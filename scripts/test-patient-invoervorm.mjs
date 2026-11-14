// Security-routine 2026-11-14 (security-backlog, gebruikers-sweep 2026-11-13 22u, Jayden en Mark):
// 1. De patiëntroutes namen aan:"false" en aan:[true] aan als de oude aan/uit-tik (een lijst haalde de
//    oefendag weg), n als lijst sloeg de naamcontrole over, wanneer:"01" of [1] gaf 200 en een id als
//    lijst gaf 404 op de misrem. Nu: id en n alleen tekst, aan alleen boolean, wanneer alleen een getal.
// 2. /api/opname/start keek niet naar kruisSite (/stop en /upload wel).
// `npm run test:patientinvoer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-patientinvoer-"));
const ID = "abcdef123456";
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio vorm": {
    "jayden": { id: ID, praktijk: "Fysio Vorm", naam: "Jayden", ts: Date.now(),
      chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }], rows: {}, cells: {}, vids: {} }
  }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, {
  method: "POST", body: JSON.stringify(body),
  headers: { "content-type": "application/json", "x-forwarded-for": "10.44.0." + (ip++), ...extra }
});
const kaart = async () => JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio vorm"].jayden;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // de gewone weg blijft werken
  assert.equal((await post("/api/kaart/gedaan", { id: ID, aan: true, wanneer: Date.now() })).status, 200, "gedaan aan");
  assert.equal((await kaart()).gedaan.length, 1);
  assert.equal((await post("/api/kaart/oefening", { id: ID, oef: 0, n: "Squat", aan: true })).status, 200, "oefening aan");
  assert.equal((await post("/api/kaart/gedaan", { id: ID })).status, 200, "oude tik zonder aan blijft werken");
  assert.equal((await kaart()).gedaan.length, 0, "oude tik haalde de dag weg");
  assert.equal((await post("/api/kaart/gedaan", { id: ID, aan: true, n: null, wanneer: null })).status, 200, "null telt als afwezig");
  assert.equal((await kaart()).gedaan.length, 1);

  // verkeerde vormen: 400 en niets veranderd
  const fout = [
    ["/api/kaart/gedaan", { id: ID, aan: "false" }],
    ["/api/kaart/gedaan", { id: ID, aan: [true] }],
    ["/api/kaart/gedaan", { id: ID, aan: 0 }],
    ["/api/kaart/gedaan", { id: ID, aan: true, wanneer: "01" }],
    ["/api/kaart/gedaan", { id: ID, aan: true, wanneer: [1] }],
    ["/api/kaart/oefening", { id: ID, oef: 0, n: ["Brug"], aan: false }],
    ["/api/kaart/oefening", { id: ID, oef: 0, n: { x: 1 } }],
    ["/api/kaart/oefzwaar", { id: ID, oef: 1, n: ["Squat"] }],
    ["/api/kaart/meting", { id: [ID], score: 3 }],
    ["/api/kaart/meting", { score: 3 }],
    ["/api/kaart/seintje", { id: ID, soort: "vraag", wanneer: "nu" }]
  ];
  for (const [pad, body] of fout) {
    const r = await post(pad, body);
    assert.equal(r.status, 400, pad + " " + JSON.stringify(body) + " moet 400 geven");
  }
  const k = await kaart();
  assert.equal(k.gedaan.length, 1, "geen enkele foute vorm haalde de oefendag weg");
  assert.equal(k.oefTrouw.Squat.n, 1, "vinkje bij Squat staat er nog");
  assert.ok(!k.oefZwaar, "geen 'te zwaar' geregistreerd");
  assert.ok(!(k.metingen || []).length, "geen meting met een lijst-id");

  // opname starten vanaf een andere website: geweigerd vóór alles
  const kruis = await post("/api/opname/start", { doel: "kaart" }, { "sec-fetch-site": "cross-site", origin: "https://evil.example" });
  assert.equal(kruis.status, 403);
  assert.match((await kruis.json()).fout || "", /andere website/, "opname/start weigert een andere website");

  console.log("test-patient-invoervorm: ok");
} catch (err) {
  console.error(uit.slice(-2000));
  throw err;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
