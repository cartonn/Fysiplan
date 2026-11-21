// Regressietest gebruikers-sweep 2026-11-21 10u (Truus, iPhone SE):
// 1. HOOG: een dubbeltik op "Begin met oefenen" opende oefening 1 én meteen de vergrote foto: de tweede tik
//    viel na het openen precies op de foto. Nu telt een tik op de foto of de videoknop kort na het openen niet.
// 2. HOOG: de balk "Zet op beginscherm" kwam 2,5 s na de pijnscore, ook als de patiënt al doortikte naar
//    "Hoe gaat het nu", en lag dan over "Hetzelfde / Iets beter" (de tik kwam op de balk). Nu komt de balk
//    pas als de patiënt een paar seconden niets doet.
// 3. LAAG (Jayden, Pixel 7 liggend): de onderbalk van de oefenstand stond links, 219 px leeg rechts. Nu gecentreerd.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:startdubbeltik`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /function openOef\(i\)\{[\s\S]{0,400}OPEN_SLOT=Date\.now\(\)\+600;/, "openen zet een tikslot");
assert.match(html, /if\(foto&&tikNaOpen\(e\)\)return;/, "foto telt niet kort na openen");
assert.match(html, /if\(tikNaOpen\(e\)\)return;/, "videoknop telt niet kort na openen");
assert.match(html, /if\(Date\.now\(\)-AB_LAATST<AB_RUST\)\{setTimeout\(probeer,1000\);return;\}/, "balk wacht op rust");
assert.match(html, /@media \(max-height:26em\)\{[\s\S]{0,900}\.srij\{flex:1 1 18em;margin:0 auto\}/, "onderbalk liggend gecentreerd");
assert.match(html, /body\.krap \.srij\{flex:1 1 18em;margin:0 auto\}/, "onderbalk bij grote letters gecentreerd");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-start-dubbeltik: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-startdt-"));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.9.41.1", ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Start Dubbeltik";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "startdubbel-wachtwoord", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }, { n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  // 1. dubbeltik op de startknop, met verschillende tussentijden
  for (const tussen of [80, 200, 350]) {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.42." + tussen } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
    await page.waitForSelector("#startknop", { state: "visible", timeout: 10000 });
    await page.locator("#startknop").scrollIntoViewIfNeeded();
    await wacht(200);
    const b = await page.locator("#startknop").boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.click(x, y);
    await wacht(tussen);
    await page.mouse.click(x, y);
    await wacht(500);
    const st = await page.evaluate(() => ({ sessie: document.body.classList.contains("sessie"), lb: document.getElementById("lightbox").classList.contains("open") }));
    assert.equal(st.sessie, true, "oefening 1 open (" + tussen + " ms)");
    assert.equal(st.lb, false, "geen vergrote foto na een dubbeltik (" + tussen + " ms)");
    await wacht(400);
    // een gewone tik op de foto daarna werkt nog
    await page.click(".oef.sopen .fotoknop, body.sessie .oef:not([hidden]) .fotoknop").catch(async () => {
      await page.evaluate(() => { const f = [...document.querySelectorAll(".fotoknop")].find((e) => e.offsetParent); f && f.click(); });
    });
    await wacht(300);
    assert.equal(await page.evaluate(() => document.getElementById("lightbox").classList.contains("open")), true, "gewone tik op de foto opent hem nog");
    assert.deepEqual(fouten, []);
    await ctx.close();
  }

  // 2. balk "Zet op beginscherm": niet terwijl de patiënt doortikt, wel daarna
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.43.1" } });
  const page = await ctx.newPage();
  await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  await page.waitForSelector("#mschaal button", { timeout: 10000 });
  await page.evaluate(() => { const b = document.querySelectorAll("#mschaal button")[3]; b.scrollIntoView({ block: "center" }); b.click(); });
  const aan = () => page.evaluate(() => document.getElementById("appbanner").classList.contains("aan"));
  for (let i = 0; i < 5; i++) { await wacht(1000); await page.mouse.move(10, 200 + i); await page.evaluate(() => window.dispatchEvent(new Event("pointerdown"))); }
  assert.equal(await aan(), false, "geen balk terwijl de patiënt nog tikt (5 s)");
  let gezien = false;
  for (let i = 0; i < 12 && !gezien; i++) { await wacht(1000); gezien = await aan(); }
  assert.equal(gezien, true, "balk komt als de patiënt even niets doet");
  await ctx.close();
  console.log("test-sweep-start-dubbeltik: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
