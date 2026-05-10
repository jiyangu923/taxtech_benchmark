-- ============================================================
-- Reminders v1 schema — history, versioning, email preferences
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Adds the columns needed for:
--   1. Keeping submission history (is_current flag instead of
--      delete-then-insert). Required for trend analysis later.
--   2. Survey versioning (admin can bump current_survey_version
--      to mark every existing submission as outdated, triggering
--      a "please update" reminder).
--   3. Per-user email-reminder preferences (opt-out).
--   4. Tracking when the last reminder was sent so we don't spam.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Submission history + versioning
alter table public.submissions
  add column if not exists is_current boolean not null default true,
  add column if not exists survey_version int not null default 1;

create index if not exists submissions_user_current_idx
  on public.submissions ("userId", is_current);

create index if not exists submissions_user_submitted_idx
  on public.submissions ("userId", "submittedAt" desc);

-- Backfill: any pre-existing rows are marked current with version 1
-- (no-op on fresh installs since defaults handle new inserts)
update public.submissions
  set is_current = true
  where is_current is null;

update public.submissions
  set survey_version = 1
  where survey_version is null;


-- 2. Profile email preferences + reminder tracking
alter table public.profiles
  add column if not exists email_reminders_enabled boolean not null default true,
  add column if not exists last_reminder_sent_at timestamptz;


-- 3. Current survey version setting
-- Stored in the existing key-value settings table. Bumping this value
-- causes every submission with survey_version < current_survey_version
-- to count as outdated for reminder purposes.
insert into public.settings (key, value)
  values ('current_survey_version', '1')
  on conflict (key) do nothing;


-- 4. RLS sanity check — no new policies needed.
-- Existing submissions policies already restrict by status='approved' OR
-- userId=auth.uid(). is_current and survey_version are read by the same
-- queries; no new access surface introduced.
-- Existing profiles policies allow each user to update their own row,
-- so email_reminders_enabled can be flipped from /profile without changes.
