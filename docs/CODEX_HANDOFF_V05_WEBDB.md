# Codex Handoff: STUDY ORBIT v0.5-webdb

## 목표

현재 PWA를 Supabase Web DB 기반으로 안정화한다.

## 현재 구조

- `server.js`: 정적 파일 서빙, `/api/config`, `/api/book-search`
- `app/app.js`: Supabase Auth REST, PostgREST fetch, Kakao book search UI
- `supabase/schema.sql`: 테이블, RLS, 인덱스
- `app/styles.css`: ORBIT UI

## 제한

- 프론트에 `service_role` 키 금지
- Kakao REST API key를 app.js에 직접 넣지 않음
- localStorage는 Supabase session token 저장에만 사용
- 학습 기록 데이터는 Supabase에 저장
- 기능 확장보다 현재 흐름 안정화 우선

## Acceptance

- 회원가입/로그인 가능
- profiles row 생성
- 책 검색 후 books insert
- study_sessions insert
- books solved_count/wrong_count/total_minutes update
- RLS로 사용자별 데이터 분리
