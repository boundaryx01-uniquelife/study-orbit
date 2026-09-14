# STUDY ORBIT v0.3.1

특목고, 과학고, 한국과학영재학교 준비 학생을 위한 PWA 학습기록장입니다.

## 핵심 원칙

**Record less. Learn more.**  
기록은 짧게, 학습은 깊게.

## v0.3 변화

- ORBIT 테마 UI 유지
- 문제집 검색을 mock에서 Kakao Image Search API 프록시 구조로 확장
- API 실패 시 mock 검색으로 자동 백업
- API 키는 `.env`에만 저장하고, 프론트엔드 코드에는 넣지 않음
- 문제집 상세 화면에서 문제집 삭제 가능

## 실행

```powershell
cd C:\DEV\study-orbit

copy .env.example .env
notepad .env
```

`.env`에 카카오 REST API 키 입력:

```env
KAKAO_REST_API_KEY=복사한_REST_API_키
PORT=8000
```

그다음 실행:

```powershell
npm run dev
```

브라우저:

```text
http://localhost:8000
```

## 주의

public GitHub 저장소에는 `.env`를 올리지 않습니다.
