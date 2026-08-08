-- ============================================================
-- Lock down profiles: users must not set their own role/email
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Found by: adversarial review of PR #148 (benchmark report email)
--
-- Problem: "Users can update own profile" RLS allows UPDATE of ANY
--          column on the caller's own row, and the self-heal INSERT
--          path accepts a client-supplied role. Two live consequences:
--            1. update({role:'admin'}) self-promotes. /api/claude and
--               /api/benchmark-report read profiles.role server-side,
--               so self-promotion bypasses the $5/24h AI meter.
--            2. update({email:...}) repoints profiles.email anywhere.
--               (Report emails already go to the verified auth identity
--               — PR #149 — but any future code reading profiles.email
--               would be forgeable again.)
--
-- Fix: column-level privileges. RLS decides WHICH ROWS you can touch;
--      column grants decide WHICH COLUMNS. authenticated keeps
--      row-level self-access but may only write the columns below.
--      Everything else fails loudly with 42501 "permission denied".
--
-- Unaffected (verified before writing this):
--   * promote_to_admin / demote_from_admin (fix_admin_role_update.sql)
--     — SECURITY DEFINER, run with the function owner's privileges.
--     This stays the ONLY path that changes role.
--   * handle_new_user signup trigger — SECURITY DEFINER.
--   * Server code under /api/* — uses the service_role key, whose
--     grants are untouched.
--   * Client self-serve paths — name edits, the /profile reminder
--     toggle (email_reminders_enabled), and reminder bookkeeping
--     (last_reminder_sent_at) are explicitly re-granted.
--
-- ⚠️ Future gotcha: adding a NEW user-editable column to profiles now
--    requires an explicit `grant update (that_column)` here, or client
--    writes will fail with 42501.
-- ============================================================

-- UPDATE: drop the blanket table-level grant, re-grant only safe columns.
revoke update on table public.profiles from authenticated, anon;
grant update (name, email_reminders_enabled, last_reminder_sent_at)
  on table public.profiles to authenticated;

-- INSERT (the fetchOrCreateProfile self-heal in services/api.ts):
-- everything except role, which now always lands as the column
-- default 'user'. Admins are made only via promote_to_admin.
revoke insert on table public.profiles from authenticated, anon;
grant insert (id, name, email) on table public.profiles to authenticated;

-- ============================================================
-- Verify (optional, as any logged-in NON-admin in the browser console):
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', uid)
--     → must fail: "permission denied for table profiles"
--   supabase.from('profiles').update({ name: 'New Name' }).eq('id', uid)
--     → must still succeed
-- The repo also has an automated live check: GitHub Actions →
-- "Intake live test" → mode: rls.
-- ============================================================
