import { bookCounts } from "./lib/book-metadata.js";
import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "public");

loadDotEnv();

const PORT = Number(process.env.PORT || 8000);
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/config") {
      sendJson(res, 200, { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
      return;
    }

    if (url.pathname === "/api/book-search") {
      await handleBookSearch(url, res);
      return;
    }

    await serveStatic(url, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`STUDY ORBIT v0.7.2 public running at http://localhost:${PORT}`);
  console.log(`Static root: ${root}`);
  console.log(KAKAO_REST_API_KEY ? "Kakao REST API key: loaded" : "Kakao REST API key: missing");
  console.log(SUPABASE_URL ? "Supabase URL: loaded" : "Supabase URL: missing");
  console.log(SUPABASE_ANON_KEY ? "Supabase anon key: loaded" : "Supabase anon key: missing");
});

async function handleBookSearch(url, res) {
  if (!KAKAO_REST_API_KEY) return sendJson(res, 500, { error: "KAKAO_REST_API_KEY_MISSING" });
  const rawQuery = (url.searchParams.get("q") || "").trim();
  if (!rawQuery) return sendJson(res, 400, { error: "QUERY_REQUIRED" });

  const apiUrl = new URL("https://dapi.kakao.com/v3/search/book");
  apiUrl.searchParams.set("query", rawQuery);
  apiUrl.searchParams.set("target", "title");
  apiUrl.searchParams.set("sort", "accuracy");
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("size", "10");

  const response = await fetch(apiUrl, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
  if (!response.ok) {
    const detail = await response.text();
    return sendJson(res, response.status, { error: "KAKAO_BOOK_API_ERROR", status: response.status, detail: detail.slice(0, 500) });
  }

  const data = await response.json();
  const items = (data.documents || []).map(book => ({
    ...bookCounts(book),
    title: cleanTitle(book.title),
    authors: book.authors || [],
    publisher: book.publisher || "",
    isbn: book.isbn || "",
    thumbnail: book.thumbnail || "",
    cover: book.thumbnail || "",
    url: book.url || "",
    subject: guessSubject(`${book.title} ${rawQuery}`),
    source: "Kakao Book Search"
  }));
  sendJson(res, 200, { query: rawQuery, totalCount: data.meta?.total_count || 0, items });
}

async function serveStatic(url, res) {
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized);
  if (!filePath.startsWith(root)) return sendText(res, 403, "Forbidden");

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    const index = await fs.readFile(path.join(root, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(index);
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
function cleanTitle(title) { return String(title || "").replace(/<[^>]*>/g, "").trim(); }
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
  if (!existsSync(envPath)) return console.warn(`.env file not found at: ${envPath}`);
  const raw = readFileSync(envPath, "utf-8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
