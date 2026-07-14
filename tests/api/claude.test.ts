import { describe, it, expect } from 'vitest';
import { computeCostUsd, resolveWindow, buildParams, resolveMaxTokens, extractQuestion, DAILY_LIMIT_USD, WINDOW_MS, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING } from '../../api/claude';

const usage = (o: Partial<{ input: number; output: number; cacheRead: number; cacheWrite: number }>) => ({
  input_tokens: o.input ?? 0,
  output_tokens: o.output ?? 0,
  cache_read_input_tokens: o.cacheRead ?? 0,
  cache_creation_input_tokens: o.cacheWrite ?? 0,
});

describe('computeCostUsd (Haiku 4.5 pricing)', () => {
  it('charges $1/M input and $5/M output', () => {
    expect(computeCostUsd(usage({ input: 1_000_000 }))).toBeCloseTo(1.0, 6);
    expect(computeCostUsd(usage({ output: 1_000_000 }))).toBeCloseTo(5.0, 6);
  });

  it('charges discounted cache reads ($0.10/M) and cache writes ($1.25/M)', () => {
    expect(computeCostUsd(usage({ cacheRead: 1_000_000 }))).toBeCloseTo(0.10, 6);
    expect(computeCostUsd(usage({ cacheWrite: 1_000_000 }))).toBeCloseTo(1.25, 6);
  });

  it('sums all components', () => {
    expect(computeCostUsd(usage({ input: 200_000, output: 100_000, cacheRead: 1_000_000 })))
      .toBeCloseTo(0.2 + 0.5 + 0.10, 6);
  });

  it('is zero for empty usage', () => {
    expect(computeCostUsd(usage({}))).toBe(0);
  });
});

describe('resolveWindow (rolling 24h)', () => {
  const now = 1_700_000_000_000;

  it('starts a fresh window when there is no row', () => {
    const s = resolveWindow(null, now);
    expect(s.used).toBe(0);
    expect(s.windowStartMs).toBe(now);
  });

  it('keeps the existing window when it is < 24h old', () => {
    const start = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago
    const s = resolveWindow({ window_started_at: start, cost_usd: 2.5, input_tokens: 10, output_tokens: 20 }, now);
    expect(s.used).toBe(2.5);
    expect(s.windowStartMs).toBe(now - 60 * 60 * 1000);
    expect(s.inTok).toBe(10);
    expect(s.outTok).toBe(20);
  });

  it('resets when the window is >= 24h old', () => {
    const start = new Date(now - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const s = resolveWindow({ window_started_at: start, cost_usd: 4.9 }, now);
    expect(s.used).toBe(0);
    expect(s.windowStartMs).toBe(now);
  });

  it('parses numeric-string cost_usd (Postgres numeric returns a string)', () => {
    const start = new Date(now - 1000).toISOString();
    const s = resolveWindow({ window_started_at: start, cost_usd: '3.25' }, now);
    expect(s.used).toBe(3.25);
  });
});

describe('limit constants', () => {
  it('caps at $5 per rolling 24h', () => {
    expect(DAILY_LIMIT_USD).toBe(5);
    expect(WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('buildParams hardening (cost-abuse holes)', () => {
  const msgs = [{ role: 'user' as const, content: 'q' }];

  it('SECURITY: ignores a client-supplied model — the meter prices Haiku only', () => {
    const params = buildParams({ messages: msgs, model: 'claude-opus-4-8' });
    expect(params.model).toBe(DEFAULT_MODEL);
  });

  it('clamps client maxTokens to the ceiling', () => {
    expect(buildParams({ messages: msgs, maxTokens: 64000 }).max_tokens).toBe(MAX_TOKENS_CEILING);
  });

  it('honors reasonable maxTokens below the ceiling', () => {
    expect(buildParams({ messages: msgs, maxTokens: 2000 }).max_tokens).toBe(2000);
  });

  it('resolveMaxTokens falls back to the default on missing/invalid input', () => {
    expect(resolveMaxTokens(undefined)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(0)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(-100)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(NaN)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens('9999' as any)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(4000.7)).toBe(4000);
  });
});

describe('extractQuestion (ai_answers persistence)', () => {
  it('pulls just the human question from a buildUserMessage-shaped payload', () => {
    const content = 'Here is the user\'s own submission:\n{"revenue":"over_5b"}\n\nUser Question: How do I compare on FTEs?';
    expect(extractQuestion(content)).toBe('How do I compare on FTEs?');
  });

  it('uses the LAST marker if the question itself contains the phrase', () => {
    const content = 'submission json\n\nUser Question: What does "User Question: " mean?';
    // lastIndexOf: everything after the final occurrence.
    expect(extractQuestion(content)).toBe('" mean?');
  });

  it('falls back to the full content when no marker exists', () => {
    expect(extractQuestion('plain prompt with no marker')).toBe('plain prompt with no marker');
  });

  it('trims and caps at 4000 chars', () => {
    expect(extractQuestion('User Question:   padded   ')).toBe('padded');
    expect(extractQuestion('User Question: ' + 'x'.repeat(5000)).length).toBe(4000);
  });
});
