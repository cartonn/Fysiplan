// Security 2026-11-08: videoruimte per praktijk. Eén gratis geclaimde praktijk kon met
// eigen opnames (100 kaarten × 12 video's × 60 MB) de gedeelde videogrens blijvend
// volzetten; daarna kreeg elke andere praktijk een 507 bij opnemen. Nu heeft elke
// praktijk een eigen quotum (VIDEO_PRAKTIJK_MAX_MB, standaard 500 MB) en blijft de rest
// voor andere praktijken. Zonder browser (draait ook in CI). `npm run test:videoquotum`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-videoquotum-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
// quotum 0,05 MB (52 428 bytes) per praktijk; de gedeelde grens ruim daarboven
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "",
    ANTHROPIC_API_KEY: "", VIDEO_PRAKTIJK_MAX_MB: "0.05", VIDEO_OPSLAG_MAX_MB: "10" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const sessie = async (praktijk) => {
    const r = await post("/api/praktijk/claim", { praktijk, wachtwoord: "wachtwoord-" + praktijk.length + "-test", akkoord: true });
    assert.equal(r.status, 200, "claim " + praktijk);
    return (await r.json()).sessie;
  };
  const sA = await sessie("Fysio Aanval"), sB = await sessie("Fysio Echt");
  const video = Buffer.alloc(20 * 1024); video.write("ftypisom", 4, "latin1");
  const neemOp = async (s) => {
    const st = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": s });
    assert.equal(st.status, 200, "opname start");
    const { token } = await st.json();
    const up = await fetch(origin + "/api/opname/upload?token=" + token, {
      method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.9.1." + (ip++) }, body: video });
    return { status: up.status, body: await up.json() };
  };

  // praktijk A zet twee opnames op een kaart (40 kB) en probeert een derde
  const v1 = await neemOp(sA), v2 = await neemOp(sA);
  assert.equal(v1.status, 200); assert.equal(v2.status, 200);
  const r = await post("/api/kaarten", { praktijk: "Fysio Aanval", naam: "Test", kaartId: "", client: { c_naam: "Test" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Lunge", i: 0 }], vids: { squat: v1.body.video, lunge: v2.body.video } }, { "x-praktijk-sessie": sA });
  assert.equal(r.status, 200, "kaart met twee video's opgeslagen");
  const v3 = await neemOp(sA);
  assert.equal(v3.status, 507, "derde opname past niet meer in het quotum van A");
  assert.equal(v3.body.praktijkVol, true);
  assert.match(v3.body.fout, /videoruimte van deze praktijk/);

  // een andere praktijk merkt daar niets van
  const vB = await neemOp(sB);
  assert.equal(vB.status, 200, "praktijk B kan gewoon opnemen");
  console.log("videoquotum per praktijk: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
