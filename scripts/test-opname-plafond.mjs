// Security 2026-11-13 12u: sinds #277 wacht een binnengekomen opname 4 uur op een kaart. Het enige plafond was
// 200 opnames voor iedereen samen, dus één praktijk (ook een gratis proef) kon met 200 kleine uploads de opname
// voor álle praktijken 4 uur op 429 zetten. Nu: per praktijk hooguit 20 open opnames, en het gezamenlijke
// plafond telt alleen tokens zonder upload.
// Gebruikers-sweep 2026-11-13 14u (Mark): opnames die al op een bewaarde kaart staan telden 4 uur mee en elk
// geannuleerd QR-venster een kwartier; een praktijk die één middag video's opnam zat dan 4 uur vast. Nu tellen
// alleen wachtende tokens en opnames die nog op geen kaart staan, en Annuleren geeft het token terug.
// Zonder browser (draait ook in CI). `npm run test:opnameplafond`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opname-plafond-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9." + Math.floor(ip / 250) + "." + (ip++ % 250), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = async (praktijk) => {
    const r = await post("/api/praktijk/claim", { praktijk, wachtwoord: "wachtwoord-" + praktijk.length + "-test", akkoord: true });
    assert.equal(r.status, 200, "claim " + praktijk);
    return (await r.json()).sessie;
  };
  const sA = await sessie("Fysio Vulpraktijk"), sB = await sessie("Fysio Buurpraktijk");
  const video = Buffer.alloc(11 * 1024); video.write("ftypisom", 4, "latin1");
  const start = (s) => post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": s });
  const upload = (token) => fetch(origin + "/api/opname/upload?token=" + token, { method: "POST",
    headers: { "content-type": "video/mp4", "x-forwarded-for": "10.8.0." + (ip++ % 250) }, body: video });

  // praktijk A start en uploadt zoveel opnames als ze mag
  let gelukt = 0, geweigerd = 0, laatsteFout = "";
  const paden = [];
  for (let i = 0; i < 30; i++) {
    const r = await start(sA);
    if (r.status === 429) { geweigerd++; laatsteFout = (await r.json()).fout; continue; }
    assert.equal(r.status, 200);
    const token = (await r.json()).token;
    const up = await upload(token);
    assert.equal(up.status, 200, "upload " + i);
    const st = await (await fetch(origin + "/api/opname/status?token=" + token, { headers: { "x-forwarded-for": "10.7.0." + (ip++ % 250) } })).json();
    paden.push(st.video);
    gelukt++;
  }
  assert.equal(gelukt, 20, "één praktijk houdt hooguit 20 opnames tegelijk open (kreeg " + gelukt + ")");
  assert.equal(geweigerd, 10);
  assert.match(laatsteFout, /bewaarde kaart/, "de weigering zegt wat je kunt doen: " + laatsteFout);
  // de andere praktijk kan gewoon opnemen
  assert.equal((await start(sB)).status, 200, "buurpraktijk kan nog een opname starten");

  // A bewaart een kaart met vijf van haar opnames: die tellen niet meer mee
  assert.ok(paden.every((p) => /^uploads\/videos\//.test(p || "")), "paden van de opnames: " + paden.slice(0, 2));
  const vids = {}, chosen = [];
  ["Squat", "Brug", "Lunge", "Plank", "Kuitheffen"].forEach((n, i) => { chosen.push({ n, i: 0 }); vids[n.toLowerCase()] = paden[i]; });
  const k = await post("/api/kaarten", { praktijk: "Fysio Vulpraktijk", naam: "Anna", kaartId: "", client: { c_naam: "Anna" }, chosen, vids },
    { "x-praktijk-sessie": sA });
  assert.equal(k.status, 200, await k.clone().text());
  assert.equal(Object.keys((await k.json()).kaart?.vids || vids).length, 5);
  let erbij = 0;
  for (let i = 0; i < 8; i++) { const r = await start(sA); if (r.status === 200) erbij++; }
  assert.equal(erbij, 5, "na het bewaren van 5 opnames op een kaart kan de praktijk er 5 bij starten (kreeg " + erbij + ")");

  // Annuleren geeft een wachtend token terug; een andere praktijk kan dat niet
  const sC = await sessie("Fysio Annuleer");
  const tokens = [];
  for (let i = 0; i < 20; i++) { const r = await start(sC); assert.equal(r.status, 200); tokens.push((await r.json()).token); }
  assert.equal((await start(sC)).status, 429, "20 wachtende tokens is vol");
  await post("/api/opname/stop", { token: tokens[0] }, { "x-praktijk-sessie": sB });
  assert.equal((await start(sC)).status, 429, "een andere praktijk kan het token van C niet intrekken");
  const stop = await post("/api/opname/stop", { token: tokens[1] }, { "x-praktijk-sessie": sC });
  assert.equal(stop.status, 200);
  assert.equal((await start(sC)).status, 200, "na Annuleren is er weer plek");
  for (const rare of ["null", "[]", "\"x\"", "{\"token\":{}}"]) {
    const r = await fetch(origin + "/api/opname/stop", { method: "POST", headers: kop({ "x-praktijk-sessie": sC }), body: rare });
    assert.equal(r.status, 200, "rare invoer geen 500: " + rare);
  }
  assert.doesNotMatch(uit, /TypeError|ReferenceError/);
  console.log("test-opname-plafond: één praktijk kan de opname niet voor andere praktijken volzetten; opnames op een bewaarde kaart en geannuleerde vensters tellen niet mee");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
