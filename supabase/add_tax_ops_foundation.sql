-- TaxBrains tax-operations foundation.
--
-- This migration is intentionally NOT applied by repository automation. Review
-- it in a preview Supabase project before production. It creates the tenant,
-- import, transaction/GL, and reconciliation data boundary for the first paid
-- compliance-close workflow.
--
-- Security posture:
--   * authenticated clients can read only organizations they belong to;
--   * organization creation is atomic through a SECURITY DEFINER RPC;
--   * raw transactions, GL entries, and reconciliation results are written only
--     by trusted server/service-role workflows;
--   * no customer tax data is joined to benchmark/community tables.

begin;

create table if not exists public.tax_ops_organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 160),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tax_ops_organization_members (
  organization_id uuid not null references public.tax_ops_organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner', 'admin', 'preparer', 'reviewer', 'viewer')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists tax_ops_members_user_idx
  on public.tax_ops_organization_members (user_id, organization_id);

-- These helpers are SECURITY DEFINER so membership checks do not recursively
-- invoke the organization_members RLS policy. search_path is pinned.
create or replace function public.is_tax_ops_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tax_ops_organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.has_tax_ops_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tax_ops_organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.role = any(allowed_roles)
  );
$$;

create or replace function public.create_tax_ops_organization(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(btrim(organization_name)) not between 2 and 160 then
    raise exception 'Organization name must be between 2 and 160 characters';
  end if;
  if organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Organization slug must contain lowercase letters, numbers, and single hyphens';
  end if;

  insert into public.tax_ops_organizations (name, slug, created_by)
  values (btrim(organization_name), organization_slug, actor_id)
  returning id into new_organization_id;

  insert into public.tax_ops_organization_members (organization_id, user_id, role)
  values (new_organization_id, actor_id, 'owner');

  return new_organization_id;
end;
$$;

revoke all on function public.is_tax_ops_organization_member(uuid) from public;
revoke all on function public.has_tax_ops_organization_role(uuid, text[]) from public;
revoke all on function public.create_tax_ops_organization(text, text) from public;
grant execute on function public.is_tax_ops_organization_member(uuid) to authenticated;
grant execute on function public.has_tax_ops_organization_role(uuid, text[]) to authenticated;
grant execute on function public.create_tax_ops_organization(text, text) to authenticated;

create table if not exists public.tax_ops_import_batches (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.tax_ops_organizations(id) on delete cascade,
  import_kind       text not null check (import_kind in ('transactions', 'general_ledger')),
  source_system     text not null check (char_length(btrim(source_system)) between 1 and 100),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  content_sha256    text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key   text not null check (char_length(idempotency_key) between 8 and 200),
  status            text not null default 'uploaded'
                    check (status in ('uploaded', 'processing', 'completed', 'failed')),
  row_count         integer check (row_count is null or row_count >= 0),
  error_summary     text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (organization_id, import_kind, idempotency_key),
  unique (id, organization_id)
);

create index if not exists tax_ops_import_batches_org_created_idx
  on public.tax_ops_import_batches (organization_id, created_at desc);

create table if not exists public.tax_ops_transactions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.tax_ops_organizations(id) on delete cascade,
  import_batch_id       uuid not null,
  source_row_number     integer not null check (source_row_number > 0),
  transaction_type      text not null check (transaction_type in ('sale', 'purchase', 'refund')),
  external_id           text,
  invoice_number        text,
  transaction_at        timestamptz not null,
  seller_country        text check (seller_country is null or seller_country ~ '^[A-Z]{2}$'),
  buyer_country         text check (buyer_country is null or buyer_country ~ '^[A-Z]{2}$'),
  buyer_jurisdiction    text,
  currency              text not null check (currency ~ '^[A-Z]{3}$'),
  amount_scale          smallint not null default 2 check (amount_scale between 0 and 9),
  net_amount            numeric(38, 9) not null,
  recorded_tax_amount   numeric(38, 9) not null,
  is_exempt             boolean not null default false,
  raw_payload           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  foreign key (import_batch_id, organization_id)
    references public.tax_ops_import_batches(id, organization_id) on delete cascade,
  unique (import_batch_id, source_row_number),
  unique (id, organization_id)
);

