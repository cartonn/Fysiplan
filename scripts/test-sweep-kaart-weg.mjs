// Gebruikers-sweep 2026-11-11 18u (Sanne, desktop): na "Definitief verwijderen" (bijvoorbeeld omdat de
// patiënt om wissen vroeg) hield de editor de kaart open met de oude QR. Eén klik op "Test de QR" of
// "Print met QR", of een autosave na een kleine wijziging, maakte de patiëntkaart stil opnieuw aan met
// een nieuwe link. Nu weet de editor dat zijn kaart weg is: QR weg met een melding, geen autosave, en
// opnieuw delen alleen na een vraag of via "Opnieuw delen met een nieuwe QR-code". Ook na herladen.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaartweg`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /function kaartIsWeg\(\)/, "editor onthoudt dat zijn kaart weg is");
assert.match(idx, /if\(kaartIsWeg\(\)&&OPNIEUW_DELEN!==KAART_ID\)\{toonKaartWegHint\(\);return;\}/, "geen autosave van een verwijderde kaart");
// de vraag staat vóór het maken en versturen van de kaart (ervoor staat alleen nog de weigering
// zolang de open kaart van v2 niet is hersteld, zie test-open-kaart.mjs)
const deel = (idx.match(/\n  function saveServerCard\(naam,cb,keuze\)\{[\s\S]*?\n  \}\n/) || [""])[0];
const vraagOp = deel.indexOf("if(kaartIsWeg()){"), kaartOp = deel.indexOf("serverKaart(naam)"), stuurOp = deel.indexOf("fetch('api/kaarten'");
assert.ok(vraagOp > 0 && vraagOp < kaartOp && kaartOp < stuurOp, "delen vraagt eerst bij een verwijderde kaart");
assert.ok(!/fetch\(|serverKaart\(|zetKaart/.test(deel.slice(0, vraagOp)), "en vóór die vraag wordt er niets gemaakt, verstuurd of gewijzigd");
assert.match(idx, /markeerKaartWeg\(d0\.dataset\.pruldef\)/, "definitief verwijderen markeert de open kaart");
assert.match(idx, /markeerKaartWeg\(x\.dataset\.sdelid\)/, "naar de prullenbak markeert de open kaart");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("kaart weg: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartweg-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.32." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Kaart Weg";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "kaartweg-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Joost T.", client: { c_naam: "Joost T." },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const kaarten = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json());

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.32.200" } });
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

  // kaart openen in de editor
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await page.waitForFunction((i) => document.querySelector("#qrBlok") && getComputedStyle(document.querySelector("#qrBlok")).display !== "none" && /k\//.test(document.querySelector("#qrBlok").innerHTML + "") , id, { timeout: 8000 }).catch(() => {});

  // naar de prullenbak: de editor laat de QR los
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sdelid='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sdelid='${id}']`);
  await page.waitForFunction(() => /is verwijderd/.test(document.getElementById("qrBlok").textContent), null, { timeout: 6000 });

  // definitief verwijderen via de prullenbak
  await page.click("#k_prullenbak > button");
  await page.waitForSelector(`[data-pruldef='${id}']`, { state: "visible", timeout: 6000 });
  await page.click(`[data-pruldef='${id}']`);
  await page.waitForFunction((i) => !document.querySelector(`[data-pruldef='${i}']`), id, { timeout: 6000 });
  await page.click("#k_close");
  assert.equal((await kaarten()).length, 0, "kaart is weg");

  // een kleine wijziging: geen stille autosave
  await page.evaluate(() => { const d = document.getElementById("c_naam"); d.value = "Joost T."; d.dispatchEvent(new Event("input", { bubbles: true })); d.blur(); });
  await page.evaluate(() => { const b = document.querySelector("[data-add]"); if (b) b.click(); });
  await wacht(3000);
  assert.equal((await kaarten()).length, 0, "geen stille nieuwe kaart na een wijziging: " + JSON.stringify(await kaarten()));
  assert.match(await page.textContent("#qrBlok"), /is verwijderd/, "melding blijft staan");

  // "Test de QR": eerst een vraag; Annuleren = niets delen
  antwoord = false;
  const n0 = vragen.length;
  await page.evaluate(() => document.getElementById("pb_qr").click()); // knop staat in de proefbalk; de handler is dezelfde
  await wacht(1200);
  assert.ok(vragen.slice(n0).some((v) => /verwijderd/.test(v)), "vraag voordat er opnieuw gedeeld wordt: " + JSON.stringify(vragen.slice(n0)));
  assert.equal((await kaarten()).length, 0, "Annuleren deelt niets");

  // herladen: nog steeds geen stille nieuwe kaart
  antwoord = true;
  await page.reload();
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await wacht(3500);
  assert.equal((await kaarten()).length, 0, "ook na herladen geen stille nieuwe kaart");

  // bewust opnieuw delen: nieuwe kaart met een nieuwe link
  await page.waitForSelector("[data-qract='opnieuwdelen']", { timeout: 6000 });
  await page.evaluate(() => document.querySelector("[data-qract='opnieuwdelen']").click());
  await page.waitForFunction(() => !/is verwijderd/.test(document.getElementById("qrBlok").textContent), null, { timeout: 8000 });
  for (let i = 0; i < 40 && (await kaarten()).length === 0; i++) await wacht(200);
  const na = await kaarten();
  assert.equal(na.length, 1, "opnieuw delen maakt één kaart");
  assert.notEqual(na[0].id, id, "met een nieuwe link");
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("kaart weg: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
