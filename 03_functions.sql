-- ============================================================
-- RENI NOW LEARNING — Views & RPC functions
-- Run after 01_schema.sql and 02_rls.sql
-- ============================================================

-- ---------- Total XP per student (helper view, not directly exposed) ----------
create or replace view public.student_xp_totals as
select student_id, coalesce(sum(amount), 0)::int as total_xp
from public.xp_events
group by student_id;

-- ---------- Leaderboard ----------
-- SECURITY DEFINER function: bypasses the strict profiles/xp RLS on purpose,
-- but only ever returns name + xp + rank — never email, phone, or ids beyond what's needed.
create or replace function public.get_leaderboard(p_limit int default 50)
returns table (
  student_id uuid,
  full_name  text,
  total_xp   int,
  rank       bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    coalesce(nullif(p.full_name, ''), 'Student'),
    coalesce(x.total_xp, 0),
    rank() over (order by coalesce(x.total_xp, 0) desc)
  from public.profiles p
  left join public.student_xp_totals x on x.student_id = p.id
  where p.role = 'student'
  order by coalesce(x.total_xp, 0) desc
  limit p_limit;
$$;

grant execute on function public.get_leaderboard(int) to authenticated;

-- ---------- Dashboard summary for the current student ----------
create or replace function public.get_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_student uuid := auth.uid();
  v_total_xp int;
  v_xp_this_week int;
  v_rank bigint;
  v_pending_assignments int;
  v_upcoming_sessions int;
  v_next_session json;
begin
  if v_student is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(sum(amount), 0) into v_total_xp
  from public.xp_events where student_id = v_student;

  select coalesce(sum(amount), 0) into v_xp_this_week
  from public.xp_events
  where student_id = v_student and created_at >= now() - interval '7 days';

  select rank into v_rank from (
    select student_id, rank() over (order by total_xp desc) as rank
    from public.student_xp_totals
  ) r where r.student_id = v_student;

  select count(*) into v_pending_assignments
  from public.assignment_submissions
  where student_id = v_student and status = 'pending';

  select count(*) into v_upcoming_sessions
  from public.live_sessions
  where starts_at >= now();

  select json_build_object(
    'title', title,
    'instructor_name', instructor_name,
    'starts_at', starts_at
  ) into v_next_session
  from public.live_sessions
  where starts_at >= now()
  order by starts_at asc
  limit 1;

  return json_build_object(
    'total_xp', v_total_xp,
    'xp_this_week', v_xp_this_week,
    'rank', v_rank,
    'pending_assignments', v_pending_assignments,
    'upcoming_sessions', v_upcoming_sessions,
    'next_session', v_next_session
  );
end;
$$;

grant execute on function public.get_dashboard_stats() to authenticated;

-- ---------- Roadmap progress (per enrollment, computed from module_progress) ----------
create or replace function public.get_my_roadmap_progress()
returns table (
  roadmap_id uuid,
  slug text,
  title text,
  track_label text,
  icon text,
  total_modules int,
  completed_modules int,
  progress_pct int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.slug,
    r.title,
    r.track_label,
    r.icon,
    r.total_modules,
    coalesce(mp.completed, 0)::int as completed_modules,
    case when r.total_modules > 0
      then round(coalesce(mp.completed, 0)::numeric / r.total_modules * 100)::int
      else 0
    end as progress_pct
  from public.enrollments e
  join public.roadmaps r on r.id = e.roadmap_id
  left join (
    select e2.roadmap_id, e2.student_id, count(*) filter (where m.status = 'completed') as completed
    from public.enrollments e2
    join public.module_progress m on m.enrollment_id = e2.id
    group by e2.roadmap_id, e2.student_id
  ) mp on mp.roadmap_id = r.id and mp.student_id = e.student_id
  where e.student_id = auth.uid();
$$;

grant execute on function public.get_my_roadmap_progress() to authenticated;

-- ---------- Auto-enroll + ensure a free subscription row on signup ----------
create or replace function public.handle_new_profile_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (student_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (student_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_new_profile_defaults on public.profiles;
create trigger trg_new_profile_defaults
  after insert on public.profiles
  for each row execute function public.handle_new_profile_defaults();
