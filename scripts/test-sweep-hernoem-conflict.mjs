// Regressietest gebruikers-sweep 2026-11-16 02u (HOOG, Sanne, desktop): dezelfde kaart open op twee apparaten. Het
// tweede apparaat hernoemt de kaart in Kaarten ("Dirk" → "Dirk de Vries", een volledige naam: ook dan geen roepnaamvraag); het eerste haalt daarna iets op de kaart aan en
// krijgt de 409 'verouderd'. "Toch mijn versie bewaren" stuurde de OUDE naam mee, dus de server vroeg "andere
// patiënt?" (alleen als minuscule links in het QR-vak) en de eerste keuze maakte een tweede kaart met een eigen QR;
// de patiënt bleef de oude zien. Nu neemt de editor de nieuwe naam over en bewaart hij op dezelfde kaart.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:hernoemconflict`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /else if\(a==='overschrijf'\)\{neemServerNaamOver\(\);OVERSCHRIJF=/, "QR-vak/balk: nieuwe naam overnemen");
assert.match(index, /if\(a==='overschrijf'\)\{neemServerNaamOver\(\);OVERSCHRIJF=[^}]*printMetQr/, "printvenster: idem");
assert.match(index, /function neemServerNaamOver\(\)\{[\s\S]{0,400}?NAAM_OK=nw\.toLowerCase\(\);/, "geen roepnaamvraag na overnemen");
assert.match(index, /if\(d\.verouderd\)VEROUDERD_NAAM=String\(d\.naam/, "naam van de server onthouden bij 409");
assert.match(index, /if\(IS_V2&&d\.verouderd\)VEROUDERD_NAAM=String\(d\.naam/, "ook in het printvenster");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-conflict-balk: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-hernoemconflict-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.44." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Hernoem Conflict";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "hernoem-conflict-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  // /api/kaart geeft een eigen video als tijdelijke link (pad?k=&e=&s=); hier telt alleen het bewaarde pad
  const zonderLink = (v) => Object.fromEntries(Object.entries(v || {}).map(([a, b]) => [a, String(b).split("?")[0]]));
  const serverKaart = async () => { const j = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json(); if (j && j.kaart && j.kaart.vids) j.kaart.vids = zonderLink(j.kaart.vids); return j; };

  const ctx = await browser.newContext({ ...pw.devices["iPad (gen 7)"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.44.200" } });
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
  await page.click(`[data-sopen='${id}']`);
  await wacht(1500);
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  const basis = (await serverKaart()).kaart.ts;
  assert.ok(basis, "versie van de kaart bekend");
  // het tweede apparaat hernoemt de kaart in Kaarten
  const rn = await post("/api/kaart/naam", { praktijk: P, id, naam: "Dirk de Vries" }, S);
  assert.equal(rn.status, 200, "hernoemd op het andere apparaat");
  // het eerste apparaat zet er een oefening bij en krijgt een 409
  const antw = page.waitForResponse((r) => r.url().endsWith("/api/kaarten") && r.request().method() === "POST", { timeout: 15000 });
  await page.evaluate(() => { const b = document.querySelector("[data-add]"); if (b) b.click(); });
  assert.equal((await antw).status(), 409, "verouderd");
  await page.waitForSelector("#conflict_bar", { state: "visible", timeout: 8000 });
  assert.match(await page.textContent("#conflict_bar"), /Daar heet de kaart nu \u201cDirk de Vries\u201d/, "balk noemt de nieuwe naam");
  const statussen = [];
  page.on("response", (r) => { if (r.url().endsWith("/api/kaarten") && r.request().method() === "POST") statussen.push(r.status()); });
  await page.click("#conflict_bar [data-cfact='overschrijf']");
  for (let i = 0; i < 100 && !statussen.includes(200); i++) await wacht(50);
  assert.ok(statussen.includes(200), "eigen versie bewaard, zonder 'andere patiënt?'-vraag: " + statussen.join(","));
  assert.ok(!statussen.includes(409), "geen tweede 409");
  assert.equal(await page.inputValue("#c_naam"), "Dirk de Vries", "naamveld volgt de nieuwe naam");
  const lijst = await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json();
  assert.equal(lijst.length, 1, "geen tweede kaart: " + lijst.map((k) => k.naam).join(","));
  const k = (await serverKaart()).kaart;
  assert.equal(lijst[0].naam, "Dirk de Vries", "nieuwe naam");
  assert.equal(lijst[0].id, id, "zelfde kaart (zelfde QR)");
  assert.ok((k.chosen || []).length >= 2, "de oefening van het eerste apparaat staat op de kaart (" + (k.chosen || []).length + ")");
  assert.deepEqual(fouten, []);
  console.log("test-sweep-hernoem-conflict: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
