// Gebruikers-sweep 2026-11-19 10u (Sanne, desktop, alleen toetsenbord): na Enter op de × van een oefentegel
// stond "Ongedaan maken" als laatste element van de pagina, na honderden tabstops (doseringsvakjes), en
// verdween de balk na 10 s. Ongedaan maken was met het toetsenbord dus praktisch onmogelijk.
// Nu: weghalen met het toetsenbord zet de focus op "Ongedaan maken"; Enter zet de oefening terug op de
// eigen plek met de focus op de tegel; Esc sluit de balk en zet de focus terug op de tegels; zolang de
// focus op de balk staat verdwijnt hij niet. Muis/aanraking houden het oude gedrag.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:oefwegtoetsenbord`
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");
assert.match(html, /function oefWeg\(n,kb\)\{/, "oefWeg weet of het toetsenbord weghaalde");
assert.match(html, /if\(kb\)knop\.focus\(\);/, "focus naar Ongedaan maken bij het toetsenbord");
assert.match(html, /b\.contains\(document\.activeElement\)\)b\.style\.display='none'/, "balk blijft staan zolang hij de focus heeft");

let playwright = null;
try { playwright = createRequire(import.meta.url)("playwright"); } catch {
  try { playwright = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!playwright) { console.log("PASS oefwegtoetsenbord (bron; geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

async function vrijePoort() { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefwegkb-"));
const port = await vrijePoort();
const app = spawn(process.execPath, ["server.js"], { cwd: root, stdio: "ignore",
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "",
    EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" } });
const browser = await playwright.chromium.launch();
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const rnVersie = (readFileSync(new URL("../public/release-notes.js", import.meta.url), "utf8").match(/version='([^']+)'/) || [])[1] || "";
  await ctx.addInitScript((v) => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_wn_gezien", "9"); localStorage.setItem("fysiplan_release_seen", v); } catch {} }, rnVersie);
  const page = await ctx.newPage();
  const fouten = []; page.on("pageerror", (e) => fouten.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/v2/app`, { waitUntil: "load" });
  await page.waitForSelector("#list .row [data-add]", { timeout: 15000 });
  await page.keyboard.press("Escape");
  for (let i = 0; i < 3; i++) { await page.locator("#list .row [data-add]").nth(i).click(); await page.waitForTimeout(900); }
  const namen = () => page.evaluate(() => [...document.querySelectorAll("#mon .pic .rm")].map((x) => x.getAttribute("aria-label")));
  for (let i = 0; i < 50 && (await namen()).length !== 3; i++) await page.waitForTimeout(100);
  const voor = await namen();
  assert.equal(voor.length, 3, "drie oefeningen op de kaart");
  const actief = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || (a.dataset && a.dataset.rm != null ? "rm" + a.dataset.rm : a.tagName)) : ""; });

  // Enter op de × van de middelste: focus op Ongedaan maken, Enter zet terug
  await page.focus("#mon [data-rm='1']");
  await page.keyboard.press("Enter");
  assert.deepEqual(await namen(), [voor[0], voor[2]], "oefening weg");
  assert.equal(await actief(), "oefweg_terug", "focus staat op Ongedaan maken");
  await page.keyboard.press("Enter");
  assert.deepEqual(await namen(), voor, "Enter zet de oefening terug op de eigen plek");
  assert.equal(await actief(), "rm1", "focus terug op de tegel");
  assert.equal(await page.isVisible("#oefweg_bar"), false, "balk weg");

  // Esc: balk dicht, focus terug op de tegels, oefening blijft weg
  await page.focus("#mon [data-rm='0']");
  await page.keyboard.press("Enter");
  assert.equal(await actief(), "oefweg_terug", "weer op Ongedaan maken");
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#oefweg_bar"), false, "Esc sluit de balk");
  assert.match(await actief(), /^rm\d$/, "Esc zet de focus terug op een tegel");
  assert.equal((await namen()).length, 2, "Esc maakt niets ongedaan");

  // zolang de focus op de balk staat verdwijnt hij niet (timer 10 s)
  await page.focus("#mon [data-rm='0']");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(10600);
  assert.equal(await page.isVisible("#oefweg_bar"), true, "balk blijft staan met de focus erop");
  assert.equal(await actief(), "oefweg_terug");

  // muis: focus springt niet naar de balk
  await page.keyboard.press("Escape");
  await page.locator("#mon [data-rm='0']").click();
  assert.notEqual(await actief(), "oefweg_terug", "met de muis blijft de focus waar hij was");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("PASS oefwegtoetsenbord (Enter op × → Ongedaan maken heeft de focus, Enter zet terug, Esc terug naar de tegels, balk blijft met focus)");
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
