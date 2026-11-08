// Gebruikers-sweep 2026-11-08 14u:
// 1. De landing /v2 printen of als PDF opslaan gaf lege secties en geen prijzen. De
//    scroll-animaties (opacity 0 tot een blok in beeld schuift) golden ook op papier.
//    Nu staan animaties uit in print.
// 2. Doel en Opmerking: de server bewaart 500 tekens, maar het veld had geen grens, dus een
//    lange tekst werd stil afgekapt. Nu stopt het veld (alleen v2) zelf bij 500.
// 4. Roepnaamvoorstel: "Marieke B. knie" werd "Marieke K." (eerste letter van het laatste
//    woord), "Kees 😀Jansen" een half emoji-teken en '@Marieke 🦵 B.; "x"' werd '@Marieke ".'.
// 3. /k: een lang woord zonder spaties (geplakte link) in Doel/Opmerking liep ver buiten de
//    kaart op een telefoon. Nu breekt de tekst af.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:landingprint`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/v2.html"), "utf8");
assert.match(html, /@media print\{\*,\*::before,\*::after\{animation:none!important/, "animaties uit in print");
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /\['c_doel','c_opm'\]\.forEach\(function\(k\)\{\s*var el=document\.getElementById\(k\);\s*if\(el\)el\.maxLength=500;/, "Doel en Opmerking max 500 in v2");
// 4. roepnaamvoorstel: de functies uit de app los uitvoeren
const fnBron = (naam) => { const m = appHtml.match(new RegExp("  function " + naam + "\\([\\s\\S]*?\\n  \\}\\n")); assert.ok(m, naam + " gevonden"); return m[0]; };
const iniBron = appHtml.match(/  var IS_INITIAAL=[^\n]*\n/);
assert.ok(iniBron, "IS_INITIAAL gevonden");
const { kaartLabelVan, naamLijktVolledig } = new Function(iniBron[0] + fnBron("kaartLabelVan") + fnBron("naamLijktVolledig") +
  "return { kaartLabelVan, naamLijktVolledig };")();
const verwacht = [
  ["Jan de Vries", "Jan V."], ["Vries, Jan de", "Jan V."], ["Marieke de Boer", "Marieke B."], ["Truus", "Truus"],
  ["Marieke B. knie", "Marieke B."], ["Jan K. schouder links", "Jan K."], ["Marieke B. (rug)", "Marieke B."],
  ["Kees 😀Jansen", "Kees J."], ['@Marieke 🦵 B.; "x"', "Marieke B."], ["Özlem Çelik", "Özlem Ç."]
];
for (const [in_, uit_] of verwacht) assert.equal(kaartLabelVan(in_), uit_, "roepnaam van " + in_);
assert.equal(naamLijktVolledig("Jan K. schouder links"), false, "roepnaam met toevoeging is geen volledige naam");
assert.equal(naamLijktVolledig("Marieke de Boer"), true, "volledige naam herkend");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /\.client \.rij span\{min-width:0;overflow-wrap:anywhere\}/, "/k: lange woorden breken af");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test:landingprint: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-landingprint-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(origin + "/v2", { waitUntil: "load" });
  await page.emulateMedia({ media: "print" });
  const verborgen = await page.evaluate(() => {
    const sel = ".sectie h2,.sectie .etiket,.stap,.cel,.fx,.stat,.belofte,.prijs,.oefkaartje,.foto,.stat-foto,.antw";
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.getClientRects().length && Number(getComputedStyle(el).opacity) < 0.99)
      .map((el) => el.className + ": " + (el.textContent || "").trim().slice(0, 40));
  });
  assert.ok((await page.$$(".prijs")).length > 0, "landing heeft prijsblokken");
  assert.deepEqual(verborgen, [], "in print is elk blok zichtbaar");
  const pdf = await page.pdf({ format: "A4" });
  assert.ok(pdf.length > 10000, "PDF gemaakt");
  await page.close();

  // 2. Doel/Opmerking in de v2-app: grens van 500 tekens in het veld
  const app2 = await browser.newPage({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.9.8.2" } });
  await app2.goto(origin + "/v2/app", { waitUntil: "load" });
  const grenzen = await app2.evaluate(() => ["c_doel", "c_opm"].map((k) => document.getElementById(k).maxLength));
  assert.deepEqual(grenzen, [500, 500], "veldgrens 500 in de v2-app");
  await app2.fill("#c_doel", "a".repeat(10000));
  assert.equal((await app2.inputValue("#c_doel")).length, 500, "plakken van 10.000 tekens stopt bij 500");
  await app2.close();

  // 3. /k op een telefoon: lang woord zonder spaties blijft binnen de breedte
  const kop = { "content-type": "application/json", "x-forwarded-for": "10.9.8.3" };
  const claim = await (await fetch(origin + "/api/praktijk/claim", { method: "POST", headers: kop,
    body: JSON.stringify({ praktijk: "Fysio Langetekst", wachtwoord: "langetekst-wachtwoord", akkoord: true }) })).json();
  assert.ok(claim.sessie, "praktijk beveiligd");
  const link = "https://voorbeeld.nl/" + "x".repeat(400);
  const kaart = await (await fetch(origin + "/api/kaarten", { method: "POST", headers: { ...kop, "x-praktijk-sessie": claim.sessie },
    body: JSON.stringify({ praktijk: "Fysio Langetekst", naam: "Truus", client: { c_naam: "Truus", c_doel: link, c_opm: link },
      chosen: [{ n: "Squat", i: 0 }], kaartId: "" }) })).json();
  assert.ok(kaart.id, "kaart gedeeld");
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.9.8.4" } });
  const k = await ctx.newPage();
  await k.goto(origin + "/k/" + kaart.id, { waitUntil: "load" });
  await k.waitForSelector(".client .rij");
  const breedte = await k.evaluate(() => ({ w: window.innerWidth,
    sw: Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll(".client .rij span")].map((e) => Math.ceil(e.getBoundingClientRect().right))) }));
  assert.ok(breedte.sw <= breedte.w + 1, "/k: Doel en Opmerking blijven binnen het scherm (" + breedte.sw + " op " + breedte.w + ")");
  await ctx.close();
  console.log("test:landingprint: ok (print alle blokken zichtbaar, PDF " + Math.round(pdf.length / 1024) + " kB; veldgrens 500; /k " + breedte.sw + " op " + breedte.w + " px)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
}
