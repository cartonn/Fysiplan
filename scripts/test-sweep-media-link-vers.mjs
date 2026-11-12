// Gebruikers-sweep 2026-11-12 22u (Truus, iPhone SE): eigen video's en foto's van de praktijk komen sinds
// #249 via een tijdelijke link (12 tot 24 uur geldig). Een kaart die langer openstond (tabblad, app op het
// beginscherm) hield de oude link: de video meldde "neem contact op met je praktijk", "Opnieuw proberen"
// probeerde dezelfde verlopen link en de foto werd een kapot plaatje. Nu haalt de kaart nieuwe links op bij
// een fout van zo'n video of foto en bij terugkomen na tien uur, en tekent opnieuw als ze veranderden.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:medialinkvers`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /function verversLinks\(\)\{/, "hulpfunctie om de links te verversen");
assert.match(k, /function dagWissel\(\)\{try\{if\(K&&Date\.now\(\)-LINKS_T>LINKS_OUD\)verversLinks\(\);/, "na lang openstaan bij terugkomen");
assert.match(k, /v\.addEventListener\('error',function\(\)\{[^\n]*verversLinks\(\);\}\);/, "bij een videofout");
assert.match(k, /tagName==='IMG'&&[^\n]*uploads[^\n]*oef-[^\n]*verversLinks\(\)/, "bij een fotofout");
assert.match(k, /if\(Date\.now\(\)-linksLaatst<60000\)return;/, "hooguit één keer per minuut");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("media link vers: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-medialink-vers-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
const gestopt = new Promise((r) => app.on("exit", r));
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.11." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// een echte (kleine) PNG, zodat de foto met een goede link ook echt laadt
const png = "data:image/png;base64," + (await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 24, g: 52, b: 59 } } }).png().toBuffer()).toString("base64");
const P = "Fysio Link Vers";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "link-vers-wachtwoord", akkoord: true })).json()).sessie };
  let r = await post("/api/praktijk/oefeningen", { praktijk: P, naam: "Eigen opstaan", uitleg: "Rustig opstaan uit de stoel.", img: png }, S);
  assert.equal(r.status, 200, "eigen oefening: " + uit.slice(-300));
  const lijst = await (await get("/api/praktijk/oefeningen?praktijk=" + encodeURIComponent(P), S)).json();
  const oef = (Array.isArray(lijst) ? lijst : lijst.oefeningen || []).find((o) => o.naam === "Eigen opstaan");
  assert.ok(oef && oef.id, "testopzet: eigen oefening met id");
  r = await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, kaartId: "",
    chosen: [{ n: "Eigen opstaan", id: oef.id, i: 0 }, { n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }] }, S);
  assert.equal(r.status, 200);
  const id = (await r.json()).id;

  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.11.200" } });
  const p = await ctx.newPage();
  const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
  let kaartVerzoeken = 0;
  // het eerste antwoord draagt een verlopen link (zoals na een dag openstaan), daarna de echte
  await p.route(/\/api\/kaart\?id=/, async (route) => {
    kaartVerzoeken++;
    const resp = await route.fetch();
    const d = await resp.json();
    if (kaartVerzoeken === 1 && d.kaart && d.kaart.eigenOef) {
      d.kaart.eigenOef = d.kaart.eigenOef.map((e) => ({ ...e, img: String(e.img).replace(/e=\d{13}/, "e=1000000000000") }));
    }
    return route.fulfill({ response: resp, json: d });
  });
  await p.goto(origin + "/k/" + id);
  await p.waitForSelector('img[src*="/uploads/oef-"]', { state: "attached", timeout: 15000 });
  let src = "";
  for (let i = 0; i < 100; i++) {
    src = await p.$eval('img[src*="/uploads/oef-"]', (im) => im.getAttribute("src"));
    if (kaartVerzoeken >= 2 && !/e=1000000000000/.test(src)) break;
    await wacht(100);
  }
  assert.ok(kaartVerzoeken >= 2, "na de kapotte foto haalt de kaart nieuwe links op (" + kaartVerzoeken + ")");
  assert.doesNotMatch(src, /e=1000000000000/, "de foto staat nu op de nieuwe link");
  await wacht(500);
  const geladen = await p.$eval('img[src*="/uploads/oef-"]', (im) => im.complete && im.naturalWidth > 0);
  assert.ok(geladen, "en laadt");
  assert.ok(kaartVerzoeken <= 3, "geen lus van verzoeken (" + kaartVerzoeken + ")");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("media link vers: ok (verlopen foto-link ververst, één keer)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await gestopt;
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
}
