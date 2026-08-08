-- ============================================================
-- Lock down profiles: users must not set their own role/email
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Found by: adversarial review of PR #148 (benchmark report email)
-- Prereqs: schema.sql + add_reminders_schema.sql already applied
--          (the update grant references the reminder columns).
-- Deploy order: run this only AFTER the PR #150 app deploy is live —
--          the old client sent email on profile saves and role on the
--          self-heal insert; both would start failing with 42501.
--
-- Problem: "Users can update own profile" RLS allows UPDATE of ANY
--          column on the caller's own row, and the self-heal INSERT
--          path accepted a client-supplied role. Consequences:
--            1. update({role:'admin'}) self-promotes. /api/claude and
--               /api/benchmark-report read profiles.role server-side,
--               so self-promotion bypasses the $5/24h AI meter.
--            2. update({email:...}) repoints profiles.email — a live
--               send-target for the reminder cron and release letters.
--
-- Fix: column-level privileges + an email pin on the insert policy.
--      RLS decides WHICH ROWS you can touch; column grants decide
--      WHICH COLUMNS. authenticated keeps row-level self-access but
--      may only write the columns granted below; everything else
--      fails loudly with 42501 "permission denied". At INSERT time
--      (the fetchOrCreateProfile self-heal) email must equal the
--      verified JWT email, so a healed row can't carry a forged
--      address either.
--
-- Unaffected (verified before writing this):
--   * promote_to_admin / demote_from_admin (fix_admin_role_update.sql)
--     — SECURITY DEFINER, owner privileges. Still the ONLY role path.
--   * handle_new_user signup trigger — SECURITY DEFINER; bypasses RLS,
--     so the tightened insert policy never applies to it.
--   * Server code under /api/* — service_role key, grants untouched.
--   * Client self-serve paths — name edits (updateUserProfile now
--     sends name only), the /profile reminder toggle
--     (email_reminders_enabled), and reminder bookkeeping
--     (last_reminder_sent_at) are explicitly re-granted.
--
-- ⚠️ Future gotcha: adding a NEW user-editable column to profiles now
--    requires an explicit `grant update (that_column)` here, or client
--    writes will fail with 42501.
-- ============================================================

begin;

-- UPDATE: drop the blanket table-level grant, re-grant only safe columns.
revoke update on table public.profiles from authenticated, anon;
grant update (name, email_reminders_enabled, last_reminder_sent_at)
  on table public.profiles to authenticated;

-- INSERT (the fetchOrCreateProfile self-heal in services/api.ts):
-- id/name/email only — role always lands as the column default 'user'.
revoke insert on table public.profiles from authenticated, anon;
grant insert (id, name, email) on table public.profiles to authenticated;

-- Pin email at INSERT to the verified auth identity. Without this, a
-- user whose row is missing could self-heal with an arbitrary email
-- (any address not already in the table) and receive cron/release
-- mail for it. The signup trigger is SECURITY DEFINER and unaffected.
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

commit;

-- ============================================================
-- Verify (optional, as any logged-in NON-admin in the browser console):
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', uid)
--     → must fail: "permission denied for table profiles"
--   supabase.from('profiles').update({ name: 'New Name' }).eq('id', uid)
--     → must still succeed
-- The repo also has an automated live check: GitHub Actions →
-- "Intake live test" → mode: rls.
-- ============================================================
