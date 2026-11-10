// Regressietest gebruikers-sweep 2026-11-10 22u:
// 1. (Truus, iPhone SE; Jayden, Pixel 7) "Te zwaar?" zonder internet zei meteen "Doorgegeven ✓",
//    terwijl de melding alleen in de wachtrij stond. Nu: "Opgeslagen op je telefoon…" tot hij echt aankomt.
// 2. (Truus) Na "Wis deze kaart van mijn telefoon" schreef pagehide fp_beelden_<id> terug in
//    localStorage; dat id is de toegang tot de kaart.
// 3. (Jayden, Engelse kaart) de stemkiezer stond in het Nederlands ("Stem", "Automatisch").
// 4. (Sanne, desktop) "Nieuw in Fysiplan" met Escape gesloten kwam bij elke keer laden terug.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:zwaaroffline`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const blok = html.match(/var oz=e\.target\.closest\('\.oefzwaar'\);[\s\S]*?\n        return;\n      \}/);
assert.ok(blok, "te-zwaar-handler gevonden");
assert.match(blok[0], /zetInWacht\('\/api\/kaart\/oefzwaar'[^)]*\);return \{ok:true,wacht:true\}/, "offline: in de wachtrij, gemarkeerd als wacht");
const teken = html.match(/function tekenZwaar\(\)\{([\s\S]*?)\n  \}/);
assert.ok(teken && /trw\('een'\)/.test(teken[1]), "tekenZwaar toont de wachtrijtekst zolang de melding niet verstuurd is");
assert.match(html, /function bewaarBeeldenLijst\(\)\{\n    if\(!id\|\|KAART_GEWIST\)return;/, "na wissen schrijft bewaarBeeldenLijst niets terug");
assert.match(html, /if\(!window\.confirm\(vraag\)\)return;\n    KAART_GEWIST=true;/, "wisVanTelefoon zet KAART_GEWIST");
assert.doesNotMatch(html, /new Option\('Automatisch',''\)/, "stemkiezer niet vast in het Nederlands");
const notes = await readFile(join(root, "public/release-notes.js"), "utf8");
assert.match(notes, /dialog\.addEventListener\('close',function\(\)\{try\{localStorage\.setItem\(key,version\)/, "'Nieuw in Fysiplan' sluiten met Escape telt als gezien");
console.log("test-kaart-zwaar-offline (statisch): te zwaar offline in de wachtrij, wissen schrijft niets terug, stemkiezer vertaald");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-zwaar-offline: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const ID = "b7c8d9e0f1a2";
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-zwaaroffline-"));
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
    "fysio offline": {
      "truus": { id: ID, praktijk: "Fysio Offline", naam: "Truus", ts: Date.now(),
        chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }], rows: {}, cells: {}, vids: {} }
    }
  }));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    browser = await pw.chromium.launch();
    const fouten = [];

    // ---- 1. te zwaar zonder internet ----
    const c = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.64.0.1" } });
    const p = await c.newPage();
    p.on("pageerror", (e) => fouten.push(e.message));
    let offline = true, aangekomen = 0;
    await p.route("**/api/kaart/oefzwaar", (r) => {
      if (offline) return r.abort("internetdisconnected");
      aangekomen++; return r.continue();
    });
    await p.goto(origin + "/k/" + ID, { waitUntil: "networkidle" });
    await p.click('#oefs .oef[data-oidx="0"] .oefinfo', { timeout: 15000 });
    const knop = "#oefs .oefzwaar[data-zidx='0']";
    await p.waitForSelector(knop, { timeout: 15000 });
    await p.click(knop);
    await p.waitForFunction((s) => /Opgeslagen op je telefoon/.test(document.querySelector(s).textContent), knop, { timeout: 5000 });
    assert.doesNotMatch(await p.textContent(knop), /Doorgegeven/, "offline zegt de knop niet 'Doorgegeven'");
    assert.equal(await p.isDisabled(knop), true, "geen tweede melding terwijl de eerste in de wachtrij staat");
    // herladen terwijl hij nog in de wachtrij staat: nog steeds de wachtrijtekst
    await p.reload({ waitUntil: "networkidle" });
    await p.click('#oefs .oef[data-oidx="0"] .oefinfo', { timeout: 15000 });
    await p.waitForFunction((s) => /Opgeslagen op je telefoon/.test(document.querySelector(s).textContent), knop, { timeout: 5000 });
    // weer internet: de wachtrij gaat mee en dan pas "Doorgegeven ✓"
    offline = false;
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await p.waitForFunction((s) => /Doorgegeven/.test(document.querySelector(s).textContent), knop, { timeout: 8000 });
    assert.equal(aangekomen, 1, "de melding kwam één keer aan bij de server");

    // ---- 2. wissen laat geen kaart-id achter ----
    p.on("dialog", (d) => d.accept());
    await p.evaluate(() => document.getElementById("mg_wis").click());
    await p.waitForSelector("#mg_weg", { timeout: 8000 });
    await p.goto(origin + "/privacy", { waitUntil: "load" });
    const over = await p.evaluate(() => Object.keys(localStorage).filter((s) => s.indexOf("fp_") === 0));
    assert.deepEqual(over.filter((s) => s.includes(ID)), [], "na wissen en weggaan geen sleutel met het kaart-id: " + JSON.stringify(over));
    await c.close();

    // ---- 3. stemkiezer in de taal van de kaart ----
    const c3 = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.64.0.3" } });
    const p3 = await c3.newPage();
    p3.on("pageerror", (e) => fouten.push(e.message));
    await p3.goto(origin + "/k/" + ID + "?taal=en", { waitUntil: "networkidle" });
    const stem = await p3.evaluate(() => ({ t: document.getElementById("stemtxt").textContent, a: document.getElementById("stemsel").getAttribute("aria-label"), o: document.getElementById("stemsel").options[0].text }));
    assert.deepEqual(stem, { t: "Voice", a: "Read-aloud voice", o: "Automatic" }, "stemkiezer Engels op een Engelse kaart");
    await c3.close();

    assert.deepEqual(fouten, [], "geen scriptfouten");
    console.log("test-kaart-zwaar-offline: te zwaar offline in de wachtrij en daarna doorgegeven; wissen laat geen kaart-id achter; stemkiezer Engels");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
