-- ============================================================
-- RENI NOW LEARNING — Row Level Security
-- Run after 01_schema.sql
-- ============================================================

alter table public.profiles              enable row level security;
alter table public.roadmaps               enable row level security;
alter table public.roadmap_modules        enable row level security;
alter table public.enrollments            enable row level security;
alter table public.module_progress        enable row level security;
alter table public.assignments            enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.assessments            enable row level security;
alter table public.assessment_results     enable row level security;
alter table public.xp_events              enable row level security;
alter table public.live_sessions          enable row level security;
alter table public.session_rsvps          enable row level security;
alter table public.content_items          enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.billing_history        enable row level security;
alter table public.recognition_letters    enable row level security;

-- ---------- PROFILES: only your own row ----------
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- insert happens via the handle_new_user() trigger (security definer), no direct insert policy needed

-- ---------- ROADMAPS / MODULES / SESSIONS / CONTENT: public catalog, read-only for students ----------
create policy "roadmaps_read" on public.roadmaps
  for select using (published = true);
create policy "modules_read" on public.roadmap_modules
  for select using (true);
create policy "assignments_read" on public.assignments
  for select using (published = true);
create policy "assessments_read" on public.assessments
  for select using (published = true);
create policy "sessions_read" on public.live_sessions
  for select using (true);
create policy "content_read" on public.content_items
  for select using (published = true);
-- Writes to these catalog tables are done from the Supabase dashboard / service role (admin/instructor tooling),
-- intentionally not exposed to the anon/authenticated role.

-- ---------- ENROLLMENTS: own rows ----------
create policy "enrollments_select_own" on public.enrollments
  for select using (auth.uid() = student_id);
create policy "enrollments_insert_own" on public.enrollments
  for insert with check (auth.uid() = student_id);
create policy "enrollments_update_own" on public.enrollments
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- ---------- MODULE PROGRESS: via owning enrollment ----------
create policy "progress_select_own" on public.module_progress
  for select using (
    exists (select 1 from public.enrollments e
            where e.id = module_progress.enrollment_id and e.student_id = auth.uid())
  );
create policy "progress_upsert_own" on public.module_progress
  for insert with check (
    exists (select 1 from public.enrollments e
            where e.id = module_progress.enrollment_id and e.student_id = auth.uid())
  );
create policy "progress_update_own" on public.module_progress
  for update using (
    exists (select 1 from public.enrollments e
            where e.id = module_progress.enrollment_id and e.student_id = auth.uid())
  );

-- ---------- ASSIGNMENT SUBMISSIONS: own rows ----------
create policy "submissions_select_own" on public.assignment_submissions
  for select using (auth.uid() = student_id);
create policy "submissions_insert_own" on public.assignment_submissions
  for insert with check (auth.uid() = student_id);
create policy "submissions_update_own" on public.assignment_submissions
  for update using (auth.uid() = student_id and status <> 'graded')
  with check (auth.uid() = student_id);
-- Note: score/feedback/graded_at should be set by an instructor via service role in production;
-- the update policy above blocks students from editing an already-graded row.

-- ---------- ASSESSMENT RESULTS: own rows ----------
create policy "results_select_own" on public.assessment_results
  for select using (auth.uid() = student_id);
create policy "results_insert_own" on public.assessment_results
  for insert with check (auth.uid() = student_id);
create policy "results_update_own" on public.assessment_results
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- ---------- XP EVENTS: read own, no direct writes ----------
-- XP should be awarded server-side (edge function / service role) when work is graded,
-- so students can't self-award XP. Read-only for the owning student.
create policy "xp_select_own" on public.xp_events
  for select using (auth.uid() = student_id);

-- ---------- SESSION RSVPs: own rows ----------
create policy "rsvp_select_own" on public.session_rsvps
  for select using (auth.uid() = student_id);
create policy "rsvp_insert_own" on public.session_rsvps
  for insert with check (auth.uid() = student_id);
create policy "rsvp_update_own" on public.session_rsvps
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

-- ---------- SUBSCRIPTIONS / BILLING: read own ----------
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = student_id);
create policy "billing_select_own" on public.billing_history
  for select using (auth.uid() = student_id);

-- ---------- RECOGNITION LETTERS: read own ----------
create policy "letters_select_own" on public.recognition_letters
  for select using (auth.uid() = student_id);
