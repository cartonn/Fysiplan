// Gebruikers-sweep 2026-11-22 10u (Sanne, desktop): na Uitloggen en weer Inloggen staan de oefeningen van de
// vorige patiënt nog in de editor, zonder roepnaam. "Test de QR" vulde dan zelf "Voorbeeldpatiënt" in en maakte
// stil een tweede kaart die meetelde in Patiënten en de CSV. En de balk "Deze editor heeft de kaart van … open"
// bleef na uitloggen staan, met patiëntnamen erin. Nu vraagt de knop eerst een roepnaam en gaat de balk weg.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:qrnauitloggen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const knop = (idx.match(/getElementById\('pb_qr'\)\.addEventListener\('click',function\(\)\{[\s\S]*?saveServerCard\(/) || [""])[0];
assert.ok(knop, "handler van Test de QR gevonden");
assert.doesNotMatch(knop, /cn\.value='Voorbeeldpati/, "Test de QR verzint geen Voorbeeldpatiënt meer");
assert.match(knop, /if\(!cn\.value\.trim\(\)\)\{alert\('[^']*roepnaam[^']*'\);try\{cn\.focus\(\);\}catch\(e\)\{\}return;\}/, "zonder roepnaam eerst de vraag om een roepnaam");
const uit = (idx.match(/\n  function prakUitgelogd\(\)\{[\s\S]*?\n  \}\n/) || [""])[0];
assert.match(uit, /getElementById\('conflict_bar'\);if\(cfbU\)\{cfbU\.style\.display='none';cfbU\.textContent='';\}/, "uitloggen haalt de balk met patiëntnamen weg");
console.log("test-sweep-qr-na-uitloggen (statisch): ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-qruitlog-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.33." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio QR Uitlog";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "qruitlog-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jan", client: { c_naam: "Jan" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const kaarten = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json());

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.33.200" } });
  await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("fp_test_eens")) { sessionStorage.setItem("fp_test_eens", "1"); localStorage.setItem("fp_praksessie", t); } } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], vragen = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { vragen.push(d.message()); d.dismiss(); });
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  // kaart van Jan openen, dan uitloggen
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await page.waitForFunction(() => document.getElementById("c_naam").value === "Jan", null, { timeout: 8000 });
  // de balk met patiëntnamen staat (zoals na een hernoemvraag)
  await page.evaluate(() => { const b = document.createElement("div"); b.id = "conflict_bar"; b.textContent = "Deze editor heeft de kaart van “Jan” open"; document.body.appendChild(b); });
  await page.click("#kaartenBtn");
  await page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });
  await page.click("#ps_uit");
  await page.waitForFunction(() => document.getElementById("c_naam").value === "", null, { timeout: 8000 });
  assert.ok(await page.evaluate(() => { const b = document.getElementById("conflict_bar"); return !b || (b.style.display === "none" && !/Jan/.test(b.textContent)); }), "balk met patiëntnaam weg na uitloggen");
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  // weer ingelogd (de sessie terug, zoals na Inloggen), de oefeningen van Jan staan er nog
  const sessie2 = (await (await post("/api/praktijk/login", { praktijk: P, wachtwoord: "qruitlog-wachtwoord-1" })).json()).sessie;
  assert.ok(sessie2, "weer ingelogd");
  S["x-praktijk-sessie"] = sessie2;
  await page.evaluate((t) => { localStorage.setItem("fp_praksessie", t); }, sessie2);
  const n0 = vragen.length;
  await page.evaluate(() => document.getElementById("pb_qr").click());
  await wacht(2500);
  assert.ok(vragen.slice(n0).some((v) => /roepnaam/.test(v)), "eerst de vraag om een roepnaam: " + JSON.stringify(vragen.slice(n0)));
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "c_naam"), "focus op het naamveld");
  assert.equal(await page.evaluate(() => document.getElementById("c_naam").value), "", "geen verzonnen naam");
  const na = await kaarten();
  assert.equal(na.length, 1, "geen stille tweede kaart: " + JSON.stringify(na.map((k) => k.naam)));
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-qr-na-uitloggen: ok");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
