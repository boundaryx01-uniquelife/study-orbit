import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { bookCounts } from '../lib/book-metadata.js';

test('explicit API counts are preserved; missing or descriptive values stay unknown', () => {
  assert.deepEqual(bookCounts({pageCount:240,question_count:'500'}), {total_pages:240,total_problems:500});
  for (const value of [null,0,-1,1.5,'240쪽',true,Infinity]) {
    assert.equal(bookCounts({pages:value}).total_pages,null);
  }
  assert.deepEqual(bookCounts({contents:'200 pages, 300 questions'}),{total_pages:null,total_problems:null});
});

test('page and accuracy metrics distinguish unknown totals and zero attempts', async () => {
  const context = vm.createContext({ renderBooks() {} });
  vm.runInContext(await fs.readFile(new URL('../public/orbit-progress.js',import.meta.url),'utf8'),context);
  assert.equal(context.bookMetrics({total_pages:200,completed_pages:50}).percent,25);
  assert.equal(context.bookMetrics({}).percent,null);
  assert.equal(context.bookMetrics({total_problems:100}).correct,null);
  assert.equal(context.bookMetrics({total_problems:100,solved_count:20,wrong_count:5}).correct,'75.0');
  assert.equal(context.bookMetrics({total_problems:100,solved_count:20,wrong_count:5}).wrong,'25.0');
  assert.equal(context.bookMetrics({total_problems:100,solved_count:2,wrong_count:3}).correct,null);
  assert.throws(()=>context.countInput(-1,'test'));
  assert.throws(()=>context.countInput(2.5,'test'));
  assert.equal(context.countInput('','test',true),null);
});

test('migration preserves history, supports retries, enforces ownership and rolls back failed records', async () => {
  const db = new PGlite();
  try {
    const user='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
    const book='20000000-0000-4000-8000-000000000001';
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
      insert into auth.users values ('${user}'),('${other}');`);
    const schema = await fs.readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');
    const migration = await fs.readFile(new URL('../supabase/migrations/20260915_orbit_v072_pages.sql',import.meta.url),'utf8');
    // Start at the old schema, with real historical aggregates and a memory.
    await db.exec(schema.split('-- Existing v0.7.x installs:')[0].replace('create extension if not exists pgcrypto;',''));
    await db.exec(`insert into public.books(id,user_id,title,total_problems,solved_count,wrong_count,total_minutes) values('${book}','${user}','기존 책',100,20,5,60);
      insert into public.memorable_mistakes(user_id,book_id,problem_label) values('${user}','${book}','p.12 3번');`);
    await db.exec(migration);
    await db.exec(migration); // Re-running the additive upgrade is safe.
    await db.exec(`grant usage on schema public,auth to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      set role authenticated; set app.user_id='${user}';
      update public.books set total_pages=200 where id='${book}';`);
    const record = (request, overrides={}) => {
      const p={pages:0,current:null,solved:0,wrong:0,minutes:0,start:null,end:null,...overrides};
      return db.query(`select public.record_book_progress($1,$2,'2026-09-15',$3,$4,$5,'메모',$6,$7,$8,$9,'수학') as id`,[book,request,p.solved,p.wrong,p.minutes,p.pages,p.current,p.start,p.end]);
    };
    const id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    await record(id(1),{pages:20,solved:10,wrong:2,minutes:15,start:'2026-09-15T00:00:00Z',end:'2026-09-15T00:15:00Z'});
    await record(id(1),{pages:20,solved:10,wrong:2}); // retry: no double count
    await record(id(2),{current:50});
    await record(id(3),{current:30}); // revisit: no loss of progress
    await record(id(4),{pages:5});
    const b=(await db.query('select * from public.books')).rows[0];
    assert.equal(b.completed_pages,55); assert.equal(b.solved_count,30);
    assert.equal(b.wrong_count,7); assert.equal(b.total_minutes,75);
    assert.equal((await db.query('select * from public.study_sessions')).rows.length,1);
    assert.equal((await db.query('select * from public.book_progress_logs')).rows.length,4);
    assert.equal((await db.query('select * from public.memorable_mistakes')).rows.length,1);
    for (const bad of [{pages:200},{solved:1,wrong:2},{pages:-1},{pages:1,current:60},{start:'2026-09-16',end:'2026-09-15'}]) {
      await assert.rejects(record(id(5),bad));
    }
    assert.equal((await db.query('select * from public.book_progress_logs')).rows.length,4);
    await db.exec(`set app.user_id='${other}'`);
    await assert.rejects(record(id(6),{pages:1}));
    assert.equal((await db.query('select * from public.books')).rows.length,0);
    await db.exec(`set app.user_id='${user}'; update public.books set status='archived' where id='${book}'`);
    assert.equal((await db.query('select * from public.memorable_mistakes')).rows.length,1);
  } finally { await db.close(); }
});
