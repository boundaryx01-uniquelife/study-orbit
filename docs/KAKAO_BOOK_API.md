# Kakao Book Search API Integration

## Endpoint

```text
GET /api/book-search?q=문제집명
```

## Internal API

```text
GET https://dapi.kakao.com/v3/search/book
```

## Kakao Parameters

```text
query=<user input>
target=title
sort=accuracy
page=1
size=10
```

## Returned fields used by ORBIT

- title
- authors
- publisher
- isbn
- thumbnail
- url
- price
- sale_price
- status

## Why Book API instead of Image API

이미지 검색은 블로그 썸네일과 후기 이미지가 섞인다.  
도서 API는 문제집 등록에 필요한 제목, 출판사, ISBN, 표지 썸네일을 함께 제공하므로 ORBIT의 문제집 데이터 구조에 더 적합하다.

## Security

REST API 키는 `.env`에만 저장한다.  
프론트엔드 `app.js`에는 키를 넣지 않는다.
