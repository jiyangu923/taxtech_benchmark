-- ============================================================
-- Seed: J Gu as the first community member (auto-confirmed).
--
-- Run AFTER add_community_members_table.sql.
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Founder self-consent — bypasses the email-token flow that PR 2
-- will add for everyone else. Idempotent: safe to re-run; on
-- conflict it refreshes status/role/company but preserves any
-- linkedin_url/photo_url already set via the admin UI.
-- ============================================================

insert into public.community_members
  (email, name, role, company, status, confirmed_at)
values
  ('jiyangu923@gmail.com', 'J Gu', 'Founder', 'taxbenchmark.ai', 'confirmed', now())
on conflict (email) do update set
  name         = excluded.name,
  role         = excluded.role,
  company      = excluded.company,
  status       = 'confirmed',
  confirmed_at = coalesce(public.community_members.confirmed_at, excluded.confirmed_at),
  updated_at   = now();
