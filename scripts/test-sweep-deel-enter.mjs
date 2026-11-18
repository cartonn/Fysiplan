// Gebruikers-sweep 2026-11-18 22u (Sanne, desktop): in Kaarten → Deel deed Enter in de werknotitie, het bericht op de kaart
// en de behandelaar niets. Wie daarna het paneel sloot, was de notitie kwijt zonder het te merken. Nu bewaart Enter, zoals
// in de andere vensters. Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:deelenter`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /document\.getElementById\('k_srv_lijst'\)\.addEventListener\('keydown',function\(e\)\{\s*if\(e\.key!=='Enter'/, "Enter-afhandeling in het Deel-paneel");
assert.match(index, /v\.hasAttribute\('data-snotitie'\)\?document\.querySelector\("\[data-snotitieopslaan=/, "werknotitie");
assert.match(index, /v\.hasAttribute\('data-sbtekst'\)\?document\.querySelector\("\[data-sbericht=/, "bericht op de kaart");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-deel-enter: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-deelenter-"));
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
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.45." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Deel Enter";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "deel-enter-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  // /api/kaart geeft een eigen video als tijdelijke link (pad?k=&e=&s=); hier telt alleen het bewaarde pad
  const zonderLink = (v) => Object.fromEntries(Object.entries(v || {}).map(([a, b]) => [a, String(b).split("?")[0]]));
  const serverKaart = async () => { const j = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json(); if (j && j.kaart && j.kaart.vids) j.kaart.vids = zonderLink(j.kaart.vids); return j; };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.45.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], meldingen = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sdeel='${id}']`);
  await page.waitForSelector(`[data-snotitie='${id}']`, { state: "visible", timeout: 8000 });
  const noti = page.waitForResponse((r) => r.url().includes("/api/kaart/notitie") && r.request().method() === "POST", { timeout: 8000 });
  await page.fill(`[data-snotitie='${id}']`, "Volgende keer zwaarder");
  await page.press(`[data-snotitie='${id}']`, "Enter");
  assert.equal((await noti).status(), 200, "Enter bewaart de werknotitie");
  for (let i = 0; i < 60 && !/Bewaard/.test(await page.textContent(`[data-snotitieopslaan='${id}']`)); i++) await wacht(50);
  assert.match(await page.textContent(`[data-snotitieopslaan='${id}']`), /Bewaard/, "en zegt het");
  const ber = page.waitForResponse((r) => r.url().includes("/api/kaart/antwoord") && r.request().method() === "POST", { timeout: 8000 });
  await page.fill(`[data-sbtekst='${id}']`, "Goed bezig!");
  await page.press(`[data-sbtekst='${id}']`, "Enter");
  assert.equal((await ber).status(), 200, "Enter zet het bericht op de kaart");
  const k = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json();
  assert.match(JSON.stringify(k), /Goed bezig!/, "bericht staat op de patiëntkaart");
  assert.deepEqual(fouten, []);
  console.log("test-sweep-deel-enter: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
