-- STUDY ORBIT Supabase schema v0.7
-- 신규 설치: Supabase SQL Editor에서 전체 실행

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  grade text,
  target_school_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  authors text[] not null default '{}',
  publisher text,
  isbn text,
  thumbnail_url text,
  source_url text,
  subject text not null default '기타',
  total_problems integer not null default 0 check (total_problems >= 0),
  solved_count integer not null default 0 check (solved_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  total_minutes integer not null default 0 check (total_minutes >= 0),
  status text not null default 'active' check (status in ('active','archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  subject text not null,
  mode text not null check (mode in ('self','academy')),
  started_at timestamptz,
  ended_at timestamptz,
  minutes integer not null default 0 check (minutes >= 0),
  solved_count integer not null default 0 check (solved_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_date date not null default current_date,
  subject text not null,
  title text not null,
  target_amount text,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memorable_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  study_session_id uuid references public.study_sessions(id) on delete set null,
  problem_label text,
  reason text,
  memo text,
  image_url text,
  review_status text not null default 'needs_review' check (review_status in ('needs_review','reviewed','solved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default '기타',
  title text not null,
  due_date date,
  minutes integer not null default 0 check (minutes >= 0),
  memo text,
  is_done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_progress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  study_session_id uuid references public.study_sessions(id) on delete set null,
  log_date date not null default current_date,
  solved_count integer not null default 0 check (solved_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  memo text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.study_sessions enable row level security;
alter table public.daily_goals enable row level security;
alter table public.memorable_mistakes enable row level security;
alter table public.academy_tasks enable row level security;
alter table public.book_progress_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

drop policy if exists "books_all_own" on public.books;
create policy "books_all_own" on public.books for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sessions_all_own" on public.study_sessions;
create policy "sessions_all_own" on public.study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_all_own" on public.daily_goals;
create policy "goals_all_own" on public.daily_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "mistakes_all_own" on public.memorable_mistakes;
create policy "mistakes_all_own" on public.memorable_mistakes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "academy_tasks_all_own" on public.academy_tasks;
create policy "academy_tasks_all_own" on public.academy_tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "book_progress_logs_all_own" on public.book_progress_logs;
create policy "book_progress_logs_all_own" on public.book_progress_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists books_user_status_idx on public.books(user_id, status);
create index if not exists sessions_user_created_idx on public.study_sessions(user_id, created_at desc);
create index if not exists goals_user_date_idx on public.daily_goals(user_id, goal_date);
create index if not exists mistakes_user_book_idx on public.memorable_mistakes(user_id, book_id);
create index if not exists academy_tasks_user_due_idx on public.academy_tasks(user_id, due_date, is_done);
create index if not exists book_progress_logs_user_book_date_idx on public.book_progress_logs(user_id, book_id, log_date desc);


-- Existing v0.7.x installs: run after 20260915_orbit_v070_core_loop.sql.
-- Additive migration. Existing totals, sessions, memories and RLS remain intact.
begin;
alter table public.books
  add column if not exists total_pages integer check (total_pages > 0),
  add column if not exists completed_pages integer not null default 0 check (completed_pages >= 0);
alter table public.book_progress_logs
  add column if not exists pages_added integer not null default 0 check (pages_added >= 0),
  add column if not exists current_page integer check (current_page >= 0),
  add column if not exists request_id uuid;
create unique index if not exists book_progress_logs_request_idx
  on public.book_progress_logs(user_id, request_id) where request_id is not null;

-- A single transaction records the optional timer session, log and book totals.
-- Row locks serialize simultaneous submissions. request_id makes retries safe.
create or replace function public.record_book_progress(
  p_book_id uuid, p_request_id uuid,
  p_log_date date default current_date,
  p_solved integer default 0, p_wrong integer default 0,
  p_minutes integer default 0, p_memo text default '',
  p_pages_added integer default 0, p_current_page integer default null,
  p_timer_started_at timestamptz default null,
  p_timer_ended_at timestamptz default null,
  p_subject text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  b public.books%rowtype;
  log_id uuid;
  session_id uuid;
  next_pages integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_request_id is null or p_log_date is null
    or p_solved is null or p_wrong is null or p_minutes is null or p_pages_added is null
    or p_solved < 0 or p_wrong < 0 or p_wrong > p_solved
    or p_minutes < 0 or p_pages_added < 0 or p_current_page < 0
    or (p_current_page is not null and p_pages_added <> 0)
  then raise exception '페이지·풀이·오답·시간 입력을 확인해 주세요.'; end if;
  if (p_timer_started_at is null) <> (p_timer_ended_at is null)
    or p_timer_ended_at < p_timer_started_at
  then raise exception '타이머 시간을 확인해 주세요.'; end if;

  select * into b from public.books
    where id = p_book_id and user_id = auth.uid() for update;
  if not found then raise exception '책을 찾을 수 없습니다.'; end if;
  select id into log_id from public.book_progress_logs
    where user_id = auth.uid() and request_id = p_request_id and book_id = p_book_id;
  if found then return log_id; end if;

  -- Current page is a forward checkpoint; revisiting earlier pages never erases progress.
  next_pages := case when p_current_page is null then b.completed_pages + p_pages_added
    else greatest(b.completed_pages, p_current_page) end;
  if b.total_pages is not null and next_pages > b.total_pages then
    raise exception '전체 페이지 수를 초과합니다. 책 정보나 입력값을 확인해 주세요.';
  end if;
  if p_timer_started_at is not null then
    insert into public.study_sessions(user_id, book_id, subject, mode, started_at, ended_at,
      minutes, solved_count, wrong_count)
    values(auth.uid(), b.id, coalesce(p_subject,b.subject), 'self', p_timer_started_at,
      p_timer_ended_at, p_minutes, p_solved, p_wrong) returning id into session_id;
  end if;
  insert into public.book_progress_logs(user_id, book_id, study_session_id, log_date,
    solved_count, wrong_count, minutes, memo, pages_added, current_page, request_id)
  values(auth.uid(), b.id, session_id, p_log_date, p_solved, p_wrong, p_minutes, p_memo,
    next_pages - b.completed_pages, p_current_page, p_request_id) returning id into log_id;
  update public.books set solved_count = solved_count + p_solved,
    wrong_count = wrong_count + p_wrong, total_minutes = total_minutes + p_minutes,
    completed_pages = next_pages, updated_at = now()
    where id = b.id and user_id = auth.uid();
  return log_id;
end;
$$;
revoke all on function public.record_book_progress(uuid,uuid,date,integer,integer,integer,text,integer,integer,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.record_book_progress(uuid,uuid,date,integer,integer,integer,text,integer,integer,timestamptz,timestamptz,text) to authenticated;
notify pgrst, 'reload schema';
commit;
