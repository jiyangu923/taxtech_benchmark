/**
 * Client-side wrappers for /api/claude. Three exports:
 *
 *   - askClaude({...})            → plain text response
 *   - askClaudeStructured({...})  → structured JSON response (output_format)
 *   - streamClaudeStructured({...}, onDelta) → streams text tokens via SSE,
 *                                  resolves with the final parsed JSON
 *
 * Caching: pass `system` as an array of text blocks; mark the stable tail
 * block with `cache_control: { type: 'ephemeral' }`. The minimum cacheable
 * prefix for Haiku 4.5 is 4096 tokens — short prefixes silently won't cache.
 * Inspect the returned `usage.cache_read_input_tokens` to verify cache hits.
 */

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string };

interface BaseArgs {
  system?: string | SystemBlock[];
  messages: ClaudeMessage[];
  maxTokens?: number;
  model?: string;
}

export interface TextResponse {
  text: string;
  usage: ClaudeUsage;
}

export interface StructuredResponse<T> {
  text: string;
  json: T;
  usage: ClaudeUsage;
}

// Attach the user's Supabase access token so the /api/claude proxy can
// identify them for per-user rate limiting. Loaded lazily and guarded so this
// module stays importable in tests that don't wire up Supabase.
async function authHeader(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import('./api');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

async function postClaude<T>(body: Record<string, unknown>): Promise<T> {
  const resp = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(data?.error || `HTTP ${resp.status}`), { status: resp.status });
  return data as T;
}

export async function askClaude(args: BaseArgs): Promise<TextResponse> {
  return postClaude<TextResponse>({ ...args });
}

export async function askClaudeStructured<T>(
  args: BaseArgs & { outputFormat: Record<string, unknown> }
): Promise<StructuredResponse<T>> {
  return postClaude<StructuredResponse<T>>({ ...args });
}

// A streamed answer can be slow to first byte — cold start plus a prompt-cache
// warm can take ~25s before the first token — but a *healthy* stream is never
// idle for long once it starts flowing. If no bytes arrive for this window we
// treat the socket as dead and abort, so the caller's error path runs instead
// of hanging forever. Exported for tests.
export const STREAM_IDLE_MS = 60_000;

/**
 * Streaming variant. Calls `onDelta(text, accumulated)` for each chunk
 * (accumulated is the full text-so-far — convenient for progressive UI
 * rendering with partial-JSON parsing if needed). Resolves with the final
 * parsed JSON, full text, and usage stats once the stream completes.
 *
 * The SSE protocol is `data: {type: 'delta'|'done'|'error', ...}\n\n`.
 */
export async function streamClaudeStructured<T>(
  args: BaseArgs & { outputFormat: Record<string, unknown> },
  onDelta?: (chunk: string, accumulated: string) => void,
): Promise<StructuredResponse<T>> {
  // Guard the whole request — connect, response, and every body read — with an
  // idle deadline. Without it, a stalled socket leaves `reader.read()` awaiting
  // forever: streamTaxi's await never settles, the caller's `finally` never
  // runs, and the Taxi UI is stuck ("thinking" spinner, disabled composer) with
  // no recovery but a hard reload. Aborting makes the pending read reject, which
  // propagates to streamTaxi's catch and surfaces the fallback answer instead.
  const ctrl = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => ctrl.abort(new DOMException('Taxi stream stalled — no data received', 'TimeoutError')),
      STREAM_IDLE_MS,
    );
  };

  try {
    bumpIdle();
    const resp = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ ...args, stream: true }),
      signal: ctrl.signal,
    });
    if (!resp.ok || !resp.body) {
      const errBody = await resp.json().catch(() => ({}));
      throw Object.assign(new Error(errBody?.error || `HTTP ${resp.status}`), { status: resp.status });
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let finalText = '';
    let finalUsage: ClaudeUsage | null = null;
    let streamError: string | null = null;

    // SSE frame parser: events are separated by `\n\n`; each event is
    // `data: <json>`. We buffer across reads because a single chunk can hold
    // multiple events or split one in half.
    const drainEvents = () => {
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        let payload: any;
        try {
          payload = JSON.parse(dataLine.slice(6));
        } catch {
          continue;
        }
        if (payload.type === 'delta' && typeof payload.text === 'string') {
          accumulated += payload.text;
          onDelta?.(payload.text, accumulated);
        } else if (payload.type === 'done') {
          finalText = payload.text || accumulated;
          finalUsage = payload.usage || null;
        } else if (payload.type === 'error') {
          streamError = payload.message || 'stream error';
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      bumpIdle(); // a read returned (data or EOF) — the socket is alive; reset the clock
      if (value) buffer += decoder.decode(value, { stream: true });
      drainEvents();
      if (done) break;
    }

    if (streamError) throw new Error(streamError);
    if (!finalUsage) throw new Error('Stream ended without a done event');

    let parsed: T;
    try {
      parsed = JSON.parse(finalText) as T;
    } catch (e: any) {
      throw new Error(`Model returned invalid JSON: ${e?.message || 'parse error'}`);
    }
    return { text: finalText, json: parsed, usage: finalUsage };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

// ─── Exported for tests ──────────────────────────────────────────────────────
//
// Pure SSE-frame parser, no fetch/DOM dependency. Test by passing canned
// strings as if they were chunks off the wire.

interface ParsedEvent {
  type: 'delta' | 'done' | 'error' | 'unknown';
  text?: string;
  usage?: ClaudeUsage;
  message?: string;
}

export function parseSseFrames(rawChunk: string, prevBuffer = ''): { events: ParsedEvent[]; remaining: string } {
  const events: ParsedEvent[] = [];
  let buffer = prevBuffer + rawChunk;
  let idx: number;
  while ((idx = buffer.indexOf('\n\n')) >= 0) {
    const frame = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
    if (!dataLine) continue;
    try {
      const payload = JSON.parse(dataLine.slice(6));
      const t = payload.type;
      if (t === 'delta' || t === 'done' || t === 'error') {
        events.push(payload);
      } else {
        events.push({ type: 'unknown' });
      }
    } catch {
      events.push({ type: 'unknown' });
    }
  }
  return { events, remaining: buffer };
}
