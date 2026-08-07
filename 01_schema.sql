-- ============================================================
-- RENI NOW LEARNING — Core Schema
-- Run this in Supabase SQL Editor (or via `supabase db push`)
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILES  (1:1 extension of auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null default '',
  phone          text unique,
  phone_verified boolean not null default false,
  role           text not null default 'student' check (role in ('student','instructor','admin')),
  preferred_language text not null default 'English',
  time_zone      text not null default 'IST (GMT+5:30)',
  reminder_pref  text not null default 'Email + WhatsApp' check (reminder_pref in ('Email + WhatsApp','Email only','Off')),
  member_since   date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- Expects signUp() to pass full_name / phone in the `data` (raw_user_meta_data) options.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ROADMAPS + MODULES  (content owned by admins/instructors)
-- ------------------------------------------------------------
create table if not exists public.roadmaps (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  track_label    text not null default '',       -- e.g. "Beginner to Intermediate"
  description    text not null default '',
  icon           text not null default 'route',
  total_modules  int not null default 0,
  published      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.roadmap_modules (
  id             uuid primary key default gen_random_uuid(),
  roadmap_id     uuid not null references public.roadmaps(id) on delete cascade,
  position       int not null,
  title          text not null,
  description    text not null default '',
  created_at     timestamptz not null default now(),
  unique (roadmap_id, position)
);

-- ------------------------------------------------------------
-- ENROLLMENTS + PER-MODULE PROGRESS
-- ------------------------------------------------------------
create table if not exists public.enrollments (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles(id) on delete cascade,
  roadmap_id         uuid not null references public.roadmaps(id) on delete cascade,
  enrolled_at        timestamptz not null default now(),
  last_module_id     uuid references public.roadmap_modules(id),
  unique (student_id, roadmap_id)
);

create table if not exists public.module_progress (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references public.enrollments(id) on delete cascade,
  module_id      uuid not null references public.roadmap_modules(id) on delete cascade,
  status         text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  updated_at     timestamptz not null default now(),
  unique (enrollment_id, module_id)
);

-- ------------------------------------------------------------
-- ASSIGNMENTS
-- ------------------------------------------------------------
create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  roadmap_id     uuid references public.roadmaps(id) on delete cascade,
  module_id      uuid references public.roadmap_modules(id) on delete set null,
  title          text not null,
  description    text not null default '',
  due_at         timestamptz,
  max_score      numeric not null default 100,
  published      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending','submitted','graded')),
  content        text,
  file_url       text,
  submitted_at   timestamptz,
  score          numeric,
  feedback       text,
  graded_at      timestamptz,
  unique (assignment_id, student_id)
);

-- ------------------------------------------------------------
-- ASSESSMENTS (quizzes / tests)
-- ------------------------------------------------------------
create table if not exists public.assessments (
  id             uuid primary key default gen_random_uuid(),
  roadmap_id     uuid references public.roadmaps(id) on delete cascade,
  title          text not null,
  total_marks    numeric not null default 100,
  scheduled_at   timestamptz,
  published      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.assessment_results (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'not_attempted' check (status in ('not_attempted','attempted')),
  score          numeric,
  attempted_at   timestamptz,
  unique (assessment_id, student_id)
);

-- ------------------------------------------------------------
-- XP LEDGER  (source of truth for XP + leaderboard)
-- ------------------------------------------------------------
create table if not exists public.xp_events (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  amount         int not null,
  reason         text not null default '',
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LIVE SESSIONS
-- ------------------------------------------------------------
create table if not exists public.live_sessions (
  id             uuid primary key default gen_random_uuid(),
  roadmap_id     uuid references public.roadmaps(id) on delete set null,
  title          text not null,
  instructor_name text not null default '',
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  meeting_url    text,
  recording_url  text,
  created_at     timestamptz not null default now()
);

create table if not exists public.session_rsvps (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.live_sessions(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'interested' check (status in ('interested','attending','attended')),
  created_at     timestamptz not null default now(),
  unique (session_id, student_id)
);

-- ------------------------------------------------------------
-- CONTENT LIBRARY
-- ------------------------------------------------------------
create table if not exists public.content_items (
  id             uuid primary key default gen_random_uuid(),
  roadmap_id     uuid references public.roadmaps(id) on delete set null,
  title          text not null,
  type           text not null check (type in ('video','pdf','doc')),
  duration_minutes int,
  page_count     int,
  url            text,
  published      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SUBSCRIPTIONS + BILLING
-- ------------------------------------------------------------
create table if not exists public.subscriptions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null unique references public.profiles(id) on delete cascade,
  plan           text not null default 'free' check (plan in ('free','pro')),
  status         text not null default 'active' check (status in ('active','cancelled','past_due')),
  renews_at      date,
  created_at     timestamptz not null default now()
);

create table if not exists public.billing_history (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  amount         numeric not null,
  currency       text not null default 'INR',
  billed_at      date not null default current_date
);

-- ------------------------------------------------------------
-- RECOGNITION LETTERS
-- ------------------------------------------------------------
create table if not exists public.recognition_letters (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  roadmap_id       uuid references public.roadmaps(id) on delete set null,
  recognition_code text unique not null,
  duration_label   text not null default '',
  completed_on     date,
  director_name    text not null default 'R. Sharma',
  issued_at        timestamptz not null default now()
);
