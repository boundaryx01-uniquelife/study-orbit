-- STUDY ORBIT v0.7.0 core loop migration
-- Supabase SQL Editor에서 1회 실행

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

alter table public.academy_tasks enable row level security;
alter table public.book_progress_logs enable row level security;

drop policy if exists "academy_tasks_all_own" on public.academy_tasks;
create policy "academy_tasks_all_own" on public.academy_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "book_progress_logs_all_own" on public.book_progress_logs;
create policy "book_progress_logs_all_own" on public.book_progress_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists academy_tasks_user_due_idx on public.academy_tasks(user_id, due_date, is_done);
create index if not exists book_progress_logs_user_book_date_idx on public.book_progress_logs(user_id, book_id, log_date desc);
