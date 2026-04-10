-- ============================================================
-- Fix RLS Policies + Notifications Table — Run in Supabase SQL Editor
-- Addresses: settings readable by non-admins, submissions unfiltered,
--            notify-me persistence
-- ============================================================

-- 0. Create notifications table for "Notify Me" persistence
create table if not exists public.notifications (
  user_id uuid references auth.users on delete cascade not null,
  type    text not null,
  created_at timestamptz default now(),
  primary key (user_id, type)
);

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can insert own notifications"
  on public.notifications for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

create policy "Admins can read all notifications"
  on public.notifications for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- First verify RLS is enabled (idempotent)
alter table public.settings    enable row level security;
alter table public.submissions enable row level security;
alter table public.profiles    enable row level security;

-- ─── Fix Settings: drop all existing policies and recreate ─────────────────

drop policy if exists "Admins can read settings"   on public.settings;
drop policy if exists "Admins can upsert settings"  on public.settings;
drop policy if exists "Admins can update settings"   on public.settings;
-- Drop any overly permissive policies that may have been added manually
drop policy if exists "Enable read access for all users"         on public.settings;
drop policy if exists "Enable read access for authenticated users" on public.settings;
drop policy if exists "Allow authenticated access"               on public.settings;

create policy "Admins can read settings"
  on public.settings for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can insert settings"
  on public.settings for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update settings"
  on public.settings for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── Fix Submissions: ensure non-admin users only see approved + own ───────

drop policy if exists "Users can read approved submissions and own" on public.submissions;
drop policy if exists "Admins can read all submissions"             on public.submissions;
-- Drop any overly permissive policies that may have been added manually
drop policy if exists "Enable read access for all users"            on public.submissions;
drop policy if exists "Enable read access for authenticated users"  on public.submissions;
drop policy if exists "Allow authenticated access"                  on public.submissions;

create policy "Users can read approved submissions and own"
  on public.submissions for select
  using (
    auth.uid() is not null
    and (status = 'approved' or "userId" = auth.uid())
  );

create policy "Admins can read all submissions"
  on public.submissions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
