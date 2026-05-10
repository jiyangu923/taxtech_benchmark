import { describe, it, expect } from 'vitest';
import {
  candidatesToBccString,
  candidatesToEmailCsv,
  findIncompleteCandidates,
  findOutdatedCandidates,
  findStaleCandidates,
} from './Admin.reminders.helpers';
import { Submission, User } from '../types';

const profile = (overrides: Partial<User> = {}): User => ({
  id: overrides.id ?? 'u',
  name: overrides.name ?? 'User',
  email: overrides.email ?? 'user@example.com',
  role: overrides.role ?? 'user',
  email_reminders_enabled: overrides.email_reminders_enabled,
  last_reminder_sent_at: overrides.last_reminder_sent_at,
});

const submission = (overrides: Partial<Submission>): Submission => ({
  id: overrides.id ?? 'sub-1',
  userId: overrides.userId ?? 'u',
  userName: overrides.userName ?? 'User',
  status: overrides.status ?? 'approved',
  submittedAt: overrides.submittedAt ?? '2026-04-01T00:00:00Z',
  is_current: overrides.is_current ?? true,
  survey_version: overrides.survey_version ?? 1,
  companyProfile: [],
  participationGoal: [],
  respondentRole: '',
  ownedTaxFunctions: [],
  organizationScope: '',
  revenueRange: '',
  aiAdopted: false,
  ...overrides,
});

describe('findIncompleteCandidates', () => {
  it('returns users with no current submission', () => {
    const profiles = [
      profile({ id: 'a', name: 'Alice', email: 'a@x.com' }),
      profile({ id: 'b', name: 'Bob', email: 'b@x.com' }),
    ];
    const submissions = [submission({ userId: 'a' })];
    const out = findIncompleteCandidates(profiles, submissions);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe('b');
    expect(out[0].lastSubmittedAt).toBeNull();
  });

  it('excludes admins', () => {
    const profiles = [
      profile({ id: 'admin', role: 'admin', email: 'admin@x.com' }),
      profile({ id: 'u', email: 'u@x.com' }),
    ];
    const out = findIncompleteCandidates(profiles, []);
    expect(out.map(c => c.email)).toEqual(['u@x.com']);
  });

  it('excludes users who opted out of reminders', () => {
    const profiles = [
      profile({ id: 'a', email: 'a@x.com', email_reminders_enabled: true }),
      profile({ id: 'b', email: 'b@x.com', email_reminders_enabled: false }),
      profile({ id: 'c', email: 'c@x.com' }),
    ];
    const out = findIncompleteCandidates(profiles, []);
    expect(out.map(c => c.email).sort()).toEqual(['a@x.com', 'c@x.com']);
  });

  it('treats historical-only submissions as never-submitted', () => {
    const profiles = [profile({ id: 'a' })];
    const submissions = [submission({ userId: 'a', is_current: false })];
    const out = findIncompleteCandidates(profiles, submissions);
    expect(out).toHaveLength(1);
  });

  it('attaches lastReminderSentAt from the profile', () => {
    const ts = '2026-04-25T10:00:00Z';
    const profiles = [profile({ id: 'a', last_reminder_sent_at: ts })];
    const out = findIncompleteCandidates(profiles, []);
    expect(out[0].lastReminderSentAt).toBe(ts);
  });
});

describe('findOutdatedCandidates', () => {
  it('flags users on a survey_version older than current', () => {
    const profiles = [
      profile({ id: 'old', email: 'old@x.com' }),
      profile({ id: 'cur', email: 'cur@x.com' }),
    ];
    const submissions = [
      submission({ userId: 'old', survey_version: 1 }),
      submission({ userId: 'cur', survey_version: 2 }),
    ];
    const out = findOutdatedCandidates(profiles, submissions, 2);
    expect(out.map(c => c.email)).toEqual(['old@x.com']);
    expect(out[0].lastSurveyVersion).toBe(1);
  });

  it('treats missing survey_version as version 1', () => {
    const profiles = [profile({ id: 'a' })];
    const submissions = [submission({ userId: 'a', survey_version: undefined })];
    const out = findOutdatedCandidates(profiles, submissions, 2);
    expect(out).toHaveLength(1);
    expect(out[0].lastSurveyVersion).toBe(1);
  });

  it('returns empty when current version is 1 (nobody is outdated)', () => {
    const profiles = [profile({ id: 'a' })];
    const submissions = [submission({ userId: 'a', survey_version: 1 })];
    expect(findOutdatedCandidates(profiles, submissions, 1)).toEqual([]);
  });

  it('skips users who opted out and admins', () => {
    const profiles = [
      profile({ id: 'a', email_reminders_enabled: false }),
      profile({ id: 'b', role: 'admin' }),
      profile({ id: 'c', email: 'c@x.com' }),
    ];
    const submissions = [
      submission({ id: 'sa', userId: 'a', survey_version: 1 }),
      submission({ id: 'sb', userId: 'b', survey_version: 1 }),
      submission({ id: 'sc', userId: 'c', survey_version: 1 }),
    ];
    const out = findOutdatedCandidates(profiles, submissions, 2);
    expect(out.map(c => c.email)).toEqual(['c@x.com']);
  });

  it('ignores historical submissions when picking current version', () => {
    const profiles = [profile({ id: 'a' })];
    const submissions = [
      submission({ id: '1', userId: 'a', survey_version: 1, is_current: false }),
      submission({ id: '2', userId: 'a', survey_version: 2, is_current: true }),
    ];
    const out = findOutdatedCandidates(profiles, submissions, 2);
    expect(out).toEqual([]);
  });
});

