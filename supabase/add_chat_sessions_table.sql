-- ============================================================
-- chat_sessions: per-user Taxi conversation history
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Replaces the localStorage-only storage used in PRs #61 / #62
-- so sessions follow the user across devices instead of staying
-- on whatever browser created them.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.chat_sessions (
  id          text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  messages    jsonb not null default '[]'::jsonb
);

create index if not exists chat_sessions_user_recent_idx
  on public.chat_sessions (user_id, updated_at desc);

alter table public.chat_sessions enable row level security;

-- Drop and recreate so re-running this script picks up any policy edits
drop policy if exists "Users can read own chat sessions"   on public.chat_sessions;
drop policy if exists "Users can insert own chat sessions" on public.chat_sessions;
drop policy if exists "Users can update own chat sessions" on public.chat_sessions;
drop policy if exists "Users can delete own chat sessions" on public.chat_sessions;

create policy "Users can read own chat sessions"
  on public.chat_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own chat sessions"
  on public.chat_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own chat sessions"
  on public.chat_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own chat sessions"
  on public.chat_sessions for delete
  using (auth.uid() = user_id);
