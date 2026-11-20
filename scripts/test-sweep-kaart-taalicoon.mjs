// Gebruikers-sweep 2026-11-20 14u (Jayden, Pixel 7 en iPhone 14):
// 1) Koos de patiënt bij ?taal=en Nederlands en later op /k/<id> (beginschermicoon) weer English, dan
//    opende ?taal=en uit de agenda toch Nederlands: de oude keus bij de taallink bleef staan.
// 2) Het beginschermicoon opende in de taal van de laatst geopende link (van welke kaart dan ook) en
//    heette "Trainingskaart". Nu draagt het manifest de taal van nu: Engelse naam, lang en start_url.
// Manifest-deel zonder browser (CI); met Playwright ook de taalkeuze in een telefoon.
// `npm run test:taalicoon`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /function manifestPad\(\)\{return '\/api\/kaart\/manifest\?id='\+id\+'&taal='/, "manifest met taal");
assert.match(kaart, /if\(!isTaal\(q\)\)\{var kz=taalKeus\(\);if\(kz&&isTaal\(kz\.link\)\)q=kz\.link;\}/, "keus zonder ?taal= werkt de taallink bij");

const ID = "0e5a0e5a7ead";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-taalicoon-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio taal": { jayden: { id: ID, praktijk: "Fysio Taal", naam: "Jayden",
  ts: Date.now(), taal: "en", client: { c_naam: "Jayden" }, chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} } } }));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const hdr = { "x-forwarded-for": "10.6.9.3" };
  const en = await (await fetch(origin + "/api/kaart/manifest?id=" + ID + "&taal=en", { headers: hdr })).json();
  assert.equal(en.start_url, "/k/" + ID + "?taal=en", "start_url met de taal");
  assert.equal(en.short_name, "Training card");
  assert.equal(en.name, "Training card Jayden");
  assert.equal(en.lang, "en");
  const ar = await (await fetch(origin + "/api/kaart/manifest?id=" + ID + "&taal=ar", { headers: hdr })).json();
  assert.equal(ar.dir, "rtl");
  const oud = await (await fetch(origin + "/api/kaart/manifest?id=" + ID, { headers: hdr })).json();
  assert.equal(oud.start_url, "/k/" + ID, "zonder taal zoals eerst");
  assert.equal(oud.short_name, "Trainingskaart");
  const raar = await (await fetch(origin + "/api/kaart/manifest?id=" + ID + "&taal=" + encodeURIComponent("en\"><x"), { headers: hdr })).json();
  assert.equal(raar.start_url, "/k/" + ID, "onbekende taal komt niet in de start_url");

  let playwright = null;
  for (const van of [import.meta.url, "/opt/node22/lib/node_modules/"]) {
    try { playwright = createRequire(van)("playwright"); break; } catch {}
  }
  if (!playwright) {
    console.log("PASS taal van het beginschermicoon (manifest; geen Playwright, browserdeel overgeslagen)");
  } else {
    const { chromium, devices } = playwright;
    browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1, serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.6.9.4" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    const taalNu = () => page.evaluate(() => document.getElementById("taalsel").value);
    const kies = async (t) => { await page.selectOption("#taalsel", t); await page.waitForTimeout(400); };
    await page.goto(origin + "/k/" + ID + "?taal=en");
    await page.waitForSelector("#taalsel");
    await kies("nl");
    await page.goto(origin + "/k/" + ID);
    await page.waitForSelector("#taalsel");
    await kies("en");
    await page.goto(origin + "/k/" + ID + "?taal=en");
    await page.waitForSelector("#taalsel");
    assert.equal(await taalNu(), "en", "?taal=en opent Engels nadat de patiënt weer Engels koos");
    const href = await page.evaluate(() => document.getElementById("kmanifest") && document.getElementById("kmanifest").getAttribute("href"));
    assert.match(String(href), /&taal=en$/, "manifest in de taal van nu: " + href);
    await kies("de");
    const href2 = await page.evaluate(() => document.getElementById("kmanifest").getAttribute("href"));
    assert.match(href2, /&taal=de$/, "manifest volgt de taalwissel");
    assert.deepEqual(fouten, []);
    await ctx.close();
    console.log("PASS taal van het beginschermicoon en de taalkeuze na een link zonder ?taal=");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
