import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const publicDir = path.join(root, "public");

await fs.access(path.join(publicDir, "index.html"));
await fs.access(path.join(publicDir, "orbit.css"));
await fs.access(path.join(publicDir, "orbit.js"));

console.log("Vercel build: STUDY ORBIT v0.7 public assets ready");
