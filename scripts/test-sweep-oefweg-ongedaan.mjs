// Regressietest gebruikers-sweep 2026-11-15 10u (Mark, iPad staand en liggend): een tik midden bovenin het plaatje
// van een oefentegel viel in het tikvlak van de × (21-24 % van de tegel) en haalde de oefening van de kaart, zonder
// weg terug: oefening en ingevulde dosering kwijt. Nu komt er na × een melding met "Ongedaan maken" die de oefening
// op dezelfde plek terugzet, met haar dosering; op een andere kaart zet de knop niets terug.
// CI heeft geen Playwright: de broncontrole draait altijd, de browserstap alleen waar Playwright staat.
// `npm run test:oefwegongedaan`
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
assert.match(html, /function oefWeg\(n,kb\)\{[\s\S]{0,2400}Ongedaan maken[\s\S]{0,1800}chosen\.splice\(Math\.min\(n,chosen\.length\),0,weg\)/,
  "× geeft een melding met Ongedaan maken die de oefening op dezelfde plek terugzet");
assert.match(html, /if\(chosen!==lijst\|\|chosen\.indexOf\(weg\)>=0\)return;/, "niet terugzetten op een andere kaart");
assert.doesNotMatch(html, /chosen\.splice\((n|rn),1\);render\(\)/, "elke × loopt via oefWeg");
assert.match(html, /if\(tik&&TOEGEVOEGD\.id===id&&Date\.now\(\)-TOEGEVOEGD\.t<800\)return;\s*for\(var hi=0;hi<chosen\.length;hi\+\+\)\{if\(chosen\[hi\]\.o===id\)\{if\(tik\)WEGGEHAALD=\{id:id,t:Date\.now\(\)\};oefWeg\(hi\);return;\}\}/,
  "bibliotheek: weghalen via oefWeg, dubbeltik op + telt één keer");
// sweep 2026-11-19 (Sanne, desktop): een dubbelklik op de − haalde de oefening weg en zette haar meteen achteraan terug
assert.match(html, /else if\(tik&&WEGGEHAALD\.id===id&&Date\.now\(\)-WEGGEHAALD\.t<800\)return;/, "dubbelklik op − haalt één keer weg");

let playwright = null;
try { playwright = createRequire(import.meta.url)("playwright"); } catch {
  try { playwright = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!playwright) { console.log("PASS oefwegongedaan (bron; geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

async function vrijePoort() { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefweg-"));
const port = await vrijePoort();
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "",
  EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" };
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: "ignore" });
const browser = await playwright.chromium.launch();
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const ctx = await browser.newContext({ ...playwright.devices["iPad (gen 7)"] });
  // het venster "Nieuw in Fysiplan" ving anders de tikken (sweep 2026-11-15 18u): de huidige versie als gezien markeren
  const rnVersie = (readFileSync(new URL("../public/release-notes.js", import.meta.url), "utf8").match(/version='([^']+)'/) || [])[1] || "";
  await ctx.addInitScript((v) => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_wn_gezien", "9"); localStorage.setItem("fysiplan_release_seen", v); } catch {} }, rnVersie);
  const page = await ctx.newPage();
  const fouten = []; page.on("pageerror", (e) => fouten.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/v2/app`);
  await page.waitForSelector("#list .row [data-add]", { timeout: 15000 });
  await page.keyboard.press("Escape");
  for (let i = 0; i < 3; i++) { await page.locator("#list .row [data-add]").nth(i).tap(); }
  await page.waitForFunction(() => document.querySelectorAll("#mon .pic .rm").length === 3);
  const namen = () => page.evaluate(() => [...document.querySelectorAll("#mon .pic .rm")].map((x) => x.getAttribute("aria-label")));
  const voor = await namen();
  // dosering bij de middelste oefening
  const cel = page.locator("#a4 input[data-k]").nth(3);
  const sleutel = await cel.getAttribute("data-k");
  await cel.fill("12");
  await cel.press("Tab");

  // tik op de × van de middelste oefening (zoals de per ongeluk-tik bovenin het plaatje)
  await page.locator("#mon [data-rm='1']").tap();
  assert.deepEqual(await namen(), [voor[0], voor[2]], "oefening 2 is van de kaart");
  await page.waitForSelector("#oefweg_bar", { state: "visible" });
  const naam = voor[1].replace(/^Verwijder | van de kaart$/g, "");
  assert.match(await page.textContent("#oefweg_tekst"), new RegExp(naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " is van de kaart gehaald"), "melding noemt de oefening");
  const maat = await page.$eval("#oefweg_terug", (b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, onder: r.bottom <= innerHeight, rechts: r.right <= innerWidth }; });
  assert.ok(maat.w >= 44 && maat.h >= 44, "knop minstens 44 px: " + JSON.stringify(maat));
  assert.ok(maat.onder && maat.rechts, "knop binnen beeld");
  await page.locator("#oefweg_terug").tap();
  assert.deepEqual(await namen(), voor, "oefening staat weer op dezelfde plek");
  assert.equal(await page.locator(`#a4 input[data-k="${sleutel}"]`).inputValue(), "12", "dosering komt mee terug");
  assert.equal(await page.isVisible("#oefweg_bar"), false, "melding weg na ongedaan maken");

  // tweede keer weghalen, dan de kaart leegmaken: Ongedaan maken zet niets terug op de nieuwe kaart
  await page.locator("#mon [data-rm='0']").tap();
  await page.waitForSelector("#oefweg_bar", { state: "visible" });
  // bibliotheek (Mark, sweep 2026-11-15 14u): een tik op een rij die al op de kaart staat haalt de oefening weg met
  // Ongedaan maken (terug op de eigen plek); een dubbeltik op + zet de oefening er wel op
  await page.locator("#oefweg_terug").tap();
  assert.deepEqual(await namen(), voor, "weer drie oefeningen");
  const rijId = await page.locator("#mon [data-rm='1']").evaluate(() => null);
  const midden = (await namen())[1];
  const knop = page.locator("#list .row [data-add].on").nth(1);
  const knopNaam = await knop.getAttribute("aria-label");
  await knop.tap();
  await page.waitForSelector("#oefweg_bar", { state: "visible" });
  assert.equal((await namen()).length, 2, "tik op een rij op de kaart haalt de oefening weg");
  await page.locator("#oefweg_terug").tap();
  assert.deepEqual(await namen(), voor, "Ongedaan maken zet hem op dezelfde plek terug, niet achteraan (" + knopNaam + ", " + midden + ")");
  const nieuw = page.locator("#list .row [data-add]:not(.on)").first();
  const nieuwId = await nieuw.getAttribute("data-add");
  await page.locator(`#list .row [data-add='${nieuwId}']`).dblclick();
  await page.waitForTimeout(200);
  assert.equal((await namen()).length, 4, "dubbeltik op + zet de oefening er één keer op");
  // dubbelklik op de − (muis, desktop): één keer weg, niet achteraan terug (sweep 2026-11-19, Sanne)
  const vierVoor = await namen();
  await page.waitForTimeout(900); // buiten de rem van 0,8 s na het toevoegen
  await page.locator(`#list .row [data-add='${nieuwId}']`).dblclick();
  await page.waitForTimeout(200);
  const naDbl = await namen();
  assert.equal(naDbl.length, 3, "dubbelklik op − haalt de oefening één keer weg: " + JSON.stringify(naDbl));
  assert.deepEqual(naDbl, vierVoor.slice(0, 3), "de andere oefeningen blijven op hun plek");
  await page.locator("#oefweg_terug").tap();
  assert.deepEqual(await namen(), vierVoor, "Ongedaan maken zet hem terug");
  void rijId;
  // "Wis alles" (zelfde functie als een nieuwe kaart beginnen) maakt een nieuwe lijst
  await page.locator("#mon [data-rm='0']").tap();
  await page.waitForSelector("#oefweg_bar", { state: "visible" });
  await page.evaluate(() => document.getElementById("wis_alles").click());
  await page.waitForFunction(() => document.querySelectorAll("#mon .pic .rm").length === 0, null, { timeout: 5000 });
  assert.ok(await page.isVisible("#oefweg_bar"), "melding staat nog");
  await page.locator("#oefweg_terug").tap();
  await page.waitForTimeout(200);
  assert.equal((await namen()).length, 0, "na leegmaken zet Ongedaan maken niets terug op de nieuwe kaart");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  await ctx.close();
  console.log("PASS oefwegongedaan (iPad: × → Ongedaan maken zet oefening en dosering terug)");
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
