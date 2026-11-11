// Gebruikers-sweep 2026-11-11 18u (Jayden, Pixel 7, trage lijn): een kaart in een andere taal dan
// Nederlands stond pas in beeld als /api/kaart/vertaal antwoordde, of na 8 s. Met 4 s vertraging op de
// kaart en 4 s op de vertaling: 8,2 s een laadscherm. Op productie wacht de eerste opening in een nieuwe
// taal op de vertaaldienst.
// Nu wacht de kaart hooguit VERTAAL_WACHT (1,5 s): daarna staat hij er met de vaste teksten in de eigen
// taal, en de oefennamen komen erin zodra de vertaling binnen is. Een late vertaling tekent niet opnieuw
// terwijl de vergroting open staat (een hertekening brak een lopende video of de vergroting af).
// Ook: schermlezerlabels van vraagveld, vergroting en sluitknoppen in de taal van de kaart.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:vertaallaat`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
const m = k.match(/var VERTAAL_WACHT=(\d+);/);
assert.ok(m, "VERTAAL_WACHT bestaat");
assert.ok(Number(m[1]) <= 2000, "kaart wacht hooguit 2 s op de vertaling, niet " + m[1]);
assert.doesNotMatch(k, /setTimeout\(function\(\)\{af\(null\);\},8000\)/, "geen 8 s wachten meer");
assert.match(k, /function kaartBezig\(\)/, "late vertaling kijkt of de patiënt bezig is");
assert.match(k, /if\(gedaan&&tk\)\{VERT\[taal\]=tk;laatVertaald\(taal\);\}/, "late vertaling via laatVertaald");
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"])
  assert.match(k, new RegExp("\\b" + t + ":\\{vraag:'[^']+',lb:'[^']+',sluit:'[^']+'\\}"), "schermlezerlabels in " + t);

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("vertaling laat: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vertlaat-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.31." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const NAAM = "Bruggen beginner";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: "Fysio Laat", wachtwoord: "laat-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: "Fysio Laat", naam: "Jayden", client: { c_naam: "Jayden" },
    chosen: [{ n: NAAM, id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "de-DE", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.31.200" } });
  const p = await ctx.newPage();
  // de vertaling komt pas na 4 s, met een Duitse naam voor de oefening
  await p.route(/\/api\/kaart\/vertaal/, async (r) => {
    await wacht(4000);
    await r.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, teksten: { [NAAM]: "Brücke Anfänger" } }) });
  });
  const t0 = Date.now();
  await p.goto(origin + "/k/" + id + "?taal=de", { waitUntil: "commit" });
  await p.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 10000 });
  const zichtbaar = Date.now() - t0;
  assert.ok(zichtbaar < 3500, "kaart in beeld vóór de vertaling (na " + zichtbaar + " ms)");
  let s = await p.evaluate(() => ({ body: document.getElementById("wrap").innerText, lang: document.documentElement.lang,
    lb: document.getElementById("lightbox").getAttribute("aria-label"), sluit: document.getElementById("lbsluit").getAttribute("aria-label"),
    vraag: document.getElementById("vraagveld").getAttribute("aria-label"), weg: document.getElementById("ab_weg").getAttribute("aria-label") }));
  assert.equal(s.lang, "de");
  assert.doesNotMatch(s.body, /Jouw oefeningen|Hoe ging het vandaag/, "vaste teksten al Duits");
  assert.ok(s.body.includes(NAAM), "oefennaam voorlopig in het Nederlands");
  assert.equal(s.lb, "vergrößertes Übungsfoto");
  assert.equal(s.sluit, "Schließen");
  assert.equal(s.weg, "Schließen");
  assert.match(s.vraag, /Frage zu deinen Übungen/);

  // vergroting openen vóór de vertaling binnen is: de late vertaling mag hem niet afbreken
  const foto = p.locator(".oef img[data-uitleg]").first();
  await foto.click();
  await p.waitForSelector("body.sessie .oef.actief img", { timeout: 8000 });
  await foto.click();
  await p.waitForSelector("#lightbox.open", { timeout: 8000 });
  const html0 = await p.evaluate(() => document.getElementById("oefs").innerHTML.length);
  const nogVoor = Date.now() - t0;
  assert.ok(nogVoor < 4000, "vergroting open vóór de vertaling (" + nogVoor + " ms)");
  await wacht(4800 - nogVoor); // vertaling is nu binnen
  s = await p.evaluate(() => ({ open: document.getElementById("lightbox").classList.contains("open"),
    body: document.getElementById("oefs").innerText }));
  assert.ok(s.open, "vergroting blijft open als de vertaling binnenkomt");
  assert.ok(s.body.includes(NAAM), "geen hertekening onder de open vergroting");
  // sluiten: daarna komt de vertaling erin
  await p.click("#lbsluit");
  await p.waitForFunction((n) => document.getElementById("oefs").innerText.includes(n), "Brücke Anfänger", { timeout: 6000 });
  s = await p.evaluate(() => ({ sessie: document.body.classList.contains("sessie") }));
  assert.ok(s.sessie, "oefenstand blijft na het hertekenen");
  void html0;
  await ctx.close();

  // Nederlandse kaart: geen vertaalverzoek en Nederlandse labels
  const nl = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "nl-NL", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.31.201" } });
  const pn = await nl.newPage();
  let vert = 0;
  await pn.route(/\/api\/kaart\/vertaal/, (r) => { vert++; return r.continue(); });
  await pn.goto(origin + "/k/" + id + "?taal=nl");
  await pn.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 10000 });
  assert.equal(vert, 0, "geen vertaalverzoek voor Nederlands");
  assert.equal(await pn.getAttribute("#lbsluit", "aria-label"), "Sluiten");
  await nl.close();
  console.log("vertaling laat: ok (kaart in beeld na " + zichtbaar + " ms)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
