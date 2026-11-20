// Gebruikers-sweep 2026-11-18 22u (Truus, iPhone SE): zonder internet getikt (pijn 8, "Ik heb vandaag geoefend", herstel,
// "Ik heb een vraag", een oefening gedaan), intussen zet de praktijk de kaart in de prullenbak. Bij weer online zei de kaart
// "Niet aangekomen", maar pijn 8 met de pijnnudge, de dag, herstel, de vraagknop en het vinkje bleven allemaal aan, direct
// onder de rode melding. Nu gaat elke tik die niet aankwam terug. En een seintje met internet op een gestopte kaart (404)
// zei "probeer het zo opnieuw"; nu de vaste melding "Niet aangekomen".
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:wachtterug`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /else if\(!weg\)\{kwijt\+\+;draaiKwijtTerug\(it,r\.status\);\}/, "niet aangekomen tik gaat terug");
assert.match(k, /function draaiKwijtTerug\(it,status\)\{/, "hulpfunctie");
assert.match(k, /else if\(d&&d\.kwijt\)\{zetSeinOpen\(null\);delete SEIN_LAATST\[soort\];zetDank\(dank,trw\('kwijt'\),'fout'(,true)?\);\}/, "seintje op gestopte kaart: vaste melding");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("wacht terug: ok (bron)"); process.exit(0); }

const ID = "0e5a0e5a7531";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wachtterug-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio wachtterug": { truus: { id: ID, praktijk: "Fysio Wachtterug", naam: "Truus",
  ts: Date.now(), chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }], rows: {}, cells: {}, vids: {} } } }));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const tot = async (page, fn, wat) => { for (let i = 0; i < 100; i++) { if (await page.evaluate(fn)) return; await wacht(50); } throw new Error("niet gezien: " + wat); };
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], deviceScaleFactor: 1, locale: "nl-NL", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.6.18.2" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  let modus = "online";
  await page.route(/\/api\/kaart\/(meting|gedaan|ervaring|seintje|oefening)$/, (r) => modus === "offline" ? r.abort("internetdisconnected")
    : modus === "404" ? r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, fout: "Kaart niet gevonden." }) })
    : r.continue());
  await page.goto(origin + "/k/" + ID);
  await page.waitForSelector('#mschaal button[data-score="8"]', { state: "attached", timeout: 15000 });
  await page.waitForSelector('#oefs .oefdone[data-idx="0"]', { state: "attached", timeout: 15000 });
  const stand = () => page.evaluate(() => ({
    pijn: !!document.querySelector('#mschaal button.aan'),
    nudge: getComputedStyle(document.getElementById("mnudge")).display !== "none",
    dag: document.getElementById("gdaan").getAttribute("aria-pressed") === "true",
    herstel: !!document.querySelector('#hsknoppen .sbtn.aan'),
    vraag: document.querySelector('#sknoppen .sbtn[data-soort="vraag"]').getAttribute("aria-pressed") === "true",
    oef: document.querySelector('#oefs .oefdone[data-idx="0"]').getAttribute("aria-pressed") === "true"
      || document.querySelector('#oefs .oefdone[data-idx="0"]').classList.contains("aan")
  }));

  // offline tikken: alles staat meteen aan
  modus = "offline";
  await page.evaluate(() => document.querySelector('#mschaal button[data-score="8"]').click());
  await tot(page, () => !!document.querySelector('#mschaal button.aan'), "pijn 8 aan");
  await page.evaluate(() => document.getElementById("gdaan").click());
  await tot(page, () => document.getElementById("gdaan").getAttribute("aria-pressed") === "true", "dag aan");
  await page.evaluate(() => document.querySelector('#hsknoppen .sbtn[data-hs="-1"]').click());
  await page.evaluate(() => document.querySelector('#sknoppen .sbtn[data-soort="vraag"]').click());
  await page.evaluate(() => document.querySelector('#oefs .oefdone[data-idx="0"]').click());
  await tot(page, () => Object.keys(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((x) => /wacht/.test(x)) || "{}") || "{}")).length >= 5, "5 in de wachtrij");
  const voor = await stand();
  assert.deepEqual(voor, { pijn: true, nudge: true, dag: true, herstel: true, vraag: true, oef: true }, "offline alles aan: " + JSON.stringify(voor));

  // kaart intussen gestopt: alles komt terug met 404
  modus = "404";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await tot(page, () => document.getElementById("wachtrij").classList.contains("fout"), "niet aangekomen");
  const na = await stand();
  assert.deepEqual(na, { pijn: false, nudge: false, dag: false, herstel: false, vraag: false, oef: false }, "na Niet aangekomen alles terug: " + JSON.stringify(na));

  // met internet een seintje op de gestopte kaart: de vaste melding, niet "probeer het zo opnieuw"
  await page.evaluate(() => document.querySelector('#sknoppen .sbtn[data-soort="pijn"]').click());
  // wacht op het antwoord van de server: "Niet aangekomen" stond al in #sdank van de wachtrij hierboven, dus
  // alleen op de tekst wachten liet de controle soms vóór het antwoord lopen (sweep 2026-11-19 22u)
  await tot(page, () => document.getElementById("sdank").classList.contains("fout") && /Niet aangekomen/.test(document.getElementById("sdank").textContent)
    && !document.querySelector('#sknoppen .sbtn[data-soort="pijn"]').dataset.bezig, "seintje 404");
  assert.equal(await page.evaluate(() => document.querySelector('#sknoppen .sbtn[data-soort="pijn"]').getAttribute("aria-pressed")), "false");
  assert.deepEqual(fouten, []);
  await ctx.close();
  console.log("wacht terug: ok (tikken die niet aankwamen gaan terug, seintje op gestopte kaart zegt het)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
