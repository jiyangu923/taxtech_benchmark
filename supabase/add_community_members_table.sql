-- ============================================================
-- community_members: public-facing list of consenting community members
-- shown on /community for social proof.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Each row is one person who has agreed to be listed. PR 1 keeps the
-- workflow simple: admin creates rows (status='pending') and manually
-- flips status to 'confirmed' after the member confirms consent
-- externally. PR 2 will add email-token confirmation + Supabase
-- Storage photo upload.
--
-- Public visitors can only SELECT rows where status='confirmed'.
-- Admins have full CRUD.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.community_members (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  role          text,
  company       text,
  linkedin_url  text,
  photo_url     text,
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'declined')),
  confirmed_at  timestamptz,
  declined_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null
);

-- Admin list view: status filter + newest-first
create index if not exists community_members_status_created_idx
  on public.community_members (status, created_at desc);

-- Public page query: only confirmed rows, newest-confirmed-first
create index if not exists community_members_confirmed_idx
  on public.community_members (confirmed_at desc)
  where status = 'confirmed';

alter table public.community_members enable row level security;

-- Drop and recreate so re-running this script picks up any policy edits
drop policy if exists "Public can read confirmed members" on public.community_members;
drop policy if exists "Admins can read all members"       on public.community_members;
drop policy if exists "Admins can insert members"         on public.community_members;
drop policy if exists "Admins can update members"         on public.community_members;
drop policy if exists "Admins can delete members"         on public.community_members;

-- Anyone (auth or anon) can read confirmed members — this is the public list.
create policy "Public can read confirmed members"
  on public.community_members for select
  using (status = 'confirmed');

-- Admins can read every row (including pending/declined) for the CRUD tab.
create policy "Admins can read all members"
  on public.community_members for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can insert members"
  on public.community_members for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update members"
  on public.community_members for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can delete members"
  on public.community_members for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
