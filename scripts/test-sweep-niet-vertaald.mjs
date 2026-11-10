// Gebruikers-sweep 2026-11-09 (Truus, iPhone SE, de/tr): mislukte de vertaling van een kaart, dan verving
// de bewegingsdemo de echte oefenuitleg door twee algemene zinnen ("Rustig van begin- naar eindhouding…"),
// zonder melding; halters, hoogte en houding vielen weg. En de lege vertaling bleef bewaard, dus geen nieuwe
// poging. Nu blijft de echte uitleg in het Nederlands staan (lang="nl") met een korte melding in de taal
// van de patiënt, en een mislukte vertaling wordt niet bewaard.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:nietvertaald`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.doesNotMatch(k, /if\(eigenUitleg&&TAAL!=='nl'&&vt\(eigenUitleg\)===eigenUitleg\)eigenUitleg='';/, "demo wist de echte uitleg niet meer");
assert.doesNotMatch(k, /VERT\[taal\]=teksten\|\|\{\}/, "mislukte vertaling wordt niet bewaard");
assert.match(k, /function uitlegNietVertaald\(s\)/, "hulpfunctie bestaat");
assert.match(k, /demo\.introTekst=[^\n]*uitlegNl\?/, "niet-vertaalde uitleg niet met een andere stem voorlezen");
const talen = ["en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
for (const t of talen) assert.match(k, new RegExp("NIET_VERTAALD=\\{[^}]*" + t + ":'[^']{10,}"), "melding in " + t);

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("niet vertaald: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-nietvert-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.8." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Vertaal";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "vertaal-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "de-DE", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.8.200" } });
  const p = await ctx.newPage();
  let vertaal = 0;
  await p.route(/\/api\/kaart\/vertaal/, (r) => { vertaal++; return r.fulfill({ status: 503, headers: { "content-type": "application/json" }, body: '{"ok":false}' }); });
  await p.goto(origin + "/k/" + id + "?taal=de");
  const foto = p.locator(".oef img[data-uitleg]").first();
  await foto.waitFor({ timeout: 15000 });
  const nl = await foto.getAttribute("data-uitleg");
  assert.ok(nl && nl.length > 20, "oefening heeft een echte uitleg");
  // eerste tik opent de oefening, een tik op het grote beeld daarna de vergroting
  await foto.click();
  await p.waitForSelector("body.sessie .oef.actief img", { timeout: 8000 });
  await foto.click();
  await p.waitForSelector("#lightbox.open", { timeout: 8000 });
  // de demo start vanzelf als de foto te splitsen is; anders staat de uitleg onder de foto
  await wacht(800);
  const r = await p.evaluate(() => {
    const demo = document.getElementById("lbdemouitleg");
    const lu = document.getElementById("lbuitleg");
    const el = demo && !demo.closest("[hidden]") ? demo : lu;
    const span = el.querySelector('[lang="nl"]');
    return { tekst: el.textContent, nl: span ? span.textContent : "", noot: (el.querySelector(".nietvertaald") || {}).textContent || "" };
  });
  assert.ok(r.nl.includes(nl.slice(0, 30)), "echte uitleg staat er (in het Nederlands, lang=nl): " + r.tekst);
  assert.doesNotMatch(r.tekst, /Beweeg rustig van de beginhouding/, "geen algemene zinnen in plaats van de uitleg");
  assert.match(r.noot, /Niederländisch/, "melding in het Duits: " + r.noot);
  assert.ok(vertaal >= 1, "vertaling is geprobeerd");
  console.log("niet vertaald: ok (echte uitleg in het Nederlands met melding, geen algemene zinnen)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
