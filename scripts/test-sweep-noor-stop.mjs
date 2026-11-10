// Gebruikers-sweep 2026-11-09 (Truus, 72, iPhone SE): "Luister naar deze oefening" bij een oefening werd
// geen stopknop. Een tweede tik begon de uitleg opnieuw; alleen de knop bovenaan werd "Stop" en die
// stond buiten beeld. Meldingen ("Nog geen actuele stemopname …", "kon niet worden afgespeeld")
// kwamen als alert(), een blokkerend venster.
// Nu: de knop bij de oefening heet tijdens het luisteren "Stop" (aria-pressed=true) en een tweede tik
// stopt de stem; meldingen staan op de pagina (#noorMelding, role=status) bij de knop die ze gaf.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:noorstop`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { exerciseId } from "../lib/exercise-id.js";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /id="noorMelding" role="status" aria-live="polite" hidden/, "meldingsvak voor Noor bestaat");
assert.match(k, /if\(bezigLezen&&noorBron===ni\)\{stopLezen\(\);return;\}/, "tweede tik op dezelfde knop stopt");
const noorDeel = k.slice(k.indexOf("  async function speelNoor("), k.indexOf("  // ---- als app"));
assert.ok(noorDeel.length > 1000, "Noor-deel gevonden");
assert.doesNotMatch(noorDeel.split("\n").filter((r) => !r.trim().startsWith("//")).join("\n"), /\balert\(/, "geen alert() meer bij het luisteren naar Noor");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("noor stop: ok"); process.exit(0); }

