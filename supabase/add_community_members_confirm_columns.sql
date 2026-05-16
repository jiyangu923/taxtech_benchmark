-- ============================================================
-- Adds confirmation-token columns to community_members so PR 2's
-- email-token flow can let a member confirm or decline a public
-- listing without an account.
--
-- Run AFTER add_community_members_table.sql.
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Trust model:
--   - Admin clicks "Send invite" in the Community tab.
--   - Server generates a fresh uuid, stores it on the row, and
--     sets expiry to now()+7d.
--   - Server emails the member a link containing the token.
--   - When the member loads /confirm-member?token=…, the server
--     validates the token against this column (must be unexpired
--     and the row must be in status='pending').
--   - On confirm or decline, the token is cleared so the link
--     can't be replayed.
--
-- The token is a plain uuid (not hashed). Acceptable risk for
-- social-proof opt-in: a leaked token only lets an attacker flip
-- one pending row to confirmed/declined, which the admin can
-- correct via the existing Community tab.
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.community_members
  add column if not exists confirm_token            uuid,
  add column if not exists confirm_token_expires_at timestamptz,
  add column if not exists invited_at               timestamptz;

-- Partial unique index — null tokens are allowed (rows in confirmed/declined
-- state clear their token) but two pending rows can't accidentally share one.
create unique index if not exists community_members_confirm_token_unique
  on public.community_members (confirm_token)
  where confirm_token is not null;
