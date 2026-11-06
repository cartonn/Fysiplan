// Zet goedgekeurde nieuwe lijntekeningen (beginhouding + pijl, gemaakt in
// output/lege-categorieen-voorbeelden/, bron per oefening in omschrijvingen.csv)
// op het bestaande img-pad van hun V2-record. Zolang er geen avatarkaart is,
// verdwijnt het kaartImg-veld (dat wees naar een niet-bestaand bestand), zodat
// app en kaart het lijnbeeld tonen. Legt alles vast in content/nieuwe-lijntekeningen.json.
//
//   node scripts/importeer-nieuwe-lijntekeningen.mjs            # controle, schrijft niets
//   node scripts/importeer-nieuwe-lijntekeningen.mjs --write
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { exerciseId } from "../lib/exercise-id.js";

const root = path.resolve(import.meta.dirname, "..");
const bronMap = path.join(root, "output", "lege-categorieen-voorbeelden");
const write = process.argv.includes("--write");

// de eerste zeven voorbeelden staan los, buiten omschrijvingen.csv
const VOORBEELDEN = {
  "Kin intrekken – zittend actief": "01-nek-kin-intrekken-zittend.png",
  "Tandemstand – met steun": "02-balans-tandemstand-met-steun.png",
  "Voorwerp van vloer tillen – ergonomische basis": "03-werk-voorwerp-van-vloer-tillen.png",
  "Landing op twee benen – techniek langzaam": "04-sportrevalidatie-landing-twee-benen.png",
  "Symmetrisch opstaan – met fysieke steun": "05-neuro-symmetrisch-opstaan-met-steun.png",
  "Blikstabilisatie horizontaal – zittend langzaam": "06-vestibulair-blikstabilisatie-horizontaal.png",
  "Bekkenkanteling postpartum – eerste fase rustig": "07-bekken-postpartum-bekkenkanteling.png",
};

function leesCsv(tekst) {
  const regels = [];
  let rij = [], veld = "", inAanhaling = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (inAanhaling) {
      if (c === '"' && tekst[i + 1] === '"') { veld += '"'; i++; }
      else if (c === '"') inAanhaling = false;
      else veld += c;
    } else if (c === '"') inAanhaling = true;
    else if (c === ",") { rij.push(veld); veld = ""; }
    else if (c === "\n") { rij.push(veld); regels.push(rij); rij = []; veld = ""; }
    else if (c !== "\r") veld += c;
  }
  if (veld || rij.length) { rij.push(veld); regels.push(rij); }
  const [kop, ...rest] = regels;
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(kop.map((k, i) => [k, r[i] ?? ""])));
}

const catalogusPad = path.join(root, "public", "oefeningen-v2.json");
const catalogus = JSON.parse(await fs.readFile(catalogusPad, "utf8"));
const perNaam = new Map(catalogus.map((e) => [e.naam, e]));
const rijen = leesCsv(await fs.readFile(path.join(bronMap, "omschrijvingen.csv"), "utf8"));
const lijst = [
  ...Object.entries(VOORBEELDEN).map(([naam, bestand]) => ({ naam, bestand, bron_url: "", bron_titel: "voorbeeldset" })),
  ...rijen,
];

const register = [];
for (const rij of lijst) {
  const e = perNaam.get(rij.naam);
  if (!e) throw new Error(`Geen V2-record: ${rij.naam}`);
  if (!/-line-v1\.png$/.test(e.img)) throw new Error(`${rij.naam}: onverwacht img-pad ${e.img}`);
  const doel = path.join(root, "public", e.img);
  const png = await sharp(path.join(bronMap, rij.bestand))
    .flatten({ background: "#fff" })
    .resize(800, 1200, { fit: "contain", background: "#fff" })
    .png({ compressionLevel: 9, palette: true, colours: 64 })
    .toBuffer();
  if (write) {
    await fs.mkdir(path.dirname(doel), { recursive: true });
    await fs.writeFile(doel, png);
    delete e.kaartImg;
  }
  register.push({
    exerciseId: exerciseId(e), naam: e.naam, groep: e.groep, img: e.img,
    sha256: createHash("sha256").update(png).digest("hex"),
    bron: rij.bron_url || null, bronTitel: rij.bron_titel || null,
  });
}
if (new Set(register.map((r) => r.naam)).size !== register.length) throw new Error("Dubbele oefening in de lijst");
if (write) {
  await fs.writeFile(catalogusPad, `${JSON.stringify(catalogus, null, 1)}\n`);
  await fs.writeFile(path.join(root, "content", "nieuwe-lijntekeningen.json"), `${JSON.stringify({
    schemaVersion: 1,
    stijl: "één figuur in de beginhouding met één zwarte pijl naar de eindhouding, zelfde stijl als images/beginhouding-pijl-v1 (Runway gpt_image_2; goedgekeurd door eigenaar 2026-11-06)",
    clinicalApproved: false,
    lijntekeningen: register,
  }, null, 1)}\n`);
}
console.log(`${register.length} nieuwe lijntekeningen ${write ? "geschreven" : "gecontroleerd (gebruik --write)"}.`);
