// Regressietest gebruikers-sweep 2026-11-06 (Truus, iPhone SE; Jayden):
// 1. /k: "Te zwaar?" toonde meteen "Doorgegeven ✓", ook als het versturen mislukte
//    (offline, 429, 5xx). De therapeut kreeg niets en de patiënt kon niet opnieuw.
//    Nu pas "Doorgegeven" na een 2xx; anders "Niet verstuurd. Tik opnieuw".
// 2. Afspraak-.ics met taal=__proto__/constructor gaf "SUMMARY:undefined".
// CI heeft geen Playwright: de statische en serverdelen draaien altijd, de browser alleen
// waar Playwright staat. `npm run test:tezwaar`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
const blok = kaart.match(/var oz=e\.target\.closest\('\.oefzwaar'\);[\s\S]*?\n        return;\n      \}/);
assert.ok(blok, "te-zwaar-handler gevonden");
assert.doesNotMatch(blok[0], /\.catch\(function\(\)\{\}\)/, "een mislukte melding wordt niet stil ingeslikt");
assert.match(blok[0], /if\(!r\.ok\)throw/, "alleen een 2xx telt als doorgegeven");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tezwaar-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio zwaar": {
    "truus": { id: "a1b2c3d4e5f6", praktijk: "Fysio Zwaar", naam: "Truus", ts: Date.now(),
      chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }], rows: {}, cells: {}, vids: {},
      afspraak: { t: Date.now() + 86400000, herhaal: 2 } }
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
  // ---- 2. .ics met een prototype-sleutel als taal ----
  for (const [i, taal] of ["__proto__", "constructor", "toString"].entries()) {
    const r = await fetch(origin + "/api/kaart/afspraak.ics?id=a1b2c3d4e5f6&taal=" + taal, { headers: { "x-forwarded-for": "10.2.0." + (i + 1) } });
    const t = await r.text();
    assert.equal(r.status, 200, "ics taal=" + taal);
    assert.doesNotMatch(t, /undefined/, "geen 'undefined' in de .ics bij taal=" + taal + ":\n" + t);
    assert.match(t, /SUMMARY:Afspraak/, "valt terug op Nederlands bij taal=" + taal);
  }

  // ---- 1. te zwaar in de browser ----
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-kaart-tezwaar: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.2.1.1" } });
    const page = await ctx.newPage();
    let fout = 503;
    await page.route("**/api/kaart/oefzwaar", (route) => fout
      ? route.fulfill({ status: fout, contentType: "application/json", body: "{}" })
      : route.continue());
    await page.goto(origin + "/k/a1b2c3d4e5f6");
    // "Te zwaar?" staat bij de oefening zelf: eerst de oefening openen vanuit het overzicht
    const open = async () => { await page.click('#oefs .oef[data-oidx="0"] .oefinfo', { timeout: 15000 }); };
    await open();
    await page.waitForSelector("#oefs .oefzwaar[data-zidx='0']", { timeout: 15000 });
    const knop = "#oefs .oefzwaar[data-zidx='0']";
    await page.click(knop);
    await page.waitForFunction((s) => /Niet verstuurd/.test(document.querySelector(s).textContent), knop, { timeout: 5000 });
    assert.equal(await page.isDisabled(knop), false, "na een mislukte melding kan Truus opnieuw tikken");
    assert.equal(await page.evaluate(() => localStorage.getItem("fp_zwaar_a1b2c3d4e5f6")), null, "mislukt wordt niet als doorgegeven onthouden");
    // weer bereikbaar: opnieuw tikken lukt en komt aan bij de server
    fout = 0;
    await page.click(knop);
    await page.waitForFunction((s) => /Doorgegeven/.test(document.querySelector(s).textContent), knop, { timeout: 5000 });
    assert.equal(await page.isDisabled(knop), true);
    await page.reload();
    await open();
    await page.waitForSelector(knop);
    assert.match(await page.textContent(knop), /Doorgegeven/, "na herladen nog steeds doorgegeven");
    await ctx.close();
    const opgeslagen = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio zwaar"].truus;
    assert.ok(JSON.stringify(opgeslagen).includes("oefZwaar"), "de server heeft de melding: " + JSON.stringify(opgeslagen).slice(0, 300));
  }
  console.log("test-kaart-tezwaar: te zwaar pas doorgegeven na echte opslag; .ics zonder 'undefined'");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
