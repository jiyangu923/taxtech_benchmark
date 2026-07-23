import type { Submission } from '../types';

/**
 * Cohort access rules, shared by every gated surface (Taxi, Report) so "who
 * can see the benchmark" is decided in exactly one place.
 *
 * Access is granted to admins and members whose CURRENT submission is
 * 'approved'. Everyone else needs to complete the Taxi intake interview
 * (docs/AI_INTAKE_PIVOT.md) — including the legacy 'pending'/'rejected'
 * states and the retired 'waitlist' status (kept as a legal DB value for
 * historical rows; no UI produces or special-cases it anymore).
 */

type StatusHolder = Pick<Submission, 'status'> | null | undefined;

/** True when this user may see the benchmark (analytics + Taxi). */
export function hasCohortAccess(sub: StatusHolder, isAdmin: boolean): boolean {
  return isAdmin || sub?.status === 'approved';
}

export type GateReason = 'granted' | 'needs_intake';

/** Why a surface is (or isn't) gated — drives which experience to render. */
export function gateReason(sub: StatusHolder, isAdmin: boolean): GateReason {
  return hasCohortAccess(sub, isAdmin) ? 'granted' : 'needs_intake';
}
