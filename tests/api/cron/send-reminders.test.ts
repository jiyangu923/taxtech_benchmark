import { describe, it, expect } from 'vitest';
import { findCandidates, ProfileRow, SubmissionRow } from '../../../api/cron/send-reminders';

const profile = (overrides: Partial<ProfileRow> = {}): ProfileRow => ({
  id: 'u',
  name: 'User',
  email: 'u@x.com',
  role: 'user',
  email_reminders_enabled: true,
  last_reminder_sent_at: null,
  ...overrides,
});

const submission = (overrides: Partial<SubmissionRow>): SubmissionRow => ({
  userId: 'u',
  submittedAt: '2026-04-15T00:00:00Z',
  is_current: true,
  ...overrides,
});

const NOW = new Date('2026-05-10T00:00:00Z').getTime();
const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe('findCandidates — incomplete', () => {
  it('flags users with no current submission', () => {
    const profiles = [
      profile({ id: 'a', email: 'a@x.com' }),
      profile({ id: 'b', email: 'b@x.com' }),
    ];
    const subs = [submission({ userId: 'a' })];
    const out = findCandidates(profiles, subs, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'incomplete', userId: 'b' });
  });

  it('treats archived (is_current=false) submissions as never-submitted', () => {
    const profiles = [profile({ id: 'a' })];
    const subs = [submission({ userId: 'a', is_current: false })];
    const out = findCandidates(profiles, subs, NOW);
    expect(out[0].kind).toBe('incomplete');
  });
});

describe('findCandidates — stale', () => {
  it('flags submissions older than 90 days', () => {
    const oldSub = submission({ userId: 'a', submittedAt: new Date(NOW - days(95)).toISOString() });
    const profiles = [profile({ id: 'a' })];
    const out = findCandidates(profiles, [oldSub], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('stale');
    expect(out[0].lastSubmittedAt).toBe(oldSub.submittedAt);
  });

  it('does NOT flag submissions less than 90 days old', () => {
    const profiles = [profile({ id: 'a' })];
    const subs = [submission({ userId: 'a', submittedAt: new Date(NOW - days(30)).toISOString() })];
    expect(findCandidates(profiles, subs, NOW)).toEqual([]);
  });

  it('skips submissions with malformed submittedAt', () => {
    const profiles = [profile({ id: 'a' })];
    const subs = [submission({ userId: 'a', submittedAt: 'not-a-date' })];
    expect(findCandidates(profiles, subs, NOW)).toEqual([]);
  });
});

describe('findCandidates — opt-out + admin filtering', () => {
  it('skips users with email_reminders_enabled = false', () => {
    const profiles = [profile({ id: 'a', email_reminders_enabled: false })];
    const out = findCandidates(profiles, [], NOW);
    expect(out).toEqual([]);
  });

  it('treats null email_reminders_enabled as opted-in (default true)', () => {
    const profiles = [profile({ id: 'a', email_reminders_enabled: null })];
    const out = findCandidates(profiles, [], NOW);
    expect(out).toHaveLength(1);
  });

  it('skips admins regardless of opt-in state', () => {
    const profiles = [
      profile({ id: 'a', role: 'admin' }),
      profile({ id: 'b', email: 'b@x.com' }),
    ];
    const out = findCandidates(profiles, [], NOW);
    expect(out.map(c => c.email)).toEqual(['b@x.com']);
  });
});

describe('findCandidates — 14-day cooldown', () => {
  it('skips users reminded within the last 14 days', () => {
    const profiles = [profile({ id: 'a', last_reminder_sent_at: new Date(NOW - days(7)).toISOString() })];
    expect(findCandidates(profiles, [], NOW)).toEqual([]);
  });

  it('includes users reminded 14+ days ago', () => {
    const profiles = [profile({ id: 'a', last_reminder_sent_at: new Date(NOW - days(20)).toISOString() })];
    const out = findCandidates(profiles, [], NOW);
    expect(out).toHaveLength(1);
  });

  it('treats malformed last_reminder_sent_at as eligible', () => {
    const profiles = [profile({ id: 'a', last_reminder_sent_at: 'not-a-date' })];
    expect(findCandidates(profiles, [], NOW)).toHaveLength(1);
  });
});

describe('findCandidates — combined scenarios', () => {
  it('correctly partitions a mixed dataset', () => {
    const profiles = [
      profile({ id: 'incomplete-1', email: 'inc1@x.com' }),                                   // → incomplete
      profile({ id: 'stale-1',      email: 'stale1@x.com' }),                                 // → stale
      profile({ id: 'fresh',        email: 'fresh@x.com' }),                                  // → none (recent submission)
      profile({ id: 'opted-out',    email: 'out@x.com',   email_reminders_enabled: false }), // → none
      profile({ id: 'admin',        email: 'admin@x.com', role: 'admin' }),                  // → none
      profile({ id: 'cooldown',     email: 'cd@x.com',    last_reminder_sent_at: new Date(NOW - days(3)).toISOString() }), // → none
    ];
    const subs = [
      submission({ userId: 'stale-1', submittedAt: new Date(NOW - days(120)).toISOString() }),
      submission({ userId: 'fresh',   submittedAt: new Date(NOW - days(10)).toISOString() }),
      submission({ userId: 'opted-out', submittedAt: new Date(NOW - days(120)).toISOString() }),
      submission({ userId: 'admin',     submittedAt: new Date(NOW - days(120)).toISOString() }),
    ];
    const out = findCandidates(profiles, subs, NOW);
    expect(out.map(c => `${c.kind}:${c.userId}`).sort()).toEqual([
      'incomplete:incomplete-1',
      'stale:stale-1',
    ]);
  });

  it('returns an empty array when all profiles are filtered out', () => {
    const profiles = [
      profile({ id: 'a', role: 'admin' }),
      profile({ id: 'b', email_reminders_enabled: false }),
    ];
    expect(findCandidates(profiles, [], NOW)).toEqual([]);
  });
});
