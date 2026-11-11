// Regressietest gebruikers-sweep 2026-11-11 14u (/k, Truus, iPhone SE):
// "Ik heb vandaag geoefend" een tweede keer tikken zette de dag uit én wiste zonder vraag alle
// vinkjes per oefening van vandaag ("0 van 6"). Nu vraagt de kaart het eerst, in de taal van de patiënt;
// bij "Annuleren" blijft alles staan.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:daguitvraag`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const tg = html.slice(html.indexOf("  var TG={"), html.indexOf("function trg("));
for (const taal of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) {
  assert.match(tg, new RegExp("\\n    " + taal + ":\\{[^\\n]*uitvraag:'[^']*\\{n\\}"), "vraag vóór uitzetten in het " + taal);
}
assert.match(html, /if\(!wil\)\{var nDaan=leesOefDaan\(\)\.done\.length;\s*if\(nDaan>0&&!window\.confirm\(trg\('uitvraag'\)/, "uitzetten met vinkjes vraagt eerst");
const klik = html.indexOf("getElementById('gdaan').addEventListener('click'");
assert.ok(klik > -1 && html.indexOf("trg('uitvraag')", klik) > -1 && html.indexOf("trg('uitvraag')", klik) < html.indexOf("stuur('/api/kaart/gedaan'", klik), "de vraag komt vóór het versturen");
console.log("test-kaart-dag-uit-vraag (statisch): vraag in 9 talen, vóór het versturen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-dag-uit-vraag: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-daguit-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://localhost:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    let ip = 1;
    const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.64.1." + (ip++), ...extra }, body: JSON.stringify(body) });
    const P = "Fysio Daguit";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "daguit-wachtwoord", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
      chosen: [{ n: "Squat", i: 0 }, { n: "Lunge", i: 1 }, { n: "Brug", i: 2 }], kaartId: "" }, S)).json()).id;
    assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

    browser = await pw.chromium.launch();
    const c = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.64.0.1" } });
    const p = await c.newPage();
    const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
    const verzonden = [];
    p.on("request", (r) => { if (r.url().endsWith("/api/kaart/gedaan")) verzonden.push(JSON.parse(r.postData() || "{}").aan); });
    await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
    await p.waitForSelector("#gdaan");
    const vinkjes = () => p.evaluate(() => { try { return (JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("fp_oefdaan_"))) || "{}").done || []).length; } catch { return -1; } });
    // twee oefeningen afvinken in de lijst
    for (const i of [0, 1]) { await p.evaluate((i) => document.querySelector(".oefdone[data-idx='" + i + "']").click(), i); await wacht(760); }
    assert.equal(await vinkjes(), 2, "twee vinkjes staan");
    // de dag aanzetten (gebeurt vanzelf pas als alles gedaan is)
    if (await p.evaluate(() => document.getElementById("gdaan").getAttribute("aria-pressed")) !== "true") await p.evaluate(() => document.getElementById("gdaan").click());
    await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true" && !document.getElementById("gdaan").dataset.bezig);
    // dag uitzetten → vraag; Annuleren laat alles staan
    const vragen = [];
    p.once("dialog", (d) => { vragen.push(d.message()); d.dismiss(); });
    await p.evaluate(() => document.getElementById("gdaan").click());
    await wacht(400);
    assert.equal(vragen.length, 1, "er komt een vraag");
    assert.match(vragen[0], /2 oefening/, "de vraag noemt het aantal vinkjes");
    assert.equal(await p.evaluate(() => document.getElementById("gdaan").getAttribute("aria-pressed")), "true", "Annuleren: dag blijft aan");
    assert.equal(await vinkjes(), 2, "Annuleren: vinkjes blijven");
    assert.ok(!verzonden.includes(false), "Annuleren: niets naar de server");
    // OK → dag uit, vinkjes weg
    p.once("dialog", (d) => d.accept());
    await p.evaluate(() => document.getElementById("gdaan").click());
    await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "false");
    await wacht(300);
    assert.equal(await vinkjes(), 0, "OK: vinkjes weg");
    assert.ok(verzonden.includes(false), "OK: uit naar de server");
    // zonder vinkjes: geen vraag
    await p.evaluate(() => document.getElementById("gdaan").click());
    await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true");
    let extra = 0; p.on("dialog", (d) => { extra++; d.dismiss(); });
    await p.evaluate(() => document.getElementById("gdaan").click());
    await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "false");
    assert.equal(extra, 0, "zonder vinkjes gaat de dag zonder vraag uit");
    assert.deepEqual(fouten, [], "geen scriptfouten");
    await c.close();
    console.log("test-kaart-dag-uit-vraag (telefoon): ok");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
