// Gebruikers-sweep 2026-11-12 (Jayden, Pixel 7 en iPhone 14; drie runs open): de seintjesknoppen op /k
// toonden de laatste tik, niet wat de praktijk ziet. Na "Het doet te veel pijn" en daarna "Het gaat goed"
// stond groen "It's going well" aan, terwijl de server (terecht, zwaarste blijft staan) pijn bewaarde; na
// herladen of op een tweede telefoon stond geen enkele knop aan. Nu geeft de server de open stand terug
// (POST `open`, GET `kaart.seinOpen`), tekent de kaart de knoppen daaruit (met aria-pressed) en zegt ze
// dat het eerdere seintje blijft staan. Seintjes gaan één tegelijk, op volgorde.
// Serverdeel en broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:seintjestand`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /function tekenSein\(\)\{/, "knoppen getekend uit de open stand");
assert.match(k, /tekenAntwoord\(\);tekenSein\(\);/, "ook bij het laden van de kaart");
assert.match(k, /'open' in d\)zetSeinOpen\(d\.open\)/, "antwoord van de server wint");
assert.doesNotMatch(k, /knoppen\.forEach\(function\(k\)\{k\.classList\.toggle\('aan',k===b\);\}\)/, "niet meer de laatste tik aanzetten");
for (const taal of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) {
  assert.match(k, new RegExp("\\n    " + taal + ":\\{seinkop:[^\\n]*blijft:'"), "uitleg 'blijft openstaan' in " + taal);
}

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sein-stand-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
const gestopt = new Promise((r) => app.on("exit", r));
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.9." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const lees = async (id) => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json());
const P = "Fysio Seintje Stand";
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "seintje-stand-wachtwoord", akkoord: true })).json()).sessie };
  const nieuweKaart = async (naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;

  // server: zwaarste blijft, lichter komt ernaast; "goed" komt nooit in ook
  const id1 = await nieuweKaart("Jay");
  assert.ok(id1, "kaart gedeeld");
  assert.equal((await lees(id1)).kaart.seinOpen, null, "nog geen seintje: null");
  let d = await (await post("/api/kaart/seintje", { id: id1, soort: "pijn" })).json();
  assert.deepEqual(d.open, { soort: "pijn" }, "pijn staat open");
  d = await (await post("/api/kaart/seintje", { id: id1, soort: "goed" })).json();
  assert.deepEqual(d.open, { soort: "pijn" }, "goed vervangt pijn niet");
  d = await (await post("/api/kaart/seintje", { id: id1, soort: "vraag" })).json();
  assert.deepEqual(d.open, { soort: "pijn", ook: ["vraag"] }, "vraag komt naast pijn");
  const k1 = (await lees(id1)).kaart;
  assert.deepEqual(k1.seinOpen, { soort: "pijn", ook: ["vraag"] }, "GET geeft dezelfde stand");
  assert.equal(k1.seintje, undefined, "het interne seintje (meld, ont) blijft binnen");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch {}
  if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("seintje stand: ok (server)"); }
  else {
    browser = await pw.chromium.launch();
    const id2 = await nieuweKaart("Jayden");
    const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.9.200" } });
    const p = await ctx.newPage();
    const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
    let n = 0;
    // het eerste seintje is traag: zonder volgorde kwam "goed" eerder aan en won het scherm toch
    await p.route(/\/api\/kaart\/seintje$/, async (r) => { n++; await wacht(n === 1 ? 2000 : 200); return r.continue(); });
    await p.goto(origin + "/k/" + id2 + "?taal=en");
    await p.waitForSelector('#sknoppen .sbtn[data-soort="pijn"]', { state: "attached", timeout: 15000 });
    const aan = () => p.$$eval("#sknoppen .sbtn", (bs) => bs.filter((b) => b.classList.contains("aan")).map((b) => b.dataset.soort + ":" + b.getAttribute("aria-pressed")));
    assert.deepEqual(await aan(), [], "begin: niets aan");
    await p.$eval('#sknoppen .sbtn[data-soort="pijn"]', (b) => b.click());
    await wacht(300);
    await p.$eval('#sknoppen .sbtn[data-soort="goed"]', (b) => b.click());
    assert.deepEqual(await aan(), ["pijn:true"], "meteen: pijn blijft aan, goed niet");
    for (let i = 0; i < 100 && n < 2; i++) await wacht(50);
    await wacht(800);
    assert.equal(n, 2, "twee verzoeken");
    assert.deepEqual(await aan(), ["pijn:true"], "na de antwoorden: pijn aan, goed niet");
    assert.deepEqual((await lees(id2)).kaart.seinOpen, { soort: "pijn" }, "server: pijn");
    const dank = await p.$eval("#sdank", (e) => e.textContent);
    assert.match(dank, /earlier message also stays open/, "uitleg dat het eerdere seintje blijft: " + dank);
    // na herladen (of op een tweede telefoon) staat dezelfde knop aan
    await p.unroute(/\/api\/kaart\/seintje$/);
    const p2 = await (await browser.newContext({ ...pw.devices["iPhone 14"], serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.9.201" } })).newPage();
    await p2.goto(origin + "/k/" + id2 + "?taal=en");
    await p2.waitForSelector('#sknoppen .sbtn[data-soort="pijn"].aan', { state: "attached", timeout: 15000 });
    assert.equal(await p2.$eval('#sknoppen .sbtn[data-soort="goed"]', (b) => b.getAttribute("aria-pressed")), "false", "tweede telefoon: goed uit");
    // de praktijk handelt af: na herladen staat niets meer aan
    const af = await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id: id2 }, S);
    if (af.status === 200) {
      await p2.reload();
      await p2.waitForSelector('#sknoppen .sbtn[data-soort="pijn"]', { state: "attached", timeout: 15000 });
      await wacht(300);
      assert.equal(await p2.$$eval("#sknoppen .sbtn.aan", (bs) => bs.length), 0, "afgehandeld: geen knop meer aan");
    }
    assert.deepEqual(fouten, [], "geen scriptfouten");
    console.log("seintje stand: ok (server, volgorde, uitleg, tweede telefoon" + (af.status === 200 ? ", afgehandeld" : "") + ")");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await gestopt;
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
}
