import { Feedback, FeedbackStatus, FeedbackType } from '../types';

/**
 * Pure formatters for the admin Feedback tab.
 *
 * Kept in a separate file from the React component so the prompt-formatting
 * logic (the "Copy as Claude prompt" feature) is unit-testable. Don't import
 * React or anything browser-side here.
 */

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new:      'New',
  triaged:  'Triaged',
  resolved: 'Resolved',
  archived: 'Archived',
};

export const TYPE_LABELS: Record<FeedbackType, string> = {
  bug:     'Bug',
  feature: 'Feature request',
  general: 'General',
};

/**
 * Renders a self-contained prompt the admin can paste into a Claude Code /
 * Anthropic API session. Includes everything Claude needs to investigate
 * (no need for the admin to add context manually): the report text, the URL
 * the user was on, the user agent, and the timestamp.
 */
export function feedbackToClaudePrompt(f: Feedback): string {
  const ts = f.created_at ? new Date(f.created_at).toISOString() : '(unknown)';
  const who = f.user_name
    ? `${f.user_name}${f.user_email ? ` <${f.user_email}>` : ''}${f.user_id ? ` (logged in as user ${f.user_id})` : ''}`
    : f.user_email || 'anonymous visitor';

  const verbByType: Record<FeedbackType, string> = {
    bug:     'Investigate this bug report and propose a fix:',
    feature: 'Evaluate this feature request — design + scope it before any code:',
    general: 'Review this user feedback and tell me whether it warrants action:',
  };

  const lines: string[] = [
    verbByType[f.type],
    '',
    `## ${TYPE_LABELS[f.type]} from ${who}`,
    `Submitted at: ${ts}`,
  ];
  if (f.page_path) lines.push(`Page: ${f.page_path}`);
  if (f.user_agent) lines.push(`User agent: ${f.user_agent}`);
  lines.push('', '### Their message', '', f.message);
  if (f.admin_notes) lines.push('', '### Admin notes (added during triage)', '', f.admin_notes);
  lines.push('', '---', '', 'When you investigate:', '- Confirm the bug reproduces (or that the feature is sensible) before changing code.', '- Cite the exact file paths and line numbers you would change.', '- If you propose a code change, run vitest + tsc + build before opening a PR.');

  return lines.join('\n');
}

/** A short subject-style label, useful for inline display in the admin table. */
export function feedbackSummaryLine(f: Feedback): string {
  const trimmed = (f.message || '').replace(/\s+/g, ' ').trim();
  return trimmed.length > 80 ? trimmed.slice(0, 80).trimEnd() + '…' : trimmed;
}

/** The next status after the admin clicks "Mark as triaged" / "Mark resolved". */
export function nextStatusOnAction(current: FeedbackStatus, action: 'triage' | 'resolve' | 'archive' | 'reopen'): FeedbackStatus {
  if (action === 'triage')  return 'triaged';
  if (action === 'resolve') return 'resolved';
  if (action === 'archive') return 'archived';
  // reopen
  return 'new';
}

/** Counts by status — used for the tab badge ("Feedback (3)") if we add it later. */
export function feedbackCounts(items: Feedback[]): Record<FeedbackStatus | 'total', number> {
  const out: Record<FeedbackStatus | 'total', number> = { new: 0, triaged: 0, resolved: 0, archived: 0, total: items.length };
  for (const f of items) out[f.status] += 1;
  return out;
}
