-- ============================================================
-- Fix: Admin role assignment for existing users
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Problem: addAdminEmail() updates settings.adminEmails, then tries
--          UPDATE profiles SET role='admin' WHERE email=$1.
--          That UPDATE runs under the calling admin's JWT, but
--          profiles RLS only allows auth.uid() = id, so it
--          silently affects 0 rows. Existing users never get
--          promoted; admin pages stay empty for them.
--
-- Fix: SECURITY DEFINER RPCs that bypass RLS but verify the
--      caller is an admin before mutating. Safer than a blanket
--      "admins can update any profile" RLS policy.
-- ============================================================

create or replace function public.promote_to_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  -- Verify the caller is an admin
  select role into caller_role
  from public.profiles
  where id = auth.uid();

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'Only admins can promote users';
  end if;

  update public.profiles
  set role = 'admin'
  where lower(email) = lower(target_email);
end;
$$;

create or replace function public.demote_from_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role
  from public.profiles
  where id = auth.uid();

  if caller_role is null or caller_role <> 'admin' then
    raise exception 'Only admins can demote users';
  end if;

  -- Prevent self-demotion via this path (UI also guards against it)
  if lower(target_email) = lower((select email from public.profiles where id = auth.uid())) then
    raise exception 'Cannot demote yourself';
  end if;

  update public.profiles
  set role = 'user'
  where lower(email) = lower(target_email);
end;
$$;

-- Allow authenticated users to call these RPCs; the function body itself
-- enforces that the caller must already be an admin.
grant execute on function public.promote_to_admin(text)   to authenticated;
grant execute on function public.demote_from_admin(text)  to authenticated;
