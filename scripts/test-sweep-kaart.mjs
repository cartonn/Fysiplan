// Regressietest voor vondsten van de gebruikers-sweep (2026-11-06):
// 1. CSV-export van het kaartenoverzicht: geen formule-injectie (Excel/LibreOffice).
// 2. Afspraak-.ics: tijd mét tijdzone, zodat een telefoon in een andere tijdzone
//    de afspraak niet een uur verschoven in de agenda zet.
// 3. Cliëntkaart /k: druk (429) of een serverfout zegt nooit "bestaat niet (meer)";
//    alleen een echte 404 doet dat.
// `npm run test:sweep`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. CSV-cel ----
const index = await readFile(join(root, "public/index.html"), "utf8");
const m = index.match(/function csvCel\(v\)\{[^\n]*\}/);
assert.ok(m, "csvCel staat in public/index.html");
const csvCel = new Function(m[0] + "; return csvCel;")();
for (const gevaar of ["=1+1", "+31 HYPERLINK", "-2+3", "@SUM(1;1)", "\t=1", "\r=1"]) {
  const cel = csvCel(gevaar);
  assert.ok(cel.startsWith("\"'"), `formule geneutraliseerd: ${JSON.stringify(gevaar)} → ${cel}`);
}
assert.equal(csvCel('Jan "J" K.'), '"Jan ""J"" K."');
assert.equal(csvCel(7), '"7"');
assert.equal(csvCel(null), '""');
assert.ok(/var veld=csvCel;/.test(index), "de CSV-export gebruikt csvCel");

// ---- server met een eigen datamap ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sweep-"));
const nu = Date.now();
// afspraak: dinsdag 10 november 2026, 14:00 Nederlandse tijd = 13:00 UTC
const afspraakT = Date.UTC(2026, 10, 10, 13, 0);
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio sweep": {
    "jayden": { id: "abcdefabcdef", praktijk: "Fysio Sweep", naam: "Jayden", ts: nu, chosen: [{ n: "Squat", id: "", i: 0 }],
      rows: {}, cells: {}, vids: {}, afspraak: { t: afspraakT, herhaal: 4 } }
  }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // ---- 2. .ics met tijdzone ----
  const ics = await (await fetch(origin + "/api/kaart/afspraak.ics?id=abcdefabcdef&taal=en", { headers: { "x-forwarded-for": "10.1.0.1" } })).text();
  assert.match(ics, /^DTSTART;TZID=Europe\/Amsterdam:20261110T140000\r$/m, "DTSTART met TZID:\n" + ics);
  assert.doesNotMatch(ics, /^DTSTART:2026/m, "geen zwevende tijd meer");
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Amsterdam/);
  assert.match(ics, /TZOFFSETTO:\+0100/);
  assert.match(ics, /TZOFFSETTO:\+0200/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;COUNT=4/);
  assert.match(ics, /SUMMARY:Physiotherapy appointment/);

  // ---- 3. /k bij 429, 500 en 404 ----
  // zonder browser (CI heeft geen Playwright): de kaart onderscheidt 404 van de rest
  const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
  assert.match(kaartHtml, /id="storing"[^>]*role="alert"/, "storingsblok staat op de kaart");
  assert.match(kaartHtml, /if\(res\[0\]&&res\[0\]\.status===404\)document\.getElementById\('fout'\)\.style\.display='block';else toonStoring\(\);/,
    "alleen een 404 toont 'bestaat niet (meer)'");
  assert.match(kaartHtml, /\}\)\.catch\(function\(\)\{toonStoring\(\);\}\);\n  \}\n\}\)\(\);/, "geen verbinding: storing");
  assert.equal((await fetch(origin + "/api/kaart?id=000000000000", { headers: { "x-forwarded-for": "10.1.0.2" } })).status, 404,
    "de server geeft voor een onbekende kaart echt 404");
  // met browser (lokaal, of waar Playwright wel staat): het echte scherm op een iPhone SE
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-sweep-kaart: geen Playwright, schermcheck van /k overgeslagen (de statische controle hierboven draaide wel)"); }
  if (pw) {
  const { chromium, devices } = pw;
  browser = await chromium.launch();
  const toestand = async (status) => {
    const ctx = await browser.newContext({ ...devices["iPhone SE"], serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.route("**/api/kaart?id=*", (route) => route.fulfill({ status, contentType: "application/json",
      body: JSON.stringify({ ok: false, fout: status === 404 ? "Kaart niet gevonden." : "Even te veel verzoeken achter elkaar." }) }));
    await page.goto(origin + "/k/abcdefabcdef");
    await page.waitForFunction(() => getComputedStyle(document.getElementById("fout")).display !== "none"
      || getComputedStyle(document.getElementById("storing")).display !== "none", null, { timeout: 15000 });
    const r = await page.evaluate(() => ({
      fout: getComputedStyle(document.getElementById("fout")).display !== "none",
      storing: getComputedStyle(document.getElementById("storing")).display !== "none",
      knopHoogte: document.getElementById("storing_knop").getBoundingClientRect().height
    }));
    await ctx.close();
    return r;
  };
  const druk = await toestand(429);
  assert.deepEqual([druk.fout, druk.storing], [false, true], "429: storing, niet 'bestaat niet'");
  assert.ok(druk.knopHoogte >= 44, "knop Opnieuw proberen minstens 44 px");
  const kapot = await toestand(500);
  assert.deepEqual([kapot.fout, kapot.storing], [false, true], "500: storing, niet 'bestaat niet'");
  const weg = await toestand(404);
  assert.deepEqual([weg.fout, weg.storing], [true, false], "404: kaart bestaat niet (meer)");

  // en de echte kaart laadt gewoon
  const ctx = await browser.newContext({ ...devices["iPhone SE"], serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(origin + "/k/abcdefabcdef");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
  await ctx.close();
  }

  // service worker: bij 429/5xx de laatst geladen versie uit de cache
  const sw = await readFile(join(root, "public/kaart-sw.js"), "utf8");
  assert.match(sw, /status === 429 \|\| antwoord\.status >= 500/);
  console.log("test-sweep-kaart: CSV, .ics-tijdzone en /k-storing in orde");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
