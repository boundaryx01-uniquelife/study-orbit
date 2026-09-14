# STUDY ORBIT v0.4

특목고, 과학고, 한국과학영재학교 준비 학생을 위한 PWA 학습기록장입니다.

## 핵심 원칙

**Record less. Learn more.**  
기록은 짧게, 학습은 깊게.

## v0.4 변화

- 문제집 검색을 Kakao Image Search에서 Kakao Book Search API로 전환
- `/api/book-search?q=문제집명` 로컬 프록시 추가
- 제목, 저자, 출판사, ISBN, 썸네일, 도서 URL 저장 구조 반영
- API 오류 시 mock 검색으로 자동 백업
- 문제집 삭제 기능 유지
- API 키는 `.env`에만 저장하고, 프론트엔드 코드에는 넣지 않음

## 실행

반드시 저장소 루트에서 실행합니다.

```powershell
cd C:\DEV\study-orbit

copy .env.example .env
notepad .env
npm run dev
```

`.env` 예시:

```env
KAKAO_REST_API_KEY=복사한_REST_API_키
PORT=8000
```

브라우저:

```text
http://localhost:8000
```

## 정상 메시지

```text
STUDY ORBIT v0.4 running at http://localhost:8000
Working directory: C:\DEV\study-orbit
Env file path: C:\DEV\study-orbit\.env
Kakao REST API key: loaded
```

## 테스트 검색어

- 최상위 수학 6-2
- 블랙라벨 중학 수학 1-1
- 오투 중등 과학 1-1
- 쎈 중등 수학 1-1
