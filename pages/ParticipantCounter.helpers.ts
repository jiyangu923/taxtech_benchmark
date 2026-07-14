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
 * Single-line eyebrow copy. The `max` "founding spots" is a marketing marker,
 * NOT an access gate — membership stays open past it and everyone who submits
 * gets instant AI (the cohort cap no longer gates; see drop_cohort_cap_gate.sql).
 * Examples:
 *   building: "Founding cohort · 4 of 25 spots filled"
 *   closing:  "Founding cohort · 22 of 25 spots filled · closing soon"
 *   full:     "Founding cohort · all 25 spots claimed · still open to join"
 */
export function eyebrowCopy(count: number, max: number): string {
  const phase = derivePhase(count, max);
  if (phase === 'full') return `Founding cohort · all ${max} spots claimed · still open to join`;
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
      title: `All ${max} founding spots are claimed.`,
      // Membership stays open — submitting still unlocks Taxi instantly; only
      // the "founding member" label is capped at max.
      subtitle: `Submit your data and Taxi unlocks instantly — you'll join as a full member (founding badge reserved for the first ${max}).`,
    };
  }
  const remaining = participantsRemaining(count, max);
  if (phase === 'closing') {
    return {
      title: `Only ${remaining} founding spots left.`,
      subtitle: `Claim founding-member status while ${remaining} of ${max} spots remain — Taxi unlocks the moment you submit.`,
    };
  }
  return {
    title: `Founding cohort — ${count} of ${max} spots filled.`,
    subtitle: `First ${max} members get founding status; Taxi unlocks instantly on submit.`,
  };
}