create index if not exists tax_ops_transactions_org_period_idx
  on public.tax_ops_transactions (organization_id, transaction_at);
create index if not exists tax_ops_transactions_org_invoice_idx
  on public.tax_ops_transactions (organization_id, invoice_number)
  where invoice_number is not null;

create table if not exists public.tax_ops_gl_entries (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.tax_ops_organizations(id) on delete cascade,
  import_batch_id       uuid not null,
  source_row_number     integer not null check (source_row_number > 0),
  reference             text not null check (char_length(btrim(reference)) > 0),
  posted_at             timestamptz not null,
  account_code          text,
  currency              text not null check (currency ~ '^[A-Z]{3}$'),
  amount_scale          smallint not null default 2 check (amount_scale between 0 and 9),
  tax_amount            numeric(38, 9) not null,
  raw_payload           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  foreign key (import_batch_id, organization_id)
    references public.tax_ops_import_batches(id, organization_id) on delete cascade,
  unique (import_batch_id, source_row_number),
  unique (id, organization_id)
);

create index if not exists tax_ops_gl_entries_org_period_idx
  on public.tax_ops_gl_entries (organization_id, posted_at);
create index if not exists tax_ops_gl_entries_org_reference_idx
  on public.tax_ops_gl_entries (organization_id, reference);

