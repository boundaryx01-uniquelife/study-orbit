import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const appDir = path.join(root, "app");
const publicDir = path.join(root, "public");

await fs.rm(publicDir, { recursive: true, force: true });
await fs.mkdir(publicDir, { recursive: true });
await fs.cp(appDir, publicDir, { recursive: true });

console.log("Vercel build: copied app/ to public/");
