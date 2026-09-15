# STUDY ORBIT v0.7.2

페이지 진행률·문항 정확도·PWA 아이콘 업데이트: [적용 및 검증 안내](docs/PATCH_V072.md)

**기존 사용자는 v0.7.2 마이그레이션 SQL을 먼저 실행하세요.** 신규 설치는 최신 schema.sql을 실행합니다.

# 초기 설치 안내 (v0.5 기반)

특목고, 과학고, 한국과학영재학교 준비 학생을 위한 PWA 학습기록장입니다.

## 핵심 원칙

**Record less. Learn more.**  
기록은 짧게, 학습은 깊게.

## v0.5-webdb 변화

- localStorage 사용자 DB 폐기
- Supabase Auth 로그인/회원가입 도입
- Supabase Postgres에 문제집, 목표, 학습 세션, 기억할 문제 저장
- RLS 정책으로 사용자별 데이터 분리
- Kakao Book Search API 프록시 유지
- 프론트 코드에 API 키를 직접 저장하지 않음

## 1. Supabase SQL 실행

Supabase Dashboard > SQL Editor에서 아래 파일 전체를 실행합니다.

```text
supabase/schema.sql
```

## 2. 환경변수 설정

```powershell
cd C:\DEV\study-orbit
copy .env.example .env
notepad .env
```

`.env`에 입력:

```env
KAKAO_REST_API_KEY=카카오_REST_API_키
SUPABASE_URL=https://프로젝트ref.supabase.co
SUPABASE_ANON_KEY=supabase_anon_public_key
PORT=8000
```

`service_role key`는 절대 넣지 않습니다.

## 3. 실행

```powershell
npm run dev
```

브라우저:

```text
http://localhost:8000
```

## 정상 메시지

```text
STUDY ORBIT v0.5-webdb running at http://localhost:8000
Kakao REST API key: loaded
Supabase URL: loaded
Supabase anon key: loaded
```

## 테스트 체크리스트

1. 회원가입
2. 로그인
3. 오늘 목표 추가
4. 문제집 검색
5. 문제집 등록
6. 개인공부 타이머 기록
7. 학원 숙제 기록
8. 리포트 반영
9. 로그아웃 후 재로그인
10. 데이터 유지 확인
