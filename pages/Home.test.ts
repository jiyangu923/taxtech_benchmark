import { describe, it, expect } from 'vitest';
import { formatRevenue } from './Home';

// ─── formatRevenue ────────────────────────────────────────────────────────────
//
// The Home hero shows "Combined revenue covered" — a sum of revenue-band
// midpoints across all approved submissions, returned by the
// get_public_stats RPC. The number can range from a few hundred million
// (early days) to multi-trillion. formatRevenue turns the raw USD into a
// hero-strip-sized label.

describe('formatRevenue', () => {
  it('formats trillions with one decimal + T', () => {
    expect(formatRevenue(4_287_500_000_000)).toBe('$4.3T');
    expect(formatRevenue(1_000_000_000_000)).toBe('$1.0T');
  });

  it('formats billions with one decimal + B', () => {
    expect(formatRevenue(35_600_000_000)).toBe('$35.6B');
    expect(formatRevenue(1_000_000_000)).toBe('$1.0B');
  });

  it('formats millions with one decimal + M', () => {
    expect(formatRevenue(450_000_000)).toBe('$450.0M');
    expect(formatRevenue(1_000_000)).toBe('$1.0M');
  });

  it('formats thousands with no decimals + K', () => {
    expect(formatRevenue(750_000)).toBe('$750K');
  });

  it('returns $0 for zero, negative, or null-ish input', () => {
    expect(formatRevenue(0)).toBe('$0');
    expect(formatRevenue(-1)).toBe('$0');
    expect(formatRevenue(NaN)).toBe('$0');
  });

  it('falls through to plain dollars under 1k', () => {
    expect(formatRevenue(750)).toBe('$750');
  });

  it('crosses the trillion boundary cleanly', () => {
    // 999_999_999_999 should still be billions (rounded down by the < 1e12 check)
    expect(formatRevenue(999_999_999_999).endsWith('B')).toBe(true);
    expect(formatRevenue(1_000_000_000_001).endsWith('T')).toBe(true);
  });
});
