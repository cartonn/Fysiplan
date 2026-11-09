// Gebruikers-sweep 2026-11-09 18u (Mark, iPad): na het aannemen van de uitnodiging moest de collega
// de praktijknaam zelf typen (algemeen welkom + Kaarten). Met een typfout ("Fysio Marktest.") toonde
// de app "nog niet beveiligd" en maakte Beveiligen stil een losse tweede praktijk zonder proef.
// Nu zet de knop "Open Fysiplan" de praktijknaam klaar (/v2/app?praktijk=…), het algemene welkom
// blijft dicht en het inlogformulier met e-mail staat open.
// Zonder browser het serverdeel (CI); het browserdeel alleen waar Playwright staat. `npm run test:uitnodigingpraktijk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /owq&&owq\.classList\.contains\('on'\)\)closeOv\('ovWelkom'\)/, "?praktijk= sluit het algemene welkom");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitnpr-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.7." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.7.8." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Marktest & Co";
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true })).json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Mark", email: "mark@example.org", wachtwoord: "mark-wachtwoord", regels: true }, G);
  const S = { "x-praktijk-sessie": (await eigen.json()).sessie };
  const { link } = await (await post("/api/praktijk/team/uitnodigen", { email: "bram@example.org", naam: "Bram", rol: "therapeut" }, S)).json();
  const token = new URL(link).searchParams.get("t");
  const klaar = await formulier("/v2/uitnodiging", { t: token, naam: "Bram C.", wachtwoord: "bram-wachtwoord", regels: "1" });
  assert.equal(klaar.status, 200);
  const html = await klaar.text();
  const href = (html.match(/<a class="knop oranje" href="([^"]+)">Open Fysiplan<\/a>/) || [])[1];
  assert.ok(href, "knop Open Fysiplan");
  const doel = new URL(href.replace(/&amp;/g, "&"), origin);
  assert.equal(doel.pathname, "/v2/app");
  assert.equal(doel.searchParams.get("praktijk"), P, "praktijknaam staat in de link: " + href);
  assert.match(html, /staat dan al ingevuld/);
  assert.doesNotMatch(html, /bram-wachtwoord/);

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch {}
  if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("uitnodiging praktijk: ok"); process.exit(0); }
  browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ ...pw.devices["iPad (gen 7)"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.7.250" } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} });
  const p = await ctx.newPage();
  const fouten = [];
  p.on("pageerror", (e) => fouten.push(String(e)));
  await p.goto(doel.href);
  await p.waitForSelector("#ps_email", { state: "visible", timeout: 10000 });
  const stand = await p.evaluate(() => ({ pr: document.getElementById("praktijk").value,
    welkom: document.getElementById("ovWelkom").classList.contains("on"),
    status: document.getElementById("ps_status").textContent, knop: document.getElementById("ps_do").textContent }));
  assert.equal(stand.pr, P, "praktijknaam ingevuld");
  assert.equal(stand.welkom, false, "geen algemeen welkom dat opnieuw om de naam vraagt");
  assert.match(stand.status, /beveiligd\. Log in/, "inloggen, niet beveiligen: " + stand.status);
  assert.equal(stand.knop, "Inloggen");
  await p.fill("#ps_email", "bram@example.org");
  await p.fill("#ps_ww", "bram-wachtwoord");
  await p.click("#ps_do");
  await p.waitForFunction(() => /Bram/.test(document.getElementById("ps_status").textContent), null, { timeout: 8000 });
  const accs = JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
  assert.equal(Object.keys(accs).length, 1, "geen tweede praktijk: " + Object.keys(accs));
  assert.deepEqual(fouten, []);
  console.log("uitnodiging praktijk: ok (naam klaargezet, geen welkom, ingelogd als Bram, één praktijk)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
