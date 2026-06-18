-- ============================================================
-- Fix: non-admin users can't archive their prior submission, so every
-- re-submit leaves a DUPLICATE current row.
--
-- Root cause: the submissions table's only UPDATE policy is admin-only
-- ("Admins can update submission status", schema.sql). A normal user's
-- client-side archive (UPDATE is_current = false) is therefore silently
-- denied by RLS — it affects 0 rows and returns no error — so the old row
-- stays is_current = true. The next insert adds another is_current row, and
-- the admin Submissions view (which filters is_current = true) shows two
-- records per user. Peer comparisons also double-count the user.
--
-- Fix: a SECURITY DEFINER function the user CAN call to archive only their
-- OWN prior current rows. It filters by auth.uid() (no cross-user access) and
-- only flips is_current — it never touches status, so it cannot be used to
-- self-approve. createSubmission() calls this right after inserting the new
-- row, passing the new row's id to keep.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query. Idempotent.
-- ============================================================

create or replace function public.archive_my_submissions_except(keep_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.submissions
     set is_current = false
   where "userId" = auth.uid()
     and is_current = true
     and id <> keep_id;
$$;

revoke all on function public.archive_my_submissions_except(uuid) from public;
grant execute on function public.archive_my_submissions_except(uuid) to authenticated;

-- ── One-time cleanup of EXISTING duplicates ──────────────────────────────────
-- Keep the newest is_current row per user (by submittedAt, tie-broken by id);
-- archive the rest. Safe to re-run — after the first run each user has exactly
-- one current row, so subsequent runs match nothing.
update public.submissions s
   set is_current = false
 where s.is_current = true
   and exists (
     select 1 from public.submissions s2
      where s2."userId" = s."userId"
        and s2.is_current = true
        and (s2."submittedAt" > s."submittedAt"
             or (s2."submittedAt" = s."submittedAt" and s2.id > s.id))
   );
