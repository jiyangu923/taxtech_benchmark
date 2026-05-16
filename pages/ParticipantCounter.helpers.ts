/**
 * Pure helpers for the founding-cohort participant counter. Split from the
 * component so the copy + phase logic is unit-testable without rendering.
 *
 * The counter has three visual phases:
 *   - 'building' (< 80% full): low-urgency, just announces the limited cohort
 *   - 'closing'  (>= 80% full): urgency framing, "closing soon"
 *   - 'full'     (>= 100% full): cohort closed, waitlist CTA
 *
 * The 80% threshold for 'closing' is a heuristic — at that point there are
 * fewer than 20 spots left and the urgency tone reads honestly. Below that
 * "closing soon" would feel like a lie.
 */

export type CounterPhase = 'building' | 'closing' | 'full';

/** Threshold below which we don't say "closing soon" — that'd be dishonest. */
export const CLOSING_THRESHOLD_RATIO = 0.8;

export function derivePhase(count: number, max: number): CounterPhase {
  if (count >= max) return 'full';
  if (count / max >= CLOSING_THRESHOLD_RATIO) return 'closing';
  return 'building';
}

export function participantsRemaining(count: number, max: number): number {
  return Math.max(0, max - count);
}

/** Clamps to [0, 100] for the progress bar. */
export function progressPercent(count: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((count / max) * 100)));
}

/**
 * Single-line eyebrow copy. Examples:
 *   building: "Founding cohort · 4 of 100 spots filled"
 *   closing:  "Founding cohort · 87 of 100 spots filled · closing soon"
 *   full:     "Founding cohort · closed · join the waitlist"
 */
export function eyebrowCopy(count: number, max: number): string {
  const phase = derivePhase(count, max);
  if (phase === 'full') return 'Founding cohort · closed · join the waitlist';
  const base = `Founding cohort · ${count} of ${max} spots filled`;
  return phase === 'closing' ? `${base} · closing soon` : base;
}

/** Two-line banner copy for the Survey step-1 placement. */
export interface BannerCopy {
  title: string;
  subtitle: string;
}

export function bannerCopy(count: number, max: number): BannerCopy {
  const phase = derivePhase(count, max);
  if (phase === 'full') {
    return {
      title: 'Founding cohort is closed.',
      subtitle: `We've capped this cohort at ${max} participants. Join the waitlist for the next round.`,
    };
  }
  const remaining = participantsRemaining(count, max);
  if (phase === 'closing') {
    return {
      title: `Only ${remaining} spots left in the founding cohort.`,
      subtitle: `Closing soon — submit your data while ${remaining} of ${max} spots remain.`,
    };
  }
  return {
    title: `Founding cohort — ${count} of ${max} spots filled.`,
    subtitle: `Limited to ${max} participants. Each submission becomes part of the public benchmark.`,
  };
}
