// Security-routine 2026-11-21 12u. Twee punten uit de backlog van 04u:
// 1. Een proef zonder abonnement wordt 30 dagen na het einde gewist (praktijkWisOp). Praktijk en
//    patiënt zien die datum ook (verdwijntOp), maar /k keek alleen naar de bewaartermijn van de
//    kaart zelf. De wisronde draait elk uur: tot dan (of langer als wissen faalde) opende de patiënt
//    de kaart nog, met scores en antwoorden, na de beloofde datum (art. 5 lid 1e AVG). Nu telt de
//    wisdatum van de praktijk mee in kaartLeeft: 404 op /k en op de therapeutroutes.
// 2. /api/kaarten/herstel telde een mis niet voor de kaartrem, de andere kaartroutes wel.
// Zonder browser. `npm run test:kaartwisdatum`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartwisdatum-"));
const dag = 86400000;
const nu = Date.now();
const PK = "proefpk0001", PROEF = "proef00000000001", ID = "d1e2f3a4b5c6";
const LOS = "fysio los zonder proef", ID_LOS = "e1f2a3b4c5d6";
// de wisdatum van de praktijk valt ~8 s na de start: de proefronde 5 s na de start wist nog niet,
// de volgende komt pas over een uur
const wisOp = nu + 8000;
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  [PROEF]: { id: PROEF, email: ["proef", "praktijk.invalid"].join("@"), naam: "Test Proef", tel: "+31687654321", praktijk: "Fysio Proef",
    gestart: wisOp - 44 * dag, verloopt: wisOp - 30 * dag, akkoord: "x", tokens: [] }
}));
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  [PK]: { naam: "Fysio Proef", proef: { id: PROEF }, leden: [{ id: "l1", naam: "Test Proef", rol: "beheerder", hash: "x" }] }
}));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  [PK]: { kaart: { id: ID, naam: "Kaart", ts: nu - dag, chosen: [], client: { c_naam: "Jan" }, metingen: [{ t: nu - dag, s: 3 }], gedaan: [] } },
  [LOS]: { kaart: { id: ID_LOS, naam: "Los", ts: nu - dag, chosen: [], client: { c_naam: "Piet" }, metingen: [], gedaan: [] } }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const kaart = (id) => fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.91.0." + (ip++ % 250) } });
const post = (pad, body, xff) => fetch(origin + pad, {
  method: "POST",
  headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", "x-forwarded-for": xff, "x-admin-sleutel": SLEUTEL },
  body: JSON.stringify(body)
});

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  assert.ok(Date.now() < wisOp - 1000, "de server startte op tijd (anders zegt deze test niets)");
  assert.equal((await kaart(ID)).status, 200, "vóór de wisdatum opent de patiënt de kaart");

  while (Date.now() < wisOp + 500) await wacht(100);
  const opSchijf = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  assert.ok(opSchijf[PK] && opSchijf[PK].kaart, "de kaart staat nog op schijf: de wisronde is nog niet langs geweest");
  assert.equal((await kaart(ID)).status, 404, "na de wisdatum van de praktijk opent /k de kaart niet meer");
  assert.equal((await kaart(ID_LOS)).status, 200, "een kaart van een praktijk zonder proef blijft gewoon open");

  // herstellen: na 30 missers vanaf één adres de kaartrem (429), net als op de andere kaartroutes
  const statussen = [];
  for (let i = 0; i < 31; i++) {
    const r = await post("/api/kaarten/herstel", { praktijk: LOS, id: (0xa00000000000 + i).toString(16) }, "10.92.0.7");
    statussen.push(r.status);
  }
  assert.deepEqual(statussen.slice(0, 30), Array(30).fill(404), "de eerste 30 missers geven 404");
  assert.equal(statussen[30], 429, "de 31e mis op /api/kaarten/herstel raakt de kaartrem (was " + statussen[30] + ")");
  console.log("test-kaart-wisdatum: ok (/k dicht na de wisdatum van de praktijk, kaartrem op herstellen)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
