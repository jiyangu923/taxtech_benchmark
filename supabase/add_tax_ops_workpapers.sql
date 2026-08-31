-- TaxBrains sourced determinations, filing workpapers, approvals, and evidence.
-- Depends on add_tax_ops_foundation.sql. Review and apply in preview only until
-- RLS and lifecycle integration tests exist.

begin;

create or replace function public.tax_ops_is_valid_iso_date(value text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  parsed_value date;
begin
  if value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  parsed_value := value::date;
  return pg_catalog.to_char(parsed_value, 'YYYY-MM-DD') = value;
exception when others then
  return false;
end;
$$;

create or replace function public.tax_ops_rule_references_are_valid(rule_references jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  rule_reference jsonb;
begin
  if pg_catalog.jsonb_typeof(rule_references) <> 'array'
     or pg_catalog.jsonb_array_length(rule_references) = 0 then
    return false;
  end if;

  for rule_reference in
    select value from pg_catalog.jsonb_array_elements(rule_references)
  loop
    if pg_catalog.jsonb_typeof(rule_reference) <> 'object'
       or not (rule_reference ?& array['ruleId', 'version', 'sourceUrl', 'effectiveFrom', 'lastVerified'])
       or pg_catalog.jsonb_typeof(rule_reference -> 'ruleId') <> 'string'
       or pg_catalog.jsonb_typeof(rule_reference -> 'version') <> 'string'
       or pg_catalog.jsonb_typeof(rule_reference -> 'sourceUrl') <> 'string'
       or pg_catalog.jsonb_typeof(rule_reference -> 'effectiveFrom') <> 'string'
       or pg_catalog.jsonb_typeof(rule_reference -> 'lastVerified') <> 'string'
       or pg_catalog.btrim(rule_reference ->> 'ruleId') = ''
       or pg_catalog.btrim(rule_reference ->> 'version') = ''
       or (rule_reference ->> 'sourceUrl') !~ '^https://[^[:space:]]+$'
       or not public.tax_ops_is_valid_iso_date(rule_reference ->> 'effectiveFrom')
       or not public.tax_ops_is_valid_iso_date(rule_reference ->> 'lastVerified') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.tax_ops_is_valid_iso_date(text) from public, anon, authenticated;
revoke all on function public.tax_ops_rule_references_are_valid(jsonb) from public, anon, authenticated;
grant execute on function public.tax_ops_is_valid_iso_date(text) to service_role;
grant execute on function public.tax_ops_rule_references_are_valid(jsonb) to service_role;

create table if not exists public.tax_ops_tax_determinations (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.tax_ops_organizations(id) on delete cascade,
  transaction_id           uuid not null,
  jurisdiction             text not null,
  tax_type                 text not null,
  component_code           text not null default 'total',
  currency                 text not null check (currency ~ '^[A-Z]{3}$'),
  amount_scale             smallint not null default 2 check (amount_scale between 0 and 9),
  taxable_amount           numeric(38, 9) not null,
  tax_rate_percent         numeric(15, 9) not null check (tax_rate_percent between 0 and 100),
  expected_tax_amount      numeric(38, 9) not null,
  rule_references          jsonb not null
                           check (public.tax_ops_rule_references_are_valid(rule_references)),
  algorithm_version        text not null,
  input_fingerprint_sha256 text not null check (input_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  foreign key (transaction_id, organization_id)
    references public.tax_ops_transactions(id, organization_id) on delete restrict,
  unique (
    organization_id,
    transaction_id,
    jurisdiction,
    tax_type,
    component_code,
    algorithm_version,
    input_fingerprint_sha256
  ),
  unique (id, organization_id)
);

create index if not exists tax_ops_determinations_transaction_idx
  on public.tax_ops_tax_determinations (organization_id, transaction_id);

create table if not exists public.tax_ops_filing_workpapers (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.tax_ops_organizations(id) on delete cascade,
  reconciliation_run_id    uuid not null,
  jurisdiction             text not null,
  tax_type                 text not null,
  period_start             date not null,
  period_end               date not null check (period_end >= period_start),
  currency                 text not null check (currency ~ '^[A-Z]{3}$'),
  amount_scale             smallint not null default 2 check (amount_scale between 0 and 9),
  status                   text not null default 'draft'
                           check (status in ('draft', 'in_review', 'approved', 'exported')),
  output_tax               numeric(38, 9) not null,
  input_tax                numeric(38, 9) not null,
  net_tax_payable          numeric(38, 9) not null,
  algorithm_version        text not null,
  input_fingerprint_sha256 text not null check (input_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  approved_at              timestamptz,
  foreign key (reconciliation_run_id, organization_id)
    references public.tax_ops_reconciliation_runs(id, organization_id) on delete restrict,
  check (
    (status in ('approved', 'exported') and approved_at is not null)
    or (status in ('draft', 'in_review') and approved_at is null)
  ),
  check (net_tax_payable = output_tax - input_tax),
  unique (
    organization_id,
    jurisdiction,
    tax_type,
    period_start,
    period_end,
    algorithm_version,
    input_fingerprint_sha256
  ),
  unique (id, organization_id)
);

create index if not exists tax_ops_workpapers_org_period_idx
  on public.tax_ops_filing_workpapers (organization_id, period_end desc, jurisdiction);
create index if not exists tax_ops_workpapers_reconciliation_run_idx
  on public.tax_ops_filing_workpapers (organization_id, reconciliation_run_id);

create table if not exists public.tax_ops_filing_workpaper_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tax_ops_organizations(id) on delete cascade,
  workpaper_id    uuid not null,
  line_code       text not null,
  description     text not null,
  amount          numeric(38, 9) not null,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  foreign key (workpaper_id, organization_id)
    references public.tax_ops_filing_workpapers(id, organization_id) on delete cascade,
  unique (workpaper_id, line_code),
  unique (id, organization_id)
);

create index if not exists tax_ops_workpaper_lines_workpaper_idx
  on public.tax_ops_filing_workpaper_lines (organization_id, workpaper_id);

create table if not exists public.tax_ops_workpaper_line_determinations (
  organization_id uuid not null references public.tax_ops_organizations(id) on delete cascade,
  workpaper_line_id uuid not null,
  determination_id uuid not null,
  created_at        timestamptz not null default now(),
  foreign key (workpaper_line_id, organization_id)
    references public.tax_ops_filing_workpaper_lines(id, organization_id) on delete cascade,
  foreign key (determination_id, organization_id)
    references public.tax_ops_tax_determinations(id, organization_id) on delete restrict,
  primary key (workpaper_line_id, determination_id)
);

create index if not exists tax_ops_workpaper_line_determinations_determination_idx
  on public.tax_ops_workpaper_line_determinations (organization_id, determination_id);

create table if not exists public.tax_ops_workpaper_approvals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tax_ops_organizations(id) on delete cascade,
  workpaper_id    uuid not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by    uuid not null references auth.users(id) on delete restrict,
  requested_at    timestamptz not null default now(),
  decided_by      uuid references auth.users(id) on delete restrict,
  decided_at      timestamptz,
  decision_note   text,
  foreign key (workpaper_id, organization_id)
    references public.tax_ops_filing_workpapers(id, organization_id) on delete restrict,
  check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  ),
  unique (id, organization_id)
);

create unique index if not exists tax_ops_workpaper_one_pending_approval_idx
  on public.tax_ops_workpaper_approvals (workpaper_id)
  where status = 'pending';

create index if not exists tax_ops_workpaper_approvals_workpaper_idx
  on public.tax_ops_workpaper_approvals (organization_id, workpaper_id);
create index if not exists tax_ops_workpaper_approvals_requested_by_idx
  on public.tax_ops_workpaper_approvals (requested_by);
create index if not exists tax_ops_workpaper_approvals_decided_by_idx
  on public.tax_ops_workpaper_approvals (decided_by)
  where decided_by is not null;

create or replace function public.enforce_tax_ops_workpaper_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_time timestamptz;
begin
  if new.status in ('approved', 'exported') then
    select approval.decided_at
      into approval_time
      from public.tax_ops_workpaper_approvals approval
     where approval.workpaper_id = new.id
       and approval.organization_id = new.organization_id
       and approval.status = 'approved'
     order by approval.decided_at desc
     limit 1;

    if approval_time is null then
      raise exception 'Approved or exported workpapers require a named approved decision';
    end if;
    new.approved_at := approval_time;
  else
    new.approved_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_tax_ops_approval_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.tax_ops_organization_members member
     where member.organization_id = new.organization_id
       and member.user_id = new.requested_by
  ) then
    raise exception 'Approval requester must belong to the workpaper organization';
  end if;

  if new.decided_by is not null and not exists (
    select 1
      from public.tax_ops_organization_members member
     where member.organization_id = new.organization_id
       and member.user_id = new.decided_by
       and member.role in ('owner', 'admin', 'reviewer')
  ) then
    raise exception 'Approval decision requires an owner, admin, or reviewer in the organization';
  end if;

  return new;
