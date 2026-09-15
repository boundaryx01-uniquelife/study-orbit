-- STUDY ORBIT Supabase schema v0.5-webdb
-- Supabase SQL Editor에서 전체 실행

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

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.study_sessions enable row level security;
alter table public.daily_goals enable row level security;
alter table public.memorable_mistakes enable row level security;

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

create index if not exists books_user_status_idx on public.books(user_id, status);
create index if not exists sessions_user_created_idx on public.study_sessions(user_id, created_at desc);
create index if not exists goals_user_date_idx on public.daily_goals(user_id, goal_date);
create index if not exists mistakes_user_book_idx on public.memorable_mistakes(user_id, book_id);
