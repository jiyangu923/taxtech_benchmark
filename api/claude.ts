import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Single endpoint for the Claude API integration. Supports two modes:
 *   - { stream: false }  → returns { text, json?, usage } as JSON
 *   - { stream: true  }  → returns Server-Sent Events with `delta` text
 *                          events followed by a single `done` event carrying
 *                          the final text + usage stats
 *
 * Structured outputs: pass `outputFormat` (a JSON Schema object — every
 * object must include `additionalProperties: false`). The model's response
 * is constrained to that schema and we parse it before returning.
 *
 * Prompt caching: pass `system` as an array of text blocks; the last block
 * with `cache_control: { type: 'ephemeral' }` will be cached. The minimum
 * cacheable prefix for Haiku 4.5 is 4096 tokens — shorter prefixes silently
 * won't cache (no error, `cache_creation_input_tokens` will be 0).
 */

const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 4000;

interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface ClaudeRequestBody {
  system?: string | SystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  outputFormat?: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
  stream?: boolean;
}

interface UsageOut {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

function buildParams(body: ClaudeRequestBody): Record<string, any> {
  const params: Record<string, any> = {
    model: body.model || DEFAULT_MODEL,
    max_tokens: body.maxTokens || DEFAULT_MAX_TOKENS,
    messages: body.messages,
  };
  if (body.system) params.system = body.system;
  if (body.outputFormat) {
    params.output_config = { format: { type: 'json_schema', schema: body.outputFormat } };
  }
  return params;
}

function pickUsage(u: any): UsageOut {
  return {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
  };
}

async function runNonStreaming(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse) {
  const response = await client.messages.create(buildParams(body) as any);
  const textBlock = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  const text = textBlock?.text ?? '';
  const usage = pickUsage(response.usage);
  if (body.outputFormat) {
    try {
      return res.status(200).json({ text, json: JSON.parse(text), usage });
    } catch (e: any) {
      // Structured-output schema should guarantee valid JSON, but if the
      // model returned malformed JSON anyway, surface the raw text so the
      // caller can decide what to do (instead of an opaque 500).
      return res.status(502).json({ error: 'Model returned invalid JSON', text, usage });
    }
  }
  return res.status(200).json({ text, usage });
}

async function runStreaming(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse) {
  // Server-Sent Events. Keep-alive headers so middleboxes don't buffer/close.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const write = (event: { type: string; [k: string]: unknown }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const stream = client.messages.stream(buildParams(body) as any);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event as any).delta?.type === 'text_delta') {
        write({ type: 'delta', text: (event as any).delta.text });
      }
    }
    const final = await stream.finalMessage();
    const textBlock = final.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
    const text = textBlock?.text ?? '';
    const usage = pickUsage(final.usage);
    write({ type: 'done', text, usage });
    res.end();
  } catch (e: any) {
    write({ type: 'error', message: e?.message || 'stream failed' });
    res.end();
  }
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ClaudeRequestBody;
  if (!body?.messages?.length) {
    return res.status(400).json({ error: 'messages required' });
  }

  const client = new Anthropic({ apiKey });

  if (body.stream) {
    return runStreaming(client, body, res);
  }
  return runNonStreaming(client, body, res);
}

// 60s — generous for Haiku, leaves room for long structured-output traces.
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'claude handler crashed',
      message: e?.message || 'unknown',
    });
  }
}

// Exported for tests — pure helpers, no env/network dependencies.
export { buildParams, pickUsage, DEFAULT_MODEL, DEFAULT_MAX_TOKENS };
export type { ClaudeRequestBody, UsageOut, SystemBlock };
