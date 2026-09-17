-- STUDY ORBIT v0.7.3: edit/delete a book progress log and recalculate aggregates.
-- Run after 20260915_orbit_v072_pages.sql.
begin;

alter table public.books
  add column if not exists orbit_legacy_solved_count integer not null default 0 check (orbit_legacy_solved_count >= 0),
  add column if not exists orbit_legacy_wrong_count integer not null default 0 check (orbit_legacy_wrong_count >= 0),
  add column if not exists orbit_legacy_minutes integer not null default 0 check (orbit_legacy_minutes >= 0),
  add column if not exists orbit_legacy_pages integer not null default 0 check (orbit_legacy_pages >= 0);

-- Preserve aggregates created before progress logs existed. Re-running this is stable.
update public.books b set
  orbit_legacy_solved_count = x.legacy_solved,
  orbit_legacy_wrong_count = x.legacy_wrong,
  orbit_legacy_minutes = x.legacy_minutes,
  orbit_legacy_pages = x.legacy_pages
from (select b2.id,
             greatest(b2.solved_count - coalesce(sum(l.solved_count), 0), 0)::integer legacy_solved,
             greatest(b2.wrong_count - coalesce(sum(l.wrong_count), 0), 0)::integer legacy_wrong,
             greatest(b2.total_minutes - coalesce(sum(l.minutes), 0), 0)::integer legacy_minutes,
             greatest(b2.completed_pages - coalesce(sum(l.pages_added), 0), 0)::integer legacy_pages
        from public.books b2 left join public.book_progress_logs l on l.book_id = b2.id and l.user_id = b2.user_id
       group by b2.id, b2.solved_count, b2.wrong_count, b2.total_minutes, b2.completed_pages) x
where x.id = b.id;

create or replace function public.recalculate_book_progress(p_book_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  update public.books b set
    solved_count = b.orbit_legacy_solved_count + coalesce(x.solved_count, 0),
    wrong_count = b.orbit_legacy_wrong_count + coalesce(x.wrong_count, 0),
    total_minutes = b.orbit_legacy_minutes + coalesce(x.total_minutes, 0),
    completed_pages = greatest(b.orbit_legacy_pages + coalesce(x.pages_added, 0), coalesce(x.max_current_page, 0)),
    updated_at = now()
  from (select coalesce(sum(solved_count),0)::integer solved_count,
               coalesce(sum(wrong_count),0)::integer wrong_count,
               coalesce(sum(minutes),0)::integer total_minutes,
               coalesce(sum(pages_added),0)::integer pages_added,
               max(current_page)::integer max_current_page
          from public.book_progress_logs
         where book_id = p_book_id and user_id = auth.uid()) x
  where b.id = p_book_id and b.user_id = auth.uid();
end;
$$;

create or replace function public.update_book_progress(
  p_log_id uuid, p_log_date date, p_solved integer, p_wrong integer,
  p_minutes integer, p_memo text, p_pages_added integer, p_current_page integer
) returns void language plpgsql security invoker set search_path = '' as $$
declare b public.books%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if p_log_date is null or p_solved < 0 or p_wrong < 0 or p_wrong > p_solved
     or p_minutes < 0 or p_pages_added < 0 or p_current_page < 0
  then raise exception '페이지·풀이·오답·시간 입력을 확인해 주세요.'; end if;
  select bk.* into b from public.books bk
  join public.book_progress_logs l on l.book_id = bk.id
  where l.id = p_log_id and l.user_id = auth.uid() and bk.user_id = auth.uid() for update;
  if not found then raise exception '학습 기록을 찾을 수 없습니다.'; end if;
  if b.total_pages is not null and p_current_page is not null and p_current_page > b.total_pages
    then raise exception '현재 페이지가 전체 페이지 수를 초과합니다.'; end if;
  update public.book_progress_logs set log_date = p_log_date, solved_count = p_solved,
    wrong_count = p_wrong, minutes = p_minutes, memo = coalesce(p_memo,''),
    pages_added = p_pages_added, current_page = p_current_page
  where id = p_log_id and user_id = auth.uid();
  perform public.recalculate_book_progress(b.id);
end;
$$;

create or replace function public.delete_book_progress(p_log_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare old_book_id uuid; old_session_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select book_id, study_session_id into old_book_id, old_session_id
    from public.book_progress_logs where id = p_log_id and user_id = auth.uid() for update;
  if not found then raise exception '학습 기록을 찾을 수 없습니다.'; end if;
  delete from public.book_progress_logs where id = p_log_id and user_id = auth.uid();
  if old_session_id is not null then
    delete from public.study_sessions where id = old_session_id and user_id = auth.uid();
  end if;
  perform public.recalculate_book_progress(old_book_id);
end;
$$;

revoke all on function public.recalculate_book_progress(uuid) from public, anon;
revoke all on function public.update_book_progress(uuid,date,integer,integer,integer,text,integer,integer) from public, anon;
revoke all on function public.delete_book_progress(uuid) from public, anon;
grant execute on function public.recalculate_book_progress(uuid) to authenticated;
grant execute on function public.update_book_progress(uuid,date,integer,integer,integer,text,integer,integer) to authenticated;
grant execute on function public.delete_book_progress(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
