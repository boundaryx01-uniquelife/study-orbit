# Kakao Book Cover Search Setup

## 목적

STUDY ORBIT의 문제집 추가 화면에서 실제 문제집 표지 후보를 검색한다.

## 사용하는 API

- Kakao Daum Search API
- Image Search endpoint
- `GET https://dapi.kakao.com/v2/search/image`

## 인증

프론트엔드가 아니라 로컬 서버 또는 서버리스 프록시에서만 다음 헤더를 사용한다.

```http
Authorization: KakaoAK ${KAKAO_REST_API_KEY}
```

## 검색어 생성

사용자가 입력한 문제집명 뒤에 `문제집 표지`를 붙인다.

예:

```text
최상위 수학 6-2 문제집 표지
블랙라벨 중학 수학 1-1 문제집 표지
```

## 보안 방침

- REST API 키는 `.env`에만 저장한다.
- `.env`는 `.gitignore`에 포함한다.
- GitHub에 키를 커밋하지 않는다.
- Admin 키는 사용하지 않는다.

## 다음 개선

- 교보문고, YES24, 알라딘, 출판사 사이트 우선 정렬
- 세로형 이미지 우선
- 수동 이미지 URL 입력 백업
- 사용자가 표지 후보 중 하나를 선택하도록 UI 개선
