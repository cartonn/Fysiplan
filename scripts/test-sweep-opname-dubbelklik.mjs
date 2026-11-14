// Gebruikers-sweep 2026-11-14 18u (Mark, iPad liggend, gemeten): dubbelklik op "Neem op met je telefoon"
// startte twee opnames (2x POST /api/opname/start). Het eerste token bleef elke 1,5 s pollen (de interval
// werd overschreven en nooit gestopt) en telde een kwartier mee voor het opnameplafond van de praktijk.
// Nu: een bezig-slot in startOpname, de knop zelf gaat uit tijdens de controle, en een eventueel nog
// lopende opname wordt eerst teruggegeven (api/opname/stop) voordat een nieuwe start.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:opnamedubbel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /function startOpname\(doel,naam,cb\)\{[\s\S]{0,200}if\(OPNAME_BEZIG\)return;\s*OPNAME_BEZIG=true;/, "bezig-slot in startOpname");
assert.match(index, /if\(opnamePoll\)\{\s*stopOpname\(\);\s*if\(OPNAME_TOKEN\)fetch\('api\/opname\/stop'/, "lopende opname wordt eerst teruggegeven");
assert.match(index, /var knop=this;if\(knop\.disabled\)return;knop\.disabled=true;/, "knop Neem op met je telefoon uit tijdens de controle");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("opname dubbelklik: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opnamedubbel-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.43." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Opname Dubbel";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "opname-dubbel-wachtwoord-1", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ ...pw.devices["iPad (gen 7) landscape"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.43.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], meldingen = [];
  let starts = 0, stops = 0;
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    if (r.url().includes("/api/opname/start")) starts++;
    if (r.url().includes("/api/opname/stop")) stops++;
  });
  // een trage verbinding: de start blijft even hangen, precies het moment van de tweede tik
  await page.route("**/api/opname/start", async (r) => { await wacht(500); await r.continue(); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await wacht(1500);
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  // 1) dubbelklik op "Neem op met je telefoon"
  await page.click("[data-evid]");
  await page.waitForSelector("#ev_opname", { state: "visible" });
  await page.dblclick("#ev_opname");
  await page.waitForSelector("#ovOpname.on", { timeout: 8000 });
  await wacht(1500);
  assert.equal(starts, 1, "dubbelklik start één opname, niet " + starts);

  // 2) nog een tik via het aanpasvenster terwijl de opname loopt: het oude token gaat eerst terug
  await page.click("#on_cancel");
  await wacht(300);
  assert.equal(stops, 1, "annuleren geeft het token terug");
  await page.click("[data-evid]");
  await page.waitForSelector("#ev_opname", { state: "visible" });
  await page.click("#ev_opname");
  await page.waitForSelector("#ovOpname.on", { timeout: 8000 });
  await wacht(600);
  assert.equal(starts, 2, "tweede opname na annuleren mag wel");
  assert.equal(meldingen.length, 0, "geen meldingen: " + JSON.stringify(meldingen));
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("opname dubbelklik: ok (één start bij dubbelklik, annuleren geeft token terug)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
