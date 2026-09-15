# STUDY ORBIT Supabase Setup

## 필요한 값

Supabase Dashboard > Project Settings > API에서 다음 값을 확인한다.

- Project URL → `SUPABASE_URL`
- Project API keys > anon public → `SUPABASE_ANON_KEY`

주의: `service_role` 키는 절대 프론트/로컬 공개 저장소에 넣지 않는다.

## SQL 실행

`supabase/schema.sql`을 SQL Editor에서 실행한다.

## Auth 설정

개발 MVP에서는 Supabase Dashboard > Authentication > Providers에서 Email provider가 켜져 있어야 한다.

회원가입 후 즉시 로그인이 안 되면 Email confirmation 설정이 켜져 있을 수 있다.  
테스트 편의를 위해 개발 단계에서는 Confirm email 옵션을 꺼둘 수 있다.

## 데이터 분리

모든 주요 테이블은 `user_id = auth.uid()` 조건의 RLS 정책으로 보호된다.  
profiles 테이블은 `id = auth.uid()` 조건을 사용한다.
