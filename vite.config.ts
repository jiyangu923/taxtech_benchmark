import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only middleware that proxies /api/claude to the Anthropic API
 * so `vite dev` works without Vercel's serverless runtime. Mirrors
 * api/claude.ts (non-streaming + streaming via SSE).
 */
function claudeDevProxy(apiKey: string): Plugin {
  return {
    name: 'claude-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/claude', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in .env' }));
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => { body += c; });
        req.on('end', async () => {
          try {
            // Lazy-import the SDK so tests/builds that don't run the dev
            // server don't pay for the import.
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const parsed = JSON.parse(body);
            const client = new Anthropic({ apiKey });
            const params: any = {
              model: parsed.model || 'claude-haiku-4-5',
              max_tokens: parsed.maxTokens || 4000,
              messages: parsed.messages,
            };
            if (parsed.system) params.system = parsed.system;
            if (parsed.outputFormat) {
              params.output_config = { format: { type: 'json_schema', schema: parsed.outputFormat } };
            }

            if (parsed.stream) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache, no-transform');
              res.setHeader('Connection', 'keep-alive');
              const stream = client.messages.stream(params);
              for await (const event of stream) {
                if (event.type === 'content_block_delta' && (event as any).delta?.type === 'text_delta') {
                  res.write(`data: ${JSON.stringify({ type: 'delta', text: (event as any).delta.text })}\n\n`);
                }
              }
              const final = await stream.finalMessage();
              const textBlock = final.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
              res.write(`data: ${JSON.stringify({
                type: 'done',
                text: textBlock?.text ?? '',
                usage: {
                  input_tokens: final.usage.input_tokens,
                  output_tokens: final.usage.output_tokens,
                  cache_creation_input_tokens: (final.usage as any).cache_creation_input_tokens ?? 0,
                  cache_read_input_tokens: (final.usage as any).cache_read_input_tokens ?? 0,
                },
              })}\n\n`);
              res.end();
              return;
            }

            const response = await client.messages.create(params);
            const textBlock = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
            const text = textBlock?.text ?? '';
            const usage = {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
              cache_read_input_tokens: (response.usage as any).cache_read_input_tokens ?? 0,
            };
            res.setHeader('Content-Type', 'application/json');
            if (parsed.outputFormat) {
              try {
                res.end(JSON.stringify({ text, json: JSON.parse(text), usage }));
              } catch {
                res.statusCode = 502;
                res.end(JSON.stringify({ error: 'Model returned invalid JSON', text, usage }));
              }
            } else {
              res.end(JSON.stringify({ text, usage }));
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        strictPort: true,
      },
      plugins: [react(), tailwindcss(), claudeDevProxy(env.ANTHROPIC_API_KEY || '')],
      // Claude API key is server-side only (api/claude.ts in prod,
      // claudeDevProxy in dev). No secrets are injected into the client bundle.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
      },
    };
});