create table if not exists public.tax_ops_reconciliation_runs (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.tax_ops_organizations(id) on delete cascade,
  period_start               date not null,
  period_end                 date not null check (period_end >= period_start),
  currency                   text not null check (currency ~ '^[A-Z]{3}$'),
  amount_scale               smallint not null default 2 check (amount_scale between 0 and 9),
  algorithm_version          text not null,
  input_fingerprint_sha256   text not null check (input_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  status                     text not null default 'pending'
                             check (status in ('pending', 'running', 'review_ready', 'approved', 'failed')),
  total_items                integer not null default 0 check (total_items >= 0),
  matched_count              integer not null default 0 check (matched_count >= 0),
  variance_count             integer not null default 0 check (variance_count >= 0),
  missing_in_gl_count        integer not null default 0 check (missing_in_gl_count >= 0),
  missing_in_tax_count       integer not null default 0 check (missing_in_tax_count >= 0),
  total_absolute_variance    numeric(38, 9) not null default 0 check (total_absolute_variance >= 0),
  created_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  completed_at              timestamptz,
  unique (organization_id, input_fingerprint_sha256, algorithm_version),
  unique (id, organization_id)
);

create index if not exists tax_ops_reconciliation_runs_org_period_idx
  on public.tax_ops_reconciliation_runs (organization_id, period_end desc);

create table if not exists public.tax_ops_reconciliation_items (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.tax_ops_organizations(id) on delete cascade,
  reconciliation_run_id uuid not null,
  transaction_id        uuid,
  status                text not null
                        check (status in ('matched', 'variance', 'missing_in_gl', 'missing_in_tax')),
  reference             text not null,
  transaction_tax       numeric(38, 9) not null,
  gl_tax                numeric(38, 9) not null,
  variance              numeric(38, 9) not null,
  explanation           text,
  created_at            timestamptz not null default now(),
  foreign key (reconciliation_run_id, organization_id)
    references public.tax_ops_reconciliation_runs(id, organization_id) on delete cascade,
  foreign key (transaction_id, organization_id)
    references public.tax_ops_transactions(id, organization_id) on delete restrict,
  unique (id, organization_id)
);

create index if not exists tax_ops_reconciliation_items_run_status_idx
  on public.tax_ops_reconciliation_items (reconciliation_run_id, status);
create index if not exists tax_ops_reconciliation_items_transaction_idx
  on public.tax_ops_reconciliation_items (organization_id, transaction_id)
  where transaction_id is not null;

-- Reconciliation groups transaction rows by invoice/reference. Preserve every
-- source row rather than collapsing a split invoice into one nullable ID.
create table if not exists public.tax_ops_reconciliation_item_transactions (
  organization_id        uuid not null references public.tax_ops_organizations(id) on delete cascade,
  reconciliation_item_id uuid not null,
  transaction_id         uuid not null,
  created_at             timestamptz not null default now(),
  foreign key (reconciliation_item_id, organization_id)
    references public.tax_ops_reconciliation_items(id, organization_id) on delete cascade,
  foreign key (transaction_id, organization_id)
    references public.tax_ops_transactions(id, organization_id) on delete restrict,
  primary key (reconciliation_item_id, transaction_id)
);

create index if not exists tax_ops_reconciliation_item_transactions_transaction_idx
  on public.tax_ops_reconciliation_item_transactions (organization_id, transaction_id);

create table if not exists public.tax_ops_reconciliation_item_gl_entries (
  organization_id       uuid not null references public.tax_ops_organizations(id) on delete cascade,
  reconciliation_item_id uuid not null,
  gl_entry_id            uuid not null,
  created_at             timestamptz not null default now(),
  foreign key (reconciliation_item_id, organization_id)
    references public.tax_ops_reconciliation_items(id, organization_id) on delete cascade,
  foreign key (gl_entry_id, organization_id)
    references public.tax_ops_gl_entries(id, organization_id) on delete restrict,
  primary key (reconciliation_item_id, gl_entry_id)
);

create index if not exists tax_ops_reconciliation_item_gl_entries_gl_idx
  on public.tax_ops_reconciliation_item_gl_entries (organization_id, gl_entry_id);

create or replace function public.set_tax_ops_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tax_ops_organizations_updated_at on public.tax_ops_organizations;
create trigger tax_ops_organizations_updated_at
  before update on public.tax_ops_organizations
  for each row execute function public.set_tax_ops_updated_at();

drop trigger if exists tax_ops_import_batches_updated_at on public.tax_ops_import_batches;
create trigger tax_ops_import_batches_updated_at
  before update on public.tax_ops_import_batches
  for each row execute function public.set_tax_ops_updated_at();

drop trigger if exists tax_ops_reconciliation_runs_updated_at on public.tax_ops_reconciliation_runs;
create trigger tax_ops_reconciliation_runs_updated_at
  before update on public.tax_ops_reconciliation_runs
  for each row execute function public.set_tax_ops_updated_at();

alter table public.tax_ops_organizations enable row level security;
alter table public.tax_ops_organization_members enable row level security;
alter table public.tax_ops_import_batches enable row level security;
alter table public.tax_ops_transactions enable row level security;
alter table public.tax_ops_gl_entries enable row level security;
alter table public.tax_ops_reconciliation_runs enable row level security;
alter table public.tax_ops_reconciliation_items enable row level security;
alter table public.tax_ops_reconciliation_item_transactions enable row level security;
alter table public.tax_ops_reconciliation_item_gl_entries enable row level security;

drop policy if exists "Tax ops members read organizations" on public.tax_ops_organizations;
create policy "Tax ops members read organizations"
  on public.tax_ops_organizations for select
  using (public.is_tax_ops_organization_member(id));

-- Organization changes and membership changes will use audited RPCs. There are
-- no direct client write policies for either table.
drop policy if exists "Tax ops admins update organizations" on public.tax_ops_organizations;

drop policy if exists "Tax ops members read memberships" on public.tax_ops_organization_members;
create policy "Tax ops members read memberships"
  on public.tax_ops_organization_members for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read import batches" on public.tax_ops_import_batches;
create policy "Tax ops members read import batches"
  on public.tax_ops_import_batches for select
  using (public.is_tax_ops_organization_member(organization_id));

-- Import creation and all financial-data writes go through trusted backend
-- routes. Keep these drops so rerunning the migration removes any older draft
-- policies that granted direct client writes.
drop policy if exists "Tax ops preparers create import batches" on public.tax_ops_import_batches;
drop policy if exists "Tax ops preparers update import batches" on public.tax_ops_import_batches;

drop policy if exists "Tax ops members read transactions" on public.tax_ops_transactions;
create policy "Tax ops members read transactions"
  on public.tax_ops_transactions for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read GL entries" on public.tax_ops_gl_entries;
create policy "Tax ops members read GL entries"
  on public.tax_ops_gl_entries for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read reconciliation runs" on public.tax_ops_reconciliation_runs;
create policy "Tax ops members read reconciliation runs"
  on public.tax_ops_reconciliation_runs for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read reconciliation items" on public.tax_ops_reconciliation_items;
create policy "Tax ops members read reconciliation items"
  on public.tax_ops_reconciliation_items for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read reconciliation transaction links" on public.tax_ops_reconciliation_item_transactions;
create policy "Tax ops members read reconciliation transaction links"
  on public.tax_ops_reconciliation_item_transactions for select
  using (public.is_tax_ops_organization_member(organization_id));

drop policy if exists "Tax ops members read reconciliation GL links" on public.tax_ops_reconciliation_item_gl_entries;
create policy "Tax ops members read reconciliation GL links"
  on public.tax_ops_reconciliation_item_gl_entries for select
  using (public.is_tax_ops_organization_member(organization_id));

-- Explicit client grants. There are deliberately no authenticated write grants;
-- trusted backend code uses the service role after validating the actor's
-- organization membership. Organization creation is the single audited RPC
-- above. Future writes should get similarly narrow RPCs.
revoke all on public.tax_ops_organizations from anon;
revoke all on public.tax_ops_organization_members from anon;
revoke all on public.tax_ops_import_batches from anon;
revoke all on public.tax_ops_transactions from anon;
revoke all on public.tax_ops_gl_entries from anon;
revoke all on public.tax_ops_reconciliation_runs from anon;
revoke all on public.tax_ops_reconciliation_items from anon;
revoke all on public.tax_ops_reconciliation_item_transactions from anon;
revoke all on public.tax_ops_reconciliation_item_gl_entries from anon;

revoke all on public.tax_ops_organizations from authenticated;
revoke all on public.tax_ops_organization_members from authenticated;
revoke all on public.tax_ops_import_batches from authenticated;
revoke all on public.tax_ops_transactions from authenticated;
revoke all on public.tax_ops_gl_entries from authenticated;
revoke all on public.tax_ops_reconciliation_runs from authenticated;
revoke all on public.tax_ops_reconciliation_items from authenticated;
revoke all on public.tax_ops_reconciliation_item_transactions from authenticated;
revoke all on public.tax_ops_reconciliation_item_gl_entries from authenticated;

grant select on public.tax_ops_organizations to authenticated;
grant select on public.tax_ops_organization_members to authenticated;
grant select on public.tax_ops_import_batches to authenticated;
grant select on public.tax_ops_transactions to authenticated;
grant select on public.tax_ops_gl_entries to authenticated;
grant select on public.tax_ops_reconciliation_runs to authenticated;
grant select on public.tax_ops_reconciliation_items to authenticated;
grant select on public.tax_ops_reconciliation_item_transactions to authenticated;
grant select on public.tax_ops_reconciliation_item_gl_entries to authenticated;

comment on table public.tax_ops_organizations is
  'Tenant boundary for TaxBrains customer tax operations; separate from benchmark profiles.';
comment on table public.tax_ops_import_batches is
  'Idempotent source-file ingestion envelope; raw financial rows are written by trusted server workflows.';
comment on table public.tax_ops_reconciliation_runs is
  'Versioned transaction-to-GL reconciliation result awaiting human review.';
comment on table public.tax_ops_reconciliation_item_transactions is
  'Complete source-transaction lineage for grouped reconciliation items, including split invoices.';

commit;
