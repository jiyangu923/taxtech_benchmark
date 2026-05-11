-- ============================================================
-- release_letters: weekly product update emails
--
-- Admin writes a markdown letter, sends a test to themselves first,
-- then broadcasts to every signed-up user (subject to email_reminders_enabled).
--
-- Includes a public Supabase Storage bucket for images embedded in letters.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. release_letters table
create table if not exists public.release_letters (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  week_of         date not null,
  body_markdown   text not null,
  status          text not null default 'draft' check (status in ('draft', 'sent')),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  sent_count      int not null default 0
);

create index if not exists release_letters_week_idx
  on public.release_letters (week_of desc);

create index if not exists release_letters_status_idx
  on public.release_letters (status, created_at desc);

alter table public.release_letters enable row level security;

drop policy if exists "Admins can read release letters"   on public.release_letters;
drop policy if exists "Admins can insert release letters" on public.release_letters;
drop policy if exists "Admins can update release letters" on public.release_letters;
drop policy if exists "Admins can delete release letters" on public.release_letters;

create policy "Admins can read release letters"
  on public.release_letters for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can insert release letters"
  on public.release_letters for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can update release letters"
  on public.release_letters for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can delete release letters"
  on public.release_letters for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- 2. Public storage bucket for release-letter images
-- Public read so embedded <img> in emails resolves; admin-only write via RLS.
insert into storage.buckets (id, name, public)
  values ('release-images', 'release-images', true)
  on conflict (id) do nothing;

drop policy if exists "Public read on release-images"     on storage.objects;
drop policy if exists "Admins can upload release-images"  on storage.objects;
drop policy if exists "Admins can delete release-images"  on storage.objects;

create policy "Public read on release-images"
  on storage.objects for select
  using (bucket_id = 'release-images');

create policy "Admins can upload release-images"
  on storage.objects for insert
  with check (
    bucket_id = 'release-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can delete release-images"
  on storage.objects for delete
  using (
    bucket_id = 'release-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
