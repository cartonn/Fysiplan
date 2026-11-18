// Gebruikers-sweep 2026-11-14 14u (Sanne, desktop 1280, alleen toetsenbord): in de oefenlijst "+" (op kaart zetten)
// of ★ indrukken zette de oefening erbij, maar renderList() bouwde de rijen opnieuw op en de focus viel naar body.
// De volgende Tab begon bovenaan; wie verder tabte, haalde bij de eerste rij met Enter de net toegevoegde oefening
// weer weg. Nu staat de focus daarna weer op dezelfde knop.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:lijstfocus`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");
assert.match(html, /function lijstFocusTerug\(sel\)\{/, "hulpfunctie voor de focus in de lijst");
assert.match(html, /renderList\(\);lijstFocusTerug\("\[data-fav='"\+fav\.dataset\.fav\+"'\]"\);/, "na ★ terug op ★");
assert.match(html, /toggleExercise\(\+r\.dataset\.id(,e\.detail!==0)?\);\s*if\(e\.target\.closest\('\[data-add\]'\)\)lijstFocusTerug\("\[data-add='"\+r\.dataset\.id\+"'\]"\);/, "na + terug op de knop");

let playwright = null;
try { playwright = createRequire(import.meta.url)("playwright"); } catch {
  try { playwright = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!playwright) { console.log("PASS lijstfocus (bron; geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

async function vrijePoort() { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-lijstfocus-"));
const port = await vrijePoort();
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "" };
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: "ignore" });
const browser = await playwright.chromium.launch();
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_wn_gezien", "9"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/v2/app`);
  await page.waitForSelector("#list .row [data-add]", { timeout: 15000 });
  await page.keyboard.press("Escape");
  const focusInfo = () => page.evaluate(() => { const a = document.activeElement; return { tag: a && a.tagName, add: a && a.dataset ? a.dataset.add || null : null, fav: a && a.dataset ? a.dataset.fav || null : null }; });
  const kaartTelt = () => page.evaluate(() => document.querySelectorAll("#list .row [data-add].on").length);

  // + met Enter
  const add = page.locator("#list .row [data-add]").nth(1);
  const id = await add.getAttribute("data-add");
  await add.focus();
  await page.keyboard.press("Enter");
  let f = await focusInfo();
  assert.equal(f.add, id, "na Enter op + staat de focus weer op dezelfde knop: " + JSON.stringify(f));
  assert.equal(await kaartTelt(), 1, "oefening staat op de kaart");
  // nog eens Enter haalt hem eraf, en de focus blijft
  await page.keyboard.press("Enter");
  f = await focusInfo();
  assert.equal(f.add, id, "na tweede Enter nog steeds op de knop");
  assert.equal(await kaartTelt(), 0);
  // spatie op + werkt ook
  await page.keyboard.press(" ");
  f = await focusInfo();
  assert.equal(f.add, id, "na spatie op de knop");

  // ★ met Enter
  const fav = page.locator(`#list .row [data-fav='${id}']`);
  await fav.focus();
  await page.keyboard.press("Enter");
  f = await focusInfo();
  assert.equal(f.fav, id, "na Enter op ★ staat de focus weer op ★: " + JSON.stringify(f));
  // Tab gaat daarna naar de + van dezelfde rij, niet terug naar boven
  await page.keyboard.press("Tab");
  f = await focusInfo();
  assert.equal(f.add, id, "Tab na ★ gaat naar + van dezelfde rij: " + JSON.stringify(f));
  console.log("PASS lijstfocus: na + en ★ blijft de focus op de knop, Tab gaat door in dezelfde rij");
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
