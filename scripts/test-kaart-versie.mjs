// Gebruikers-sweep 2026-11-07 (Truus):
// 1. Een oud apparaat of tabblad dat de app opent, schreef stil zijn verouderde kopie
//    van een gedeelde kaart terug (POST /api/kaarten met vids:{}). De server verving de
//    kaart en wiste de eigen opnames die intussen op een ander apparaat waren gekoppeld.
//    Nu stuurt de v2-editor basisTs mee en weigert de server een verouderde versie (409).
// 2. /k: de eigen video van de therapeut verdween bij een oefening waarvan het
//    bibliotheekbeeld wordt gecontroleerd (Chair squat). Die video staat daar los van.
// Serverdeel zonder browser (CI); het /k-deel draait alleen als Chromium er is.
// `npm run test:kaartversie`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const root = process.cwd();

// ---- broncontroles (falen zonder de fix) ----
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /if\(KAART_ID\)c\.basisTs=KAART_TS\|\|0;/, "v2-editor stuurt basisTs mee");
assert.match(index, /if\(d\.verouderd\)\{/, "editor toont een melding bij een verouderde kaart");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.ok(!/if\(hideMedia\|\|holdExplanation\)knop='';/.test(kaartHtml), "eigen video wordt niet meer weggegooid bij een gecontroleerd beeld");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartversie-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const bestaat = (pad) => access(join(dataDir, pad)).then(() => true, () => false);
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Versie", wachtwoord: "wachtwoord-versie-test", akkoord: true });
  assert.equal(claim.status, 200);
  const sessie = (await claim.json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const kaart = (extra) => post("/api/kaarten", { praktijk: "Fysio Versie", naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Chair squat", i: 0 }, { n: "Squat", i: 0 }], ...extra }, S);

  // laptop deelt de kaart (nieuwe kaart, nog geen versie)
  const r1 = await kaart({ kaartId: "", vids: {} });
  assert.equal(r1.status, 200);
  const { id, ts: ts1 } = await r1.json();
  assert.ok(id && ts1 > 0, "server geeft id en versie terug");

  // tweede werkplek: eigen opname bij Chair squat
  const st = await post("/api/opname/start", { doel: "kaart" }, S);
  const { token } = await st.json();
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const up = await fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.8.1.1" }, body: video });
  assert.equal(up.status, 200);
  const pad = (await up.json()).video;
  await wacht(5);
  const r2 = await kaart({ kaartId: id, basisTs: ts1, vids: { chairsquat: pad } });
  assert.equal(r2.status, 200, "werkplek met de actuele versie mag opslaan");
  const ts2 = (await r2.json()).ts;
  assert.ok(ts2 > ts1);

  // laptop opent de app weer met zijn oude kopie: weigeren, niets wissen
  const r3 = await kaart({ kaartId: id, basisTs: ts1, vids: {} });
  assert.equal(r3.status, 409, "verouderde versie wordt geweigerd");
  const d3 = await r3.json();
  assert.equal(d3.verouderd, true);
  assert.ok(await bestaat(pad), "opname staat nog op schijf");
  const pub = await (await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.8.2.1" } })).text();
  assert.ok(pub.includes(pad), "opname staat nog op de kaart");

  // ook een apparaat met een kaartId maar zonder bekende versie (oude opslag)
  assert.equal((await kaart({ kaartId: id, basisTs: 0, vids: {} })).status, 409);
  // de actuele versie mag verder, en 'Toch mijn versie bewaren' werkt bewust
  assert.equal((await kaart({ kaartId: id, basisTs: ts2, vids: { chairsquat: pad } })).status, 200);

  // ---- /k: eigen video blijft bij een oefening met een gecontroleerd beeld ----
  let chromium = null;
  try { ({ chromium } = require("playwright")); browser = await chromium.launch(); } catch { browser = null; }
  if (!browser) {
    console.log("test-kaart-versie: geen Chromium, /k-deel overgeslagen");
  } else {
    const ctx = await browser.newContext({ locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.3.1" } });
    const page = await ctx.newPage();
    await page.goto(origin + "/k/" + id);
    await page.waitForSelector(".oef .naam");
    const info = await page.evaluate(() => [...document.querySelectorAll(".oef")].map((o) => ({
      naam: (o.querySelector(".naam") || {}).textContent || "",
      eigen: (o.querySelector(".vbtn.eigen") || {}).dataset ? o.querySelector(".vbtn.eigen").dataset.eigen : null,
      controle: /wordt gecontroleerd/.test(o.textContent)
    })));
    const cs = info.find((x) => /chair squat/i.test(x.naam));
    assert.ok(cs, "Chair squat staat op de kaart: " + JSON.stringify(info));
    if (!cs.controle) console.log("test-kaart-versie: let op, Chair squat is niet (meer) in controle; check op eigen video blijft gelden");
    assert.equal(cs.eigen, "/" + pad, "eigen video van de therapeut blijft zichtbaar: " + JSON.stringify(cs));
    await page.click(".vbtn.eigen");
    assert.equal(await page.locator(".vhouder.open video").count(), 1, "video speelt");
    await ctx.close();
  }
  console.log("test-kaart-versie: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
