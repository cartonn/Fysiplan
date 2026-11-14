// Gebruikers-sweep 2026-11-14 22u (Truus, iPhone SE): online pijnscore 4, dan zonder internet 7 tikken
// en de kaart herladen: het scherm toonde weer 4 (de kaart uit de cache van vóór de tik). pasWachtToe()
// legde alleen oefening-vinkjes en de dagvink uit de wachtrij over de kaart, niet de scores. Nu ook
// pijnscore, doelactiviteit (PSK) en ervaren herstel: één score per dag, de wachtende tik wint.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:offlinescore`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const nlDag = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });

const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /var WACHT_SCORE=\{'\/api\/kaart\/meting':'metingen','\/api\/kaart\/psk':'psk','\/api\/kaart\/ervaring':'ervaring'\};/,
  "wachtrij kent de drie scores");
assert.match(html, /function pasWachtToe\(\)\{[\s\S]{0,1600}else if\(WACHT_SCORE\[it\.pad\]/, "pasWachtToe legt ook scores over de kaart");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-offline-score: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-offlinescore-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Score Offline";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "score-offline-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const kaart = async () => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json()).kaart;
  const vandaag = nlDag(Date.now());
  const scoreVandaag = (lijst) => { const v = (lijst || []).filter((x) => nlDag(x.t) === vandaag); return v.length ? v[v.length - 1].s : null; };

  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.9.9.3" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept(d.defaultValue()));
  await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  await page.waitForSelector("#mschaal button[data-score]", { state: "attached" });
  const tik = (sel) => page.evaluate((s) => { const b = document.querySelector(s); b.scrollIntoView({ block: "center" }); b.click(); }, sel);
  const gekozen = () => page.evaluate(() => ({
    pijn: [...document.querySelectorAll("#mschaal button[data-score]")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => Number(b.dataset.score)),
    herstel: [...document.querySelectorAll("#hsknoppen .sbtn")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => Number(b.dataset.hs))
  }));
  const heeftHerstel = await page.locator("#hsknoppen .sbtn").count() > 0;

  // online: pijn 4 (en herstel 'gelijk' als het blok er is)
  await tik("#mschaal button[data-score='4']");
  if (heeftHerstel) { await wacht(400); await tik("#hsknoppen .sbtn[data-hs='0']"); }
  let k = null;
  for (let i = 0; i < 50; i++) { k = await kaart(); if (scoreVandaag(k.metingen) === 4) break; await wacht(100); }
  assert.equal(scoreVandaag(k.metingen), 4, "online pijn 4 op de server");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#mschaal button[data-score]", { state: "attached" });

  // offline: pijn 7 (en herstel 'beter'), dan herladen zonder internet
  await ctx.setOffline(true);
  await tik("#mschaal button[data-score='7']");
  if (heeftHerstel) { await wacht(400); await tik("#hsknoppen .sbtn[data-hs='1']"); }
  await wacht(500);
  assert.deepEqual((await gekozen()).pijn, [7], "direct na de tik: 7");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#mschaal button[data-score]", { state: "attached" });
  await wacht(600);
  const st = await gekozen();
  assert.deepEqual(st.pijn, [7], "offline herladen: pijnscore blijft 7, niet de oude 4");
  if (heeftHerstel) assert.deepEqual(st.herstel, [1], "offline herladen: herstel blijft de nieuwe keuze");

  // weer online: de server krijgt 7, het scherm blijft 7
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 60; i++) { k = await kaart(); if (scoreVandaag(k.metingen) === 7) break; await wacht(100); }
  assert.equal(scoreVandaag(k.metingen), 7, "praktijk krijgt 7");
  assert.deepEqual((await gekozen()).pijn, [7], "na online: 7");
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-offline-score: alles groen" + (heeftHerstel ? " (pijn + herstel)" : " (pijn)"));
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
