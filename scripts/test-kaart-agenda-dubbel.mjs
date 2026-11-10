// Regressietest gebruikers-sweep 2026-11-10 14u (Jayden, iPhone 14, Engelse kaart):
// - twee keer snel tikken op "Add to my calendar" gaf twee downloads van het .ics-bestand
//   (op iOS twee keer het toevoegscherm);
// Sweep 2026-11-10 18u (Truus, iPhone SE): twee tikken op hetzelfde seintje ("Ik heb een vraag", ±1 s uit elkaar)
//   gaven twee regels in het contactlogboek en dossier; nu stuurt een tweede tik binnen 30 s niets.
// - de afspraaktijd stond op een Engelse kaart in Amerikaans formaat ("02:25 PM").
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:agendadubbel`
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
const fn = html.match(/function naarAgenda\(url,knop,afspraak\)\{([\s\S]*?)\n  \}/);
assert.ok(fn, "naarAgenda bestaat");
assert.match(fn[1], /if\(knop\.dataset\.bezig\)return;/, "naarAgenda neemt één tik tegelijk aan");
assert.match(html, /toLocaleString\(SPRAAK\[TAAL\]\|\|'nl-NL',\{[^}]*hourCycle:'h23'\}/, "afspraaktijd met 24-uursklok in de taal van de kaart");
assert.doesNotMatch(html, /toLocaleString\(TAAL==='nl'\?'nl-NL':TAAL/, "geen kale taalcode (en = Amerikaans formaat)");
// zelfde formaat als de JS hieronder: Engels met en-GB en 24 uur
const voorbeeld = new Date(2026, 10, 13, 14, 25).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
assert.match(voorbeeld, /14:25/, "en-GB geeft 14:25: " + voorbeeld);
assert.match(html, /if\(SEIN_LAATST\[soort\]&&nu-SEIN_LAATST\[soort\]<30000\)/, "seintje: tweede tik binnen 30 s stuurt niets");
console.log("test-kaart-agenda-dubbel (statisch): één agenda-download per tik, tijd in 24 uur");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-agenda-dubbel: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-agdubbel-"));
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
    browser = await pw.chromium.launch();
    const c = await browser.newContext({ ...pw.devices["iPhone 14"], locale: "en-GB", serviceWorkers: "block", acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.63.0.1" } });
    const p = await c.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(e.message));
    let navs = 0;
    p.on("request", (r) => { if (r.url().includes("/api/kaart/agenda") && r.isNavigationRequest()) navs++; });
    await p.goto(origin + "/k/demo?taal=en", { waitUntil: "networkidle" });
    await p.waitForFunction(() => document.querySelectorAll("#agdagen button").length === 7);
    await p.evaluate(() => { const d = document.getElementById("agdagen").closest("details"); d.open = true; });
    await p.click("#agdagen button >> nth=0");
    // twee tikken vlak na elkaar, zoals een duim die twee keer raakt
    await p.evaluate(() => { const b = document.getElementById("agbtn"); b.click(); b.click(); });
    await wacht(1200);
    assert.equal(navs, 1, "twee tikken geven één agenda-download, niet " + navs);
    assert.deepEqual(fouten, [], "geen scriptfouten");
    await c.close();

    // seintjes: zelfde soort twee keer (dubbeltik én een tweede tik na een seconde) = één verzoek; andere soort wel
    const c2 = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.63.0.2" } });
    const p2 = await c2.newPage();
    p2.on("pageerror", (e) => fouten.push(e.message));
    const sein = [];
    await p2.route("**/api/kaart/seintje", async (r) => { sein.push(JSON.parse(r.request().postData() || "{}").soort); await wacht(150); await r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
    await p2.goto(origin + "/k/demo", { waitUntil: "networkidle" });
    await p2.waitForSelector("#sknoppen .sbtn", { state: "attached" });
    await p2.evaluate(() => { const d = document.getElementById("sknoppen").closest("details"); if (d) d.open = true; });
    const tik = (soort) => p2.evaluate((s) => document.querySelector('#sknoppen .sbtn[data-soort="' + s + '"]').click(), soort);
    await tik("vraag"); await tik("vraag");
    await wacht(1000);
    await tik("vraag");
    await wacht(400);
    assert.deepEqual(sein, ["vraag"], "drie tikken op 'Ik heb een vraag' binnen 30 s geven één seintje, niet " + JSON.stringify(sein));
    assert.match(await p2.textContent("#sdank"), /\S/, "de patiënt ziet na de extra tik wel de bevestiging");
    await tik("goed");
    await wacht(400);
    assert.deepEqual(sein, ["vraag", "goed"], "een ander seintje gaat wel");
    assert.deepEqual(fouten, [], "geen scriptfouten (seintjes)");
    await c2.close();
    console.log("test-kaart-agenda-dubbel: hetzelfde seintje twee keer tikken geeft één seintje (iPhone SE)");
    console.log("test-kaart-agenda-dubbel: dubbeltik op de agendaknop geeft één download (iPhone 14, Engels)");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
