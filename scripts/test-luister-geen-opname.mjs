// Gebruikers-sweep 2026-11-20 (Truus, 72, iPhone SE): "Luister naar uitleg" bovenaan /k stond er ook
// als geen enkele oefening op de kaart een stemopname had. Een tik gaf geen geluid, alleen een groot blok
// met "Nog geen actuele stemopname: <alle namen> … deze selectie … behandelaar".
// Nu: in het Nederlands (waar de knop alleen opnames afspeelt) verdwijnt de knop zodra het stemmanifest
// geladen is en geen oefening een opname heeft. Laadt het manifest niet, of is de kaart in een andere taal
// (toestelstem), dan blijft hij staan. Broncontrole altijd (CI); browserdeel alleen waar Playwright staat.
// `npm run test:luistergeenopname`
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
assert.match(k, /function zetLeesKnop\(\)/, "zetLeesKnop bestaat");
assert.match(k, /herstelNoorKnoppen\(\);zetLeesKnop\(\);/, "na het laden van het manifest wordt de knop gezet");
assert.match(k, /LEES_OPNAME='fout';toonLeesKnop\(\)/, "mislukt manifest laat de knop staan");
assert.match(k, /var weg=TAAL==='nl'&&\(LEES_OPNAME===''\|\|LEES_OPNAME==='geen'\)&&!bezigLezen;/, "alleen in het Nederlands verbergen, ook zolang het manifest er niet is");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("luister geen opname: ok"); process.exit(0); }

const lib = JSON.parse(await readFile(join(root, "public/oefeningen-v2.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "public/audio/noor/manifest.json"), "utf8"));
const review = JSON.parse(await readFile(join(root, "public/mobile-media-review.json"), "utf8"));
const tegen = new Set(review.entries.filter((r) => r.status === "rejected" || r.presentation === "withhold").map((r) => r.name));
const heeft = (e) => manifest.clips.some((c) => c.name === e.naam && c.text === e.naam + ". " + e.uitleg);
const met = lib.find((e) => e.uitleg && heeft(e) && !tegen.has(e.naam));
const zonder = lib.filter((e) => e.uitleg && !heeft(e) && !tegen.has(e.naam) && e.kaartImg).slice(0, 3);
assert.ok(met, "een oefening met een opname");
assert.equal(zonder.length, 3, "drie oefeningen zonder opname");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-luister-"));
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
const bij = (c) => { if (uit.length < 20000) uit += c; };
app.stdout.on("data", bij);
app.stderr.on("data", bij);
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.9." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Luister Leeg";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "luister-leeg-wachtwoord", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk geclaimd");
  const deel = async (lijst, naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam },
    chosen: lijst.map((e) => ({ n: e.naam, id: exerciseId(e), i: 0 })), kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  const leeg = await deel(zonder, "Truus");
  const gemengd = await deel([zonder[0], met], "Toos");
  assert.ok(leeg && gemengd, "kaarten gedeeld");

  let n = 200;
  const open = async (pad, opties = {}) => {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: opties.locale || "nl-NL", serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.9." + (n++) } });
    if (opties.geenManifest) await ctx.route("**/audio/noor/manifest.json", (r) => r.abort());
    if (opties.traag) await ctx.route("**/audio/noor/manifest.json", async (r) => { await wacht(3000); await r.continue(); });
    const p = await ctx.newPage();
    await p.goto(origin + pad);
    for (let i = 0; i < 200; i++) {
      if (await p.evaluate(() => { const w = document.getElementById("wrap"); return !!w && w.style.display === "block"; })) break;
      await wacht(50);
    }
    await wacht(800);
    return { ctx, p };
  };
  const zichtbaar = (p) => p.evaluate(() => { const b = document.getElementById("leesBtn"); return !!b && b.getClientRects().length > 0; });

  // 1. Geen enkele opname: de knop staat er niet.
  let { ctx, p } = await open("/k/" + leeg);
  assert.equal(await zichtbaar(p), false, "zonder opnames geen 'Luister naar uitleg'");
  await ctx.close();

  // 1b. Traag manifest: de knop flitst niet even op (hertest Truus: 4 s zichtbaar, tik gaf het oude blok)
  ({ ctx, p } = await open("/k/" + leeg, { traag: true }));
  let ooit = false;
  for (let i = 0; i < 70; i++) { if (await zichtbaar(p)) ooit = true; await wacht(50); }
  assert.equal(ooit, false, "bij een traag manifest staat de knop er niet tussendoor");
  await ctx.close();
  ({ ctx, p } = await open("/k/" + gemengd, { traag: true }));
  for (let i = 0; i < 100 && !(await zichtbaar(p)); i++) await wacht(50);
  assert.equal(await zichtbaar(p), true, "traag manifest met opname: knop komt alsnog");
  await ctx.close();

  // 2. Eén oefening met een opname: de knop staat er wel.
  ({ ctx, p } = await open("/k/" + gemengd));
  assert.equal(await zichtbaar(p), true, "met een opname staat de knop er");
  await ctx.close();

  // 3. Manifest laadt niet: de knop blijft (met zijn eigen melding bij een tik).
  ({ ctx, p } = await open("/k/" + leeg, { geenManifest: true }));
  assert.equal(await zichtbaar(p), true, "zonder manifest blijft de knop staan");
  await ctx.close();

  // 4. Andere taal: de toestelstem leest voor, dus de knop blijft.
  ({ ctx, p } = await open("/k/" + leeg + "?taal=en", { locale: "en-US" }));
  assert.equal(await zichtbaar(p), true, "in het Engels blijft de knop staan");
  // terug naar Nederlands: dan verdwijnt hij weer
  const heeftKeuze = await p.evaluate(() => !!document.getElementById("taalsel"));
  if (heeftKeuze) {
    await p.selectOption("#taalsel", "nl");
    for (let i = 0; i < 60 && await zichtbaar(p); i++) await wacht(50);
    assert.equal(await zichtbaar(p), false, "terug in het Nederlands verdwijnt de knop");
  }
  await ctx.close();
  console.log("luister geen opname: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  await browser.close();
  app.kill();
}