describe('findStaleCandidates', () => {
  const now = new Date('2026-04-26T00:00:00Z');

  it('returns users whose last submission is older than threshold', () => {
    const profiles = [
      profile({ id: 'old', email: 'old@x.com' }),
      profile({ id: 'fresh', email: 'fresh@x.com' }),
    ];
    const submissions = [
      submission({ userId: 'old', submittedAt: '2025-12-01T00:00:00Z' }),
      submission({ userId: 'fresh', submittedAt: '2026-04-01T00:00:00Z' }),
    ];
    const out = findStaleCandidates(profiles, submissions, now, 90);
    expect(out.map(c => c.email)).toEqual(['old@x.com']);
  });

  it('respects custom threshold', () => {
    const profiles = [profile({ id: 'a' })];
    const submissions = [submission({ userId: 'a', submittedAt: '2026-04-01T00:00:00Z' })];
    expect(findStaleCandidates(profiles, submissions, now, 30)).toHaveLength(0);
    expect(findStaleCandidates(profiles, submissions, now, 20)).toHaveLength(1);
  });

  it('uses 90-day threshold by default', () => {
    const profiles = [profile({ id: 'a' })];
    const old = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const submissions = [submission({ userId: 'a', submittedAt: old })];
    expect(findStaleCandidates(profiles, submissions, now)).toHaveLength(1);
    submissions[0].submittedAt = fresh;
    expect(findStaleCandidates(profiles, submissions, now)).toHaveLength(0);
  });

  it('skips submissions with malformed submittedAt', () => {
    const profiles = [profile({ id: 'a' })];
    const submissions = [submission({ userId: 'a', submittedAt: 'not-a-date' })];
    expect(findStaleCandidates(profiles, submissions, now)).toEqual([]);
  });

  it('excludes admins and opted-out users', () => {
    const old = '2025-01-01T00:00:00Z';
    const profiles = [
      profile({ id: 'a', role: 'admin' }),
      profile({ id: 'b', email_reminders_enabled: false }),
      profile({ id: 'c', email: 'c@x.com' }),
    ];
    const submissions = [
      submission({ id: 'sa', userId: 'a', submittedAt: old }),
      submission({ id: 'sb', userId: 'b', submittedAt: old }),
      submission({ id: 'sc', userId: 'c', submittedAt: old }),
    ];
    const out = findStaleCandidates(profiles, submissions, now);
    expect(out.map(c => c.email)).toEqual(['c@x.com']);
  });
});

describe('candidatesToEmailCsv', () => {
  it('produces a name,email CSV with header', () => {
    const csv = candidatesToEmailCsv([
      { userId: 'a', name: 'Alice', email: 'a@x.com', lastSubmittedAt: null, lastSurveyVersion: null, lastReminderSentAt: null },
      { userId: 'b', name: 'Bob', email: 'b@x.com', lastSubmittedAt: null, lastSurveyVersion: null, lastReminderSentAt: null },
    ]);
    expect(csv).toBe('name,email\nAlice,a@x.com\nBob,b@x.com');
  });

  it('escapes commas and quotes per RFC 4180', () => {
    const csv = candidatesToEmailCsv([
      { userId: 'a', name: 'Smith, Jr.', email: 'a@x.com', lastSubmittedAt: null, lastSurveyVersion: null, lastReminderSentAt: null },
      { userId: 'b', name: 'O"Brien', email: 'b@x.com', lastSubmittedAt: null, lastSurveyVersion: null, lastReminderSentAt: null },
    ]);
    expect(csv).toContain('"Smith, Jr."');
    expect(csv).toContain('"O""Brien"');
  });

  it('returns just the header for empty input', () => {
    expect(candidatesToEmailCsv([])).toBe('name,email');
  });
});

describe('candidatesToBccString', () => {
  it('joins emails with comma+space', () => {
    expect(candidatesToBccString([
      { userId: 'a', name: 'A', email: 'a@x.com', lastSubmittedAt: null, lastSurveyVersion: null, lastReminderSentAt: null },
      { userId: 'b', name: 'B', email: 'b@x.com', lastSubmittedAt: null, lastSurveyVersion: null, lastReminderSentAt: null },
    ])).toBe('a@x.com, b@x.com');
  });
  it('returns empty string for no candidates', () => {
    expect(candidatesToBccString([])).toBe('');
  });
});
