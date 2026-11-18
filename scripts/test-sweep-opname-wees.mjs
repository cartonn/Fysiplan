// Gebruikers-sweep 2026-11-18 22u (Mark, iPad): dezelfde kaart open op twee apparaten. Het andere apparaat haalt de oefening
// weg; daarna neemt deze editor via /o een eigen video op bij juist die oefening. "Open de nieuwste versie (video gaat mee)"
// liet de video stil verdwijnen (bestand als wees op de server). Nu zegt de app het in de conflictbalk en kan Mark de
// oefening met de video terugzetten. Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:opnamewees`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /OPNAME_WEES\.push\(\{k:k,o:oid,naam:oid\?OEF\[oid\]\.naam:k,pad:OPNAME_NIEUW\[k\]\}\);/, "video bij weggehaalde oefening wordt onthouden");
assert.match(index, /if\(OPNAME_WEES\.length\)\{toonOpnameWees\(\);return;\}/, "en gemeld");
assert.match(index, /gaan de wijzigingen van dat apparaat verloren/, "Toch mijn versie bewaren waarschuwt");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("opname wees: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opnamewees-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.44." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Opname Wees";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "opname-wees-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }, { n: "Anteflexie armen", id: "", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  // /api/kaart geeft een eigen video als tijdelijke link (pad?k=&e=&s=); hier telt alleen het bewaarde pad
  const zonderLink = (v) => Object.fromEntries(Object.entries(v || {}).map(([a, b]) => [a, String(b).split("?")[0]]));
  const serverKaart = async () => { const j = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json(); if (j && j.kaart && j.kaart.vids) j.kaart.vids = zonderLink(j.kaart.vids); return j; };

  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.44.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], meldingen = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await wacht(1500);
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  const basis = (await serverKaart()).kaart.ts;
  assert.ok(basis, "versie van de kaart bekend");

  // het andere apparaat haalt Bruggen beginner weg en bewaart
  const r2 = await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk", c_doel: "Traplopen zonder pijn" }, chosen: [chosen[1]], kaartId: id, basisTs: basis }, S);
  assert.equal(r2.status, 200, "ander apparaat bewaart");

  // deze editor neemt een eigen video op bij Bruggen beginner (eerste oefening)
  await page.click("[data-evid]");
  const startP = page.waitForResponse((r) => r.url().includes("/api/opname/start"));
  await page.click("#ev_opname");
  const { token } = await (await startP).json();
  assert.ok(token, "opname gestart");
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const up = await fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.7.44.150" }, body: video });
  assert.equal(up.status, 200, "telefoon verstuurt");
  const pad = (await up.json()).video;
  await page.waitForSelector("#conflict_bar", { state: "visible", timeout: 15000 });
  assert.match(await page.textContent("#conflict_bar"), /wijzigingen van dat apparaat verloren/, "waarschuwing bij Toch mijn versie bewaren");

  // Open de nieuwste versie: de oefening is weg, dus de video kan niet mee. Dat moet er staan.
  await page.click("#conflict_bar [data-cfact='nieuwste']");
  for (let i = 0; i < 160 && !/van de kaart gehaald/.test(await page.evaluate(() => { const b = document.getElementById("conflict_bar"); return b && b.style.display !== "none" ? b.textContent : ""; })); i++) await wacht(50);
  const balk = await page.evaluate(() => { const b = document.getElementById("conflict_bar"); return b && b.style.display !== "none" ? b.textContent : ""; });
  assert.match(balk, /Bruggen beginner/, "balk noemt de oefening: " + balk);
  assert.match(balk, /van de kaart gehaald/, "balk zegt wat er is gebeurd");
  let k = (await serverKaart()).kaart || {};
  assert.equal(k.client && k.client.c_doel, "Traplopen zonder pijn", "nieuwste versie geladen, wijziging elders blijft");

  // terugzetten: oefening en video komen op de kaart, de andere wijziging blijft
  await page.click("#conflict_bar [data-cfact='opnameterug']");
  for (let i = 0; i < 160; i++) { k = (await serverKaart()).kaart || {}; if (Object.values(k.vids || {}).includes(pad)) break; await wacht(50); }
  assert.ok(Object.values(k.vids || {}).includes(pad), "video op de kaart: " + JSON.stringify(k.vids));
  assert.ok((k.chosen || []).some((c) => /Bruggen beginner/.test(c.n || "")), "oefening terug: " + JSON.stringify(k.chosen));
  assert.equal(k.client && k.client.c_doel, "Traplopen zonder pijn", "wijziging van het andere apparaat blijft staan");
  assert.deepEqual(meldingen, [], "geen venster (alert)");
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("opname wees: ok (video bij een elders weggehaalde oefening wordt gemeld en kan terug)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
