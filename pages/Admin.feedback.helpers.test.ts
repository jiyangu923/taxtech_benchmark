import { describe, it, expect } from 'vitest';
import {
  feedbackToClaudePrompt,
  feedbackSummaryLine,
  feedbackCounts,
  nextStatusOnAction,
  STATUS_LABELS,
  TYPE_LABELS,
} from './Admin.feedback.helpers';
import { Feedback } from '../types';

const fb = (overrides: Partial<Feedback> = {}): Feedback => ({
  id: overrides.id ?? 'fb-1',
  user_id: overrides.user_id ?? null,
  user_email: overrides.user_email ?? null,
  user_name: overrides.user_name ?? null,
  type: overrides.type ?? 'bug',
  message: overrides.message ?? 'Something is broken.',
  page_path: overrides.page_path ?? null,
  user_agent: overrides.user_agent ?? null,
  status: overrides.status ?? 'new',
  admin_notes: overrides.admin_notes ?? null,
  created_at: overrides.created_at ?? '2026-05-11T10:00:00Z',
  resolved_at: overrides.resolved_at ?? null,
});

describe('feedbackToClaudePrompt', () => {
  it('starts with an action verb specific to the feedback type', () => {
    expect(feedbackToClaudePrompt(fb({ type: 'bug' }))).toMatch(/^Investigate this bug/);
    expect(feedbackToClaudePrompt(fb({ type: 'feature' }))).toMatch(/^Evaluate this feature/);
    expect(feedbackToClaudePrompt(fb({ type: 'general' }))).toMatch(/^Review this user feedback/);
  });

  it('includes type label, name, email, user id, and ISO timestamp', () => {
    const out = feedbackToClaudePrompt(fb({
      type: 'bug',
      user_name: 'Jane Doe',
      user_email: 'jane@example.com',
      user_id: 'uid-123',
      created_at: '2026-05-11T10:00:00Z',
    }));
    expect(out).toContain('## Bug from Jane Doe <jane@example.com> (logged in as user uid-123)');
    expect(out).toContain('Submitted at: 2026-05-11T10:00:00.000Z');
  });

  it('falls back to anonymous label when no name/email present', () => {
    const out = feedbackToClaudePrompt(fb({ user_name: null, user_email: null, user_id: null }));
    expect(out).toContain('from anonymous visitor');
  });

  it('includes Page line only when page_path is present', () => {
    expect(feedbackToClaudePrompt(fb({ page_path: '/#/taxi' }))).toContain('Page: /#/taxi');
    expect(feedbackToClaudePrompt(fb({ page_path: null }))).not.toContain('Page:');
  });

  it('includes the message verbatim under a clear heading', () => {
    const out = feedbackToClaudePrompt(fb({ message: 'The Taxi sidebar overlaps the chat on iPad.' }));
    expect(out).toContain('### Their message');
    expect(out).toContain('The Taxi sidebar overlaps the chat on iPad.');
  });

  it('appends admin_notes when present', () => {
    const out = feedbackToClaudePrompt(fb({ admin_notes: 'Reproduced on iPad Air, not on iPad Pro.' }));
    expect(out).toContain('### Admin notes');
    expect(out).toContain('Reproduced on iPad Air');
  });

  it('omits the admin_notes section when absent', () => {
    const out = feedbackToClaudePrompt(fb({ admin_notes: null }));
    expect(out).not.toContain('### Admin notes');
  });

  it('ends with investigation guidance', () => {
    const out = feedbackToClaudePrompt(fb());
    expect(out).toContain('When you investigate:');
    expect(out).toContain('vitest');
  });
});

describe('feedbackSummaryLine', () => {
  it('returns the message trimmed and whitespace-collapsed when short', () => {
    expect(feedbackSummaryLine(fb({ message: '  Hello   world  ' }))).toBe('Hello world');
  });

  it('truncates with an ellipsis at 80 chars', () => {
    const long = 'A'.repeat(120);
    const out = feedbackSummaryLine(fb({ message: long }));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(81);
  });

  it('returns empty string for an empty message', () => {
    expect(feedbackSummaryLine(fb({ message: '' }))).toBe('');
  });
});

describe('nextStatusOnAction', () => {
  it.each([
    ['triage',  'triaged'],
    ['resolve', 'resolved'],
    ['archive', 'archived'],
    ['reopen',  'new'],
  ] as const)('action %s → %s', (action, expected) => {
    expect(nextStatusOnAction('new', action)).toBe(expected);
  });
});

describe('feedbackCounts', () => {
  it('counts items by status with a total', () => {
    const out = feedbackCounts([
      fb({ status: 'new' }),
      fb({ status: 'new' }),
      fb({ status: 'triaged' }),
      fb({ status: 'resolved' }),
      fb({ status: 'archived' }),
    ]);
    expect(out).toEqual({ total: 5, new: 2, triaged: 1, resolved: 1, archived: 1 });
  });

  it('returns zero counts for empty input', () => {
    expect(feedbackCounts([])).toEqual({ total: 0, new: 0, triaged: 0, resolved: 0, archived: 0 });
  });
});

describe('label maps', () => {
  it('STATUS_LABELS covers every status', () => {
    expect(STATUS_LABELS.new).toBe('New');
    expect(STATUS_LABELS.triaged).toBe('Triaged');
    expect(STATUS_LABELS.resolved).toBe('Resolved');
    expect(STATUS_LABELS.archived).toBe('Archived');
  });

  it('TYPE_LABELS covers every type', () => {
    expect(TYPE_LABELS.bug).toBe('Bug');
    expect(TYPE_LABELS.feature).toBe('Feature request');
    expect(TYPE_LABELS.general).toBe('General');
  });
});
