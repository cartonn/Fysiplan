// Begrijpelijkheid (B1) van de juridische pagina's, en "In het kort" klopt met de artikelen
// en de code (legal 2026-11-09 17u). Vóór deze fix:
// - de voorwaarden-samenvatting zei "opzeggen, daarna wissen we je kaarten binnen 30 dagen",
//   terwijl art. 5 en de code (lib/mollie.js) pas 30 dagen na het einde van de betaalde maand
//   alles wissen, en de proef zonder abonnement (art. 3) ontbrak;
// - de privacy-samenvatting had niets voor de therapeut;
// - de opslag op de patiënttelefoon stond in één zin van 61 woorden, het datalekartikel in 41;
// - de abonnementstermijn stond als vaste "30" in de tekst in plaats van uit de code.
// Legal 2026-11-11 17u, /v2/gegevens (de pagina voor inzage, meenemen en wissen):
// - "Een losse kaart wis je in de app met Verwijderen" klopte sinds de prullenbak (#191) niet meer:
//   de kaart blijft dan nog dagen herstelbaar; meteen wissen kan alleen met Definitief verwijderen;
// - de waarschuwing bij Alles wissen stond in één zin van 35 woorden.
// Legal 2026-11-11 21u, voorwaarden (c): de landing belooft "je prijs staat minstens 24 maanden vast"
// (ook als "prijsgarantie" bij de oprichters), maar art. 4 zei alleen "een nieuwe prijs melden we
// 30 dagen vooraf" en "de artikelen hieronder gelden". Elke prijsbelofte op /v2 moet nu ook in de
// voorwaarden staan, in het artikel én in de samenvatting.
// Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NA_EINDE_WISSEN_DAGEN } from "../lib/mollie.js";

const serverBron = await readFile("server.js", "utf8");
const proefBewaar = Number(serverBron.match(/const PROEF_BEWAAR_DAGEN = (\d+)/)[1]);
const herstelDagen = Number(serverBron.match(/const KAART_HERSTEL_MS = (\d+) \* 86400000/)[1]);
const bron = await readFile("public/juridisch.html", "utf8");
// termijnen van het einde staan niet als vast getal in de tekst, maar komen uit de code
assert.doesNotMatch(bron, /binnen \d+ dagen na het einde|\d+ dagen na het einde wissen|wissen we alles binnen \d+ dagen/,
  "wis-termijn na het einde komt uit NA_EINDE_WISSEN_DAGEN, niet als vast getal");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-b1-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });

