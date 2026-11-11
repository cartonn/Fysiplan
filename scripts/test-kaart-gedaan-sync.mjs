// Regressietest gebruikers-sweep 2026-11-07 (Truus, iPhone SE + iPad):
// /k: "gedaan" per oefening stond alleen in de localStorage van één apparaat. Op de
// iPhone 6/6 afgevinkt (de server kreeg ze), de iPad toonde "0 van 6"; een tik op de
// iPad haalde daarna het vinkje van de telefoon weg. Nu geeft GET /api/kaart de
// serverdag (Amsterdam) mee en telt de kaart de vinkjes van vandaag uit oefTrouw mee.
// CI heeft geen Playwright: het server- en statische deel draait altijd, de browser
// alleen waar Playwright staat.
// Ook (Jayden, iPhone 14): na "Alles gedaan" haalde een bevestigende tik op "Ik heb vandaag
// geoefend" de dag weg (blinde aan/uit op de server), terwijl de kaart "alles gedaan" bleef
// tonen. Nu zet de kaart de dag expliciet (aan:true/false) en gaan de vinkjes mee uit. `npm run test:gedaansync`
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
const lees = kaart.match(/function leesOefDaan\(\)\{[\s\S]*?\n  \}/);
assert.ok(lees, "leesOefDaan gevonden");
assert.match(lees[0], /serverOefDaan\(/, "de kaart telt de vinkjes van de server (ander apparaat) mee");

const ID = "c0ffee123456";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gedaansync-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio sync": {
    "truus": { id: ID, praktijk: "Fysio Sync", naam: "Truus", ts: Date.now(),
      chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }, { n: "Kuitheffen", id: "", i: 2 }],
      rows: {}, cells: {}, vids: {} }
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
const vandaag = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  // ---- server: de kaart draagt de serverdag ----
  const r = await fetch(origin + "/api/kaart?id=" + ID, { headers: { "x-forwarded-for": "10.3.0.1" } });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.dag, vandaag, "GET /api/kaart geeft de dag (Amsterdam) mee");
  // aan:true is idempotent; aan:false haalt hem weg; zonder aan blijft het de oude toggle
  const zet = async (body, ip) => (await (await fetch(origin + "/api/kaart/gedaan", { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ id: ID, ...body }) })).json()).gedaan.length;
  assert.equal(await zet({ aan: true }, "10.3.0.2"), 1);
  assert.equal(await zet({ aan: true }, "10.3.0.3"), 1, "tweede bevestiging haalt de dag niet weg");
  assert.equal(await zet({ aan: false }, "10.3.0.4"), 0);
  assert.equal(await zet({ aan: false }, "10.3.0.5"), 0);
  assert.equal(await zet({}, "10.3.0.6"), 1, "oude toggle werkt nog");
  assert.equal(await zet({}, "10.3.0.7"), 0);

  // ---- browser: iPhone vinkt af, iPad ziet het ----
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-kaart-gedaan-sync: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const tel = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", timezoneId: "Europe/Amsterdam", extraHTTPHeaders: { "x-forwarded-for": "10.3.1.1" } });
    const tab = await browser.newContext({ ...pw.devices["iPad (gen 7)"], locale: "nl-NL", timezoneId: "Europe/Amsterdam", extraHTTPHeaders: { "x-forwarded-for": "10.3.1.2" } });
    const p1 = await tel.newPage();
    p1.on("dialog", (d) => d.accept()); // dag uitzetten vraagt eerst (test:daguitvraag)
    await p1.goto(origin + "/k/" + ID);
    await p1.waitForSelector("#oefs .oefdone[data-idx='2']", { state: "attached", timeout: 15000 });
    for (const i of [0, 2]) {
      const klaar = p1.waitForResponse((res) => res.url().endsWith("/api/kaart/oefening"));
      await p1.click(`#oefs .oefdone[data-idx='${i}']`);
      assert.equal((await klaar).status(), 200);
    }
    const p2 = await tab.newPage();
    p2.on("dialog", (d) => d.accept()); // dag uitzetten vraagt eerst (test:daguitvraag)
    await p2.goto(origin + "/k/" + ID);
    await p2.waitForSelector("#oefs .oefdone[data-idx='2']", { state: "attached", timeout: 15000 });
    const aan = (p) => p.$$eval("#oefs .oefdone", (bs) => bs.map((b) => b.getAttribute("aria-pressed")));
    assert.deepEqual(await aan(p2), ["true", "false", "true"], "de iPad ziet de vinkjes van de iPhone");
    assert.match(await p2.textContent("#ovtekst"), /2/, "voortgang telt 2 van 3");
    // iPad vinkt oefening 1 af: die van de telefoon blijven staan
    const klaar = p2.waitForResponse((res) => res.url().endsWith("/api/kaart/oefening"));
    await p2.click("#oefs .oefdone[data-idx='1']");
    await klaar;
    assert.deepEqual(await aan(p2), ["true", "true", "true"], "tik op de iPad haalt geen vinkje van de telefoon weg");
    // iPad vinkt 2 uit: na herladen blijft hij uit (geen spookvinkje via de serverkopie)
    const uitgevinkt = p2.waitForResponse((res) => res.url().endsWith("/api/kaart/oefening"));
    await p2.click("#oefs .oefdone[data-idx='2']");
    await uitgevinkt;
    assert.deepEqual(await aan(p2), ["true", "true", "false"], "uitvinken werkt meteen");
    await p2.reload();
    await p2.waitForSelector("#oefs .oefdone[data-idx='2']", { state: "attached" });
    assert.deepEqual(await aan(p2), ["true", "true", "false"], "na herladen klopt de stand");
    await wacht(300);
    const opgeslagen = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio sync"].truus.oefTrouw;
    assert.equal(opgeslagen.Squat.d, vandaag);
    assert.equal(opgeslagen.Brug.d, vandaag);
    assert.notEqual(opgeslagen.Kuitheffen.d, vandaag, "uitgevinkt op de server");
    // alles af → dag geregistreerd; een tik op "Ik heb vandaag geoefend" zet hem uit én de vinkjes mee
    // (de dag staat al aan: de iPad had eerder alle drie af)
    assert.equal(await p2.getAttribute("#gdaan", "aria-pressed"), "true", "alles af bevestigde de dag");
    await p2.click("#oefs .oefdone[data-idx='2']");
    await wacht(300);
    const dagUit = p2.waitForResponse((res) => res.url().endsWith("/api/kaart/gedaan"));
    await p2.click("#gdaan");
    assert.equal((await (await dagUit).json()).gedaan.length, 0);
    await p2.waitForFunction(() => [...document.querySelectorAll("#oefs .oefdone")].every((b) => b.getAttribute("aria-pressed") === "false"), null, { timeout: 5000 });
    await wacht(500);
    const naUit = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio sync"].truus;
    assert.equal(naUit.gedaan.length, 0, "geen oefendag op de server");
    assert.ok(Object.values(naUit.oefTrouw).every((r) => r.d !== vandaag), "vinkjes ook op de server uit");
    // weer aan via "Alles gedaan" en daarna nog eens tikken op een vinkje-knop: dag blijft
    await p2.click("#ovalles");
    await p2.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
    await p2.click("#oefs .oefdone[data-idx='1']");
    await p2.click("#oefs .oefdone[data-idx='0']");
    await wacht(500);
    await p2.click("#oefs .oefdone[data-idx='0']");
    await p2.click("#oefs .oefdone[data-idx='1']");
    await wacht(800);
    const terug = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio sync"].truus;
    assert.equal(terug.gedaan.length, 1, "opnieuw alles af haalt de dag niet weg (geen toggle)");
    await tel.close(); await tab.close();
  }
  console.log("test-kaart-gedaan-sync: gedaan-vinkjes gelijk op telefoon en tablet");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
