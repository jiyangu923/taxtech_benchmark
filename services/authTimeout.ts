/**
 * Race a promise against a timeout. Used to wrap `supabase.auth.getSession()`
 * (and similar) calls that can wedge indefinitely in long-lived admin tabs
 * when the underlying processLock is stuck.
 *
 * On timeout, throws an Error whose message tells the admin exactly what to
 * do — refresh the page — instead of leaving the button spinning forever
 * with no feedback.
 *
 * Pure (no Supabase or DOM dependency) so it can be unit-tested with fake
 * timers and reused by any mutation that touches auth.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Conventional copy for the auth-stuck case. Centralized so every admin
 * mutation surfaces the same wording.
 */
export const STALE_SESSION_MESSAGE =
  'Your admin session is stuck — please refresh the page (⌘+Shift+R / Ctrl+Shift+R) and try again.';

/** Default cap on how long we'll wait for `supabase.auth.*` to resolve. */
export const AUTH_TIMEOUT_MS = 5_000;
