// Gebruikers-sweep 2026-11-13 22u (Jayden, Pixel 7 en iPhone 14, hertest #291): haalt de praktijk een
// oefening van de kaart terwijl /k open staat, dan weigert de server een vinkje of "te zwaar" bij die
// oefening netjes (409). Maar de kaart las dat antwoord niet: het vinkje bleef groen ("1 of 4 done
// today") en "Too hard?" zei eindeloos "Not sent. Tap to retry", alsof de verbinding het probleem was.
// Nu draait de kaart het vinkje terug en zegt bij de oefening dat die niet meer op de kaart staat
// (in de taal van de kaart). Het statische deel draait altijd (CI heeft geen browser); met Playwright
// ook in een telefoon. `npm run test:oefweg`
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
assert.match(kaart, /if\(r\.status===409&&j&&typeof j==='object'\)j\.weg=true/, "stuur() geeft een 409 door aan de kaart");
assert.match(kaart, /\.then\(function\(d\)\{if\(d&&d\.weg\)oefWeg\(idx,p===-1\);\}\)/, "vinkje leest het antwoord");
assert.match(kaart, /if\(st===409\)\{oz\.textContent=trg\('weg'\);return;\}/, "te zwaar: bij 409 geen 'tik opnieuw'");
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) {
  assert.match(kaart, new RegExp("    " + t + ":\\{weg:'[^']{10,}'"), "melding in het " + t);
}

let playwright = null;
for (const van of [import.meta.url, "/opt/node22/lib/node_modules/"]) {
  try { playwright = createRequire(van)("playwright"); break; } catch {}
}
if (!playwright) {
  console.log("PASS weggehaalde oefening op /k (statisch; geen Playwright, browserdeel overgeslagen)");
  process.exit(0);
}

const ID = "0e5a0e5a5678";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefweg-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio oefweg": { jayden: { id: ID, praktijk: "Fysio Oefweg", naam: "Jayden",
  ts: Date.now(), taal: "en", chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Lunges", id: "", i: 1 }, { n: "Brug", id: "", i: 2 }],
  rows: {}, cells: {}, vids: {} } } }));
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
const { chromium, devices } = playwright;
const browser = await chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1, extraHTTPHeaders: { "x-forwarded-for": "10.6.9.1" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  // de praktijk haalde "Squat" intussen van de kaart: de server antwoordt zoals lib/patient-routes.js
  const weg = { ok: false, fout: "Deze oefening staat niet meer op je kaart. Open je kaart opnieuw." };
  let vinkjes = 0, zwaar = 0;
  await page.route("**/api/kaart/oefening", (r) => { vinkjes++; r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify(weg) }); });
  await page.route("**/api/kaart/oefzwaar", (r) => { zwaar++; r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify(weg) }); });
  await page.goto(origin + "/k/" + ID + "?taal=en");
  await page.waitForSelector('#oefs .oefdone[data-idx="0"]');
  await page.evaluate(() => document.querySelectorAll(".ov.on,.lb.on").forEach((o) => o.classList.remove("on")));
  await page.click('#oefs .oefdone[data-idx="0"]');
  await page.waitForSelector(".oefweg", { timeout: 4000 });
  const r1 = await page.evaluate(() => ({
    pressed: document.querySelector('#oefs .oefdone[data-idx="0"]').getAttribute("aria-pressed"),
    tekst: document.querySelector(".oefweg").textContent, rol: document.querySelector(".oefweg").getAttribute("role"),
    bij: document.querySelector(".oefweg").closest(".oef").dataset.oidx }));
  assert.equal(vinkjes, 1);
  assert.equal(r1.pressed, "false", "vinkje teruggedraaid");
  assert.match(r1.tekst, /no longer on your card/, "melding in het Engels: " + r1.tekst);
  assert.equal(r1.rol, "alert");
  assert.equal(r1.bij, "0", "melding bij de juiste oefening");
  // te zwaar: niet "Not sent. Tap to retry"
  // de knop staat in de oefenstand; een klik via de DOM loopt door dezelfde handler
  await page.evaluate(() => document.querySelector('#oefs .oefzwaar[data-zidx="0"]').click());
  await page.waitForTimeout(600);
  const zt = await page.evaluate(() => document.querySelector('#oefs .oefzwaar[data-zidx="0"]').textContent);
  assert.equal(zwaar, 1, "te zwaar verstuurd");
  assert.doesNotMatch(zt, /retry/i, "geen 'tik opnieuw' bij een weggehaalde oefening: " + zt);
  assert.match(zt, /no longer on your card/);
  assert.deepEqual(fouten, []);
  await ctx.close();
  console.log("PASS weggehaalde oefening op /k: vinkje terug en een melding in de taal van de kaart");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
