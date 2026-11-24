// Gebruikers-sweep 2026-11-21 18u (Sanne, desktop): dubbelklik op "Openen" in Patiënten gaf twee keer de vraag
// "Huidige kaart vervangen?" en laadde de kaart twee keer; en de kaart die al open stond nog eens openen vroeg ook
// "vervangen?". Nu één opening tegelijk, en de open kaart (zelfde id, geen nieuwere versie) laadt niet opnieuw.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:openendubbel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
if (!process.env.ZONDER_BRON) {
  assert.match(index, /function openSrvKaart\(id\)\{\n    if\(SRV_OPEN_BEZIG\)return;/, "één opening tegelijk");
  assert.match(index, /\.then\(function\(\)\{SRV_OPEN_BEZIG=false;\}\);/, "slot gaat altijd weer open");
  assert.match(index, /if\(KAART_ID&&d\.kaart\.id===KAART_ID&&chosen\.length&&\(Number\(d\.kaart\.ts\)\|\|0\)<=KAART_TS\)\{/, "open kaart niet opnieuw laden");
}

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("openen dubbel: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-openendubbel-"));
const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
let app, uit = "", browser;
let ip = 1;
const kop = (x = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.21." + (ip++ & 255), ...x });
const post = (p, b, x) => fetch(origin + p, { method: "POST", headers: kop(x), body: JSON.stringify(b) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await (await post("/api/praktijk/claim", { praktijk: "Fysio Dubbel", wachtwoord: "dubbel-wachtwoord-123", akkoord: true })).json();
  const A = { "x-praktijk-sessie": claim.sessie };
  const ids = {};
  for (const n of ["Truus", "Piet"]) {
    const r = await post("/api/kaarten", { praktijk: "Fysio Dubbel", naam: n, client: { c_naam: n }, kaartId: "", chosen: [{ n: "Squat", i: 0 }] }, A);
    assert.equal(r.status, 200, uit.slice(-300));
    ids[n] = (await r.json()).id;
  }

  browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.22.1" } });
  await ctx.addInitScript(([s]) => { try {
    localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_alle_schermen", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
    localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Dubbel" }));
    localStorage.setItem("fp_praksessie", s);
  } catch {} }, [claim.sessie]);
  const fouten = [];
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fouten.push(String(e)));
  let vragen = [];
  p.on("dialog", (d) => { vragen.push(d.message()); d.accept(); });
  let geladen = 0;
  // traag antwoord, zodat de tweede klik van een dubbelklik valt terwijl het eerste verzoek nog loopt
  await p.route(/\/api\/praktijk\/kaart\?/, async (r) => { geladen++; await wacht(600); return r.continue(); });
  await p.goto(origin + "/v2/app", { waitUntil: "load" });
  await p.waitForSelector("#fpSchermen [data-scherm='patienten']", { timeout: 15000 });
  await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));

  const naarPatienten = async () => {
    await p.click("#fpSchermen [data-scherm='patienten']");
    await p.waitForSelector("#k_srv_lijst [data-sopen]", { timeout: 8000 });
    await p.waitForTimeout(200);
  };
  const openNaam = () => p.evaluate(() => (document.getElementById("c_naam") || {}).value || "");
  // eerst Truus openen (lege editor: geen vraag)
  await naarPatienten();
  await p.click(`#k_srv_lijst [data-sopen='${ids.Truus}']`);
  for (let i = 0; i < 40 && (await openNaam()) !== "Truus"; i++) await wacht(100);
  assert.equal(await openNaam(), "Truus", "Truus staat open");
  await wacht(300);

  // dubbelklik op Openen bij Piet: één vraag, één keer laden
  vragen = []; geladen = 0;
  await naarPatienten();
  await p.dblclick(`#k_srv_lijst [data-sopen='${ids.Piet}']`);
  for (let i = 0; i < 40 && (await openNaam()) !== "Piet"; i++) await wacht(100);
  await wacht(1200);
  assert.equal(await openNaam(), "Piet", "Piet staat open");
  assert.equal(vragen.length, 1, "één vervang-vraag bij dubbelklik: " + JSON.stringify(vragen));
  assert.equal(geladen, 1, "de kaart is één keer opgehaald");

  // Piet nog eens openen terwijl hij al open staat: geen vraag, scherm dicht, kaart blijft
  vragen = [];
  await naarPatienten();
  await p.click(`#k_srv_lijst [data-sopen='${ids.Piet}']`);
  await wacht(1200);
  assert.deepEqual(vragen, [], "geen vraag bij de kaart die al open staat");
  assert.equal(await openNaam(), "Piet");
  assert.equal(await p.evaluate(() => document.getElementById("ovKaarten").classList.contains("on")), false, "Patiënten is dicht");

  // en Truus daarna gewoon weer met de vraag
  vragen = [];
  await naarPatienten();
  await p.click(`#k_srv_lijst [data-sopen='${ids.Truus}']`);
  for (let i = 0; i < 40 && (await openNaam()) !== "Truus"; i++) await wacht(100);
  assert.equal(vragen.length, 1, "een andere kaart vraagt nog wel om te vervangen");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("openen dubbel: ok");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  if (browser) await browser.close();
  if (app && app.exitCode === null) app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
