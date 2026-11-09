// Gebruikers-sweep 2026-11-09 (Sanne, desktop): in het Kaarten-venster gaf een dubbelklik op × twee
// vragen en twee verwijderverzoeken (200 + 404 "Kaart niet gevonden.") en op Kopie twee vragen.
// Nu een bezig-slot per actie en kaart: één vraag, één verzoek; × is 44 px.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:dubbelklikoverzicht`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /var KAARTEN_BEZIG=\{\};/, "bezig-slot bestaat");
assert.match(appHtml, /var kpSlot='kopie:'\+kp\.dataset\.skopie;\s*if\(KAARTEN_BEZIG\[kpSlot\]\)return;/, "Kopie: bezig-slot");
assert.match(appHtml, /var delSlot='del:'\+nm;\s*if\(KAARTEN_BEZIG\[delSlot\]\)return;/, "×: bezig-slot");
assert.match(appHtml, /#k_srv_lijst \[data-sdel\]\{min-width:44px;min-height:44px/, "× is 44 px");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("dubbelklik overzicht: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-dubbelklik-"));
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
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.1." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Dubbelklik";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "dubbelklik-wachtwoord", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  for (const naam of ["Truus V.", "Jan K."])
    assert.equal((await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).status, 200);
  const kaarten = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json());
  assert.equal((await kaarten()).length, 2);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.1" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], vragen = [], verzoeken = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { vragen.push(d.type() + ": " + d.message()); d.type() === "confirm" ? d.accept() : d.dismiss(); });
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/kaarten/verwijder")) verzoeken.push(r.url()); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  const x = page.locator(`#k_srv_lijst [data-sdel="Jan K."]`);
  await x.waitFor({ state: "visible", timeout: 8000 });
  const maat = await x.boundingBox();
  assert.ok(maat.width >= 43.5 && maat.height >= 43.5, "× minstens 44 px: " + JSON.stringify(maat));

  await x.dblclick();
  await wacht(1500);
  assert.equal(vragen.filter((v) => v.startsWith("confirm")).length, 1, "één vraag bij dubbelklik ×: " + JSON.stringify(vragen));
  assert.equal(verzoeken.length, 1, "één verwijderverzoek");
  assert.deepEqual(vragen.filter((v) => v.startsWith("alert")), [], "geen foutmelding");
  assert.deepEqual((await kaarten()).map((k) => k.naam), ["Truus V."]);

  // Kopie: dubbelklik geeft één vraag (er staat al een kaart open met oefeningen)
  vragen.length = 0;
  await page.evaluate(() => { document.querySelector("[data-add]").click(); });
  await page.click("#kaartenBtn").catch(() => {});
  const kopie = page.locator("#k_srv_lijst [data-skopie]").first();
  await kopie.waitFor({ state: "visible", timeout: 8000 });
  await kopie.dblclick();
  await wacht(1500);
  assert.equal(vragen.filter((v) => v.startsWith("confirm")).length, 1, "één vraag bij dubbelklik Kopie: " + JSON.stringify(vragen));
  assert.deepEqual(fouten, []);
  console.log("dubbelklik overzicht: ok (× en Kopie: één vraag, één verzoek)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
