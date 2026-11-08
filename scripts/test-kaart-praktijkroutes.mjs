// Security-routine 2026-11-08 12u, audit (d) gedeelde kaarten: de therapeutroutes op één kaart
// (antwoord, afspraak, nieuwe link, archief, naam, notitie, ...) gebruikten `eisPraktijk`. Die laat
// ALLES door bij een praktijk zonder wachtwoord. Kaarten van zo'n praktijk bestaan nog (gedeeld
// via v1 of de beheersleutel, of van vóór de wachtwoordplicht). Wie de geprinte kaart heeft
// (QR = kaart-id, praktijknaam staat erop), kon zo namens "de praktijk" een bericht en een
// afspraak op de patiëntkaart zetten, de kaart archiveren (bewaartermijn) of de link breken.
// Nu: dezelfde poort als het overzicht (`eisBeveiligdePraktijk`): zonder wachtwoord alleen v1 en
// een eigen beheersleutel. `npm run test:kaartroutes`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartroutes-"));
const ID = "a1b2c3d4e5f6";
const PRAKTIJK = "fysio oud zonder wachtwoord";
const nu = Date.now();
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  [PRAKTIJK]: { jan: { id: ID, naam: "Jan", ts: nu, chosen: [], client: { c_naam: "Jan" }, metingen: [], gedaan: [] } }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ipTeller = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, {
  method: "POST",
  headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", "x-forwarded-for": "10.77.0." + (ipTeller++ % 250), ...extra },
  body: JSON.stringify(body)
});

const routes = [
  ["/api/kaart/antwoord", { tekst: "Bel dit nummer voor je uitslag" }],
  ["/api/kaart/afspraak", { t: nu + 86400000 }],
  ["/api/kaart/nieuwe-link", {}],
  ["/api/kaart/archief", { archief: true }],
  ["/api/kaart/naam", { naam: "Overgenomen" }],
  ["/api/kaart/notitie", { tekst: "x" }],
  ["/api/kaart/behandelaar", { naam: "x" }],
  ["/api/kaart/psk-doel", { doel: "x" }],
  ["/api/kaart/doel", { doel: 3 }],
  ["/api/kaart/seintje/gezien", {}],
  ["/api/kaart/oefzwaar/gezien", {}]
];

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // 1) zonder login, met praktijknaam + kaart-id van de geprinte kaart: alles dicht
  for (const [pad, extra] of routes) {
    const r = await post(pad, { praktijk: PRAKTIJK, id: ID, ...extra });
    assert.equal(r.status, 401, pad + " zonder wachtwoord op de praktijk geeft 401 (was " + r.status + ")");
  }
  const k = await (await fetch(origin + "/api/kaart?id=" + ID, { headers: { "x-forwarded-for": "10.78.0.1" } })).json();
  assert.ok(!k.antwoord || !k.antwoord.tekst, "geen vals praktijkbericht op de patiëntkaart");
  assert.ok(!k.afspraak, "geen valse afspraak op de patiëntkaart");
  assert.notEqual(k.gearchiveerd, true, "kaart niet gearchiveerd");
  const opSchijf = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  assert.equal(opSchijf[PRAKTIJK].jan.id, ID, "de patiëntlink werkt nog (zelfde id)");
  assert.equal(opSchijf[PRAKTIJK].jan.naam, "Jan", "naam niet gewijzigd");

  // 2) de eigen beheersleutel mag het nog (zoals bij het overzicht)
  const r = await post("/api/kaart/antwoord", { praktijk: PRAKTIJK, id: ID, tekst: "Tot dinsdag" }, { "x-admin-sleutel": SLEUTEL });
  assert.equal(r.status, 200, "beheer met eigen sleutel werkt nog");
  console.log("test-kaart-praktijkroutes: ok (" + routes.length + " therapeutroutes dicht zonder praktijkwachtwoord)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
