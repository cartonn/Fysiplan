// Code tegen tekst (legal-routine 2026-11-12 21u, gebied d):
// 1. Sinds #247 houdt de server per kaart een leeslog bij (wie opende of bewaarde welke kaart, en wanneer).
//    /privacy en de verwerkersovereenkomst noemden het niet (art. 13 lid 1 c, lid 2 a; art. 28 lid 3 c en art. 32 AVG).
// 2. Sinds #251 kan een PostgreSQL-database meeschrijven, met eerdere versies van een kaart. De Railway-rij moet
//    dat noemen zodra hij aan staat, en niet zolang hij uit staat.
// 3. De download (art. 15/20) bevat sinds #247/#254 ook het leeslog en de eigen vragen; de uitleg op /v2/gegevens zei dat niet.
// Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BEWAAR_DAGEN, MAX_PER_KAART } from "../lib/leeslog.js";

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

async function paginas(extraEnv, paden) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-privleeslog-"));
  const port = await vrijePoort();
  const origin = "http://127.0.0.1:" + port;
  let uitvoer = "";
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "",
      DATABASE_URL: "", DATABASE_MEESCHRIJVEN: "", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    const uit = {};
    for (const pad of paden) {
      const res = await fetch(origin + pad);
      assert.equal(res.status, 200, pad + " bereikbaar\n" + uitvoer);
      uit[pad] = await res.text();
    }
    return uit;
  } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}

// --- standaard: database uit ---
const a = await paginas({}, ["/privacy", "/verwerkersovereenkomst", "/v2/gegevens"]);
const privacy = a["/privacy"];
assert.doesNotMatch(privacy, /__[A-Z_]+__/, "geen placeholders over");
assert.doesNotMatch(privacy, /<!--\/?database-->/, "markeringen weg");

const rij = (privacy.match(/<tr id="leeslog">[\s\S]*?<\/tr>/) || [""])[0];
assert.ok(rij, "/privacy heeft een rij over het leeslog");
for (const [re, wat] of [
  [/opende of bewaarde/, "wat erin staat"], [/overzicht van alle kaarten/, "overzicht"], [/berichten van pati&euml;nten/, "berichten"],
  [/download/, "download"], [/Geen naam van een pati&euml;nt/, "geen patiëntnaam"], [/eigen kaart opent, staat er niet in/, "patiënt zelf niet"],
  [/beheerder van je praktijk ziet het/, "wie het ziet"], [/een therapeut niet/, "therapeut niet"],
  [/Tot de kaart voorgoed weg is/, "weg met de kaart"], [new RegExp("hooguit " + BEWAAR_DAGEN + " dagen"), "termijn uit de code"],
  [new RegExp("laatste " + MAX_PER_KAART + " regels"), "plafond uit de code"]]) assert.match(rij, re, "leeslogrij noemt " + wat);

const einde = (privacy.match(/<p id="einde">[\s\S]*?<\/p>/) || [""])[0];
assert.match(einde, /eigen vragen bij oefeningen/, "Als je stopt noemt de eigen vragen (#254)");
assert.match(einde, /leeslog/, "Als je stopt noemt het leeslog");

const railway = (privacy.match(/<tr><td>Railway<\/td>[\s\S]*?<\/tr>/) || [""])[0];
assert.ok(railway, "Railway-rij staat er");
assert.doesNotMatch(railway, /database|versies van een kaart/, "database uit: de Railway-rij noemt geen database");

const vwo = a["/verwerkersovereenkomst"];
assert.match(vwo, /<li>een leeslog per kaart: wie van de praktijk een kaart opende of bewaarde/, "VWO art. 5 noemt het leeslog");

const gegevens = a["/v2/gegevens"];
assert.match(gegevens, /het leeslog van je kaarten/, "uitleg download noemt het leeslog");
assert.match(gegevens, /eigen vragen daarbij/, "uitleg download noemt de eigen vragen");

// --- database aan (onbereikbaar adres: de server draait door, de tekst volgt de schakelaar) ---
const b = await paginas({ DATABASE_URL: "postgres://test@127.0.0.1:1/test", DATABASE_MEESCHRIJVEN: "aan" }, ["/privacy"]);
const railwayAan = (b["/privacy"].match(/<tr><td>Railway<\/td>[\s\S]*?<\/tr>/) || [""])[0];
assert.doesNotMatch(b["/privacy"], /<!--\/?database-->/, "markeringen weg");
assert.match(railwayAan, /een database die een kopie bijhoudt/, "database aan: Railway-rij noemt de database");
assert.match(railwayAan, /in dezelfde regio/, "database aan: regio");
assert.match(railwayAan, /hooguit 100 per kaart, en ze verdwijnen met de kaart/, "database aan: kaartversies en termijn");

const { VERSIES_PER_KAART } = await import("../lib/database.js");
assert.equal(VERSIES_PER_KAART, 100, "tekst zegt 100 versies per kaart; pas /privacy aan als dit verandert");

console.log("test-privacy-leeslog: ok");
