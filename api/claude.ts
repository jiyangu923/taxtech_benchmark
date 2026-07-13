import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

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
// Ceiling on client-requested max_tokens. The meter records cost AFTER a call
// completes (soft cap), so a single oversized request could otherwise overshoot
// the daily limit by a wide margin in one shot.
const MAX_TOKENS_CEILING = 8000;

// ─── Per-user AI rate limiting ──────────────────────────────────────────────
// Claude Haiku 4.5 pricing, USD per 1M tokens. Cached input is ~90% cheaper;
// cache writes are 1.25x base input. https://platform.claude.com (pricing)
const PRICE_PER_MTOK = { input: 1.0, output: 5.0, cacheRead: 0.10, cacheWrite: 1.25 };
const DAILY_LIMIT_USD = 5;            // per non-admin user, per rolling window
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface ClaudeRequestBody {
  system?: string | SystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  outputFormat?: Record<string, unknown>;
  maxTokens?: number;          // clamped server-side to MAX_TOKENS_CEILING
  model?: string;              // accepted in the body but IGNORED — see buildParams
  stream?: boolean;
}

interface UsageOut {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * Clamp client-supplied max_tokens to (0, MAX_TOKENS_CEILING]; anything
 * missing/invalid falls back to the default.
 */
function resolveMaxTokens(requested: unknown): number {
  const n = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : 0;
  if (n <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(n, MAX_TOKENS_CEILING);
}

function buildParams(body: ClaudeRequestBody): Record<string, any> {
  const params: Record<string, any> = {
    // The model is SERVER-CHOSEN, always. body.model is deliberately ignored:
    // the meter prices Haiku only, so honoring a client-requested model would
    // let any authed user burn Sonnet/Opus tokens against Haiku-priced quota.
    // When multi-model routing lands (harness plan L3), the routing decision
    // stays server-side — never a client passthrough.
    model: DEFAULT_MODEL,
    max_tokens: resolveMaxTokens(body.maxTokens),
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

type Meter = (u: UsageOut) => Promise<void>;

// Pure: USD cost of one call from its token usage.
function computeCostUsd(u: UsageOut): number {
  return (
    (u.input_tokens / 1e6) * PRICE_PER_MTOK.input +
    (u.output_tokens / 1e6) * PRICE_PER_MTOK.output +
    (u.cache_read_input_tokens / 1e6) * PRICE_PER_MTOK.cacheRead +
    (u.cache_creation_input_tokens / 1e6) * PRICE_PER_MTOK.cacheWrite
  );
}

interface UsageRow {
  window_started_at: string;
  cost_usd: number | string;
  input_tokens?: number;
  output_tokens?: number;
}
interface WindowState { windowStartMs: number; used: number; inTok: number; outTok: number; }

// Pure: resolve the active rolling window from the stored row + current time.
// A window >= 24h old is expired → start fresh (used resets to 0).
function resolveWindow(row: UsageRow | null, nowMs: number): WindowState {
  if (!row) return { windowStartMs: nowMs, used: 0, inTok: 0, outTok: 0 };
  const startMs = new Date(row.window_started_at).getTime();
  if (Number.isNaN(startMs) || nowMs - startMs >= WINDOW_MS) {
    return { windowStartMs: nowMs, used: 0, inTok: 0, outTok: 0 };
  }
  return {
    windowStartMs: startMs,
    used: Number(row.cost_usd) || 0,
    inTok: row.input_tokens || 0,
    outTok: row.output_tokens || 0,
  };
}

function bearerToken(req: VercelRequest): string | null {
  const auth = (req.headers['authorization'] as string | undefined) || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m ? m[1] : null;
}

// Best-effort: add this call's cost to the user's window. A failure here must
// not break the response (the user already got their answer), so we swallow +
// log; slight under-counting on a DB hiccup is acceptable for a soft cap.
async function recordUsage(admin: any, userId: string, state: WindowState, usage: UsageOut): Promise<void> {
  try {
    await admin.from('ai_usage').upsert({
      user_id: userId,
      window_started_at: new Date(state.windowStartMs).toISOString(),
      cost_usd: state.used + computeCostUsd(usage),
      input_tokens: state.inTok + usage.input_tokens,
      output_tokens: state.outTok + usage.output_tokens,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e: any) {
    console.warn('ai_usage record failed:', e?.message);
  }
}

async function runNonStreaming(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse, meter?: Meter) {
  const response = await client.messages.create(buildParams(body) as any);
  const textBlock = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  const text = textBlock?.text ?? '';
  const usage = pickUsage(response.usage);
  if (meter) await meter(usage);
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

async function runStreaming(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse, meter?: Meter) {
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
    if (meter) await meter(usage);
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

  // ── Per-user auth + rolling daily spend limit ──
  // This endpoint was previously open to anyone; auth here both identifies the
  // user for metering AND closes that hole.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Auth backend not configured' });
  }
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to use the AI assistant.' });

  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Your session expired — sign in again.' });
  }
  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const [profileRes, usageRes] = await Promise.all([
    admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
    admin.from('ai_usage')
      .select('window_started_at, cost_usd, input_tokens, output_tokens')
      .eq('user_id', userId).maybeSingle(),
  ]);
  const isAdmin = (profileRes.data as any)?.role === 'admin';

  let meter: Meter | undefined;
  if (!isAdmin) {
    const state = resolveWindow((usageRes.data as UsageRow) ?? null, Date.now());
    if (state.used >= DAILY_LIMIT_USD) {
      const resetsAtMs = state.windowStartMs + WINDOW_MS;
      const hours = Math.max(1, Math.ceil((resetsAtMs - Date.now()) / 3_600_000));
      return res.status(429).json({
        error: `You've reached your daily AI limit ($${DAILY_LIMIT_USD} of usage). It resets in about ${hours} hour${hours === 1 ? '' : 's'}.`,
        resetsAt: new Date(resetsAtMs).toISOString(),
      });
    }
    meter = (u) => recordUsage(admin, userId, state, u);
  }

  const client = new Anthropic({ apiKey });
  if (body.stream) {
    return runStreaming(client, body, res, meter);
  }
  return runNonStreaming(client, body, res, meter);
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
export { buildParams, pickUsage, computeCostUsd, resolveWindow, resolveMaxTokens, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING, DAILY_LIMIT_USD, WINDOW_MS, PRICE_PER_MTOK };
export type { ClaudeRequestBody, UsageOut, SystemBlock };
