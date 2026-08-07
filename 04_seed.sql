-- ============================================================
-- RENI NOW LEARNING — Sample seed data (optional, for testing)
-- Run after 01-03. Safe to skip in production.
-- ============================================================

insert into public.roadmaps (slug, title, track_label, description, icon, total_modules) values
  ('coding-programming', 'Coding & Programming Roadmap', 'Beginner to Intermediate', '12 modules covering programming fundamentals through functions and loops.', 'code', 12),
  ('spoken-english', 'Spoken English Roadmap', 'Fluency Track', '8 modules building everyday conversation confidence.', 'message', 8),
  ('exam-crash-course', 'Competitive Exam Prep Roadmap', 'Full Syllabus', '10 modules covering the full competitive exam syllabus.', 'check', 10)
on conflict (slug) do nothing;

-- modules for coding roadmap
insert into public.roadmap_modules (roadmap_id, position, title, description)
select r.id, gs, 'Module ' || gs, ''
from public.roadmaps r, generate_series(1,12) gs
where r.slug = 'coding-programming'
on conflict do nothing;

insert into public.roadmap_modules (roadmap_id, position, title, description)
select r.id, gs, 'Module ' || gs, ''
from public.roadmaps r, generate_series(1,8) gs
where r.slug = 'spoken-english'
on conflict do nothing;

insert into public.roadmap_modules (roadmap_id, position, title, description)
select r.id, gs, 'Module ' || gs, ''
from public.roadmaps r, generate_series(1,10) gs
where r.slug = 'exam-crash-course'
on conflict do nothing;

-- assignments
insert into public.assignments (roadmap_id, title, description, due_at, max_score)
select id, 'Loops & Conditionals — Practice Set', 'Practice set covering loops and conditionals.', now() + interval '2 days', 100
from public.roadmaps where slug = 'coding-programming';

insert into public.assignments (roadmap_id, title, description, due_at, max_score)
select id, 'Roleplay: Ordering at a Café', 'Recorded roleplay assignment.', now() - interval '1 day', 100
from public.roadmaps where slug = 'spoken-english';

-- assessments
insert into public.assessments (roadmap_id, title, total_marks, scheduled_at)
select id, 'Module 2 Quiz', 100, now() - interval '4 days' from public.roadmaps where slug = 'coding-programming';
insert into public.assessments (roadmap_id, title, total_marks, scheduled_at)
select id, 'Module 3 Quiz', 100, now() + interval '3 days' from public.roadmaps where slug = 'coding-programming';
insert into public.assessments (roadmap_id, title, total_marks, scheduled_at)
select id, 'Vocabulary Check 1', 100, now() - interval '9 days' from public.roadmaps where slug = 'spoken-english';
insert into public.assessments (roadmap_id, title, total_marks, scheduled_at)
select id, 'Mock Test 1', 100, now() - interval '15 days' from public.roadmaps where slug = 'exam-crash-course';

-- live sessions
insert into public.live_sessions (roadmap_id, title, instructor_name, starts_at, ends_at)
select id, 'Live doubt-clearing — Coding Track', 'A. Rao', now() + interval '1 day', now() + interval '1 day 1 hour'
from public.roadmaps where slug = 'coding-programming';

insert into public.live_sessions (roadmap_id, title, instructor_name, starts_at, ends_at)
select id, 'Spoken English — Conversation Circle', 'M. Iyer', now() + interval '3 days', now() + interval '3 days 1 hour'
from public.roadmaps where slug = 'spoken-english';

insert into public.live_sessions (roadmap_id, title, instructor_name, starts_at, ends_at, recording_url)
select id, 'Module 2 Recap — Coding Track', 'A. Rao', now() - interval '9 days', now() - interval '9 days' + interval '1 hour', 'https://example.com/recording'
from public.roadmaps where slug = 'coding-programming';

-- content library
insert into public.content_items (roadmap_id, title, type, duration_minutes)
select id, 'Module 3: Functions — Recording', 'video', 48 from public.roadmaps where slug = 'coding-programming';
insert into public.content_items (roadmap_id, title, type, duration_minutes)
select id, 'Module 2: Loops — Recording', 'video', 51 from public.roadmaps where slug = 'coding-programming';
insert into public.content_items (roadmap_id, title, type, page_count)
select id, 'Practice Set — Loops & Conditionals', 'pdf', 3 from public.roadmaps where slug = 'coding-programming';
insert into public.content_items (roadmap_id, title, type, page_count)
select id, 'Grammar Cheat Sheet — Tenses', 'pdf', 4 from public.roadmaps where slug = 'spoken-english';
insert into public.content_items (roadmap_id, title, type, duration_minutes)
select id, 'Conversation Circle — Recording', 'video', 39 from public.roadmaps where slug = 'spoken-english';
insert into public.content_items (roadmap_id, title, type, page_count)
select id, 'Formula Sheet — Quant Section', 'pdf', 6 from public.roadmaps where slug = 'exam-crash-course';

-- NOTE: enrollments, submissions, results, xp_events, subscriptions, and recognition_letters
-- are per-student and should be created once you have real auth.users rows (e.g. after your
-- first signup), not seeded blindly here.
