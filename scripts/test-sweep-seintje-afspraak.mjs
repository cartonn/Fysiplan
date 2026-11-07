// Gebruikers-sweep 2026-11-07 14u, open punten uit docs/routine-backlog.md:
// 1. Seintje "heeft een vraag": één klik + Enter handelde de vraag stil af (prompt(), leeg = afhandelen).
//    Nu een eigen venster; Enter of "Beantwoorden" zonder tekst handelt niets af.
// 2. Afspraak: na een geweigerde afspraak bleef de fouttekst voorgoed op de knop "Bewaar"
//    (de knoptekst werd bij elke klik opnieuw gelezen), en een dubbelklik op "+1 week"
//    verzette de afspraak twee weken.
// 3. Hoge vensters (Kaarten na beveiligen) passen in het scherm: .modal scrolt zelf.
// 4. /k?taal=__proto__ (of constructor, toString) maakte de kaart leeg en bleef via fp_taal
//    ook elke latere gewone QR-scan leeg (Jayden, Pixel 7 en iPhone 14).
// Statisch deel draait altijd (CI heeft geen browser); het browserdeel alleen met Playwright.
// `npm run test:seintje`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");

// ---- statisch ----
const sein = idx.match(/var sn=e\.target\.closest\('\[data-sein\]'\);[\s\S]*?\n      return;\n    \}/);
assert.ok(sein, "seintje-handler gevonden");
assert.doesNotMatch(sein[0], /prompt\(/, "seintje niet meer via prompt() (leeg + Enter = stil afhandelen)");
assert.match(idx, /function openSeinVenster\(/);
const afs = idx.match(/var af=e\.target\.closest\('\[data-safspraakopslaan\]'\);[\s\S]*?\n      return;\n    \}/);
assert.ok(afs, "afspraak-handler gevonden");
assert.match(afs[0], /dataset\.label/, "knoptekst één keer onthouden");
assert.match(afs[0], /dataset\.bezig/, "bezig-slot tegen dubbelklik");
assert.match(idx, /\.modal\{[^}]*max-height:[^}]*overflow-y:auto/, "hoge vensters scrollen binnen het scherm");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.doesNotMatch(kaartHtml, /if\(\w+&&T\[\w+\]\)|if\(T\[\w+\]\)|=T\[\w+\]\?/, "taalcode niet met T[x] controleren (erft van Object.prototype)");
assert.match(kaartHtml, /function isTaal\(x\)\{[^}]*hasOwnProperty/);

// ---- browser ----
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-seintje-afspraak: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-seintje-"));
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
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = "Fysio Seintje";
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wachtwoord-seintje-test", akkoord: true });
    assert.equal(claim.status, 200);
    const sessie = (await claim.json()).sessie;
    const S = { "x-praktijk-sessie": sessie };
    const r = await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
    assert.equal(r.status, 200);
    const { id } = await r.json();
    assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);
    const kaart = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json()).find((k) => k.id === id);
    assert.ok((await kaart()).seintje, "seintje staat klaar");

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.9.1" } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    page.on("dialog", (d) => { fouten.push("onverwacht venster: " + d.message()); d.dismiss(); });
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#kaartenBtn");
    await page.waitForSelector(`[data-sein='${id}']`, { state: "visible", timeout: 8000 });

    // 1. klik + Enter: venster open, niets afgehandeld
    await page.click(`[data-sein='${id}']`);
    await page.waitForSelector("#ovSein.on", { timeout: 4000 });
    await page.keyboard.press("Enter");
    await page.click("#sn_ok");
    await wacht(400);
    assert.match(await page.textContent("#sn_fout"), /Typ eerst een antwoord/);
    assert.ok((await kaart()).seintje, "vraag niet stil afgehandeld na Enter / lege Beantwoorden");
    // beantwoorden met tekst
    await page.fill("#sn_tekst", "Zak tot 90 graden, niet dieper.");
    await page.click("#sn_ok");
    await page.waitForFunction(() => !document.querySelector("#ovSein.on"), null, { timeout: 4000 });
    const na = await kaart();
    assert.ok(!na.seintje, "seintje afgehandeld na antwoord");
    assert.equal(na.antwoord && na.antwoord.tekst, "Zak tot 90 graden, niet dieper.");

    // 2. afspraak: geweigerde tijd → fouttekst verdwijnt weer, label blijft "Bewaar"
    await page.waitForSelector(`[data-sdeel='${id}']`, { state: "visible", timeout: 8000 });
    await page.click(`[data-sdeel='${id}']`);
    await page.waitForSelector(`[data-safspraakopslaan='${id}']`, { state: "visible", timeout: 8000 });
    const knop = page.locator(`[data-safspraakopslaan='${id}']`);
    const label = (await knop.textContent()).trim();
    await page.evaluate((i) => { document.querySelector(`[data-safspraak='${i}']`).value = "2099-01-01T10:00"; }, id);
    await knop.click();
    await page.waitForFunction((l) => document.querySelector("[data-safspraakopslaan]").textContent.trim() !== l, label, { timeout: 4000 });
    await page.evaluate((i) => { document.querySelector(`[data-safspraak='${i}']`).value = ""; }, id);
    await knop.click(); // tweede klik terwijl de fouttekst er nog staat
    await page.waitForFunction((l) => document.querySelector("[data-safspraakopslaan]").textContent.trim() === l, label, { timeout: 6000 });
    await wacht(4200);
    assert.equal((await knop.textContent()).trim(), label, "knop krijgt zijn eigen tekst terug, niet de fouttekst");

    // dubbelklik op "+1 week": precies één week
    const voor = Date.now();
    await page.locator(`[data-safweek='${id}']`).dblclick();
    await wacht(1500);
    const af = (await kaart()).afspraak;
    assert.ok(af && af.t, "afspraak bewaard: " + JSON.stringify(af));
    const dagen = (af.t - voor) / 864e5;
    assert.ok(dagen > 6.9 && dagen < 7.1, "dubbelklik = één week, niet twee (" + dagen.toFixed(2) + " dagen)");

    // 3. hoog venster past in 800 px
    const h = await page.evaluate(() => { const m = document.querySelector("#ovKaarten .modal"); return m ? m.getBoundingClientRect().height : 0; });
    assert.ok(h > 0 && h <= 800, "Kaarten-venster past in het scherm (" + h + " px)");

    assert.deepEqual(fouten, []);

    // 4. rare taal in de link: kaart blijft leesbaar, ook bij de volgende gewone scan
    const pctx = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.9.2" } });
    const pp = await pctx.newPage();
    for (const taal of ["__proto__", "constructor", "toString"]) {
      await pp.goto(origin + "/k/" + id + "?taal=" + taal);
      await pp.waitForFunction(() => /Squat/i.test(document.body.innerText), null, { timeout: 8000 });
      await pp.goto(origin + "/k/" + id);
      await pp.waitForFunction(() => /Squat/i.test(document.body.innerText), null, { timeout: 8000 });
    }
    // een al vergiftigde fp_taal (van vóór de fix) herstelt zichzelf
    await pp.evaluate(() => localStorage.setItem("fp_taal", "__proto__"));
    await pp.goto(origin + "/k/" + id);
    await pp.waitForFunction(() => /Squat/i.test(document.body.innerText), null, { timeout: 8000 });
    assert.equal(await pp.evaluate(() => localStorage.getItem("fp_taal")), null);
    await pctx.close();
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
console.log("test-sweep-seintje-afspraak: OK");
