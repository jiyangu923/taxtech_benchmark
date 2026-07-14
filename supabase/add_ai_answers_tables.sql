-- Phase 0 (AI harness): answer persistence + per-answer feedback + CP1 reports.
--
--   ai_answers      — every Taxi Q&A, written server-side by /api/claude.
--                     This is simultaneously the audit trail ("defend your AI
--                     in an audit"), the eval-mining source, and the anchor for
--                     per-answer feedback. See docs/AI_HARNESS_PLAN.md L5.
--   answer_reports  — CP1: structured "report a wrong fact" (expected answer +
--                     optional source), admin-reviewed; accepted reports become
--                     golden-set eval candidates.
--
-- Retention (CEO review Q-S3, approved): 12-month rolling purge of raw Q&A;
-- rows linked to ratings/reports/evals are kept. purge_old_ai_answers() below —
-- schedule it monthly (Supabase Dashboard → Database → Cron) or run manually.
--
-- Idempotent: safe to re-run.

create table if not exists public.ai_answers (
  id           uuid primary key default gen_random_uuid(),
  "userId"     uuid not null references public.profiles(id) on delete cascade,
  question     text not null,
  answer       jsonb not null,          -- parsed TaxiResponse (analysis/chart/followUps/sources) or {text}
  model        text,
  usage        jsonb,                    -- input/output/cache token counts
  rating       smallint check (rating in (-1, 1)),
  rated_at     timestamptz,
  eval_linked  boolean not null default false,  -- promoted into the golden set → retention keeps it
  created_at   timestamptz not null default now()
);

create index if not exists ai_answers_user_created_idx
  on public.ai_answers ("userId", created_at desc);

alter table public.ai_answers enable row level security;

-- Members read their own answers; admins read all (eval mining). Inserts happen
-- ONLY via the service role in /api/claude (no insert policy on purpose).
drop policy if exists "Users read own ai answers" on public.ai_answers;
create policy "Users read own ai answers"
  on public.ai_answers for select
  using (auth.uid() = "userId");

drop policy if exists "Admins read all ai answers" on public.ai_answers;
create policy "Admins read all ai answers"
  on public.ai_answers for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Rating flows through a narrow SECURITY DEFINER RPC (repo pattern — users have
-- no UPDATE policy, so they can't touch any other column).
create or replace function public.rate_my_answer(answer_id uuid, new_rating smallint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_answers
     set rating = case when new_rating in (-1, 1) then new_rating else null end,
         rated_at = now()
   where id = answer_id
     and "userId" = auth.uid();
$$;
grant execute on function public.rate_my_answer(uuid, smallint) to authenticated;

-- ── CP1: structured wrong-fact reports ──────────────────────────────────────

create table if not exists public.answer_reports (
  id              uuid primary key default gen_random_uuid(),
  answer_id       uuid not null references public.ai_answers(id) on delete cascade,
  "userId"        uuid not null references public.profiles(id) on delete cascade,
  expected_answer text not null check (char_length(expected_answer) between 3 and 4000),
  source_url      text check (source_url is null or char_length(source_url) <= 2000),
  status          text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists answer_reports_status_idx on public.answer_reports (status, created_at desc);

alter table public.answer_reports enable row level security;

-- Report only your OWN answers (prevents probing others' answer ids).
drop policy if exists "Users report own answers" on public.answer_reports;
create policy "Users report own answers"
  on public.answer_reports for insert
  with check (
    auth.uid() = "userId"
    and exists (select 1 from public.ai_answers a where a.id = answer_id and a."userId" = auth.uid())
  );

drop policy if exists "Users read own reports" on public.answer_reports;
create policy "Users read own reports"
  on public.answer_reports for select
  using (auth.uid() = "userId");

drop policy if exists "Admins read all reports" on public.answer_reports;
create policy "Admins read all reports"
  on public.answer_reports for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins update reports" on public.answer_reports;
create policy "Admins update reports"
  on public.answer_reports for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- A report marks its answer as eval-relevant so retention keeps the pair.
create or replace function public.mark_answer_eval_linked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_answers set eval_linked = true where id = new.answer_id;
  return new;
end;
$$;

drop trigger if exists trg_mark_answer_eval_linked on public.answer_reports;
create trigger trg_mark_answer_eval_linked
  after insert on public.answer_reports
  for each row execute function public.mark_answer_eval_linked();

-- ── Retention (Q-S3): 12-month rolling purge ────────────────────────────────
-- Keeps: rated rows, eval-linked rows, rows with reports (eval_linked covers them).
create or replace function public.purge_old_ai_answers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from public.ai_answers
   where created_at < now() - interval '12 months'
     and eval_linked = false
     and rating is null;
  get diagnostics purged = row_count;
  return purged;
end;
$$;
-- Schedule monthly in Supabase (or run: select purge_old_ai_answers();)
