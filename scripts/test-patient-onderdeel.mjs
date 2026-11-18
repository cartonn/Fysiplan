// De patiëntkant als los onderdeel (lib/patient-routes.js) met een vaste controle op invoer
// (lib/invoer.js). Reviewlijst punt 15. `npm run test:patientonderdeel`
//
// 1. de controles zelf
// 2. de echte server: elke patiëntroute weigert een body die geen JSON-object is met 400, kent
//    een onbekende kaart niet (404), en doet bij een goede tik wat hij deed
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leesObject, geheel, eenVan, index } from "../lib/invoer.js";
import { PATIENT_ROUTES } from "../lib/patient-routes.js";

// ---- 1. de controles ----
{
  const body = (t) => async () => t;
  assert.deepEqual(await leesObject({}, body('{"a":1}')), { a: 1 });
  for (const t of ["[1]", "null", "3", '"x"', "{kapot", ""]) assert.equal(await leesObject({}, body(t)), null, t);
  assert.equal(await leesObject({}, async () => { throw new Error("te groot"); }), null);
  assert.equal(geheel(3, 0, 10), 3); assert.equal(geheel(0, 0, 10), 0);
  for (const x of [11, -1, 3.5, "3", NaN, null, undefined, true]) assert.equal(geheel(x, 0, 10), undefined, String(x));
  assert.equal(eenVan("pijn", ["vraag", "pijn"]), "pijn"); assert.equal(eenVan("PIJN", ["pijn"]), undefined); assert.equal(eenVan(null, ["pijn"]), undefined);
  assert.equal(index(2, 3), 2); assert.equal(index("1", 3), 1);
  for (const x of [3, -1, "", " 1", "1e0", 1.5, null, undefined, true, "constructor", [0], ["1"], "01", "0001", "00"]) assert.equal(index(x, 3), undefined, JSON.stringify(x));
  assert.equal(index("0", 3), 0);
  for (const x of [["pijn"], { toString: () => "pijn" }]) assert.equal(eenVan(x, ["vraag", "pijn"]), undefined, "geen lijst of object als tekst");
}

// ---- 2. de echte server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-patientonderdeel-"));
const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
let uit = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = () => ({ "content-type": "application/json", "x-forwarded-for": "10.9." + (ip >> 8) + "." + (ip++ & 255) });
const ruw = (pad, tekst) => fetch(origin + pad, { method: "POST", headers: kop(), body: tekst });
const post = (pad, b, x = {}) => fetch(origin + pad, { method: "POST", headers: { ...kop(), ...x }, body: JSON.stringify(b) });
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claim = await (await post("/api/praktijk/claim", { praktijk: "Fysio Kant", wachtwoord: "kant-wachtwoord-1", akkoord: true })).json();
  const r = await post("/api/kaarten", { praktijk: "Fysio Kant", naam: "Truus", client: { c_naam: "Truus" }, kaartId: "", chosen: [{ n: "Squat", i: 0 }, { n: "Lunge", i: 0 }] }, { "x-praktijk-sessie": claim.sessie });
  assert.equal(r.status, 200, uit.slice(-300));
  const id = (await r.json()).id;
  assert.equal((await post("/api/kaart/psk", { id, score: 6 })).status, 400, "zonder doelactiviteit geen PSK");
  assert.equal((await post("/api/kaart/psk-doel", { praktijk: "Fysio Kant", id, activiteit: "Traplopen" }, { "x-praktijk-sessie": claim.sessie })).status, 200);

  for (const pad of PATIENT_ROUTES) {
    for (const t of ["[]", "null", "12", '"tekst"', "{kapot"]) {
      const a = await ruw(pad, t);
      assert.equal(a.status, 400, pad + " met " + t + ": " + a.status);
      assert.equal((await a.json()).ok, false);
    }
    const geen = await post(pad, { id: "0123456789abcdef", soort: "vraag", score: 1, oef: 0 });
    assert.equal(geen.status, 404, pad + ": onbekende kaart");
  }
  // een onbekend seintje: 400, ook voor een kaart die niet bestaat (de soort eerst)
  assert.equal((await post("/api/kaart/seintje", { id: "0123456789abcdef", soort: "boos" })).status, 400);
  // sinds 2026-11-13 (security-backlog LAAG): een lijst is geen soort meer, ook niet met één soort erin
  assert.equal((await post("/api/kaart/seintje", { id, soort: ["pijn"] })).status, 400, "een lijst met één soort is geen soort");
  assert.equal((await post("/api/kaart/seintje", { id, soort: "pijn" })).status, 200, "dezelfde soort als tekst");

  // goede tikken doen wat ze deden
  let d = await (await post("/api/kaart/meting", { id, score: 4 })).json();
  assert.equal(d.metingen.at(-1).s, 4);
  assert.equal((await post("/api/kaart/meting", { id, score: 11 })).status, 400);
  assert.equal((await post("/api/kaart/meting", { id, score: "4" })).status, 400);
  d = await (await post("/api/kaart/ervaring", { id, score: -2 })).json();
  assert.equal(d.ervaring.at(-1).s, -2);
  d = await (await post("/api/kaart/psk", { id, score: 6 })).json();
  assert.equal(d.psk.at(-1).s, 6);
  d = await (await post("/api/kaart/gedaan", { id, aan: true })).json();
  assert.equal(d.gedaan.length, 1);
  d = await (await post("/api/kaart/gedaan", { id, aan: true })).json();
  assert.equal(d.gedaan.length, 1, "aan:true is idempotent");
  assert.equal((await post("/api/kaart/oefening", { id, oef: 1 })).status, 200);
  assert.equal((await post("/api/kaart/oefening", { id, oef: 2 })).status, 400, "geen derde oefening");
  assert.equal((await post("/api/kaart/oefzwaar", { id, oef: "0" })).status, 200);
  for (const oef of [[0], "00", "01"]) assert.equal((await post("/api/kaart/oefening", { id, oef })).status, 400, "geen lijst of voorloopnul: " + JSON.stringify(oef));
  assert.equal((await post("/api/kaart/antwoord/gezien", { id })).status, 200);
  const k = (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json()).kaart;
  assert.deepEqual(Object.keys(k.oefTrouw), ["Lunge"]);
  assert.deepEqual(Object.keys(k.oefZwaar), ["Squat"]);
  assert.equal(k.mijnSeintjes.at(-1).soort, "pijn");
  // de voorbeeldkaart reageert, maar bewaart niets
  assert.equal((await post("/api/kaart/meting", { id: "demo", score: 2 })).status, 200);
  console.log("test-patient-onderdeel: ok (vaste controle op invoer, " + PATIENT_ROUTES.length + " patiëntroutes in een eigen onderdeel, gedrag gelijk)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r)).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
