// Gebruikers-sweep 2026-11-09 10u (Jayden, Pixel 7/iPhone 14; Truus, iPhone SE):
// - trage /api/kaart: een volledig leeg scherm zonder laadindicator;
// - trage vertaling op een Engelse kaart: eerst een half lege, Nederlandse kaart ("Jouw oefeningen"
//   zonder oefeningen, aantikbare Nederlandse knoppen);
// - onbekend id met ?taal=en: Nederlandse "Kaart niet gevonden";
// - 200 % tekst: "Begrepen" in de privacyregel en "Gemaakt met Fysiplan" maakten de pagina 392 px breed op 320.
// Nu een laadscherm in de taal van de patiënt tot de kaart in die taal getekend is (max 8 s wachten
// op de vertaling), een vertaalde niet-gevonden-pagina en afbrekende privacyregel/voet.
// Sweep 2026-11-10 18u (Jayden, Pixel 7, trage lijn): de laadtekst bleef ±1,5 s Nederlands ("Je kaart wordt
// geladen…") omdat het hoofdscript (na /noor-audio.js) hem pas vertaalde. Nu zet een klein script direct na het
// laadscherm de tekst in de taal van de patiënt.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaartladen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /<div class="laden" id="laden" role="status"/, "laadscherm bestaat");
const vroeg = k.indexOf('id="laden_tekst"'), vroegScript = k.indexOf("<script>", vroeg), noor = k.indexOf('<script src="/noor-audio.js">');
assert.ok(vroeg > 0 && vroegScript > vroeg && vroegScript < noor && k.slice(vroegScript, noor).includes("LADEN[t]"), "laadtekst wordt vóór de zware scripts vertaald");
assert.match(k, /function wisselTaal\(t,klaar\)/, "wisselTaal meldt wanneer de taal getekend is");
assert.match(k, /wisselTaal\(TAAL,toonKaart\)/, "kaart pas tonen na het tekenen in de eigen taal");
assert.doesNotMatch(k, /if\(TAAL!=='nl'\)wisselTaal\(TAAL\);else alles\(\);\s*document\.getElementById\('wrap'\)\.style\.display='block';/, "niet meer meteen tonen");
assert.match(k, /function toonNietGevonden\(\)/, "niet-gevonden in de taal van de patiënt");
assert.match(k, /\.privregel\{display:flex;flex-wrap:wrap;/, "privacyregel breekt af");
assert.match(k, /\.voet \.merk\{[^}]*flex-wrap:wrap/, "voetmerk breekt af");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("kaart laden: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartladen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Laden";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "laden-wachtwoord", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay", client: { c_naam: "Jay" },
    chosen: [{ n: "Mobilisatie rotatie rug", id: "fp_f17c3675b48db1ae", i: 0 }, { n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }],
    kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  // 0) trage lijn: alle scripts traag, laadtekst toch meteen Engels
  {
    const c0 = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.10" } });
    const p0 = await c0.newPage();
    await p0.route("**/noor-audio.js*", async (r) => { await wacht(2500); await r.continue(); });
    await p0.goto(origin + "/k/" + id, { waitUntil: "commit" });
    await p0.waitForSelector("#laden_tekst", { state: "attached" });
    await wacht(600);
    const t0 = await p0.evaluate(() => ({ t: document.getElementById("laden_tekst").textContent, lang: document.documentElement.lang }));
    assert.match(t0.t, /Loading your card/, "trage lijn: laadtekst meteen Engels: " + JSON.stringify(t0));
    await p0.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    await c0.close();
    const c1 = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.12" } });
    const p1 = await c1.newPage();
    await p1.route("**/noor-audio.js*", async (r) => { await wacht(1500); await r.continue(); });
    await p1.goto(origin + "/k/" + id, { waitUntil: "commit" });
    await p1.waitForSelector("#laden_tekst", { state: "attached" });
    await wacht(400);
    assert.match(await p1.textContent("#laden_tekst"), /Je kaart wordt geladen/, "Nederlandse telefoon: Nederlandse laadtekst");
    await c1.close();
  }

  // 1) trage kaart en trage vertaling (Engels): laadscherm, nooit een half Nederlandse kaart
  const en = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.9.11" } });
  const pe = await en.newPage();
  await pe.route("**/api/kaart?id=*", async (r) => { await wacht(1500); await r.continue(); });
  await pe.route("**/api/kaart/vertaal*", async (r) => { await wacht(2500); await r.continue(); });
  await pe.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "commit" });
  await wacht(800);
  let s = await pe.evaluate(() => ({ laden: getComputedStyle(document.getElementById("laden")).display !== "none",
    tekst: document.getElementById("laden").textContent, wrap: getComputedStyle(document.getElementById("wrap")).display }));
  assert.ok(s.laden && /Loading your card/.test(s.tekst), "trage kaart: Engels laadscherm: " + JSON.stringify(s));
  assert.equal(s.wrap, "none");
  await wacht(2000); // kaart binnen, vertaling nog onderweg
  s = await pe.evaluate(() => ({ laden: getComputedStyle(document.getElementById("laden")).display !== "none",
    wrap: getComputedStyle(document.getElementById("wrap")).display }));
  assert.ok(s.laden && s.wrap === "none", "trage vertaling: nog laadscherm, geen half Nederlandse kaart: " + JSON.stringify(s));
  await pe.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 10000 });
  s = await pe.evaluate(() => ({ laden: getComputedStyle(document.getElementById("laden")).display, oefs: document.querySelectorAll("#oefs .oef").length,
    body: document.getElementById("wrap").innerText }));
  assert.equal(s.laden, "none", "laadscherm weg");
  assert.equal(s.oefs, 2, "oefeningen getekend");
  assert.doesNotMatch(s.body, /Jouw oefeningen|Hoe ging het vandaag/, "geen Nederlandse vaste teksten op de Engelse kaart");
  await en.close();

  // 2) onbekend id in het Engels
  const en2 = await browser.newContext({ ...pw.devices["iPhone 14"], locale: "en-GB", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.12" } });
  const p2 = await en2.newPage();
  await p2.goto(origin + "/k/000000abcdef?taal=en", { waitUntil: "networkidle" });
  const f = await p2.evaluate(() => ({ fout: document.getElementById("fout").innerText, laden: getComputedStyle(document.getElementById("laden")).display }));
  assert.match(f.fout, /Card not found/, "Engelse niet-gevonden-pagina: " + f.fout);
  assert.equal(f.laden, "none");
  await en2.close();

  // 3) iPhone SE, 200 %: privacyregel en voet binnen 320 px
  const se = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.13" } });
  const p3 = await se.newPage();
  await p3.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  await p3.waitForSelector("#oefs .oef");
  assert.equal(await p3.evaluate(() => getComputedStyle(document.getElementById("privregel")).display), "flex", "privacyregel zichtbaar");
  await p3.evaluate(() => {
    const els = [...document.querySelectorAll("body *")];
    const maten = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    els.forEach((e, i) => { e.style.fontSize = (maten[i] * 2) + "px"; });
  });
  await wacht(200);
  const b = await p3.evaluate(() => ({ vw: window.innerWidth, sw: document.documentElement.scrollWidth,
    ok: Math.round(document.getElementById("privok").getBoundingClientRect().right),
    merk: Math.round(document.querySelector(".voet .merk").getBoundingClientRect().right),
    okH: Math.round(document.getElementById("privok").getBoundingClientRect().height) }));
  assert.ok(b.ok <= b.vw && b.merk <= b.vw, "Begrepen en voet binnen het scherm: " + JSON.stringify(b));
  assert.ok(b.sw <= b.vw + 1, "geen pagina breder dan het scherm: " + JSON.stringify(b));
  assert.ok(b.okH >= 44, "Begrepen is 44 px hoog");
  await se.close();
  console.log("kaart laden: ok (laadscherm, wachten op vertaling, Engelse niet-gevonden, 200 % op 320 px)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
