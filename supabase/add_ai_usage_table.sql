-- ============================================================
-- ai_usage: per-user AI (Taxi / Claude) spend tracking for rate limiting.
--
-- Each row tracks one user's spend in the current rolling 24h window. The
-- /api/claude serverless function (service role) reads this before each call
-- and blocks the user once they pass the daily limit, then writes the running
-- cost after each call. The window resets 24h after window_started_at.
--
-- Cost is USD, derived from Claude Haiku 4.5 token usage
-- ($1/M input, $5/M output, ~$0.10/M cached input).
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query. Idempotent.
-- ============================================================

create table if not exists public.ai_usage (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  window_started_at  timestamptz not null default now(),
  cost_usd           numeric(12,6) not null default 0,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  updated_at         timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

-- Users may READ their own usage (so the app can show remaining budget).
-- Writes happen only via the service role in /api/claude, which bypasses RLS;
-- there is deliberately NO user insert/update policy (users can't reset their
-- own meter).
drop policy if exists "Users read own ai_usage" on public.ai_usage;
create policy "Users read own ai_usage"
  on public.ai_usage for select
  using (user_id = auth.uid());
