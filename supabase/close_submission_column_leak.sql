-- Close the companyName / userName column leak on submissions.
--
-- The old SELECT policy ("Users can read approved submissions and own") let ANY
-- authenticated user read every approved row — including companyName (promised
-- private/anonymous) and userName (a real person's name) — straight off the
-- PostgREST endpoint (GET /rest/v1/submissions?status=eq.approved&select=*).
-- No app screen ever showed a peer's identity, but the raw API handed it over.
--
-- Fix:
--   1. Base-table SELECT is now OWN-ROWS-ONLY for regular users. Admins keep
--      read-all via their existing "Admins can read all submissions" policy.
--   2. Peer benchmark data is served through get_visible_submissions(), a
--      SECURITY DEFINER function that returns the same rows with companyName /
--      userName NULLed for every viewer EXCEPT the row's owner and admins.
--
-- getMySubmission() (own row, base table) and the admin read-all policy are
-- untouched, so survey prefill and the admin dashboard/CSV keep full data. The
-- client's getSubmissions() calls the function and falls back to a direct read
-- only when the function is missing (pre-migration), so a code deploy can't get
-- ahead of this SQL.
--
-- Idempotent: safe to re-run.

-- 1) Regular users can only read their OWN submission rows off the base table.
drop policy if exists "Users can read approved submissions and own" on public.submissions;
create policy "Users can read own submission"
  on public.submissions for select
  using (auth.uid() = "userId");

-- 2) Sanitized, admin-aware peer feed. Returns is_current rows the caller is
--    allowed to analyze (all approved rows, plus their own row at any status,
--    plus everything for admins), with companyName/userName blanked for rows the
--    caller neither owns nor (as admin) governs. jsonb round-trip nulls exactly
--    those two fields without enumerating the ~40 other columns (schema-drift proof).
create or replace function public.get_visible_submissions()
returns setof public.submissions
language sql
stable
security definer
set search_path = public
as $$
  select (
    jsonb_populate_record(
      null::public.submissions,
      to_jsonb(s) || jsonb_build_object(
        'companyName',
          case when s."userId" = auth.uid()
                 or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
               then s."companyName" else null end,
        'userName',
          case when s."userId" = auth.uid()
                 or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
               then s."userName" else null end
      )
    )
  ).*
  from public.submissions s
  where s.is_current = true
    and (
      s.status = 'approved'
      or s."userId" = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
$$;

grant execute on function public.get_visible_submissions() to authenticated;

-- Verify after running:
--   As a NON-admin user, GET /rest/v1/submissions?status=eq.approved returns only
--   your own row; POST /rest/v1/rpc/get_visible_submissions returns peers with
--   "companyName": null and "userName": null. As admin, both return full data.
