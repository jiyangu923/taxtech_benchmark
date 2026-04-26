-- ============================================================
-- Add optional company name column to submissions
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Background: contributors asked for an optional "Company Name"
-- field in Section 1 of the survey. The platform stays
-- anonymous for peer comparisons — this column is for admin
-- tracking and the contributor's own reference only. It must
-- never be exposed in public analytics or peer dashboards.
-- ============================================================

alter table public.submissions
  add column if not exists "companyName" text;

-- No new RLS policies needed: the existing
-- "Users can read approved submissions and own" policy already
-- restricts non-admin reads to (status='approved' OR userId=auth.uid()).
-- The application layer must NOT include companyName in the
-- payload sent to the public Report / peer comparison views.
