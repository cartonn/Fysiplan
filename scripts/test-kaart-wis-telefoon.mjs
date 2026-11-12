// Legal 2026-11-07 (rechten en code tegen tekst, patiëntkant /k):
// - "Wis deze kaart van mijn telefoon" wist alles van deze kaart én de voorkeuren die
//   /privacy noemt (taal, lettergrootte, stem); andere kaarten op dezelfde telefoon blijven.
// - Staat er nog iets in de wachtrij (zonder internet aangetikt), dan waarschuwt de vraag.
// - Na wissen opent herladen de kaart niet stil opnieuw (adres wordt /k?gewist=1).
// - De privacyzin belooft niet "alleen je voornaam" of "verdwijnt na je behandeling".
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat.
// `node scripts/test-kaart-wis-telefoon.mjs`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = process.cwd();
const TALEN = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const lees = (naam) => vm.runInNewContext("(" + html.match(new RegExp("var " + naam + "=(\\{[\\s\\S]*?\\n?\\});\\n"))[1] + ")");
const TMG = lees("TMG"), TPRIV = lees("TPRIV");
for (const t of TALEN) {
  assert.match(TMG[t].wacht || "", /\{n\}/, "waarschuwing niet-verstuurd: " + t);
  assert.ok(TMG[t].gewist.length > 80, "gewist-tekst noemt praktijk en beginscherm: " + t);
}
assert.doesNotMatch(TPRIV.nl.b, /alleen je voornaam|verdwijnt de kaart vanzelf/, "privacyzin belooft niet te veel");
assert.match(TPRIV.nl.b, /fysiotherapeut erbij schreef/);
assert.match(TMG.nl.l1, /fysiotherapeut erbij schreef/, "Mijn gegevens noemt ook doel en opmerking");
assert.doesNotMatch(html, /\.privregel\{[^}]*color:var\(--zacht\)/, "privacyregel met leesbaar contrast");
assert.match(html, /replaceState\(null,'','\/k\?gewist=1'(\+\(TAAL!=='nl'\?'&taal='\+encodeURIComponent\(TAAL\):''\))?\)/);
// Legal 2026-11-09: ook de oefenbeelden van deze kaart uit de offline-cache, en de hele
// cache als er geen andere kaart op de telefoon staat.
assert.match(html, /wisOfflineKopie\(\)\.then\(klaar,klaar\)/, "wissen gebruikt wisOfflineKopie");
assert.match(html, /if\(!Object\.keys\(andereIds\)\.length\)return caches\.delete\(n\)/, "geen andere kaart: hele cache weg");
assert.match(html, /beelden\[u\.pathname\]/, "beelden van deze kaart gaan mee");
console.log("test-kaart-wis-telefoon: statisch OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-wis-telefoon: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wistel-"));
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
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra }, body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const P = "Fysio Wistelefoon";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wis-telefoon-ww", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    assert.ok(id);
    const ctx = await browser.newContext({ ...pw.devices["iPhone 13"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.1" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    await page.evaluate((i) => {
      localStorage.setItem("fp_taal", "nl"); localStorage.setItem("fp_groot", "1"); localStorage.setItem("fp_stem_nl-NL", "x");
      localStorage.setItem("fp_wacht_" + i, JSON.stringify({ a: { pad: "/api/kaart/meting", body: {} } }));
      localStorage.setItem("fp_oefdaan_ander12345678", "{}");
    }, id);
    // offline-cache gevuld (service worker) plus een gedeeld plaatje en de bibliotheek. Met
    // evaluate in een lus: waitForFunction wacht niet op een async functie (de Promise zelf
    // telt al als waar).
    let gevuld = false;
    for (let n = 0; n < 60 && !gevuld; n++) {
      gevuld = await page.evaluate(async (i) => { for (const naam of await caches.keys()) { const c = await caches.open(naam); if (await c.match("/k/" + i)) return true; } return false; }, id);
      if (!gevuld) await wacht(250);
    }
    assert.ok(gevuld, "de service worker bewaart de kaart na het eerste bezoek");
    await page.evaluate(async () => { const c = await caches.open("fysiplan-kaart-v2"); await c.put("/oefeningen.json", new Response("[]")); await c.put("/beelden/test-oefening.png", new Response("x")); });
    let vraag = "";
    page.once("dialog", (d) => { vraag = d.message(); d.accept(); });
    await page.click("#mgblok summary");
    await page.click("#mg_wis");
    await page.waitForSelector("#mg_weg", { state: "visible", timeout: 5000 });
    assert.match(vraag, /1 keer aangetikt zonder internet is nog niet verstuurd/, "waarschuwing over de wachtrij");
    const over = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fp_")).sort());
    assert.deepEqual(over, ["fp_oefdaan_ander12345678"], "alleen de andere kaart blijft");
    assert.match(page.url(), /\/k\?gewist=1$/);
    const restCache = await page.evaluate(async () => { const uit = []; for (const n of await caches.keys()) { const c = await caches.open(n); for (const r of await c.keys()) uit.push(r.url); } return uit; });
    assert.deepEqual(restCache, [], "geen andere kaart: niets meer in de offline-cache (ook geen beelden of bibliotheek)");
    await page.reload();
    await page.waitForSelector("#mg_weg", { state: "visible", timeout: 5000 });
    assert.equal(await page.isVisible("#wrap"), false, "herladen opent de kaart niet opnieuw");
    assert.match(await page.textContent("#mg_weg"), /beginscherm/);
    assert.deepEqual(fouten, []);
  } catch (e) { console.error(uit.slice(-2000)); throw e; }
  finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
}
console.log("test-kaart-wis-telefoon: OK");
