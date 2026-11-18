// Gebruikers-sweep 2026-11-14 10u (Sanne, desktop): "Opnieuw delen met een nieuwe QR-code" bij een kaart die
// nog in de prullenbak staat. De server weigert dat (409, de naam hoort bij een verwijderde kaart), maar
// 1. die melding kwam nergens op het scherm: de klik leek niets te doen;
// 2. de editor had de markering "kaart is weg" al vóór het verzoek gewist, dus na "Definitief verwijderen"
//    maakte één klik op "Test de QR" zonder vraag een nieuwe kaart met een nieuwe link.
// Nu blijft de markering tot de server de nieuwe kaart heeft, en de 409 staat bij de QR-plek met de weg
// terug (Herstellen of een andere roepnaam). Broncontrole altijd (CI); browserdeel waar Playwright staat.
// `npm run test:opnieuwdelen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const srv = await readFile(join(root, "server.js"), "utf8");
assert.match(idx, /a==='opnieuwdelen'\)\{OPNIEUW_DELEN=KAART_ID;/, "opnieuw delen wist de markering niet vooraf");
assert.ok(!/a==='opnieuwdelen'\)\{zetKaartWeg\(''\)/.test(idx), "geen zetKaartWeg('') vóór het verzoek");
assert.match(idx, /if\(opnieuw\)\{zetKaartWeg\(''\);OPNIEUW_DELEN='';\}/, "markering pas weg na een gelukte deling");
assert.match(idx, /if\(d\.verwijderd\)\{toonQrHint\(/, "409 'verwijderd' komt op het scherm");
assert.match(idx, /if\(d\.fout\)\{toonQrHint\(d\.fout\);return true;\}/, "elke andere weigering ook");
const deel = (idx.match(/\n  function saveServerCard\(naam,cb,keuze\)\{[\s\S]*?\n  \}\n/) || [""])[0];
assert.ok(deel && !/zetKaartWeg\(''\);zetKaartId\(''/.test(deel), "saveServerCard wist de markering niet vóór het verzoek");
assert.match(srv, /409, \{ ok: false, verwijderd: true,/, "server zegt dat het om een verwijderde kaart gaat");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("opnieuw delen: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opnieuwdelen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.33." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Opnieuw Delen";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "opnieuw-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Joost T.", client: { c_naam: "Joost T." },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const kaarten = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json());

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.33.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], vragen = [];
  let antwoord = true;
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { vragen.push(d.message()); if (d.type() === "alert" || !antwoord) d.dismiss(); else d.accept(); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  const qr = () => page.textContent("#qrBlok");

  // kaart openen, naar de prullenbak
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await wacht(800);
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sdelid='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sdelid='${id}']`);
  await page.waitForFunction(() => /is verwijderd/.test(document.getElementById("qrBlok").textContent), null, { timeout: 6000 });
  await page.click("#k_close").catch(() => {});

  // "Opnieuw delen" terwijl de kaart nog in de prullenbak staat: de weigering staat op het scherm
  await page.evaluate(() => document.querySelector("[data-qract='opnieuwdelen']").click());
  await page.waitForFunction(() => /prullenbak/i.test(document.getElementById("qrBlok").textContent), null, { timeout: 8000 });
  assert.match(await qr(), /Herstellen/, "met de weg terug: " + (await qr()));
  assert.equal(await page.evaluate(() => localStorage.getItem("fp_kaartweg")), id, "markering staat er nog");
  assert.equal((await kaarten()).length, 0, "geen nieuwe kaart");

  // definitief verwijderen, dan "Test de QR": eerst een vraag, Annuleren = niets delen
  await page.click("#kaartenBtn");
  await page.click("#k_prullenbak > button");
  await page.waitForSelector(`[data-pruldef='${id}']`, { state: "visible", timeout: 6000 });
  await page.click(`[data-pruldef='${id}']`);
  await page.waitForFunction((i) => !document.querySelector(`[data-pruldef='${i}']`), id, { timeout: 6000 });
  await page.click("#k_close");
  antwoord = false;
  const n0 = vragen.length;
  await page.evaluate(() => document.getElementById("pb_qr").click());
  await wacht(1500);
  assert.ok(vragen.slice(n0).some((v) => /verwijderd/.test(v)), "vraag voordat er opnieuw gedeeld wordt: " + JSON.stringify(vragen.slice(n0)));
  assert.equal((await kaarten()).length, 0, "geen stille nieuwe kaart na Definitief verwijderen");

  // nu bewust opnieuw delen: één nieuwe kaart, markering weg
  antwoord = true;
  await page.evaluate(() => { const a = document.querySelector("[data-qract='opnieuwdelen']"); if (a) a.click(); });
  for (let i = 0; i < 40 && (await kaarten()).length === 0; i++) await wacht(200);
  const na = await kaarten();
  assert.equal(na.length, 1, "opnieuw delen maakt één kaart");
  assert.notEqual(na[0].id, id, "met een nieuwe link");
  await page.waitForFunction(() => !localStorage.getItem("fp_kaartweg"), null, { timeout: 5000 });
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("opnieuw delen: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
