# STUDY ORBIT v0.3.2 Patch Note

## 변경 사항

`server.js`의 `.env` 로딩 방식을 수정했다.

## 원인

프로젝트가 ES Module 방식이라 `require("node:fs")`를 사용한 이전 로딩 방식이 안정적이지 않았다.  
또한 서버를 `app` 폴더 안에서 실행하면 `process.cwd()` 기준으로 `.env`를 찾지 못한다.

## 해결

- `readFileSync`, `existsSync`를 ESM import 방식으로 사용
- `.env` 파일 위치가 없으면 경로를 출력하도록 수정
- 실행 위치를 저장소 루트로 명확히 고정

## 정상 메시지

```text
STUDY ORBIT v0.3 running at http://localhost:8000
Kakao REST API key: loaded
```
