-- Founding-cohort cap enforcement (pilot launch).
--
-- Business rule: the founding cohort is capped (default 25 distinct approved
-- members). Once full, a NEW person's submission is routed to 'waitlist'
-- instead of 'approved' — they keep no analytics/AI access until an admin
-- promotes them. Existing members editing their own submission are NEVER
-- bumped and never consume a new spot.
--
-- Why a trigger (not client-side): RLS lets a user INSERT their own submission
-- row, so a client that sets status='approved' itself could walk straight past
-- any client-side cap. The decision MUST live server-side. A BEFORE INSERT
-- trigger overrides the status the client asked for.
--
-- Race safety: two people submitting the 25th/26th spot at the same moment
-- could both read "24 approved" and both get in. A transaction-level advisory
-- lock serializes the cap decision so only one wins the last seat.
--
-- The cap is read from settings.foundingCohortMax (falling back to 25) so you
-- can tune the cohort size — or temporarily lower it to test waitlisting —
-- without a redeploy. Keep it in sync with MAX_PARTICIPANTS in constants.ts.
--
-- Idempotent: safe to re-run.

-- The status column's CHECK constraint predates the waitlist state and only
-- allows pending/approved/rejected — widen it, or the trigger's 'waitlist'
-- write is rejected at INSERT time.
alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('pending', 'approved', 'rejected', 'waitlist'));

create or replace function public.enforce_founding_cohort_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cohort_max      integer;
  approved_others integer;
begin
  -- Only gate rows trying to ENTER the live cohort as an approved, current row.
  -- Drafts, re-submits that archive later, rejects, and already-waitlisted rows
  -- are untouched.
  if new.status is distinct from 'approved' or new.is_current is not true then
    return new;
  end if;

  -- Serialize concurrent cap decisions (see header). Transaction-scoped: the
  -- lock releases automatically at COMMIT/ROLLBACK.
  perform pg_advisory_xact_lock(hashtext('founding_cohort_cap'));

  cohort_max := coalesce(
    (select nullif(btrim(value), '')::integer
       from public.settings
      where key = 'foundingCohortMax'),
    25
  );

  -- Count DISTINCT approved members OTHER than this user. Excluding the caller
  -- means an existing member re-submitting (their prior approved row is still
  -- is_current at this point — it is archived just after) is never counted
  -- against the cap and never demoted to waitlist.
  select count(distinct s."userId")
    into approved_others
    from public.submissions s
   where s.status = 'approved'
     and s.is_current = true
     and s."userId" <> new."userId";

  if approved_others >= cohort_max then
    new.status := 'waitlist';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_founding_cohort_cap on public.submissions;
create trigger trg_enforce_founding_cohort_cap
  before insert on public.submissions
  for each row execute function public.enforce_founding_cohort_cap();

-- To test waitlisting without 25 real signups, temporarily lower the cap, run a
-- fresh signup + submit (it lands as 'waitlist'), then restore:
--   insert into settings(key, value) values ('foundingCohortMax','1')
--     on conflict (key) do update set value = excluded.value;
--   -- ...run the test...
--   delete from settings where key = 'foundingCohortMax';   -- back to default 25
