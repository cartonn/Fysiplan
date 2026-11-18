// Gebruikers-sweep 2026-11-14 18u (Truus, iPhone SE): zonder internet een oefening uitvinken of de
// dagvink uitzetten en dan de kaart herladen, zette beide weer AAN. De kaart kwam uit de cache van
// vóór de tik en de wachtrij werd er niet overheen gelegd. Nu legt pasWachtToe() de wachtrij over
// de kaart heen, direct na het laden; na weer online krijgt de praktijk dezelfde stand.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:offlineherladen`
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
assert.match(html, /K=\{kaart:res\[0\]\.kaart[^\n]*\n\s*pasWachtToe\(\);/, "na het laden van de kaart gaat de wachtrij eroverheen");
assert.match(html, /function pasWachtToe\(\)\{[\s\S]{0,900}'\/api\/kaart\/oefening'[\s\S]{0,300}mgTrouwTik[\s\S]{0,300}'\/api\/kaart\/gedaan'/,
  "pasWachtToe kent oefening-vinkjes en de dagvink");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-offline-herladen: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-offlineherladen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.1." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Herladen";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "herladen-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const kaart = async () => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json()).kaart;
  const vandaag = nlDag(Date.now());

  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.9.9.1" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  // uitzetten van de dagvink vraagt eerst of de vinkjes van vandaag mee weg mogen
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  await page.waitForSelector("#oefs .oefdone");
  // online: beide oefeningen af -> ook de dagvink
  await page.locator("#oefs .oefdone").nth(0).click();
  await page.locator("#oefs .oefdone").nth(1).click();
  let k = null;
  for (let i = 0; i < 50; i++) { k = await kaart(); if ((k.gedaan || []).some((x) => nlDag(x.t) === vandaag) && k.oefTrouw?.Brug?.d === vandaag) break; await wacht(100); }
  assert.ok((k.gedaan || []).some((x) => nlDag(x.t) === vandaag), "dagvink staat online op de server");
  // herladen zodat de cache de stand met vinkjes heeft
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#oefs .oefdone.aan");

  const aan = () => page.evaluate(() => ({
    oef: [...document.querySelectorAll("#oefs .oefdone")].map((b) => b.classList.contains("aan")),
    dag: document.getElementById("gdaan").classList.contains("aan")
  }));

  // 1. offline één oefening uitvinken en herladen: blijft uit
  await ctx.setOffline(true);
  await page.locator("#oefs .oefdone").nth(0).click();
  await wacht(300);
  assert.deepEqual((await aan()).oef, [false, true], "direct na uitvinken");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#oefs .oefdone");
  await wacht(500);
  assert.deepEqual((await aan()).oef, [false, true], "offline herladen: uitgevinkte oefening blijft uit");

  // 2. offline de dagvink uitzetten en herladen: dagvink en vinkjes blijven uit
  await page.locator("#gdaan").click();
  await wacht(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#oefs .oefdone");
  await wacht(500);
  const st = await aan();
  assert.equal(st.dag, false, "offline herladen: uitgezette dagvink blijft uit");
  assert.deepEqual(st.oef, [false, false], "offline herladen: vinkjes blijven uit");

  // 3. weer online: de praktijk krijgt dezelfde stand, de kaart blijft zo staan
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 60; i++) {
    k = await kaart();
    if (!(k.gedaan || []).some((x) => nlDag(x.t) === vandaag) && k.oefTrouw?.Squat?.d !== vandaag && k.oefTrouw?.Brug?.d !== vandaag) break;
    await wacht(100);
  }
  assert.ok(!(k.gedaan || []).some((x) => nlDag(x.t) === vandaag), "praktijk: geen oefendag vandaag");
  assert.notEqual(k.oefTrouw?.Squat?.d, vandaag, "praktijk: Squat niet vandaag");
  assert.notEqual(k.oefTrouw?.Brug?.d, vandaag, "praktijk: Brug niet vandaag");
  const na = await aan();
  assert.equal(na.dag, false, "na online: dagvink uit");
  assert.deepEqual(na.oef, [false, false], "na online: vinkjes uit");
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-offline-herladen: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