const lib = JSON.parse(await readFile(join(root, "public/oefeningen-v2.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "public/audio/noor/manifest.json"), "utf8"));
const review = JSON.parse(await readFile(join(root, "public/mobile-media-review.json"), "utf8"));
const tegen = new Set(review.entries.filter((r) => r.status === "rejected" || r.presentation === "withhold").map((r) => r.name));
const heeft = (e) => manifest.clips.some((c) => c.name === e.naam && c.text === e.naam + ". " + e.uitleg);
const metOpname = lib.filter((e) => e.uitleg && heeft(e) && !tegen.has(e.naam)).slice(0, 2);
const zonder = lib.find((e) => e.uitleg && !heeft(e) && !tegen.has(e.naam) && e.kaartImg);
assert.equal(metOpname.length, 2, "twee oefeningen met een opname");
assert.ok(zonder, "een oefening zonder opname");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-noorstop-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.4." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Noor Stop";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "noor-stop-wachtwoord", akkoord: true })).json()).sessie;
  const chosen = [...metOpname, zonder].map((e) => ({ n: e.naam, id: exerciseId(e), i: 0 }));
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen, kaartId: "" },
    { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.4.200" } });
  // Geen echte geluidsweergave in de test: play() lukt en meldt 'playing', of mislukt op verzoek.
  await ctx.addInitScript(() => {
    window.__speelFout = false;
    HTMLMediaElement.prototype.play = function () {
      if (window.__speelFout) return Promise.reject(new Error("test"));
      setTimeout(() => this.dispatchEvent(new Event("playing")), 10);
      return Promise.resolve();
    };
  });
  const p = await ctx.newPage();
  const dialogen = [];
  p.on("dialog", (d) => { dialogen.push(d.message()); d.dismiss().catch(() => {}); });
  await p.goto(origin + "/k/" + id);
  // de stemknop staat bij de oefening zelf: eerst de oefening openen vanuit het overzicht
  await p.click('#oefs .oef[data-oidx="0"] .oefinfo', { timeout: 10000 });
  await p.waitForSelector('#oefs [data-noor="0"]', { timeout: 10000 });
  const stand = (i) => p.evaluate((i) => { const b = document.querySelector('#oefs [data-noor="' + i + '"]');
    return { t: b.textContent.trim(), a: b.getAttribute("aria-pressed") }; }, i);

  // 1) tik: de knop bij de oefening wordt Stop; tweede tik stopt
  await p.click('#oefs [data-noor="0"]');
  await p.waitForFunction(() => document.querySelector('#oefs [data-noor="0"]').textContent.trim() === "Stop", null, { timeout: 5000 });
  assert.deepEqual(await stand(0), { t: "Stop", a: "true" }, "tijdens het luisteren is de knop een stopknop");
  const knopMaat = await p.$eval('#oefs [data-noor="0"]', (b) => b.getBoundingClientRect().height);
  assert.ok(knopMaat >= 44, "stopknop minstens 44 px hoog: " + knopMaat);
  await p.click('#oefs [data-noor="0"]');
  await p.waitForFunction(() => document.querySelector('#oefs [data-noor="0"]').textContent.trim() === "Luister naar deze oefening", null, { timeout: 5000 });
  assert.deepEqual(await stand(0), { t: "Luister naar deze oefening", a: "false" }, "tweede tik stopt de stem");
  assert.equal(await p.evaluate(() => document.getElementById("leesBtn").classList.contains("aan")), false, "ook de knop bovenaan staat weer op luisteren");

  // 2) door naar de volgende oefening terwijl de eerste praat: de stem stopt, en bij de
  //    volgende oefening heet alleen de nieuwe knop Stop
  await p.click('#oefs [data-noor="0"]');
  await p.waitForFunction(() => document.querySelector('#oefs [data-noor="0"]').textContent.trim() === "Stop");
  await p.click("#svolgende");
  await p.waitForFunction(() => document.querySelector('#oefs [data-noor="0"]').textContent.trim() === "Luister naar deze oefening", null, { timeout: 5000 });
  assert.deepEqual(await stand(0), { t: "Luister naar deze oefening", a: "false" }, "doorgaan stopt de stem van de vorige oefening");
  await p.click('#oefs [data-noor="1"]');
  await p.waitForFunction(() => document.querySelector('#oefs [data-noor="1"]').textContent.trim() === "Stop");
  assert.deepEqual(await stand(0), { t: "Luister naar deze oefening", a: "false" }, "de vorige knop gaat terug");
  await p.click('#oefs [data-noor="1"]');
  await p.waitForFunction(() => document.querySelector('#oefs [data-noor="1"]').textContent.trim() === "Luister naar deze oefening");
  await p.click("#svorige");

  // 3) afspelen mislukt: melding op de pagina bij deze oefening, geen alert, knop terug
  await p.evaluate(() => { window.__speelFout = true; });
  await p.click('#oefs [data-noor="0"]');
  await p.waitForFunction(() => !document.getElementById("noorMelding").hidden, null, { timeout: 5000 });
  let m = await p.evaluate(() => { const el = document.getElementById("noorMelding");
    return { t: el.textContent, bijOefening: !!el.closest(".oef") && el.closest(".oef").contains(document.querySelector('#oefs [data-noor="0"]')) }; });
  assert.match(m.t, /kon niet worden afgespeeld/, "melding zegt wat er misging");
  assert.ok(m.bijOefening, "melding staat bij de oefening die werd aangetikt");
  assert.deepEqual(await stand(0), { t: "Luister naar deze oefening", a: "false" }, "na een fout geen hangende Stop");
  await p.evaluate(() => { window.__speelFout = false; });

  // 4) knop bovenaan met een oefening zonder opname: melding bovenaan op de pagina, geen alert
  await p.click("#sterug");
  await p.waitForFunction(() => !document.body.classList.contains("sessie"));
  await p.evaluate(() => { const b = document.getElementById("leesBtn"); b.style.display = ""; b.click(); });
  await p.waitForFunction(() => /Nog geen actuele stemopname/.test(document.getElementById("noorMelding").textContent), null, { timeout: 5000 });
  m = await p.evaluate(() => ({ inOef: !!document.getElementById("noorMelding").closest("#oefs"),
    breed: document.documentElement.scrollWidth <= window.innerWidth }));
  assert.equal(m.inOef, false, "melding van de knop bovenaan staat bovenaan");
  assert.ok(m.breed, "melding past op 320 px");
  await p.evaluate(() => document.getElementById("leesBtn").click());

  assert.deepEqual(dialogen, [], "geen alert()-vensters: " + dialogen.join(" | "));
  await ctx.close();
  console.log("noor stop: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
}
