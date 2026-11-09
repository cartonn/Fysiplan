// Gebruikers-sweep 2026-11-09 14u (Jayden, iPhone 14): snel tikken op de pijnscore zette de schrijfrem
// (40 per 5 minuten per IP) vol. Daarna gingen "gedaan" per oefening en "Ik heb vandaag geoefend" stil
// verloren: de kaart toonde het vinkje, de server gaf 429 en de therapeut zag niets.
// Nu gaat een tik bij 429 of 5xx in de wachtrij op de telefoon, met een eerlijke melding ("even druk"),
// en wordt hij na de Retry-After vanzelf opnieuw verstuurd.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaartdruk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
const stuur = k.slice(k.indexOf("  function stuur(pad,body){"), k.indexOf("  var WACHT_VELD="));
assert.match(stuur, /r\.status===429\|\|r\.status>=500/, "stuur zet 429/5xx in de wachtrij");
assert.match(stuur, /zetInWacht\(pad,body\);later\(/, "en plant een nieuwe poging");
const tw = k.match(/  var TWACHT=(\{.*\});/);
const TW = eval("(" + tw[1] + ")");
for (const taal of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) assert.ok(TW[taal].druk && TW[taal].drukN.includes("{n}"), "druk-melding in " + taal);

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("kaart druk: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartdruk-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.5." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Druk";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "druk-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay", client: { c_naam: "Jay" },
    chosen: [{ n: "Mobilisatie rotatie rug", id: "fp_f17c3675b48db1ae", i: 0 }, { n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }],
    kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");
  const serverKaart = async () => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json()).kaart;

  const ctx = await browser.newContext({ ...pw.devices["iPhone 14"], locale: "en-GB", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.5.200" } });
  const p = await ctx.newPage();
  // de rem nabootsen: de eerste keer elk van deze routes 429 met Retry-After 5
  const al = new Set();
  await p.route(/\/api\/kaart\/(gedaan|oefening)$/, async (r) => {
    const pad = new URL(r.request().url()).pathname;
    if (!al.has(pad)) { al.add(pad); return r.fulfill({ status: 429, headers: { "retry-after": "5", "content-type": "application/json" },
      body: JSON.stringify({ ok: false, fout: "Even te veel verzoeken achter elkaar; probeer het over een paar minuten opnieuw." }) }); }
    return r.continue();
  });
  await p.goto(origin + "/k/" + id + "?taal=en");
  await p.waitForSelector("#oefs .oefdone", { timeout: 15000 });

  await p.click("#oefs .oefdone");
  await p.click("#gdaan");
  // wachten tot beide tikken in de wachtrij staan (de tweede 429 kan net later binnenkomen)
  await p.waitForFunction(() => /busy right now/.test(document.getElementById("wachtrij").textContent || "") && /2 saved/.test(document.getElementById("wachtrij").textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const wachtrij = await p.evaluate(() => { const el = document.getElementById("wachtrij"); return { t: el.textContent, zicht: getComputedStyle(el).display !== "none" }; });
  assert.ok(wachtrij.zicht, "wachtrijmelding zichtbaar");
  assert.doesNotMatch(wachtrij.t, /once you are online/, "niet beweren dat er geen internet is: " + wachtrij.t);
  assert.match(wachtrij.t, /2 saved/, "beide tikken staan in de wachtrij: " + wachtrij.t);
  let kaart = await serverKaart();
  assert.equal((kaart.gedaan || []).length, 0, "nog niets op de server tijdens de rem");

  // na de Retry-After gaat de wachtrij vanzelf (zonder herladen of 'online'-gebeurtenis)
  for (let i = 0; i < 40; i++) { kaart = await serverKaart(); if ((kaart.gedaan || []).length) break; await wacht(500); }
  assert.equal((kaart.gedaan || []).length, 1, "geoefend komt alsnog bij de therapeut");
  await p.waitForFunction(() => /Sent to your physiotherapist/.test(document.getElementById("wachtrij").textContent || ""), null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((x) => /wacht/.test(x))) || "{}")).length), 0, "wachtrij leeg");
  await ctx.close();
  console.log("kaart druk: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
}
