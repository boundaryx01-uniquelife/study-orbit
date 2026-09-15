import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const indexPath = path.join(root, "public", "index.html");

const desktopOverride = `
<style id="orbit-desktop-v069">
@media (min-width: 900px) {
  body { padding: 18px !important; }

  #appShell {
    width: min(1500px, calc(100vw - 36px)) !important;
    max-width: none !important;
    min-height: calc(100vh - 36px) !important;
    grid-template-columns: 190px minmax(0, 1fr) !important;
    grid-template-rows: 132px minmax(0, 1fr) !important;
  }

  .hero {
    padding: 28px 34px !important;
  }

  main {
    grid-column: 2 !important;
    grid-row: 2 !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 28px 34px 48px !important;
    overflow-x: hidden !important;
  }

  .tabbar {
    width: 190px !important;
    min-width: 190px !important;
    max-width: 190px !important;
    padding: 22px 14px !important;
    gap: 10px !important;
    align-items: stretch !important;
  }

  .tabbar button {
    width: 100% !important;
    height: 76px !important;
    min-height: 76px !important;
    padding: 10px 14px !important;
    grid-template-columns: 42px 1fr !important;
    grid-template-rows: 1fr !important;
    justify-items: start !important;
    align-items: center !important;
    gap: 12px !important;
    border-radius: 18px !important;
  }

  .tabbar b {
    font-size: 30px !important;
    line-height: 1 !important;
    width: 42px !important;
    text-align: center !important;
  }

  .tabbar span {
    font-size: 15px !important;
    line-height: 1.2 !important;
    font-weight: 950 !important;
    white-space: nowrap !important;
  }

  .tabbar .active {
    background: rgba(255,255,255,.16) !important;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.14) !important;
  }

  #screen {
    width: 100% !important;
    max-width: none !important;
  }

  #screen > .panel,
  #screen > .stack,
  #screen > .primary,
  #screen > .secondary {
    width: 100% !important;
    max-width: none !important;
  }

  .book-card {
    grid-template-columns: 72px minmax(0, 1fr) auto !important;
    gap: 18px !important;
    padding: 18px !important;
  }

  .cover {
    width: 68px !important;
    height: 96px !important;
  }

  .panel {
    padding: 22px !important;
  }
}

@media (min-width: 1280px) {
  #appShell { grid-template-columns: 210px minmax(0, 1fr) !important; }
  .tabbar {
    width: 210px !important;
    min-width: 210px !important;
    max-width: 210px !important;
  }
  main { padding-left: 42px !important; padding-right: 42px !important; }
}
</style>`;

let html = await fs.readFile(indexPath, "utf8");
html = html.replace(/<style id="orbit-desktop-v069">[\s\S]*?<\/style>/, "");
html = html.replace("</head>", `${desktopOverride}\n</head>`);
await fs.writeFile(indexPath, html, "utf8");

console.log("Vercel build: applied ORBIT desktop v0.6.9 layout override");
