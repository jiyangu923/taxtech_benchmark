import { Submission, User } from '../types';

/**
 * Pure helpers for identifying reminder candidates.
 *
 * Three categories matching the user's stated reminder triggers:
 *   1. INCOMPLETE — registered (profile exists) but never submitted
 *   2. OUTDATED  — submitted on an older survey version than current
 *   3. STALE     — submitted more than `staleThresholdDays` ago
 *
 * All helpers respect the user's `email_reminders_enabled` opt-in (default
 * true) so users who unchecked the toggle on /profile are excluded.
 */

export interface ReminderCandidate {
  userId: string;
  name: string;
  email: string;
  /** ISO timestamp of last submission, or null for INCOMPLETE candidates. */
  lastSubmittedAt: string | null;
  /** Submission survey_version, or null if never submitted. */
  lastSurveyVersion: number | null;
  /** ISO timestamp of last reminder we sent, or null if never. */
  lastReminderSentAt: string | null;
}

const STALE_THRESHOLD_DAYS_DEFAULT = 90;

function isOptedIn(profile: User): boolean {
  // Default-true: users with the column unset (e.g. pre-migration rows)
  // get reminders. They can opt out later via /profile.
  return profile.email_reminders_enabled !== false;
}

function eligibleProfiles(profiles: User[]): User[] {
  // Admins shouldn't get spammed by reminder flows for now — they're
  // typically the ones running the reminder, and bouncing your own admin
  // user looks weird. Trivial to revisit later.
  return profiles.filter(p => p.role !== 'admin' && isOptedIn(p));
}

function currentSubmissionByUser(submissions: Submission[]): Map<string, Submission> {
  const map = new Map<string, Submission>();
  for (const s of submissions) {
    if (s.is_current === false) continue;
    const existing = map.get(s.userId);
    if (!existing || (existing.submittedAt && s.submittedAt && s.submittedAt > existing.submittedAt)) {
      map.set(s.userId, s);
    }
  }
  return map;
}

/**
 * Users who registered but never submitted a survey.
 * Excludes admins and opted-out users.
 */
export function findIncompleteCandidates(
  profiles: User[],
  submissions: Submission[]
): ReminderCandidate[] {
  const submitted = currentSubmissionByUser(submissions);
  return eligibleProfiles(profiles)
    .filter(p => !submitted.has(p.id))
    .map(p => ({
      userId: p.id,
      name: p.name,
      email: p.email,
      lastSubmittedAt: null,
      lastSurveyVersion: null,
      lastReminderSentAt: p.last_reminder_sent_at ?? null,
    }));
}

/**
 * Users whose current submission is on a survey version older than
 * `currentVersion`. Triggered after admin bumps the version.
 */
export function findOutdatedCandidates(
  profiles: User[],
  submissions: Submission[],
  currentVersion: number
): ReminderCandidate[] {
  const submitted = currentSubmissionByUser(submissions);
  const eligible = new Map(eligibleProfiles(profiles).map(p => [p.id, p]));
  const out: ReminderCandidate[] = [];
  for (const [userId, sub] of submitted) {
    const profile = eligible.get(userId);
    if (!profile) continue;
    const version = sub.survey_version ?? 1;
    if (version < currentVersion) {
      out.push({
        userId,
        name: profile.name,
        email: profile.email,
        lastSubmittedAt: sub.submittedAt,
        lastSurveyVersion: version,
        lastReminderSentAt: profile.last_reminder_sent_at ?? null,
      });
    }
  }
  return out;
}

/**
 * Users whose last submission is older than `staleThresholdDays` (default 90).
 * For the quarterly refresh trigger.
 */
export function findStaleCandidates(
  profiles: User[],
  submissions: Submission[],
  now: Date,
  staleThresholdDays: number = STALE_THRESHOLD_DAYS_DEFAULT
): ReminderCandidate[] {
  const cutoff = now.getTime() - staleThresholdDays * 24 * 60 * 60 * 1000;
  const submitted = currentSubmissionByUser(submissions);
  const eligible = new Map(eligibleProfiles(profiles).map(p => [p.id, p]));
  const out: ReminderCandidate[] = [];
  for (const [userId, sub] of submitted) {
    const profile = eligible.get(userId);
    if (!profile) continue;
    const submittedTime = sub.submittedAt ? new Date(sub.submittedAt).getTime() : NaN;
    if (!Number.isFinite(submittedTime)) continue;
    if (submittedTime < cutoff) {
      out.push({
        userId,
        name: profile.name,
        email: profile.email,
        lastSubmittedAt: sub.submittedAt,
        lastSurveyVersion: sub.survey_version ?? 1,
        lastReminderSentAt: profile.last_reminder_sent_at ?? null,
      });
    }
  }
  return out;
}

/**
 * Format a list of candidates as a CSV the admin can paste into BCC of
 * their email tool. Two columns: name, email.
 */
export function candidatesToEmailCsv(candidates: ReminderCandidate[]): string {
  const escape = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const header = 'name,email';
  const rows = candidates.map(c => `${escape(c.name)},${escape(c.email)}`);
  return [header, ...rows].join('\n');
}

/**
 * Returns just the email addresses, comma-joined — convenient for pasting
 * directly into the To/BCC field of a mail tool.
 */
export function candidatesToBccString(candidates: ReminderCandidate[]): string {
  return candidates.map(c => c.email).join(', ');
}
