-- Pivot (2026-07-14): the founding-cohort cap NO LONGER GATES access.
--
-- Product decision: everyone who submits the survey gets instant AI + analytics
-- (great launch UX — no "you're on the waitlist" wall when a LinkedIn post
-- drives a spike). "25 founding members" survives ONLY as a front-end marketing
-- label (MAX_PARTICIPANTS in constants.ts / ParticipantCounter), not a DB gate.
--
-- What this does:
--   1. Drops the enforce_founding_cohort_cap trigger + function, so every
--      submission keeps the status createSubmission gives it ('approved',
--      api.ts). No new 'waitlist' rows are ever produced.
--   2. Releases anyone currently parked on the waitlist into the cohort.
--
-- The status CHECK-constraint widening from add_cohort_cap_trigger.sql stays
-- ('waitlist' remains a legal value — harmless with no writer). Any
-- settings.foundingCohortMax row is now ignored; safe to leave or delete.
--
-- To RE-ENABLE a hard cap later, re-run add_cohort_cap_trigger.sql.
-- Idempotent: safe to re-run.

drop trigger if exists trg_enforce_founding_cohort_cap on public.submissions;
drop function if exists public.enforce_founding_cohort_cap();

-- Release currently-waitlisted members (if any) — they submitted, they're in.
update public.submissions
   set status = 'approved'
 where status = 'waitlist' and is_current = true;
