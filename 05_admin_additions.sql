-- ============================================================
-- RENI NOW LEARNING — Admin additions
-- Run this in Supabase SQL Editor AFTER 01-04, in your existing project.
-- Adds: ability for admins to block a student's access.
-- ============================================================

alter table public.profiles
  add column if not exists blocked boolean not null default false;

comment on column public.profiles.blocked is
  'Set by an admin via the backend API. When true, the frontend signs the student out immediately after login.';

-- ------------------------------------------------------------
-- IMPORTANT: lock down which columns a student can edit on their
-- own profile row. The existing "profiles_update_own" RLS policy
-- (02_rls.sql) checks WHO can update a row, but not WHICH columns
-- — so without this, a student could UPDATE their own `role` to
-- 'admin' or their own `blocked` back to false via the anon key.
-- Postgres column-level GRANTs close that gap; RLS still governs
-- which rows.
-- ------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (
  full_name,
  phone,
  preferred_language,
  time_zone,
  reminder_pref
) on public.profiles to authenticated;
-- role and blocked are intentionally NOT granted here — only the
-- backend's service-role key (which bypasses grants + RLS) can
-- change them, via /api/admin/students/:id/role and
-- /api/admin/students/:id/block.

