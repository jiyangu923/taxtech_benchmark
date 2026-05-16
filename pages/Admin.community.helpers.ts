import type { CommunityMemberStatus } from '../types';

export const STATUS_LABELS: Record<CommunityMemberStatus, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  declined:  'Declined',
};

export const STATUS_BADGE_CLASSES: Record<CommunityMemberStatus, string> = {
  pending:   'bg-amber-50 text-amber-800 border-amber-100',
  confirmed: 'bg-green-50 text-green-700 border-green-100',
  declined:  'bg-gray-100 text-gray-500 border-gray-200',
};

/**
 * Two-letter monogram for the avatar fallback when no photo_url is set.
 * "J Gu" → "JG", "Jiyan Gu" → "JG", "Madonna" → "MA", "" → "?".
 * Always uppercase. Strips non-letter characters from each token.
 */
export function initialsFromName(name: string): string {
  const tokens = (name || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  const lettersOnly = (s: string) => s.replace(/[^A-Za-z]/g, '');
  if (tokens.length === 1) {
    const t = lettersOnly(tokens[0]);
    return (t.slice(0, 2) || '?').toUpperCase();
  }
  const first = lettersOnly(tokens[0])[0] || '';
  const last = lettersOnly(tokens[tokens.length - 1])[0] || '';
  return ((first + last) || '?').toUpperCase();
}

export type CommunityAction = 'confirm' | 'decline' | 'reset';

/**
 * Maps a button click on a member row to the next status. "reset" returns
 * the member to pending so the admin can un-publish without deleting.
 */
export function nextStatusOnAction(
  current: CommunityMemberStatus,
  action: CommunityAction
): CommunityMemberStatus {
  if (action === 'confirm') return 'confirmed';
  if (action === 'decline') return 'declined';
  // reset
  return 'pending';
}

/**
 * Normalize a user-pasted URL. Returns null for empty/whitespace input.
 * If the input is missing a scheme, prepends `https://` so admin can
 * paste "linkedin.com/in/foo" without breaking the link on the public card.
 */
export function normalizeUrl(input: string | null | undefined): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Loose email check — good enough to catch typos in the admin form
 * before we hit the database. The unique constraint on email is the
 * real guarantee.
 */
export function isValidEmail(email: string): boolean {
  const trimmed = (email || '').trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
