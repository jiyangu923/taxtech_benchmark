-- ============================================================
-- kb_articles: curated industry news & knowledge for the AI analyst.
--
-- Admins curate short summaries of industry news (e-invoicing mandates,
-- regulatory changes, vendor moves, etc.) in the admin "Knowledge" tab.
-- Published articles are injected into Taxi's cached system prompt so AI
-- answers can reference current industry context alongside the benchmark
-- data. Manual curation first — automated ingestion can come later.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query. Idempotent.
-- ============================================================

create table if not exists public.kb_articles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  summary       text not null,
  source_url    text,
  tags          text[] not null default '{}',
  status        text not null default 'published'
                  check (status in ('draft', 'published')),
  published_at  timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Taxi context query: newest published first.
create index if not exists kb_articles_published_idx
  on public.kb_articles (published_at desc)
  where status = 'published';

alter table public.kb_articles enable row level security;

drop policy if exists "Authenticated can read published articles" on public.kb_articles;
drop policy if exists "Admins can read all articles"              on public.kb_articles;
drop policy if exists "Admins can insert articles"                on public.kb_articles;
drop policy if exists "Admins can update articles"                on public.kb_articles;
drop policy if exists "Admins can delete articles"                on public.kb_articles;

-- Any signed-in user can read published articles (the Taxi client builds
-- the AI context in the browser). Drafts stay admin-only.
create policy "Authenticated can read published articles"
  on public.kb_articles for select
  using (auth.uid() is not null and status = 'published');

create policy "Admins can read all articles"
  on public.kb_articles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Admins can insert articles"
  on public.kb_articles for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Admins can update articles"
  on public.kb_articles for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "Admins can delete articles"
  on public.kb_articles for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));
