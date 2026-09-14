import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "app");

loadDotEnv();

const PORT = Number(process.env.PORT || 8000);
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/book-search") {
      await handleBookSearch(url, res);
      return;
    }

    // v0.3 compatibility alias. The app now uses /api/book-search.
    if (url.pathname === "/api/book-cover") {
      await handleBookSearch(url, res);
      return;
    }

    await serveStatic(url, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
  }
});

server.listen(PORT, () => {
  console.log(`STUDY ORBIT v0.4 running at http://localhost:${PORT}`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Env file path: ${path.join(process.cwd(), ".env")}`);
  console.log(KAKAO_REST_API_KEY ? "Kakao REST API key: loaded" : "Kakao REST API key: missing");
});

async function handleBookSearch(url, res) {
  if (!KAKAO_REST_API_KEY) {
    sendJson(res, 500, { error: "KAKAO_REST_API_KEY_MISSING" });
    return;
  }

  const rawQuery = (url.searchParams.get("q") || "").trim();
  if (!rawQuery) {
    sendJson(res, 400, { error: "QUERY_REQUIRED" });
    return;
  }

  const apiUrl = new URL("https://dapi.kakao.com/v3/search/book");
  apiUrl.searchParams.set("query", rawQuery);
  apiUrl.searchParams.set("target", "title");
  apiUrl.searchParams.set("sort", "accuracy");
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("size", "10");

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    sendJson(res, response.status, {
      error: "KAKAO_BOOK_API_ERROR",
      status: response.status,
      detail: detail.slice(0, 500)
    });
    return;
  }

  const data = await response.json();
  const items = (data.documents || []).map(book => ({
    title: cleanTitle(book.title),
    authors: book.authors || [],
    publisher: book.publisher || "",
    isbn: book.isbn || "",
    thumbnail: book.thumbnail || "",
    cover: book.thumbnail || "",
    url: book.url || "",
    datetime: book.datetime || "",
    price: book.price || 0,
    salePrice: book.sale_price || 0,
    status: book.status || "",
    subject: guessSubject(`${book.title} ${rawQuery}`),
    source: "Kakao Book Search"
  }));

  sendJson(res, 200, {
    query: rawQuery,
    totalCount: data.meta?.total_count || 0,
    pageableCount: data.meta?.pageable_count || 0,
    isEnd: data.meta?.is_end ?? true,
    items
  });
}

async function serveStatic(url, res) {
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";

  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized);

  if (!filePath.startsWith(root)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    sendText(res, 404, "Not Found");
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function cleanTitle(title) {
  return String(title || "").replace(/<[^>]*>/g, "").trim();
}

function guessSubject(query) {
  if (query.includes("수학")) return "수학";
  if (query.includes("과학") || query.includes("물리") || query.includes("화학") || query.includes("생명") || query.includes("지구")) return "과학";
  if (query.includes("영어")) return "영어";
  if (query.includes("국어")) return "국어";
  if (query.includes("사회")) return "사회";
  return "기타";
}

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    console.warn(`.env file not found at: ${envPath}`);
    return;
  }

  try {
    const raw = readFileSync(envPath, "utf-8").replace(/^\uFEFF/, "");
    const lines = raw.split(/\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn(".env 파일을 읽지 못했습니다:", error.message);
  }
}
