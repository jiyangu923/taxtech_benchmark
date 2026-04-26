-- ============================================================
-- Public stats RPC for the Home page hero strip
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Background: the Home page hero shows aggregate stats
-- (submission count, distinct industries, total revenue covered).
-- The submissions table requires auth via RLS, so anonymous
-- visitors would see zeros if we queried the table directly.
--
-- This SECURITY DEFINER function returns ONLY aggregates —
-- never individual rows, never PII (companyName etc.). Safe to
-- expose to anon and authenticated.
--
-- Revenue midpoints come from constants.ts OPTS_REVENUE buckets.
-- "prefer_not_to_answer" / unknown values contribute 0.
-- ============================================================

create or replace function public.get_public_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'totalSubmissions', count(*),
    'distinctIndustries', count(distinct nullif(industry, '')),
    'totalRevenue', coalesce(sum(case "revenueRange"
      when 'under_10m'   then 5000000
      when '10m_100m'    then 55000000
      when '100m_500m'   then 300000000
      when '500m_5b'     then 2750000000
      when 'over_5b'     then 10000000000
      when 'over_100b'   then 200000000000
      else 0
    end), 0)
  )
  into result
  from public.submissions
  where status = 'approved';

  return result;
end;
$$;

-- Both anon and authenticated visitors can call this RPC.
-- The function body limits exposure to status='approved'
-- aggregates only.
grant execute on function public.get_public_stats() to anon, authenticated;
