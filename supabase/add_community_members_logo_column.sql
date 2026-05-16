-- ============================================================
-- Adds a company_logo_url column + auto-derivation trigger so cards
-- on /community can show a small company logo next to the company
-- name. Boosts credibility / quick brand recognition.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Three pieces:
--   1. Column: company_logo_url text (nullable)
--   2. Trigger function: derives a Google favicon URL from the
--      member's corporate email domain (or, for personal-provider
--      emails, falls back to a guess based on the company name).
--      Only fires when the row becomes confirmed and no URL is set,
--      so admin overrides via the form stay sticky.
--   3. Backfill: stamps the four existing rows with Google favicon
--      URLs (Meta, Fonoa, Expedia, Google) so they get logos
--      immediately without waiting for any further write.
--
-- Logo URL pattern: https://www.google.com/s2/favicons?domain=<d>&sz=128
-- (Google's favicon service is unauthenticated and reliable; Clearbit's
-- free logo API was deprecated.)
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Column
alter table public.community_members
  add column if not exists company_logo_url text;

-- 2. Trigger function: auto-derive when row becomes confirmed with no logo set.
-- BEFORE INSERT OR UPDATE so the value lands in the same write.
create or replace function public.derive_community_member_logo_url()
  returns trigger
  language plpgsql
  as $$
declare
  email_domain    text;
  guess_domain    text;
  personal_providers constant text[] := array[
    'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com'
  ];
begin
  -- Skip when the caller already set a URL — admin manual overrides win.
  if new.company_logo_url is not null and new.company_logo_url <> '' then
    return new;
  end if;
  -- Only derive at the moment of confirmation, not on every pending edit.
  -- INSERT path: row arrives as confirmed (e.g. seed SQL, J Gu).
  -- UPDATE path: status flips to confirmed (admin Mark Confirmed, member
  --   /confirm-member action). If it was already confirmed before this
  --   update, don't touch — preserves whatever the admin had set.
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    return new;
  end if;
  if new.company is null or btrim(new.company) = '' then
    return new;
  end if;

  -- First preference: the corporate domain from the member's email.
  email_domain := lower(split_part(coalesce(new.email, ''), '@', 2));
  if email_domain <> '' and not (email_domain = any(personal_providers)) then
    new.company_logo_url := 'https://www.google.com/s2/favicons?domain=' || email_domain || '&sz=128';
    return new;
  end if;

  -- Fallback for personal-email members: lowercased company name with
  -- non-alphanumerics stripped + '.com' ("Expedia Group" -> expediagroup.com).
  -- Imperfect; admin can paste the correct URL to override if the guess
  -- doesn't resolve to a real domain.
  guess_domain := regexp_replace(lower(new.company), '[^a-z0-9]', '', 'g');
  if guess_domain <> '' then
    new.company_logo_url := 'https://www.google.com/s2/favicons?domain=' || guess_domain || '.com&sz=128';
  end if;

  return new;
end;
$$;

drop trigger if exists community_members_derive_logo_url on public.community_members;
create trigger community_members_derive_logo_url
  before insert or update on public.community_members
  for each row execute function public.derive_community_member_logo_url();

-- 3. Backfill the four existing members. The trigger only fires on new writes,
-- so existing rows need an explicit update. Pinned to email so a re-run
-- doesn't clobber a manually-set custom logo (the WHERE filters to nulls only).
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
