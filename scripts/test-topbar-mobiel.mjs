// Gebruikers-sweep 2026-11-07 (Sanne, iPhone SE): de bovenbalk van /v2/app liep op een
// smal scherm over vijf regels en bleef sticky staan: 323 van de 568 px, dus 57 % van
// het scherm, en met het toetsenbord open bleef er bijna niets over. Onder 920 px
// scrolt de balk nu mee weg; op desktop blijft hij sticky.
// Broncontrole zonder browser (CI); het schermdeel draait alleen als Chromium er is.
// `npm run test:topbar`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
const smal = css.match(/@media screen and \(max-width:920px\)\{([\s\S]*?)\n\}/);
assert.ok(smal, "smal-blok in v2.css gevonden");
assert.match(smal[1], /html\.v2 header\.topbar\{[^}]*position:static/, "bovenbalk is op een smal scherm niet sticky");

let playwright = null;
try { playwright = require("playwright"); } catch {}
let browser = null;
if (playwright) {
  try { browser = await playwright.chromium.launch(); } catch { browser = null; }
}
if (!browser) {
  console.log("test-topbar-mobiel: bron ok (geen browser, schermdeel overgeslagen)");
  process.exit(0);
}

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-topbar-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const meet = async (opties) => {
    const ctx = await browser.newContext({ ...opties, locale: "nl-NL" });
    const page = await ctx.newPage();
    await page.goto(origin + "/v2/app", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.querySelectorAll(".ov").forEach((o) => { o.style.display = "none"; }));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wacht(150);
    const r = await page.evaluate(() => {
      const b = document.querySelector("header.topbar").getBoundingClientRect();
      return { zichtbaar: Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0)), hoogte: innerHeight };
    });
    await ctx.close();
    return r;
  };
  const se = await meet(playwright.devices["iPhone SE"]);
  assert.ok(se.zichtbaar / se.hoogte < 0.25,
    `iPhone SE: bovenbalk bedekt na scrollen ${se.zichtbaar} van ${se.hoogte} px`);
  const desk = await meet({ viewport: { width: 1280, height: 800 } });
  assert.ok(desk.zichtbaar > 0, "desktop: bovenbalk blijft sticky in beeld");
  console.log("test-topbar-mobiel: ok", JSON.stringify({ se, desk }));
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
