/**
 * Detects Supabase invite / password-recovery links that should prompt the
 * user to set a password.
 *
 * The auth `type` can arrive in the query string (`?type=invite`) or the URL
 * hash (`#access_token=...&type=recovery`) depending on whether the project
 * uses the PKCE or implicit flow and which kind of link it is — so we match
 * against the whole URL rather than one location. This must be evaluated in
 * index.tsx BEFORE the PKCE `?code=` exchange wipes the query string.
 *
 * We deliberately match only `invite` and `recovery` (both require setting a
 * password) and NOT `signup` (those users already chose a password) or a plain
 * OAuth `?code=` login.
 */
export function isPasswordSetupUrl(url: string): boolean {
  return /[#?&]type=(invite|recovery)\b/.test(url);
}
