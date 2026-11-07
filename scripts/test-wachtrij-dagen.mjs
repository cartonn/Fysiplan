// Offline-wachtrij op de kaart (/k): twee dagen zonder internet blijven twee dagen.
// - De telefoon bewaart per soort per dag een tik, met het moment van tikken (`wanneer`).
// - De server zet een tik uit de wachtrij op de dag waarop hij gedaan is (pijnscore,
//   oefendag, herstel, PSK, seintje), maar telt hem in de inbox toch als nieuw.
// - Een te oud of toekomstig `wanneer` telt als nu; een oud seintje verdringt geen nieuwer.
// API altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:wachtrijdagen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const DAG = 86400000;
const nlDag = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });

const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /function zetInWacht[\s\S]{0,400}'@'\+dagStr\(nu\)/, "wachtrij-sleutel per dag");
assert.match(html, /function zetInWacht[\s\S]{0,500}mee\.wanneer=nu/, "wachtrij bewaart het moment van tikken");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wachtdagen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Wachtrij";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wachtrij-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const nieuweKaart = async (naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  const id = await nieuweKaart("Truus");
  assert.ok(id);
  const inbox = async () => (await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json()).kaarten.find((k) => k.id === id);

  // de therapeut handelt af: alles tot nu is gezien
  await post("/api/kaart/meting", { id, score: 3 });
  assert.equal((await (await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id }, S)).json()).ok, true);
  assert.equal(await inbox(), undefined, "inbox leeg na afhandelen");

  // gisteren zonder internet getikt, vandaag pas verstuurd
  const nu = Date.now();
  const gisteren = nu - DAG;
  const m1 = await (await post("/api/kaart/meting", { id, score: 7, wanneer: gisteren })).json();
  assert.equal(m1.ok, true);
  const dagen = m1.metingen.map((m) => nlDag(m.t));
  assert.ok(dagen.includes(nlDag(gisteren)), "pijnscore van gisteren staat op gisteren: " + JSON.stringify(m1.metingen));
  assert.equal(m1.metingen.find((m) => nlDag(m.t) === nlDag(gisteren)).s, 7);
  // en is voor de therapeut nieuw, ook al is de dag ouder dan het afhandelen
  const ib = await inbox();
  assert.ok(ib && ib.items.some((i) => i.soort === "pijn"), "late tik telt als nieuw in de inbox");

  // vandaag nog een score: gisteren blijft staan
  const m2 = await (await post("/api/kaart/meting", { id, score: 4 })).json();
  assert.equal(m2.metingen.find((m) => nlDag(m.t) === nlDag(gisteren)).s, 7, "dag 1 blijft bewaard");
  assert.equal(m2.metingen.find((m) => nlDag(m.t) === nlDag(Date.now())).s, 4);
  // volgorde op tijd
  const ts = m2.metingen.map((m) => m.t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b), "metingen op volgorde van tijd");
  // een oudere tik uit de wachtrij vervangt geen nieuwere van dezelfde dag
  const m3 = await (await post("/api/kaart/meting", { id, score: 9, wanneer: Date.now() - 60000 })).json();
  assert.equal(m3.metingen.find((m) => nlDag(m.t) === nlDag(Date.now())).s, 4, "oudere tik laat de nieuwere staan");

  // oefendagen: eergisteren en gisteren uit de wachtrij, plus vandaag
  for (const w of [nu - 2 * DAG, gisteren, undefined]) {
    const g = await (await post("/api/kaart/gedaan", { id, aan: true, ...(w ? { wanneer: w } : {}) })).json();
    assert.equal(g.ok, true);
  }
  const g = await (await post("/api/kaart/gedaan", { id, aan: true, wanneer: gisteren })).json();
  assert.equal(g.gedaan.length, 3, "drie oefendagen, dubbel blijft één: " + JSON.stringify(g.gedaan));
  const g2 = await (await post("/api/kaart/gedaan", { id, aan: false, wanneer: nu - 2 * DAG })).json();
  assert.equal(g2.gedaan.length, 2, "uitzetten van eergisteren raakt vandaag niet");
  assert.ok(g2.gedaan.some((x) => nlDag(x.t) === nlDag(Date.now())));

  // herstel en PSK op hun dag
  assert.equal((await (await post("/api/kaart/psk-doel", { praktijk: P, id, activiteit: "traplopen" }, S)).json()).ok, true);
  const e = await (await post("/api/kaart/ervaring", { id, score: 1, wanneer: gisteren })).json();
  assert.equal(nlDag(e.ervaring[0].t), nlDag(gisteren));
  const p = await (await post("/api/kaart/psk", { id, score: 6, wanneer: gisteren })).json();
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(nlDag(p.psk[0].t), nlDag(gisteren));

  // onzin-moment: toekomst of te lang geleden telt als nu
  const id2 = await nieuweKaart("Bep");
  for (const w of [nu + 3 * DAG, nu - 60 * DAG, "gisteren", 1e20]) {
    const r = await (await post("/api/kaart/meting", { id: id2, score: 2, wanneer: w })).json();
    assert.equal(r.ok, true);
    assert.equal(r.metingen.length, 1);
    assert.equal(nlDag(r.metingen[0].t), nlDag(Date.now()), "rare wanneer telt als vandaag: " + w);
    assert.ok(r.metingen[0].t <= Date.now());
  }

  // seintjes: het nieuwere blijft het seintje, het oudere gaat wel in het logboek
  await post("/api/kaart/seintje", { id, soort: "vraag" });
  await post("/api/kaart/seintje", { id, soort: "goed", wanneer: gisteren });
  const ib2 = await inbox();
  const sein = ib2.items.find((i) => i.soort === "seintje");
  assert.equal(sein && sein.wat, "vraag", "oud seintje uit de wachtrij verdringt de nieuwere vraag niet");
  console.log("test-wachtrij-dagen: API OK");

  // ---- browser: twee dagen offline op de telefoon ----
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-wachtrij-dagen: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    const id3 = await nieuweKaart("Truus offline");
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.1" } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (err) => fouten.push(String(err)));
      const dag1 = Date.now() - DAG;
      await page.clock.install({ time: dag1 });
      await page.goto(origin + "/k/" + id3);
      await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
      await ctx.setOffline(true);
      // dag 1: pijn 6 en geoefend
      await page.locator("#mschaal button[data-score='6']").click();
      await page.waitForFunction(() => /Opgeslagen op je telefoon/.test(document.getElementById("mdank").textContent), null, { timeout: 5000 });
      await page.click("#gdaan");
      await page.waitForFunction(() => /2 keer opgeslagen/.test(document.getElementById("wachtrij").textContent), null, { timeout: 5000 });
      // dag 2: pijn 3 en weer geoefend
      await page.clock.setSystemTime(Date.now());
      await page.evaluate(() => { document.getElementById("gdaan").setAttribute("aria-pressed", "false"); });
      await page.locator("#mschaal button[data-score='3']").click();
      await page.click("#gdaan");
      await page.waitForFunction(() => /4 keer opgeslagen/.test(document.getElementById("wachtrij").textContent), null, { timeout: 5000 });
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForFunction((i) => localStorage.getItem("fp_wacht_" + i) === null, id3, { timeout: 10000 });
      const pat = (await (await get("/api/kaart?id=" + id3)).json()).kaart;
      const sc = Object.fromEntries((pat.metingen || []).map((m) => [nlDag(m.t), m.s]));
      assert.equal(sc[nlDag(dag1)], 6, "dag 1 pijnscore kwam aan: " + JSON.stringify(pat.metingen));
      assert.equal(sc[nlDag(Date.now())], 3, "dag 2 pijnscore kwam aan");
      assert.equal((pat.gedaan || []).length, 2, "twee oefendagen: " + JSON.stringify(pat.gedaan));
      assert.deepEqual(fouten, []);
    } finally { await browser.close(); }
  }
  console.log("test-wachtrij-dagen: OK");
} catch (err) {
  console.error(uit.slice(-2000));
  throw err;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
