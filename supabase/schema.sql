-- ============================================================
-- TaxTech Benchmark — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. User profiles (auth.users is managed by Supabase Auth)
create table public.profiles (
  id     uuid references auth.users on delete cascade primary key,
  name   text not null,
  email  text not null unique,
  role   text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

-- 2. Survey submissions (camelCase columns match the TypeScript Submission type)
create table public.submissions (
  id         uuid primary key default gen_random_uuid(),
  "userId"   uuid references public.profiles on delete cascade not null,
  "userName" text not null,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  "submittedAt" timestamptz default now(),

  -- Section 1
  "companyProfile"          text[],
  "participationGoal"       text[],
  "respondentRole"          text,
  "ownedTaxFunctions"       text[],
  "ownedTaxFunctionsOther"  text,
  "organizationScope"       text,

  -- Section 2
  industry      text,
  "revenueRange" text,

  -- Section 3
  "taxTechLocation"       text,
  "centralizationModel"   text,
  "taxTechApproach"       text,
  "taxOutsourcingExtent"  text,

  -- Section 4
  "taxTechFTEsRange"                    text,
  "taxTechOutsourcedResourcesFTEsRange" text,
  "dataHostingPlatform"                 text,
  "dataHostingPlatformOther"            text,
  "taxTechSkillMixFrontendPercent"      numeric,
  "taxTechSkillMixBackendPercent"       numeric,
  "taxTechSkillMixDataEngineeringPercent" numeric,
  "taxTechSkillMixDevOpsPercent"        numeric,
  "taxTechSkillMixOtherPercent"         numeric,

  -- Section 5
  "taxBusinessFTEsRange"              text,
  "taxBusinessOutsourcingFTEsRange"   text,
  "planningSpecialistsPercent"        numeric,
  "complianceSpecialistsPercent"      numeric,
  "auditSpecialistsPercent"           numeric,
  "provisionSpecialistsPercent"       numeric,
  "otherSpecialistsPercent"           numeric,

  -- Section 6
  "taxCalculationAutomationRange"     text,
  "taxPaymentAutomationRange"         text,
  "withholdingTaxAutomationRange"     text,
  "complianceAutomationCoverageRange" text,
  "regulatoryChangeResponseTime"      text,
  "dataConfidence"                    text,

  -- Section 7
  "annualTaxFilingsRange"   text,
  "jurisdictionsCovered"    integer,
  "taxDataArchitecture"     text,

  -- Section 8
  "architecturePattern"         text,
  "dataFlow"                    text,
  "primaryProgrammingLanguages" text,
  "cloudProvider"               text,
  "cicdTools"                   text,

  -- Section 9
  "productRegulationEnablementCycle" text,
  "incidentResponseTime"             text,
  "p0IncidentsPerQuarter"            text,

  -- Section 10
  "financialCloseTotalDays"    integer,
  "financialCloseCompletionDay" integer,

  -- Section 11
  "aiAdopted"        boolean not null default false,
  "genAIAdoptionStage" text,
  "aiUseCases"         text,
  "additionalNotes"    text
);

-- 3. Key-value settings store (webhook URL, admin email list)
create table public.settings (
  key   text primary key,
  value text
);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.profiles    enable row level security;
alter table public.submissions enable row level security;
alter table public.settings    enable row level security;

-- Profiles: users can read/update/insert their own profile; admins can read all
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Submissions: users see approved submissions + their own; admins see all
create policy "Users can read approved submissions and own"
  on public.submissions for select
  using (
    auth.uid() is not null
    and (status = 'approved' or "userId" = auth.uid())
  );

create policy "Users can insert their own submission"
  on public.submissions for insert
  with check ("userId" = auth.uid());

create policy "Users can delete their own submission"
  on public.submissions for delete
  using ("userId" = auth.uid());

create policy "Admins can read all submissions"
  on public.submissions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update submission status"
  on public.submissions for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can delete any submission"
  on public.submissions for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Settings: only admins can read/write
create policy "Admins can read settings"
  on public.settings for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can upsert settings"
  on public.settings for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update settings"
  on public.settings for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── Profile auto-creation trigger ───────────────────────────────────────────
-- Fires the instant Supabase creates a new auth.users row — for both
-- email/password sign-up AND Google OAuth.  This guarantees the profile row
-- exists before the client ever tries to log in, removing the race condition
-- where login fails with "Account not found" before email confirmation.
--
-- Admin role: checks the settings table first; falls back to the hard-coded
-- seed list so the very first admins work even before any settings row exists.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  admin_emails jsonb;
  user_role    text := 'user';
begin
  -- Load admin email list from settings; fall back to hard-coded seed values
  select value::jsonb into admin_emails
  from public.settings
  where key = 'adminEmails';

  if admin_emails is null then
    admin_emails := '["admin@taxbenchmark.com","jiyangu923@gmail.com"]'::jsonb;
  end if;

  -- jsonb ? operator returns true when the string is an element of a jsonb array
  if admin_emails ? lower(new.email) then
    user_role := 'admin';
  end if;

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    lower(new.email),
    user_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
