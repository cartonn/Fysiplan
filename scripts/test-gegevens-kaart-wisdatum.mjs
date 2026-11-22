// Legal 2026-11-22 (rechten van betrokkenen, art. 15 lid 1 d AVG): de download op /v2/gegevens
// noemt per kaart `verlooptOp`. Voor een kaart in de prullenbak was dat al de vroegste van herstelTot
// en de wisdatum van de praktijk, maar voor een gewone kaart gaf hij de bewaartermijn van de kaart
// (tot 90 dagen), ook als de praktijk eerder verdwijnt: een proef zonder abonnement of een opgezegd
// abonnement. Sinds #428/#430 gaat de kaart op die wisdatum dicht en wordt hij gewist; de download
// moet dan die datum noemen, zoals het overzicht en de patiëntkaart (verdwijntOp).
// Zonder browser. Onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gegevens-wisdatum-"));
const nu = Date.now();
const dag = 86400000;
const ww = (w) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(w, s, 32).toString("hex"); };
const tok = (t) => createHash("sha256").update(t).digest("hex");
const vwo = { versie: "2026-11-01", t: new Date(nu).toISOString() };
const proefVerloopt = nu + 5 * dag;

await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p_wd: { id: "p_wd", email: "proef@wisdatum.test", naam: "Proef Wisdatum", tel: "+31612345678", praktijk: "Fysio Proefwis",
    gestart: nu - 9 * dag, verloopt: proefVerloopt, akkoord: nu - 9 * dag, tokens: [tok("f".repeat(48))], kaarten: 1 }
}));
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio proefwis": { naam: "Fysio Proefwis", hash: ww("proefwis-wachtwoord-1"), gemaakt: nu - 9 * dag, vwo,
    proef: { id: "p_wd", verloopt: proefVerloopt } },
  "fysio zonderproef": { naam: "Fysio Zonderproef", hash: ww("zonderproef-wachtwoord-1"), gemaakt: nu, vwo }
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 60 * dag }));
const kaart = (id, naam, extra = {}) => ({ id, naam, ts: nu, chosen: [{ n: "Squat", i: 0 }], rows: {}, cells: {}, vids: {},
  metingen: [{ t: nu, s: 3 }], ...extra });
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio proefwis": {
    anna: kaart("cccccccccc01", "Anna"),
    // afgerond vandaag: 30 dagen na afronden, dat is vóór de wisdatum, dus die datum blijft
    bob: kaart("cccccccccc02", "Bob", { gearchiveerd: true, gearchiveerdOp: nu })
  },
  "fysio zonderproef": { cor: kaart("cccccccccc03", "Cor") }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"] });
let uitvoer = "";
app.stdout.on("data", (c) => { uitvoer += c; });
app.stderr.on("data", (c) => { uitvoer += c; });
let ip = 1;
const download = async (praktijk, wachtwoord) => {
  const r = await fetch(origin + "/v2/gegevens/download", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.7.0." + (ip++) },
    body: new URLSearchParams({ praktijk, wachtwoord }).toString() });
  assert.equal(r.status, 200, "download " + praktijk);
  return r.json();
};

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  const wisdatum = proefVerloopt + 30 * dag;
  const pakket = await download("Fysio Proefwis", "proefwis-wachtwoord-1");
  assert.equal(pakket.kaarten.length, 2);
  const verwacht = { Anna: wisdatum, Bob: nu + 30 * dag };
  for (const k of pakket.kaarten) {
    assert.equal(Date.parse(k.verlooptOp), verwacht[k.naam], k.naam + ": download noemt de vroegste van bewaartermijn en wisdatum van de praktijk (" + k.verlooptOp + ")");
  }

  // zonder proef of opgezegd abonnement blijft het de bewaartermijn van de kaart (90 dagen stil)
  const ander = await download("Fysio Zonderproef", "zonderproef-wachtwoord-1");
  assert.equal(ander.kaarten.length, 1);
  assert.equal(Date.parse(ander.kaarten[0].verlooptOp), nu + 90 * dag, "zonder wisdatum: de bewaartermijn van de kaart");

  console.log("ok: download noemt per kaart de dag dat hij echt verdwijnt");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); }
  await rm(dataDir, { recursive: true, force: true });
}