const ent = { "&euml;": "ë", "&eacute;": "é", "&oacute;": "ó", "&ldquo;": "“", "&rdquo;": "”", "&rsquo;": "’", "&amp;": "&", "&nbsp;": " " };
function zinnen(html) {
  const tekst = html.replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, "")
    .replace(/<(li|p|h\d|td|th|tr|div|ul)[^>]*>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, (e) => ent[e] || " ");
  return tekst.split("\n").flatMap((blok) => blok.split(/(?<=[.;:!?])\s+/)).map((z) => z.trim()).filter(Boolean);
}
const woorden = (z) => z.split(/\s+/).length;
const kort = (html) => (html.match(/<b>In het kort<\/b><\/p>\s*<ul>([\s\S]*?)<\/ul>/) || [])[1] || "";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const pag = {};
  for (const p of ["privacy", "verwerkersovereenkomst", "voorwaarden"]) {
    pag[p] = await (await fetch(origin + "/" + p)).text();
    assert.doesNotMatch(pag[p], /__[A-Z_]+__/, p + ": geen open plekhouders");
    // B1: geen zin langer dan 40 woorden (opsommingen in een lijst tellen per regel)
    for (const z of zinnen(pag[p])) assert.ok(woorden(z) <= 40, p + ": zin van " + woorden(z) + " woorden: " + z.slice(0, 120));
    const k = kort(pag[p]);
    assert.ok(k, p + ": heeft In het kort");
    for (const li of k.split("</li>").filter((s) => s.includes("<li>"))) {
      const n = woorden(li.replace(/<[^>]+>/g, "").trim());
      assert.ok(n <= 40, p + ": samenvattingspunt van " + n + " woorden");
    }
  }
  // patiëntdeel: korte zinnen (hooguit 30 woorden)
  const patient = pag.privacy.split('id="patient"')[1].split("<h2")[0];
  for (const z of zinnen(patient)) assert.ok(woorden(z) <= 30, "patiëntdeel: zin van " + woorden(z) + " woorden: " + z.slice(0, 120));

  // /v2/gegevens: korte zinnen, en de uitleg over een losse kaart klopt met de prullenbak
  const gegevens = await (await fetch(origin + "/v2/gegevens")).text();
  assert.doesNotMatch(gegevens, /__[A-Z_]+__/, "gegevens: geen open plekhouders");
  for (const z of zinnen(gegevens)) assert.ok(woorden(z) <= 30, "gegevens: zin van " + woorden(z) + " woorden: " + z.slice(0, 120));
  assert.doesNotMatch(gegevens, /Een losse kaart wis je in de app met/, "gegevens: Verwijderen wist niet meteen (prullenbak)");
  assert.match(gegevens, new RegExp("hooguit " + herstelDagen + " dagen in de prullenbak"), "gegevens: hersteltermijn uit KAART_HERSTEL_MS");
  assert.match(gegevens, /&ldquo;Definitief verwijderen&rdquo;/, "gegevens: noemt Definitief verwijderen");
  assert.match(gegevens, /alle kaarten, ook die in de prullenbak/, "gegevens: Alles wissen neemt de prullenbak mee");

  // voorwaarden: samenvatting volgt art. 3 en 5
  const avKort = kort(pag.voorwaarden);
  assert.match(avKort, /einde van de maand die je al betaald hebt/, "voorwaarden kort: abonnement stopt aan het einde van de betaalde maand");
  assert.match(avKort, new RegExp(NA_EINDE_WISSEN_DAGEN + " dagen later wissen we alles"), "voorwaarden kort: wissen na het einde");
  assert.match(avKort, new RegExp("geen klant, dan wissen we alles van je praktijk " + proefBewaar + " dagen na de proef"), "voorwaarden kort: einde proef");
  assert.doesNotMatch(avKort, /Daarna wissen we je kaarten binnen/, "oude, onjuiste samenvatting is weg");
  // prijsbelofte van de landing staat ook in de voorwaarden (art. 4 en In het kort)
  const landing = await (await fetch(origin + "/v2")).text();
  const beloftes = [...landing.matchAll(/minstens (\d+) maanden vast|(\d+) maanden prijsgarantie/g)].map((m) => m[1] || m[2]);
  for (const n of new Set(beloftes)) {
    const art4 = pag.voorwaarden.split('id="abonnement"')[1].split("<h2")[0];
    assert.match(art4, new RegExp("staat minstens " + n + " maanden vast, gerekend vanaf de start van je abonnement"), "voorwaarden art. 4: prijsbelofte van " + n + " maanden van /v2");
    assert.match(art4, new RegExp("Prijswijziging na die " + n + " maanden"), "voorwaarden art. 4: prijswijziging pas na de belofte");
    assert.match(avKort, new RegExp("Je prijs staat minstens " + n + " maanden vast"), "voorwaarden kort: prijsbelofte");
  }
  // privacy: samenvatting ook voor de therapeut
  assert.match(kort(pag.privacy), /Therapeut\?[\s\S]*href="#einde"/, "privacy kort: regel voor de therapeut");
  assert.match(kort(pag.privacy), new RegExp(NA_EINDE_WISSEN_DAGEN + " dagen na het einde van je abonnement, of " + proefBewaar + " dagen na de proef"));
  // gewone taal naast de juridische term
  assert.match(pag.privacy, /<b>Waarom dit mag\.<\/b> De wet noemt dit de grondslag\./);
  assert.match(pag.privacy, /<b>bezwaar maken<\/b> als we gegevens gebruiken om de dienst veilig te houden/);
  assert.match(pag.verwerkersovereenkomst, /\(een datalek\)[\s\S]*uiterlijk binnen 48 uur/);
  assert.match(pag.verwerkersovereenkomst, new RegExp("wissen we alles binnen " + NA_EINDE_WISSEN_DAGEN + " dagen"));
  console.log("ok: juridische pagina's B1 en samenvattingen kloppen met de code");
} catch (e) {
  console.error(uitvoer.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
