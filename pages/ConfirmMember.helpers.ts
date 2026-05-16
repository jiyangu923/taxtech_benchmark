/**
 * Pure helpers for the /confirm-member page. Kept separate so they can be
 * unit-tested without rendering the React component.
 */

export const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Flat result shape (rather than a discriminated union) because the project's
 * tsconfig doesn't enable `strict`, so `ok: true | false` doesn't narrow on
 * `if (!result.ok)`. Both fields are always populated — `ext` is meaningful
 * only when `ok` is true; `reason` is meaningful only when `ok` is false.
 */
export interface PhotoValidation {
  ok: boolean;
  ext: string;
  reason: string;
}

/**
 * Extract the confirmation token from a URL search string.
 * Returns null if missing or empty. Trims surrounding whitespace.
 */
export function parseTokenFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const t = (params.get('token') || '').trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the URL search string includes `decline=1` — emitted by
 * the "Or click here to decline" link in the invite email so the page can
 * skip straight to the decline confirmation UI.
 */
export function parseDeclineIntent(search: string): boolean {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return params.get('decline') === '1';
  } catch {
    return false;
  }
}

/**
 * Extract a lowercased extension (no dot) from a filename. Falls back to
 * 'jpg' if there's no `.` in the name — Supabase still accepts the upload,
 * we just lose the type hint.
 */
export function extFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0 || idx === name.length - 1) return 'jpg';
  return name.slice(idx + 1).toLowerCase();
}

/**
 * Validate a photo file before requesting an upload URL. Catches the obvious
 * client-side errors so we don't waste a serverless round trip on a 5GB PDF.
 */
export function validatePhoto(file: File): PhotoValidation {
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, ext: '', reason: `Photo is too large (max ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB).` };
  }
  const ext = extFromFilename(file.name);
  if (!ALLOWED_PHOTO_EXTENSIONS.includes(ext as (typeof ALLOWED_PHOTO_EXTENSIONS)[number])) {
    return { ok: false, ext: '', reason: `Unsupported file type. Use ${ALLOWED_PHOTO_EXTENSIONS.join(', ')}.` };
  }
  return { ok: true, ext, reason: '' };
}

/**
 * Maps an HTTP status code from the /api/community/* endpoints to a
 * user-facing message. Keeps the messaging tone consistent and gives the
 * page one place to update wording.
 */
export function errorMessageForStatus(status: number, fallback?: string): string {
  switch (status) {
    case 401:
      return 'This invite link is not valid.';
    case 409:
      return 'This invite has already been used. If you need to update your listing, ask the admin to send a new invite.';
    case 410:
      return 'This invite link has expired. Ask the admin to send a new one.';
    case 502:
      return 'Could not save your response right now. Please try again in a moment.';
    default:
      return fallback || 'Something went wrong. Please try again.';
  }
}
