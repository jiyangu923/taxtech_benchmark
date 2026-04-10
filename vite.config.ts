import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Dev-only middleware that proxies /api/gemini to the Gemini REST API
 *  so `vite dev` works without Vercel's serverless runtime. */
function geminiDevProxy(apiKey: string): Plugin {
  return {
    name: 'gemini-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c; });
        req.on('end', async () => {
          try {
            const { contents, config } = JSON.parse(body);
            const model = 'gemini-3-flash-preview';
            const upstream = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents,
                  generationConfig: {
                    responseMimeType: config?.responseMimeType,
                    responseSchema: config?.responseSchema,
                    temperature: config?.temperature,
                  },
                  systemInstruction: config?.systemInstruction
                    ? { parts: [{ text: config.systemInstruction }] }
                    : undefined,
                }),
              }
            );
            const data = await upstream.text();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = upstream.status;
            res.end(data);
          } catch (e: any) {
            res.statusCode = 500;
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
      },
      plugins: [react(), tailwindcss(), geminiDevProxy(env.GEMINI_API_KEY || '')],
      // Gemini API key is now server-side only (api/gemini.ts).
      // No secrets are injected into the client bundle.
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
