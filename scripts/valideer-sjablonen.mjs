// Bewaakt dat elk kaartsjabloon uitsluitend verwijst naar oefeningen die het
// publieke v2-kanaal echt publiceert. Les van 2026-09-09: na de curatie van de
// bibliotheek verwezen vijf sjablonen naar niet-gepubliceerde oefeningen en
// leverde "één klik en de kaart staat vol" een lege kaart met foutmelding op.
// Deze validator draait in de buildketen (lokaal én op Railway): drift tussen
// sjablonen.json en de bibliotheek blokkeert voortaan de deploy, luidkeels.
//
// "Gepubliceerd" spiegelt imageReady in server.js: het kaartbeeld (of anders
// het gewone beeld) moet als bestand onder public/ bestaan. Runtime-beheer
// (verwijderde of hernoemde oefeningen in DATA_DIR) is hier bewust buiten
// beeld: dat is een handeling van de beheerder op de server, geen drift die
// een commit kan introduceren.
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const sjablonen = JSON.parse(await readFile(join(publicDir, "sjablonen.json"), "utf8"));
const bibliotheek = JSON.parse(await readFile(join(publicDir, "oefeningen-v2.json"), "utf8"));

const bestaat = async (p) => {
  try { await access(join(publicDir, String(p).replace(/^\/+/, "")), constants.R_OK); return true; }
  catch { return false; }
};
const gepubliceerd = new Set();
for (const e of bibliotheek) {
  const bron = String(e.kaartImg || e.img || "");
  if (bron && (/^(?:data:|https?:|uploads\/)/.test(bron) || await bestaat(bron))) gepubliceerd.add(e.naam);
}

const fouten = [];
if (!Array.isArray(sjablonen) || !sjablonen.length) fouten.push("sjablonen.json is leeg of geen lijst");
for (const s of Array.isArray(sjablonen) ? sjablonen : []) {
  const naam = String(s && s.naam || "").trim();
  if (!naam) { fouten.push("sjabloon zonder naam"); continue; }
  if (!String(s.sub || "").trim()) fouten.push(`${naam}: mist de sub-omschrijving`);
  const oef = Array.isArray(s.oefeningen) ? s.oefeningen : [];
  if (oef.length < 1 || oef.length > 12) fouten.push(`${naam}: ${oef.length} oefeningen (verwacht 1-12; een kaart kan er maximaal 12 aan)`);
  for (const o of oef) {
    const n = typeof o === "string" ? o : String(o && o.n || "");
    if (!gepubliceerd.has(n)) fouten.push(`${naam}: "${n}" is niet (meer) gepubliceerd in het v2-kanaal`);
  }
}

if (fouten.length) {
  console.error(`Sjablonen-validatie ROOD (${fouten.length} fouten):`);
  for (const f of fouten) console.error("  - " + f);
  process.exit(1);
}
console.log(`Sjablonen geldig: ${sjablonen.length} sjablonen, alle verwijzingen gepubliceerd (bibliotheek: ${gepubliceerd.size} oefeningen).`);
