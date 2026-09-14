import http from "node:http";
import fs from "node:fs/promises";
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

    if (url.pathname === "/api/book-cover") {
      await handleBookCover(url, res);
      return;
    }

    await serveStatic(url, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
  }
});

server.listen(PORT, () => {
  console.log(`STUDY ORBIT v0.3 running at http://localhost:${PORT}`);
  console.log(KAKAO_REST_API_KEY ? "Kakao REST API key: loaded" : "Kakao REST API key: missing");
});

async function handleBookCover(url, res) {
  if (!KAKAO_REST_API_KEY) {
    sendJson(res, 500, { error: "KAKAO_REST_API_KEY_MISSING" });
    return;
  }

  const rawQuery = (url.searchParams.get("q") || "").trim();
  if (!rawQuery) {
    sendJson(res, 400, { error: "QUERY_REQUIRED" });
    return;
  }

  const kakaoQuery = `${rawQuery} 문제집 표지`;
  const apiUrl = new URL("https://dapi.kakao.com/v2/search/image");
  apiUrl.searchParams.set("query", kakaoQuery);
  apiUrl.searchParams.set("sort", "accuracy");
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("size", "12");

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    sendJson(res, response.status, {
      error: "KAKAO_API_ERROR",
      status: response.status,
      detail: detail.slice(0, 500)
    });
    return;
  }

  const data = await response.json();
  const items = (data.documents || [])
    .filter(item => item.thumbnail_url || item.image_url)
    .map(item => ({
      title: guessTitle(rawQuery, item),
      subject: guessSubject(rawQuery),
      cover: item.thumbnail_url || item.image_url,
      image: item.image_url,
      source: item.display_sitename || "Kakao Image Search",
      docUrl: item.doc_url,
      width: item.width,
      height: item.height
    }))
    .filter(item => {
      if (!item.width || !item.height) return true;
      return item.height >= item.width * 0.85;
    })
    .slice(0, 8);

  sendJson(res, 200, { query: rawQuery, kakaoQuery, items });
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

function guessSubject(query) {
  if (query.includes("수학")) return "수학";
  if (query.includes("과학") || query.includes("물리") || query.includes("화학") || query.includes("생명") || query.includes("지구")) return "과학";
  if (query.includes("영어")) return "영어";
  if (query.includes("국어")) return "국어";
  if (query.includes("사회")) return "사회";
  return "기타";
}

function guessTitle(query, item) {
  const site = item.display_sitename ? ` · ${item.display_sitename}` : "";
  return `${query}${site}`;
}

function loadDotEnv() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const raw = require("node:fs").readFileSync(envPath, "utf-8");
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {}
}
