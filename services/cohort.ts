import type { Submission } from '../types';

/**
 * Founding-cohort access rules, shared by every gated surface (Taxi, Report)
 * so "who can see the benchmark" is decided in exactly one place.
 *
 * Access is granted only to admins and members whose CURRENT submission is
 * 'approved'. Everyone else is gated, but for different reasons:
 *   - 'waitlist' → cohort was full; held until an admin promotes them
 *   - 'pending' / 'rejected' / no submission → hasn't earned a live spot yet
 */

type StatusHolder = Pick<Submission, 'status'> | null | undefined;

export function isWaitlisted(sub: StatusHolder): boolean {
  return sub?.status === 'waitlist';
}

/** True when this user may see the benchmark (analytics + Taxi). */
export function hasCohortAccess(sub: StatusHolder, isAdmin: boolean): boolean {
  return isAdmin || sub?.status === 'approved';
}

export type GateReason = 'granted' | 'waitlist' | 'needs_survey';

/**
 * Why a surface is (or isn't) gated — drives which message to render.
 * 'needs_survey' covers no submission, pending, and rejected (all resolve to
 * "take/again the survey"); 'waitlist' gets its own reassuring copy.
 */
export function gateReason(sub: StatusHolder, isAdmin: boolean): GateReason {
  if (hasCohortAccess(sub, isAdmin)) return 'granted';
  if (isWaitlisted(sub)) return 'waitlist';
  return 'needs_survey';
}
