import { describe, it, expect } from 'vitest';
import { usageState, AI_DAILY_LIMIT_USD, AI_WINDOW_MS } from './usageMeter';

const NOW = 1_800_000_000_000;

describe('usageState', () => {
  it('reports zero usage when there is no row yet', () => {
    expect(usageState(null, NOW)).toEqual({ fraction: 0, resetsAtMs: null });
    expect(usageState(undefined, NOW)).toEqual({ fraction: 0, resetsAtMs: null });
  });

  it('computes the used fraction inside an active window', () => {
    const start = NOW - 2 * 60 * 60 * 1000; // 2h ago
    const s = usageState({ cost_usd: 2.5, window_started_at: new Date(start).toISOString() }, NOW);
    expect(s.fraction).toBeCloseTo(2.5 / AI_DAILY_LIMIT_USD, 6);
    expect(s.resetsAtMs).toBe(start + AI_WINDOW_MS);
  });

  it('parses numeric-string cost (Postgres numeric)', () => {
    const start = NOW - 1000;
    const s = usageState({ cost_usd: '4.0', window_started_at: new Date(start).toISOString() }, NOW);
    expect(s.fraction).toBeCloseTo(0.8, 6);
  });

  it('caps the fraction at 1 even if the server slightly overshot the limit', () => {
    const start = NOW - 1000;
    const s = usageState({ cost_usd: 5.4, window_started_at: new Date(start).toISOString() }, NOW);
    expect(s.fraction).toBe(1);
  });

  it('treats an expired window as unused (server will reset on next call)', () => {
    const start = NOW - AI_WINDOW_MS - 1;
    const s = usageState({ cost_usd: 4.9, window_started_at: new Date(start).toISOString() }, NOW);
    expect(s).toEqual({ fraction: 0, resetsAtMs: null });
  });

  it('treats an unparseable window as unused', () => {
    expect(usageState({ cost_usd: 3, window_started_at: 'garbage' }, NOW))
      .toEqual({ fraction: 0, resetsAtMs: null });
  });
});
