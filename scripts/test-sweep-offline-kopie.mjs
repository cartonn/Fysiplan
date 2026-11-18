// Gebruikers-sweep 2026-11-18 06u (Truus, iPhone SE): pijnscore en herstel online getikt ("Genoteerd", 200),
// daarna zonder internet de kaart herladen: het scherm toonde de stand van bij het laden. De offline-kopie
// van /api/kaart?id= werd alleen bij een GET ververst; nu haalt de kaart na een geslaagde tik de kopie
// opnieuw op (verversKopie). Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:offlinekopie`
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
assert.match(html, /function verversKopie\(\)\{/, "kaart ververst de offline-kopie");
assert.match(html, /function stuur\(pad,body\)\{[\s\S]{0,900}verversKopie\(\)/, "stuur() ververst na een geslaagde tik");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-offline-kopie: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-offlinekopie-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.4." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Kopie Offline";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "kopie-offline-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const kaart = async () => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json()).kaart;
  const vandaag = nlDag(Date.now());
  const scoreVandaag = (lijst) => { const v = (lijst || []).filter((x) => nlDag(x.t) === vandaag); return v.length ? v[v.length - 1].s : null; };

  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.9.9.4" } });
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
  // geen online herladen: de kaart moet de getikte stand zelf in de offline-kopie zetten
  await wacht(1500);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#mschaal button[data-score]", { state: "attached" });
  await wacht(600);
  const st = await gekozen();
  assert.deepEqual(st.pijn, [4], "offline herladen: online getikte pijnscore 4 blijft staan");
  if (heeftHerstel) assert.deepEqual(st.herstel, [0], "offline herladen: online getikt herstel blijft staan");
  await ctx.setOffline(false);
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-offline-kopie: alles groen" + (heeftHerstel ? " (pijn + herstel)" : " (pijn)"));
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
