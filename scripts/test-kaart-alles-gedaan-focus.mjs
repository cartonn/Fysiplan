// Gebruikers-sweep 2026-11-13 18u (Truus, iPhone SE, 100 % en 200 %, schermlezer):
// na "Alles gedaan" verdween de knop, viel de focus op de pagina en stond de bevestiging
// ("Alle oefeningen vandaag gedaan") buiten beeld en niet in een live-regio: Truus zag en
// hoorde niets. En de afvinkknoppen heetten allemaal alleen "Gedaan".
// Nu: bevestiging is een statusregio, krijgt de focus en komt in beeld; elke afvinkknop
// noemt de oefening. Broncontrole altijd (CI), browserdeel waar Playwright staat.
// `npm run test:allesgedaan`
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
assert.match(kaart, /id="ovtekst" role="status"/, "bevestiging is een statusregio");
const alles = kaart.match(/function doeAllesDaan\(\)\{[\s\S]*?\n  \}/);
assert.ok(alles, "doeAllesDaan gevonden");
assert.match(alles[0], /ovtekst[\s\S]*\.focus\(/, "Alles gedaan zet de focus op de bevestiging");
assert.match(kaart, /setAttribute\('aria-label',nm\.textContent\+': '\+trg\('oefdaan'\)\)/, "afvinkknop noemt de oefening");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("alles gedaan focus: ok"); process.exit(0); }

const ID = "a11e5d0e1234";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-allesgedaan-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio alles": {
    "truus": { id: ID, praktijk: "Fysio Alles", naam: "Truus", ts: Date.now(),
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
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", timezoneId: "Europe/Amsterdam", extraHTTPHeaders: { "x-forwarded-for": "10.4.1.1" } });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(origin + "/k/" + ID);
  await p.waitForSelector("#oefs .oefdone[data-idx='2']", { state: "attached", timeout: 15000 });
  const labels = await p.$$eval("#oefs .oefdone", (bs) => bs.map((b) => b.getAttribute("aria-label")));
  assert.deepEqual(labels.map((l) => /: /.test(l || "")), [true, true, true], "elke afvinkknop heeft een naam: " + JSON.stringify(labels));
  assert.equal(new Set(labels).size, 3, "de namen verschillen per oefening");
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.locator("#ovalles").scrollIntoViewIfNeeded();
  await p.locator("#ovalles").click();
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === "ovtekst", null, { timeout: 5000 });
  const st = await p.evaluate(() => {
    const t = document.getElementById("ovtekst"), r = t.getBoundingClientRect();
    return { tekst: t.textContent, rol: t.getAttribute("role"), inBeeld: r.top >= 0 && r.bottom <= innerHeight, knop: getComputedStyle(document.getElementById("ovalles")).display };
  });
  assert.equal(st.rol, "status");
  assert.ok(st.inBeeld, "bevestiging staat in beeld");
  assert.equal(st.knop, "none", "knop Alles gedaan is weg");
  assert.match(st.tekst, /gedaan/i, "bevestiging zegt dat alles gedaan is: " + st.tekst);
  console.log("alles gedaan focus: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
