// Security 2026-11-13 12u: sinds #277 wacht een binnengekomen opname 4 uur op een kaart. Het enige plafond was
// 200 opnames voor iedereen samen, dus één praktijk (ook een gratis proef) kon met 200 kleine uploads de opname
// voor álle praktijken 4 uur op 429 zetten. Nu: per praktijk hooguit 20 open opnames, en het gezamenlijke
// plafond telt alleen tokens zonder upload. Zonder browser (draait ook in CI). `npm run test:opnameplafond`
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
  let gelukt = 0, geweigerd = 0;
  for (let i = 0; i < 30; i++) {
    const r = await start(sA);
    if (r.status === 429) { geweigerd++; continue; }
    assert.equal(r.status, 200);
    const up = await upload((await r.json()).token);
    assert.equal(up.status, 200, "upload " + i);
    gelukt++;
  }
  assert.equal(gelukt, 20, "één praktijk houdt hooguit 20 opnames tegelijk open (kreeg " + gelukt + ")");
  assert.equal(geweigerd, 10);
  // de andere praktijk kan gewoon opnemen
  assert.equal((await start(sB)).status, 200, "buurpraktijk kan nog een opname starten");
  console.log("test-opname-plafond: één praktijk kan de opname niet voor andere praktijken volzetten");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
