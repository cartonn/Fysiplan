// Gebruikers-sweep 2026-11-12 10u (Mark, iPad + desktop): twee apparaten hebben dezelfde kaart open.
// De desktop bewaart een wijziging; daarna neemt de iPad via /o een eigen video op. De autosave van
// de iPad kreeg 409 "verouderd" en de enige melding was een hint van 8,5 px in het QR-vak. Koos
// de therapeut "Open de nieuwste versie", dan was de nieuwe video stil weg (niet op /k).
// Nu: een duidelijke melding, en "Open de nieuwste versie" neemt de nog niet bewaarde opname mee
// en bewaart hem op de nieuwste versie, zonder de wijziging van de desktop te overschrijven.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:opnameverouderd`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /function zetOpnameVideo\(naam,pad\)\{var k=normEx\(naam\);VIDS\[k\]=pad;OPNAME_NIEUW\[k\]=pad;/, "opname wordt als nog niet bewaard onthouden");
assert.match(index, /startOpname\('kaart',naam,function\(pad\)\{zetOpnameVideo\(naam,pad\);\}\)/, "opname-callback gebruikt zetOpnameVideo");
assert.match(index, /if\(d\.verouderd\)\{\s*if\(Object\.keys\(OPNAME_NIEUW\)\.length\)\{/, "duidelijke melding bij verouderd met een nieuwe video");
assert.match(index, /if\(mee\)\{deelNu\(\);return;\}/, "nieuwste versie bewaart de meegenomen video");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("opname verouderd: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opnameverouderd-"));
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
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.41." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Opname Versie";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "opname-versie-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  // /api/kaart geeft een eigen video als tijdelijke link (pad?k=&e=&s=); hier telt alleen het bewaarde pad
  const zonderLink = (v) => Object.fromEntries(Object.entries(v || {}).map(([a, b]) => [a, String(b).split("?")[0]]));
  const serverKaart = async () => { const j = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json(); if (j && j.kaart && j.kaart.vids) j.kaart.vids = zonderLink(j.kaart.vids); return j; };

  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.41.200" } });
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

  // het andere apparaat (desktop) bewaart intussen een wijziging
  const r2 = await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk", c_doel: "Traplopen zonder pijn" }, chosen, kaartId: id, basisTs: basis }, S);
  assert.equal(r2.status, 200, "desktop bewaart");

  // deze editor neemt een eigen video op via de telefoon (/o)
  await page.click("[data-evid]");
  const startP = page.waitForResponse((r) => r.url().includes("/api/opname/start"));
  await page.click("#ev_opname");
  const { token } = await (await startP).json();
  assert.ok(token, "opname gestart");
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const up = await fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.7.41.150" }, body: video });
  assert.equal(up.status, 200, "telefoon verstuurt");
  const pad = (await up.json()).video;
  for (let i = 0; i < 200 && !/video gaat mee/.test(await page.textContent("#qrBlok")); i++) await wacht(50);
  assert.match(await page.textContent("#qrBlok"), /nieuwe video is nog niet bewaard/, "melding in het QR-vak noemt de video");
  assert.ok(meldingen.some((m) => /nog niet op de kaart bewaard/.test(m)), "duidelijke melding (venster): " + JSON.stringify(meldingen));
  assert.equal(Object.keys((await serverKaart()).kaart?.vids || {}).length, 0, "nog niet op de server");

  // een volgende autosave: niet nog een venster
  const n = meldingen.length;
  await page.evaluate(() => { const b = document.querySelector("[data-add]"); if (b) b.click(); });
  await wacht(3000);
  assert.equal(meldingen.length, n, "het venster komt één keer: " + JSON.stringify(meldingen));

  // Open de nieuwste versie: video gaat mee en de wijziging van de desktop blijft
  await page.click("[data-qract='nieuwste']");
  let k = null;
  for (let i = 0; i < 120; i++) { k = (await serverKaart()).kaart || {}; if (Object.values(k.vids || {}).includes(pad)) break; await wacht(50); }
  assert.ok(Object.values(k.vids || {}).includes(pad), "video staat na 'Open de nieuwste versie' op de kaart: " + JSON.stringify(k.vids));
  assert.equal(k.client && k.client.c_doel, "Traplopen zonder pijn", "wijziging van het andere apparaat blijft staan");
  for (let i = 0; i < 100 && /nog niet bewaard/.test(await page.textContent("#qrBlok")); i++) await wacht(50);
  assert.doesNotMatch(await page.textContent("#qrBlok"), /nog niet bewaard/, "melding weg na bewaren");
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("opname verouderd: ok (melding, video gaat mee naar de nieuwste versie, wijziging elders blijft)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
