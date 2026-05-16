-- ============================================================
-- Public Supabase Storage bucket for community-member photos.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Read: public (anyone can fetch a photo) — needed because /community
-- is anonymous-visible and the <img src> must resolve without auth.
--
-- Write/delete: NO RLS-granted access. All uploads go through the
-- /api/community/upload-url serverless endpoint, which validates a
-- confirmation token and then issues a signed upload URL using the
-- service-role key. Service role bypasses RLS, so we don't need a
-- bucket-level write policy at all.
--
-- Admins can also upload/delete via the Supabase dashboard, which uses
-- the service role under the hood.
--
-- Idempotent — safe to re-run.
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('community-photos', 'community-photos', true)
  on conflict (id) do nothing;

-- Public-read policy. Drop+recreate so re-running this script picks up
-- any future policy edits.
drop policy if exists "Public read on community-photos" on storage.objects;

create policy "Public read on community-photos"
  on storage.objects for select
  using (bucket_id = 'community-photos');