end;
$$;

create or replace function public.approve_tax_ops_workpaper(
  target_workpaper_id uuid,
  approval_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  approval_id uuid;
  target_organization_id uuid;
  decision_time timestamptz := pg_catalog.now();
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select approval.id, approval.organization_id
    into approval_id, target_organization_id
    from public.tax_ops_workpaper_approvals approval
    join public.tax_ops_filing_workpapers workpaper
      on workpaper.id = approval.workpaper_id
     and workpaper.organization_id = approval.organization_id
   where approval.workpaper_id = target_workpaper_id
     and approval.status = 'pending'
   for update of approval, workpaper;

  if approval_id is null then
    raise exception 'No pending approval exists for this workpaper';
  end if;
  if not public.has_tax_ops_organization_role(
    target_organization_id,
    array['owner', 'admin', 'reviewer']
  ) then
    raise exception 'Reviewer access required';
  end if;

  update public.tax_ops_workpaper_approvals
     set status = 'approved',
         decided_by = actor_id,
         decided_at = decision_time,
         decision_note = approval_note
   where id = approval_id
     and organization_id = target_organization_id;

  update public.tax_ops_filing_workpapers
     set status = 'approved',
         approved_at = decision_time
   where id = target_workpaper_id
     and organization_id = target_organization_id;

  return approval_id;
end;
$$;

revoke all on function public.enforce_tax_ops_workpaper_approval() from public, anon, authenticated;
revoke all on function public.enforce_tax_ops_approval_membership() from public, anon, authenticated;
revoke all on function public.approve_tax_ops_workpaper(uuid, text) from public;
grant execute on function public.approve_tax_ops_workpaper(uuid, text) to authenticated;

drop trigger if exists tax_ops_workpaper_approval_guard on public.tax_ops_filing_workpapers;
create trigger tax_ops_workpaper_approval_guard
  before insert or update on public.tax_ops_filing_workpapers
  for each row execute function public.enforce_tax_ops_workpaper_approval();

drop trigger if exists tax_ops_approval_membership_guard on public.tax_ops_workpaper_approvals;
create trigger tax_ops_approval_membership_guard
  before insert or update on public.tax_ops_workpaper_approvals
  for each row execute function public.enforce_tax_ops_approval_membership();

create table if not exists public.tax_ops_evidence_artifacts (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.tax_ops_organizations(id) on delete cascade,
  workpaper_id           uuid not null,
  artifact_kind          text not null check (artifact_kind in ('workpaper_json', 'csv', 'pdf')),
  storage_path           text not null,
  content_sha256         text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  source_fingerprint_sha256 text not null check (source_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  metadata               jsonb not null default '{}'::jsonb,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  foreign key (workpaper_id, organization_id)
    references public.tax_ops_filing_workpapers(id, organization_id) on delete restrict,
  unique (workpaper_id, artifact_kind, content_sha256),
  unique (id, organization_id)
);

create index if not exists tax_ops_evidence_artifacts_workpaper_idx
  on public.tax_ops_evidence_artifacts (organization_id, workpaper_id);

drop trigger if exists tax_ops_filing_workpapers_updated_at on public.tax_ops_filing_workpapers;
create trigger tax_ops_filing_workpapers_updated_at
  before update on public.tax_ops_filing_workpapers
  for each row execute function public.set_tax_ops_updated_at();

alter table public.tax_ops_tax_determinations enable row level security;
alter table public.tax_ops_filing_workpapers enable row level security;
alter table public.tax_ops_filing_workpaper_lines enable row level security;
alter table public.tax_ops_workpaper_line_determinations enable row level security;
alter table public.tax_ops_workpaper_approvals enable row level security;
alter table public.tax_ops_evidence_artifacts enable row level security;

drop policy if exists "Tax ops members read determinations" on public.tax_ops_tax_determinations;
create policy "Tax ops members read determinations"
  on public.tax_ops_tax_determinations for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read filing workpapers" on public.tax_ops_filing_workpapers;
create policy "Tax ops members read filing workpapers"
  on public.tax_ops_filing_workpapers for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read workpaper lines" on public.tax_ops_filing_workpaper_lines;
create policy "Tax ops members read workpaper lines"
  on public.tax_ops_filing_workpaper_lines for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read workpaper sources" on public.tax_ops_workpaper_line_determinations;
create policy "Tax ops members read workpaper sources"
  on public.tax_ops_workpaper_line_determinations for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read workpaper approvals" on public.tax_ops_workpaper_approvals;
create policy "Tax ops members read workpaper approvals"
  on public.tax_ops_workpaper_approvals for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read evidence artifacts" on public.tax_ops_evidence_artifacts;
create policy "Tax ops members read evidence artifacts"
  on public.tax_ops_evidence_artifacts for select
  using (public.is_tax_ops_organization_member(organization_id));

revoke all on public.tax_ops_tax_determinations from anon;
revoke all on public.tax_ops_filing_workpapers from anon;
revoke all on public.tax_ops_filing_workpaper_lines from anon;
revoke all on public.tax_ops_workpaper_line_determinations from anon;
revoke all on public.tax_ops_workpaper_approvals from anon;
revoke all on public.tax_ops_evidence_artifacts from anon;

revoke all on public.tax_ops_tax_determinations from authenticated;
revoke all on public.tax_ops_filing_workpapers from authenticated;
revoke all on public.tax_ops_filing_workpaper_lines from authenticated;
revoke all on public.tax_ops_workpaper_line_determinations from authenticated;
revoke all on public.tax_ops_workpaper_approvals from authenticated;
revoke all on public.tax_ops_evidence_artifacts from authenticated;

grant select on public.tax_ops_tax_determinations to authenticated;
grant select on public.tax_ops_filing_workpapers to authenticated;
grant select on public.tax_ops_filing_workpaper_lines to authenticated;
grant select on public.tax_ops_workpaper_line_determinations to authenticated;
grant select on public.tax_ops_workpaper_approvals to authenticated;
grant select on public.tax_ops_evidence_artifacts to authenticated;

comment on table public.tax_ops_tax_determinations is
  'Deterministic expected-tax results with non-empty rule provenance; never model-generated liabilities.';
comment on table public.tax_ops_workpaper_approvals is
  'Named human decisions for a filing workpaper; direct client writes are not granted.';
comment on table public.tax_ops_evidence_artifacts is
  'Content-addressed exports linked to their source fingerprint and filing workpaper.';

commit;
