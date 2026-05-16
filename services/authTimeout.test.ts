import { describe, it, expect, vi } from 'vitest';
import { withTimeout, STALE_SESSION_MESSAGE, AUTH_TIMEOUT_MS } from './authTimeout';

// Using real timers throughout. The hang case uses a tiny 10ms cap so the
// test still runs fast — but avoids the fake-timer / Promise.race ordering
// hazard that surfaces a spurious "unhandled rejection" warning even when
// the rejection IS caught downstream.

describe('withTimeout', () => {
  it('resolves with the value when the promise resolves before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'too slow');
    expect(result).toBe('ok');
  });

  it('rejects with the timeout message when the promise hangs past the deadline', async () => {
    const hanging = new Promise<string>(() => {
      // never resolves — simulates a wedged processLock
    });
    await expect(withTimeout(hanging, 10, 'too slow')).rejects.toThrow('too slow');
  });

  it('propagates the underlying rejection when the promise rejects first', async () => {
    const failing = Promise.reject(new Error('upstream boom'));
    await expect(withTimeout(failing, 1000, 'too slow')).rejects.toThrow('upstream boom');
  });

  it('clears the timer on success so it does not fire after resolution', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve(42), 1000, 'too slow');
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('clears the timer on rejection too', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.reject(new Error('x')), 1000, 'too slow').catch(() => {});
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe('exported constants', () => {
  it('STALE_SESSION_MESSAGE mentions refreshing the page', () => {
    expect(STALE_SESSION_MESSAGE.toLowerCase()).toContain('refresh');
  });

  it('AUTH_TIMEOUT_MS is a positive number under 30 seconds', () => {
    expect(AUTH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AUTH_TIMEOUT_MS).toBeLessThan(30_000);
  });
});
