/**
 * Shared env diagnostics for the live scripts. Exists because a single wrong
 * paste (publishable key stored as SUPABASE_SERVICE_ROLE_KEY) produced two
 * silent, confusing failures: RLS filtering reads to zero rows ("tax_rules is
 * empty" right after seeding) and auth-admin 401s. Fail loudly and name the fix.
 */

/**
 * Sanity-check the shape of a value claiming to be a Supabase service key.
 * Accepts: legacy service_role JWT ('eyJ…') or a new secret key ('sb_secret_…').
 * Returns a human-readable error naming the exact mistake, or null when the
 * shape is plausible (actual privileges are still proven at first use).
 */
export function checkServiceKeyShape(key: string): string | null {
  if (key.startsWith('sb_publishable_')) {
    return 'SUPABASE_SERVICE_ROLE_KEY is set to the PUBLISHABLE key (sb_publishable_…) — that key has anon privileges: RLS silently filters reads to zero rows and admin endpoints 401. Paste a SECRET key instead: Supabase dashboard → Settings → API keys → "Secret keys" → create/reveal (sb_secret_…), or the Legacy tab\'s service_role JWT (eyJ…). Then: gh secret set SUPABASE_SERVICE_ROLE_KEY -R jiyangu923/taxtech_benchmark';
  }
  if (key.startsWith('sb_secret_') || key.startsWith('eyJ')) return null;
  return `SUPABASE_SERVICE_ROLE_KEY has an unrecognized shape (starts with "${key.slice(0, 8)}…") — expected sb_secret_… or a legacy service_role JWT (eyJ…).`;
}
