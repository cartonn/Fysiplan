// Gebruikers-sweep 2026-11-18 14u (Truus, iPhone SE): begon de therapeut de opmerking zelf met "Let op:", dan
// stond op /k "Let op  Let op: ..." (label plus dezelfde woorden). Nu valt het herhaalde label weg; een tekst die
// alleen met hetzelfde woord begint ("Doel is ...") blijft staan. `npm run test:letopdubbel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /esc\(zonderLabel\(vt\(cl\.c_opm\),\[tr\('letop'\),'Let op'\]\)\)/, "Let op-label niet dubbel");
assert.match(kaart, /esc\(zonderLabel\(vt\(cl\.c_doel\),\[tr\('doel'\),'Doel'\]\)\)/, "Doel-label niet dubbel");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("let op dubbel: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-letop-"));
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
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.6.47." + (ip++), ...extra }, body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Letop";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "letop-wachtwoord-1", akkoord: true })).json()).sessie };
  const r = await post("/api/kaarten", { praktijk: P, naam: "Truus", chosen: [{ n: "Squat", i: 0 }], kaartId: "",
    client: { c_naam: "Truus", c_doel: "Doel is weer zelf boodschappen doen", c_opm: "Let op: niet door de pijn heen oefenen" } }, S);
  assert.equal(r.status, 200, "kaart bewaard");
  const d = await r.json();
  const id = d.id || d.kaartId || (d.kaart && d.kaart.id);
  assert.ok(id, "kaart-id: " + JSON.stringify(d).slice(0, 200));
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(origin + "/k/" + id);
  await page.waitForSelector("#clientblok .rij", { timeout: 10000 });
  const rijen = await page.evaluate(() => [...document.querySelectorAll("#clientblok .rij")].map((x) => x.querySelector("span").textContent));
  assert.ok(rijen.includes("niet door de pijn heen oefenen"), "Let op zonder herhaald label: " + JSON.stringify(rijen));
  assert.ok(rijen.includes("Doel is weer zelf boodschappen doen"), "doel dat met 'Doel is' begint blijft heel: " + JSON.stringify(rijen));
  await ctx.close();
  console.log("let op dubbel: ok");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
