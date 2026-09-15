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
