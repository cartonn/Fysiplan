// Gebruikers-sweep 2026-11-18 18u (Truus, iPhone SE, 200 % tekst): tikte ze zonder internet een seintje of
// pijnscore, dan stond bij de knop "Opgeslagen op je telefoon". Kwam het daarna niet aan (kaart in de prullenbak),
// dan verdween die regel stil en stond "Niet aangekomen" alleen bovenaan, 7 tot 11 schermen hoger; kwam het wel aan,
// dan verdween de regel ook en stond "Verstuurd ✓" alleen bovenaan. Nu staat de uitkomst ook op de plek van de tik.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:wachtplek`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /function wachtSlotten\(tekst,soort\)/, "hulpfunctie voor de meldingsvakken bij de tik");
assert.match(k, /if\(!n&&klaar\)wachtSlotten\(trw\('ok'\),''\);/, "verstuurd: ook bij de tik");
assert.match(k, /wachtSlotten\(trw\('kwijt'\),'fout'\);/, "niet aangekomen: ook bij de tik");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("wacht plek: ok (bron)"); process.exit(0); }

const ID = "0e5a0e5a9876";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wachtplek-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio wachtplek": { truus: { id: ID, praktijk: "Fysio Wachtplek", naam: "Truus",
  ts: Date.now(), chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }], rows: {}, cells: {}, vids: {} } } }));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], deviceScaleFactor: 1, locale: "nl-NL", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.6.18.1" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  let modus = "offline";
  await page.route("**/api/kaart/seintje", (r) => modus === "offline" ? r.abort("internetdisconnected")
    : modus === "404" ? r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, fout: "Kaart niet gevonden." }) })
    : r.continue());
  await page.goto(origin + "/k/" + ID);
  await page.waitForSelector('#sknoppen .sbtn[data-soort="vraag"]', { timeout: 15000 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const tik = async () => {
    await page.evaluate(() => document.querySelector('#sknoppen .sbtn[data-soort="vraag"]').click());
    await page.waitForFunction(() => document.getElementById("sdank").classList.contains("wacht"), null, { timeout: 4000 });
  };

  // 1. kaart is intussen gestopt (404): "niet aangekomen" staat bij de tik, niet alleen bovenaan
  await tik();
  modus = "404";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => document.getElementById("wachtrij").classList.contains("fout"), null, { timeout: 4000 });
  const a = await page.evaluate(() => { const d = document.getElementById("sdank");
    return { t: d.textContent, zicht: d.style.display, fout: d.classList.contains("fout"), wacht: d.classList.contains("wacht") }; });
  assert.match(a.t, /Niet aangekomen/, "bij de tik: niet aangekomen: " + a.t);
  assert.equal(a.zicht, "block");
  assert.equal(a.fout, true, "in de foutopmaak");
  assert.equal(a.wacht, false);

  // 2. weer offline getikt, daarna komt het wel aan: "verstuurd ✓" bij de tik
  await page.evaluate(() => { localStorage.clear(); });
  modus = "offline";
  await page.evaluate(() => document.querySelector('#sknoppen .sbtn[data-soort="goed"]').click());
  await page.waitForFunction(() => document.getElementById("sdank").classList.contains("wacht"), null, { timeout: 4000 });
  modus = "ok";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => document.getElementById("wachtrij").classList.contains("klaar"), null, { timeout: 4000 });
  const b = await page.evaluate(() => { const d = document.getElementById("sdank");
    return { t: d.textContent, zicht: d.style.display, fout: d.classList.contains("fout"), wacht: d.classList.contains("wacht") }; });
  assert.match(b.t, /Verstuurd naar je fysiotherapeut ✓/, "bij de tik: verstuurd: " + b.t);
  assert.equal(b.zicht, "block");
  assert.equal(b.fout, false);
  assert.equal(b.wacht, false);
  assert.deepEqual(fouten, []);
  await ctx.close();
  console.log("wacht plek: ok (uitkomst van de wachtrij staat bij de tik)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
