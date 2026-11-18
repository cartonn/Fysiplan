// Gebruikers-sweep 2026-11-14 18u (Jayden, Pixel 7): bleef het verzoek naar /api/kaart hangen (geen
// antwoord, geen fout), dan stond "Je kaart wordt geladen…" eindeloos zonder knop Opnieuw. Nu geeft
// laadKaartApi() na KAART_WACHT_MS op: de offline-kopie als die er is, anders het storingsscherm.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:kaarthangt`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /function laadKaartApi\(\)\{[\s\S]{0,400}new AbortController\(\)[\s\S]{0,200}KAART_WACHT_MS[\s\S]{0,400}caches\.match/,
  "laadKaartApi heeft een tijdgrens en valt terug op de offline-kopie");
assert.match(html, /if\(c\)\{UIT_KOPIE=true;return c;\}/, "kaart uit de offline-kopie zet UIT_KOPIE");
assert.match(html, /function tekenOfflijn\(\)\{[^\n]*UIT_KOPIE\|\|/, "offlinebalk ook bij een kaart uit de offline-kopie");
assert.match(html, /laadKaartApi\(\)\.then\(function\(r\)\{\s*return r\.json\(\)/, "de kaart laadt via laadKaartApi");
const ms = Number((html.match(/var KAART_WACHT_MS=(\d+);/) || [])[1]);
assert.ok(ms >= 5000 && ms <= 20000, "tijdgrens tussen 5 en 20 s: " + ms);

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-kaart-hangt: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaarthangt-"));
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
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Hangt";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "hangt-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  // zonder service worker, zodat de route het verzoek van de pagina zelf vasthoudt
  const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.3" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  await page.route("**/api/kaart?id=**", () => { /* nooit antwoorden: de verbinding hangt */ });
  const t0 = Date.now();
  await page.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#storing", { state: "visible", timeout: ms + 8000 });
  const duur = Date.now() - t0;
  assert.ok(duur >= ms - 1000, "niet te vroeg opgegeven: " + duur + " ms");
  assert.ok(await page.isVisible("#storing_knop"), "knop Opnieuw zichtbaar");
  assert.equal(await page.getAttribute("#storing", "data-soort"), "net", "storing: geen verbinding");
  assert.equal(await page.evaluate(() => document.documentElement.lang), "en", "melding in de taal van de kaart");
  // Opnieuw met een werkende verbinding laadt de kaart gewoon
  await page.unroute("**/api/kaart?id=**");
  await page.click("#storing_knop");
  await page.waitForSelector("#oefs .oefdone", { timeout: 15000 });
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-kaart-hangt: alles groen (" + duur + " ms)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
