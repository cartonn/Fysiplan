#!/usr/bin/env node
// Zet de avatartekeningen (begin + eind) van de nieuwe lijntekeningen in de V2-catalogus.
// Bron: output/lege-categorieen-voorbeelden/avatars/<categorie>/<slug>-avatar[-vN].png (hoogste
// versie wint) of, voor de 7 voorbeeldoefeningen, de goedgekeurde voorbeeldbestanden.
// Schrijft public/images/<categorie>/<slug>-avatar-v8.jpg (800x1200, wit), zet kaartImg in
// public/oefeningen-v2.json en legt pad + sha256 vast in content/nieuwe-lijntekeningen.json.
// Gebruik: node scripts/importeer-nieuwe-avatars.mjs [--write]
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const bronMap = path.join(root, "output", "lege-categorieen-voorbeelden", "avatars");
const registerPad = path.join(root, "content", "nieuwe-lijntekeningen.json");
const cataloguePad = path.join(root, "public", "oefeningen-v2.json");
const schrijf = process.argv.includes("--write");

// Goedgekeurde voorbeeldavatars (Ahmed 2026-11-06), tenzij er een nieuwere in de categoriemap staat.
const VOORBEELDEN = {
  "Kin intrekken – zittend actief": "01-avatar-v2.png",
  // "Tandemstand – met steun": 02 is nog niet goed (voeten naast elkaar); wacht op een nieuwe versie in de categoriemap.
  "Voorwerp van vloer tillen – ergonomische basis": "03-avatar.png",
  "Landing op twee benen – techniek langzaam": "04-avatar.png",
  "Symmetrisch opstaan – met fysieke steun": "05-avatar.png",
  "Blikstabilisatie horizontaal – zittend langzaam": "06-avatar-v2.png",
  "Bekkenkanteling postpartum – eerste fase rustig": "07-avatar.png",
};

function bronVoor(entry) {
  const [, cat, bestand] = entry.img.match(/^images\/([^/]+)\/(.+)-line-v1\.png$/) || [];
  if (!cat) throw new Error(`Onverwacht lijnpad ${entry.img}`);
  const map = path.join(bronMap, cat);
  if (existsSync(map)) {
    const versies = readdirSync(map)
      .map((f) => f.match(new RegExp(`^${bestand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-avatar(?:-v(\\d+))?\\.png$`)))
      .filter(Boolean)
      .sort((a, b) => Number(b[1] || 1) - Number(a[1] || 1));
    if (versies.length) return { bron: path.join(map, versies[0][0]), cat, bestand };
  }
  const voorbeeld = VOORBEELDEN[entry.naam];
  if (voorbeeld && existsSync(path.join(bronMap, voorbeeld))) return { bron: path.join(bronMap, voorbeeld), cat, bestand };
  return { bron: null, cat, bestand };
}

const register = JSON.parse(await readFile(registerPad, "utf8"));
const catalogue = JSON.parse(await readFile(cataloguePad, "utf8"));
const perNaam = new Map(catalogue.map((e) => [e.naam, e]));
const ontbreekt = [];
let klaar = 0;
for (const entry of register.lijntekeningen) {
  const { bron, cat, bestand } = bronVoor(entry);
  if (!bron) { ontbreekt.push(entry.naam); continue; }
  const kaartImg = `images/${cat}/${bestand}-avatar-v8.jpg`;
  const jpg = await sharp(bron).flatten({ background: "#fff" })
    .resize(800, 1200, { fit: "contain", background: "#fff" })
    .jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const record = perNaam.get(entry.naam);
  if (!record) throw new Error(`Geen V2-record: ${entry.naam}`);
  if (schrijf) {
    await writeFile(path.join(root, "public", kaartImg), jpg);
    entry.kaartImg = kaartImg;
    entry.kaartSha256 = createHash("sha256").update(jpg).digest("hex");
    entry.kaartBron = path.relative(root, bron);
    record.kaartImg = kaartImg;
  }
  klaar++;
}
if (schrijf) {
  await writeFile(registerPad, `${JSON.stringify(register, null, 2)}\n`);
  await writeFile(cataloguePad, `${JSON.stringify(catalogue, null, 1)}\n`);
}
console.log(JSON.stringify({ schrijf, klaar, ontbreekt: ontbreekt.length, voorbeeldOntbreekt: ontbreekt.slice(0, 10) }));
