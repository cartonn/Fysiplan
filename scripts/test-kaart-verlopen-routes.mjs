// Security-routine 2026-11-21 04u, audit (d) gedeelde kaarten: een kaart voorbij de bewaartermijn
// bestaat niet meer voor de patiënt (vindKaart) en niet meer in het overzicht, maar de opruimronde
// haalt hem pas elke zes uur van schijf. Tot die tijd vonden de therapeutroutes op één kaart
// (antwoord, afspraak, naam, archief, notitie, ...) hem nog wel. Een antwoord of afspraak zette een
// nieuw tijdstip op de kaart, afronden een nieuwe `gearchiveerdOp`: de kaart kwam weer tot leven,
// mét alle scores van de patiënt en de oude patiëntlink, langer dan de bewaartermijn belooft
// (art. 5 lid 1e AVG). Nu: dezelfde regel als vindKaart (`kaartLeeft`), dus 404.
// `npm run test:kaartverlopen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartverlopen-"));
const dag = 86400000;
const PRAKTIJK = "fysio verlopen kaart";
const OUD = "b1c2d3e4f5a6";
const LEVEND = "c1d2e3f4a5b6";
const nu = Date.now();
// de oude kaart verloopt een paar seconden na de start: de opruimronde bij het opstarten ziet hem
// nog levend en laat hem staan, de volgende ronde komt pas over zes uur
const verloopt = nu + 6000;
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  [PRAKTIJK]: {
    oud: { id: OUD, naam: "Oud", ts: verloopt - 90 * dag, chosen: [], client: { c_naam: "Oud" }, metingen: [{ t: verloopt - 90 * dag, s: 4 }], gedaan: [] },
    levend: { id: LEVEND, naam: "Levend", ts: nu, chosen: [], client: { c_naam: "Levend" }, metingen: [], gedaan: [] }
  }
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
const post = (pad, body) => fetch(origin + pad, {
  method: "POST",
  headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin",
    "x-forwarded-for": "10.79.0." + (ipTeller++ % 250), "x-admin-sleutel": SLEUTEL },
  body: JSON.stringify(body)
});

const routes = [
  ["/api/kaart/antwoord", { tekst: "Tot dinsdag" }],
  ["/api/kaart/afspraak", { t: nu + 2 * dag }],
  ["/api/kaart/archief", { archief: true }],
  ["/api/kaart/naam", { naam: "Oud Nieuw" }],
  ["/api/kaart/notitie", { tekst: "x" }],
  ["/api/kaart/behandelaar", { naam: "x" }],
  ["/api/kaart/psk-doel", { activiteit: "traplopen" }],
  ["/api/kaart/doel", { doel: 3 }],
  ["/api/kaart/seintje/gezien", {}],
  ["/api/kaart/oefzwaar/gezien", {}],
  ["/api/kaart/dossier", { aan: true }],
  ["/api/praktijk/inbox/afgehandeld", {}],
  ["/api/kaart/nieuwe-link", {}]
];

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  while (Date.now() < verloopt + 300) await wacht(100);
  // de oude kaart staat nog op schijf (anders zegt deze test niets)
  const voor = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  assert.ok(voor[PRAKTIJK] && voor[PRAKTIJK].oud && voor[PRAKTIJK].oud.id === OUD, "de verlopen kaart staat nog op schijf");
  const p = await fetch(origin + "/api/kaart?id=" + OUD, { headers: { "x-forwarded-for": "10.80.0.1" } });
  assert.equal(p.status, 404, "de patiënt ziet de verlopen kaart niet meer");

  for (const [pad, extra] of routes) {
    const r = await post(pad, { praktijk: PRAKTIJK, id: OUD, ...extra });
    assert.equal(r.status, 404, pad + " op een verlopen kaart geeft 404 (was " + r.status + ")");
  }
  const na = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  const oud = na[PRAKTIJK] && na[PRAKTIJK].oud;
  assert.ok(oud, "de verlopen kaart is niet hernoemd");
  assert.equal(oud.id, OUD, "geen nieuwe link op de verlopen kaart");
  assert.equal(oud.ts, verloopt - 90 * dag, "geen nieuw tijdstip op de verlopen kaart");
  assert.ok(!oud.antwoord && !oud.afspraak && !oud.gearchiveerd, "geen antwoord, afspraak of afronding op de verlopen kaart");
  const p2 = await fetch(origin + "/api/kaart?id=" + OUD, { headers: { "x-forwarded-for": "10.80.0.2" } });
  assert.equal(p2.status, 404, "de oude patiëntlink blijft dood");

  // een lopende kaart in dezelfde praktijk werkt gewoon
  const r = await post("/api/kaart/antwoord", { praktijk: PRAKTIJK, id: LEVEND, tekst: "Tot dinsdag" });
  assert.equal(r.status, 200, "antwoord op een lopende kaart werkt nog");
  const a = await post("/api/kaart/archief", { praktijk: PRAKTIJK, id: LEVEND, archief: true });
  assert.equal(a.status, 200, "afronden van een lopende kaart werkt nog");
  console.log("test-kaart-verlopen-routes: ok (" + routes.length + " therapeutroutes geven 404 op een verlopen kaart)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
