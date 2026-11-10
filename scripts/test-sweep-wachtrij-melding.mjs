// Gebruikers-sweep 2026-11-10 (Truus, iPhone SE): zonder internet een pijnscore tikken gaf
// "Opgeslagen op je telefoon. Gaat vanzelf mee…". Kwam de verbinding terug, dan ging de score
// wel mee en zei de wachtrijbalk "Verstuurd ✓", maar de melding onder de pijnscore bleef staan.
// Nu verdwijnt die zodra de wachtrij leeg is. Broncontrole altijd (CI); browserdeel waar
// Playwright staat. `npm run test:wachtrijmelding`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
const teken = kaart.slice(kaart.indexOf("function tekenWacht(klaar){"), kaart.indexOf("var WACHT_REDEN="));
assert.match(teken, /querySelectorAll\('\.mdank\.wacht,\.sdank\.wacht'\)/, "tekenWacht ruimt de wachtmeldingen op");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("wachtrij melding: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wachtmelding-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio wacht": { "truus": { id: "abcdef654321", praktijk: "Fysio Wacht", naam: "Truus", ts: Date.now(),
    chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} } }
}));
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
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.4.1" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  await page.goto(origin + "/k/abcdef654321");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
  // geen verbinding voor de pijnscore: de tik gaat in de wachtrij
  await page.route("**/api/kaart/meting", (r) => r.abort("internetdisconnected"));
  await page.locator("#mschaal button").nth(3).click();
  await page.waitForFunction(() => document.getElementById("mdank").classList.contains("wacht"), null, { timeout: 5000 });
  assert.ok(await page.isVisible("#mdank"), "melding 'opgeslagen op je telefoon' zichtbaar");
  // verbinding terug
  await page.unroute("**/api/kaart/meting");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 100; i++) {
    const k = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
    if ((k["fysio wacht"].truus.metingen || []).length) break;
    await wacht(100);
  }
  await page.waitForFunction(() => !/Nog niet/.test(document.getElementById("wachtrij").textContent), null, { timeout: 5000 });
  const na = await page.evaluate(() => {
    const d = document.getElementById("mdank");
    return { zicht: getComputedStyle(d).display, wacht: d.classList.contains("wacht"), tekst: d.textContent };
  });
  assert.equal(na.wacht, false, "geen wachtmelding meer na versturen");
  assert.equal(na.zicht, "none", "melding onder de pijnscore weg na versturen: " + na.tekst);
  const k = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  assert.equal((k["fysio wacht"].truus.metingen || []).length, 1, "pijnscore kwam echt aan");
  assert.deepEqual(fouten, []);
  console.log("wachtrij melding: ok (melding verdwijnt zodra de score verstuurd is)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
