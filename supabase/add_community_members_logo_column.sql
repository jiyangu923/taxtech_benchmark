-- ============================================================
-- Adds a company_logo_url column to community_members so cards on
-- /community can show a small company logo next to the company name
-- (boosts credibility / quick brand recognition).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- The column stores any URL — typically a Google favicon URL
-- (https://www.google.com/s2/favicons?domain=<domain>&sz=128) since
-- that service is unauthenticated, reliable, and returns a small
-- square icon optimized for inline display. Admins can paste any
-- other URL if they want a custom brand image.
--
-- The migration also backfills the four existing rows with Google
-- favicon URLs derived from the company name.
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.community_members
  add column if not exists company_logo_url text;

-- Backfill the four existing members with Google favicon URLs.
-- Pinned to email so re-running this migration after the row data has
-- moved on (e.g. someone changed their company) won't clobber a
-- manually-set custom logo.
update public.community_members
set company_logo_url = case email
    when 'jiyangu923@gmail.com' then 'https://www.google.com/s2/favicons?domain=meta.com&sz=128'
    when 'rob@fonoa.com'        then 'https://www.google.com/s2/favicons?domain=fonoa.com&sz=128'
    when 'lesaimard@gmail.com'  then 'https://www.google.com/s2/favicons?domain=expedia.com&sz=128'
    when 'akajain@google.com'   then 'https://www.google.com/s2/favicons?domain=google.com&sz=128'
  end
where email in (
    'jiyangu923@gmail.com',
    'rob@fonoa.com',
    'lesaimard@gmail.com',
    'akajain@google.com'
  )
  and company_logo_url is null;
