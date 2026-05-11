-- ============================================================
-- feedback: user-submitted bug reports / feature requests / general feedback
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Anyone (including anonymous visitors) can INSERT — the floating
-- feedback widget on the public site needs to work without login.
-- Only admins can SELECT / UPDATE / DELETE.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  user_email   text,
  user_name    text,
  type         text not null check (type in ('bug', 'feature', 'general')),
  message      text not null,
  page_path    text,
  user_agent   text,
  status       text not null default 'new' check (status in ('new', 'triaged', 'resolved', 'archived')),
  admin_notes  text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Drop and recreate so re-running this script picks up any policy edits
drop policy if exists "Anyone can submit feedback"  on public.feedback;
drop policy if exists "Admins can read feedback"    on public.feedback;
drop policy if exists "Admins can update feedback"  on public.feedback;
drop policy if exists "Admins can delete feedback"  on public.feedback;

-- Anyone (auth or anon) can insert. We don't expose ids back, just success.
create policy "Anyone can submit feedback"
  on public.feedback for insert
  with check (true);

create policy "Admins can read feedback"
  on public.feedback for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update feedback"
  on public.feedback for update
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

create policy "Admins can delete feedback"
  on public.feedback for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
