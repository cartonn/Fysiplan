// Security 2026-11-07: een opname-video hoort bij de praktijk die hem opnam.
// Voorheen accepteerde POST /api/kaarten in `vids` elk pad dat op een opname leek, ook
// een opname van een andere praktijk (het token staat leesbaar in de scherm-QR). Zette
// praktijk B dat pad op haar kaart en haalde ze het er weer af, dan wiste de server de
// nog niet opgeslagen opname van praktijk A. Nu negeert de server een vreemd pad.
// Zonder browser (draait ook in CI). `npm run test:opname-eigen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opname-eigen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const bestaat = (pad) => access(join(dataDir, pad)).then(() => true, () => false);

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const sessie = async (praktijk) => {
    const r = await post("/api/praktijk/claim", { praktijk, wachtwoord: "wachtwoord-" + praktijk.length + "-test", akkoord: true });
    assert.equal(r.status, 200, "claim " + praktijk);
    return (await r.json()).sessie;
  };
  const sA = await sessie("Fysio Lisa"), sB = await sessie("Fysio Mark");

  // praktijk A neemt een video op (nog niet op een kaart opgeslagen)
  const st = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": sA });
  assert.equal(st.status, 200, "A start een opname");
  const { token } = await st.json();
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const up = await fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.7.1.1" }, body: video });
  assert.equal(up.status, 200, "upload lukt");
  const pad = (await up.json()).video;
  assert.match(pad, /^uploads\/videos\/v-[a-f0-9]+\.mp4$/);
  assert.ok(await bestaat(pad), "video staat op schijf");

  const kaart = (praktijk, naam, vids, s) => post("/api/kaarten",
    { praktijk, naam, kaartId: "", client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], vids }, { "x-praktijk-sessie": s });

  // praktijk B probeert de opname van A op haar eigen kaart te zetten
  const rB = await kaart("Fysio Mark", "Piet", { squat: pad }, sB);
  assert.equal(rB.status, 200, "kaart van B wordt wel opgeslagen");
  const idB = (await rB.json()).id;
  const volB = await fetch(origin + "/api/praktijk/kaart?id=" + idB, { headers: { "x-praktijk-sessie": sB, "x-forwarded-for": "10.7.2.1" } });
  if (volB.ok) {
    const k = await volB.json();
    const v = (k.kaart || k).vids || {};
    assert.ok(!Object.values(v).includes(pad), "vreemde opname staat niet op de kaart van B");
  }
  const publiek = await (await fetch(origin + "/api/kaart?id=" + idB, { headers: { "x-forwarded-for": "10.7.2.2" } })).text();
  assert.ok(!publiek.includes(pad), "patiënt van B krijgt de opname van A niet te zien");

  // B haalt 'm er weer af: de opname van A blijft bestaan
  const rB2 = await post("/api/kaarten", { praktijk: "Fysio Mark", naam: "Piet", kaartId: idB, client: { c_naam: "Piet" },
    chosen: [{ n: "Squat", i: 0 }], vids: {} }, { "x-praktijk-sessie": sB });
  assert.equal(rB2.status, 200);
  assert.ok(await bestaat(pad), "opname van A is niet gewist door B");

  // A zelf kan de opname wel op haar kaart zetten
  const rA = await kaart("Fysio Lisa", "Anna", { squat: pad }, sA);
  assert.equal(rA.status, 200);
  const idA = (await rA.json()).id;
  const pubA = await (await fetch(origin + "/api/kaart?id=" + idA, { headers: { "x-forwarded-for": "10.7.2.3" } })).text();
  assert.ok(pubA.includes(pad), "eigen opname staat op de kaart van A");

  // en daarna nog steeds niet bij B, ook niet nu het pad op een kaart staat
  const rB3 = await kaart("Fysio Mark", "Kees", { squat: pad }, sB);
  assert.equal(rB3.status, 200);
  const pubB3 = await (await fetch(origin + "/api/kaart?id=" + (await rB3.json()).id, { headers: { "x-forwarded-for": "10.7.2.4" } })).text();
  assert.ok(!pubB3.includes(pad), "pad van een kaart van A blijft vreemd voor B");
  console.log("test-opname-eigen: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
