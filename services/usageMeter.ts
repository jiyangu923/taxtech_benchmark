/**
 * Client-side view of the per-user AI fair-use meter.
 *
 * Mirrors the server's rolling-window logic in api/claude.ts (which is the
 * enforcement point — this is display only). The user can read their own
 * ai_usage row under RLS; from it we derive how much of today's allowance
 * is used and when the window resets.
 */

export const AI_DAILY_LIMIT_USD = 5;
export const AI_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AiUsageRow {
  cost_usd: number | string; // Postgres numeric arrives as a string
  window_started_at: string;
}

export interface UsageState {
  /** 0..1 share of the daily allowance used in the active window. */
  fraction: number;
  /** When the current window resets, or null when there's no active window. */
  resetsAtMs: number | null;
}

export function usageState(row: AiUsageRow | null | undefined, nowMs: number): UsageState {
  if (!row) return { fraction: 0, resetsAtMs: null };
  const startMs = new Date(row.window_started_at).getTime();
  // Expired or unparseable window → the server will start fresh on the next
  // call, so display as unused.
  if (Number.isNaN(startMs) || nowMs - startMs >= AI_WINDOW_MS) {
    return { fraction: 0, resetsAtMs: null };
  }
  const used = Number(row.cost_usd) || 0;
  return {
    fraction: Math.min(1, Math.max(0, used / AI_DAILY_LIMIT_USD)),
    resetsAtMs: startMs + AI_WINDOW_MS,
  };
}
