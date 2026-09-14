# Book Search API Notes

## 우선순위

1. Aladin OpenAPI
2. Kakao Book Search API
3. Manual cover image upload or URL input

## 보안 방침

public GitHub 저장소와 순수 PWA 프론트엔드에는 API 키를 직접 넣지 않는다.
실제 연동은 serverless function, local proxy, 또는 별도 backend를 통해 처리한다.

## v0.2

API 연결 전까지 mock search를 사용한다.
검색 UI와 등록 흐름을 먼저 검증한 뒤 실제 API를 붙인다.

## 연결 시 필요한 값

### Aladin

- TTBKey
- 검색 API 사용 가능 여부
- 응답 형식 JSON 사용 가능 여부 확인

### Kakao

- REST API Key
- 책 검색 API 사용 가능 여부
- 호출 제한과 도메인 설정 확인
