// Gebruikers-sweep 2026-11-10 (Truus, iPhone SE): twee kaarten op één telefoon met een gedeelde
// oefening. "Wis van dit apparaat" op kaart B haalde ook het oefenbeeld en het appicoon uit de
// offline-cache die kaart A nog nodig heeft; A toonde offline een kapot plaatje. Nu onthoudt elke
// kaart welke beelden ze gebruikt (fp_beelden_<id>) en blijft wat een andere kaart nodig heeft.
// Beelden die alleen B gebruikte gaan wel weg (legal: gedeelde telefoon). Statisch altijd (CI);
// browserdeel waar Playwright staat. `npm run test:wistweekaarten`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const wis = html.slice(html.indexOf("function wisOfflineKopie(){"), html.indexOf("function wisVanTelefoon(){"));
assert.match(wis, /beeldenVanAndereKaarten\(/, "wissen kijkt naar de beelden van andere kaarten");
assert.match(wis, /!ander\.nodig\[u\.pathname\]/, "beeld van een andere kaart blijft staan");
assert.match(html, /function bewaarBeeldenLijst\(\)/, "kaart onthoudt haar beelden");
assert.match(html, /BEELDEN_PREFIX='fp_beelden_'/);
console.log("wis twee kaarten: statisch ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("wis twee kaarten: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wistwee-"));
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
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const P = "Fysio Wistwee";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wis-twee-kaarten", akkoord: true })).json()).sessie };
  const maak = async (naam, chosen) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen, kaartId: "" }, S)).json()).id;
  const A = await maak("Truus", [{ n: "Anteflexie armen", i: 0 }, { n: "Biceps curl", i: 1 }]);
  const B = await maak("Henk", [{ n: "Anteflexie armen", i: 0 }, { n: "Lateral raises", i: 1 }]);
  assert.ok(A && B);
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.9.1" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  const beelden = async () => page.evaluate(() => Array.from(document.querySelectorAll(".fotoknop img")).map((i) => new URL(i.src).pathname));
  const inCache = async () => page.evaluate(async () => { const uit = []; for (const n of await caches.keys()) { const c = await caches.open(n); for (const r of await c.keys()) uit.push(new URL(r.url).pathname); } return uit; });
  const open = async (k) => {
    await page.goto(origin + "/k/" + k);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    await page.evaluate(() => Promise.all(Array.from(document.querySelectorAll(".fotoknop img")).map((i) => { i.loading = "eager"; return i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }); })));
    await page.waitForFunction((k) => !!localStorage.getItem("fp_beelden_" + k), k, { timeout: 8000 });
  };
  await open(A);
  const beeldA = await beelden();
  assert.equal(beeldA.length, 2, "kaart A heeft twee oefenbeelden");
  await open(B);
  const beeldB = await beelden();
  const gedeeld = beeldA.filter((p) => beeldB.includes(p));
  const alleenB = beeldB.filter((p) => !beeldA.includes(p));
  assert.equal(gedeeld.length, 1, "één gedeelde oefening");
  assert.equal(alleenB.length, 1);
  // wachten tot de service worker de beelden heeft bewaard
  await page.waitForFunction(async (ps) => { const uit = new Set(); for (const n of await caches.keys()) { const c = await caches.open(n); for (const r of await c.keys()) uit.add(new URL(r.url).pathname); } return ps.every((p) => uit.has(p)); }, [...beeldA, ...beeldB], { timeout: 15000, polling: 250 });
  page.once("dialog", (d) => d.accept());
  await page.click("#mgblok summary");
  await page.click("#mg_wis");
  await page.waitForSelector("#mg_weg", { state: "visible", timeout: 5000 });
  const rest = await inCache();
  for (const p of beeldA) assert.ok(rest.includes(p), "beeld van kaart A blijft offline: " + p);
  assert.ok(!rest.includes(alleenB[0]), "beeld dat alleen B gebruikte is weg");
  assert.ok(!rest.includes("/k/" + B), "kaart B zelf is weg");
  assert.ok(rest.includes("/k/" + A), "kaart A blijft");
  const sleutels = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fp_beelden_")));
  assert.deepEqual(sleutels, ["fp_beelden_" + A], "alleen de beeldenlijst van A blijft");
  assert.deepEqual(fouten, []);
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
console.log("wis twee kaarten: ok");
