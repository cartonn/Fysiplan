// Gebruikers-sweep 2026-11-15 10u (Jayden, Pixel 7 + iPhone 14): zonder internet op "Add to my calendar"
// tikken, nadat het agenda-bestand eerder al eens was gedownload, opende de browserfoutpagina
// (chrome-error://). De werker van /k bewaarde ook /api/kaart/afspraak.ics en /api/kaart/agenda in de
// cache; de controle in naarAgenda() kreeg die kopie, daarna liep location.href zonder net vast. Ook kon
// na een gewijzigde afspraak een oud agenda-bestand uit de cache komen. Nu: agenda-routes gaan nooit
// door de cache, en zonder internet toont de kaart meteen de melding onder de knop.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:agendaoffline`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const sw = await readFile(join(root, "public/kaart-sw.js"), "utf8");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const fetchDeel = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
const agendaRegel = fetchDeel.search(/afspraak\\\.ics\|agenda\)\$\/\.test\(url\.pathname\)\) return;/);
assert.ok(agendaRegel > 0, "werker laat de agenda-routes met rust");
assert.ok(agendaRegel < fetchDeel.indexOf("e.respondWith("), "vóór respondWith, dus nooit uit de cache");
assert.match(html, /function naarAgenda\(url,knop,afspraak\)\{[\s\S]{0,900}navigator\.onLine===false\)\{vrij\(0\);m\.textContent=trag\('fout'\);return;\}/,
  "zonder internet meteen de melding");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-agenda-offline: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-agendaoffline-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.2." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Agenda Offline";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "agenda-offline-ww", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: Date.now() + 3 * 86400000 }, S)).status, 200, "afspraak gezet");

  const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.9.9.2" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  await page.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
  // wacht tot de werker de pagina beheert, dan opnieuw laden zodat alles door de werker gaat
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#afics", { state: "visible" });
  const icsUrl = await page.evaluate(() => document.getElementById("afics").href);

  // online één keer downloaden (zoals Jayden deed)
  const dl = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await page.click("#afics");
  await dl;
  await wacht(1700);
  // ook rechtstreeks via de werker ophalen: dit is het verzoek dat vroeger in de cache belandde
  assert.equal(await page.evaluate((u) => fetch(u).then((r) => r.status), icsUrl), 200, "online komt het agenda-bestand");

  // offline: de werker mag geen bewaarde kopie geven
  await ctx.setOffline(true);
  const offlineFetch = await page.evaluate((u) => fetch(u, { cache: "no-store" }).then((r) => "antwoord " + r.status, () => "geen net"), icsUrl);
  assert.equal(offlineFetch, "geen net", "offline geeft de werker geen oud agenda-bestand uit de cache");
  const cacheHeeftIcs = await page.evaluate(async () => {
    for (const n of await caches.keys()) {
      const c = await caches.open(n);
      for (const r of await c.keys()) if (/\/api\/kaart\/(afspraak\.ics|agenda)/.test(r.url)) return true;
    }
    return false;
  });
  assert.equal(cacheHeeftIcs, false, "geen agenda-bestand in de offline-cache");

  // offline tikken: melding onder de knop, de kaart blijft staan
  await page.click("#afics");
  await page.waitForFunction(() => (document.querySelector(".agmelding") || {}).textContent, null, { timeout: 3000 });
  assert.match(await page.textContent(".agmelding"), /did not work/i, "Engelse melding onder de knop");
  await wacht(500);
  assert.ok(page.url().startsWith(origin + "/k/"), "nog op de kaart, geen foutpagina: " + page.url());
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-agenda-offline: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
