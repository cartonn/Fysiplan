#!/usr/bin/env node
// Zet de goedgekeurde elleboog-, pols- en handoefeningen (Physitrack-richting, 2026-11-09) in de
// V2-catalogus: nieuwe records in public/oefeningen-v2.json, lijntekening (beginhouding + pijl) en
// avatartekening (begin boven, eind onder) in public/images/bovenste-extremiteit/, en elk beeld met
// sha256 in content/nieuwe-lijntekeningen.json.
//
// Bron: map output/elleboog-pols-hand/ van de werkbranch (specs.json, omschrijvingen.csv, PNG's).
// Ahmed koos op 2026-11-09 "De 25 goede nu, 5 later": 4, 11, 20, 24 en 26 blijven buiten de app.
//
//   node scripts/importeer-elleboog-pols-hand.mjs --bron <map>           # controle
//   node scripts/importeer-elleboog-pols-hand.mjs --bron <map> --write
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { exerciseId } from "../lib/exercise-id.js";

const root = path.resolve(import.meta.dirname, "..");
const arg = (naam) => { const i = process.argv.indexOf(naam); return i > 0 ? process.argv[i + 1] : null; };
const bron = arg("--bron");
if (!bron) throw new Error("Gebruik: --bron <map met specs.json en omschrijvingen.csv>");
const schrijf = process.argv.includes("--write");

const LATER = new Set(["pols-zijwaarts-op-tafel", "polsrondjes", "tafelstand-vingers", "knijpen-klei", "duim-spreiden"]);
const GROEP = "Bovenste extremiteit";
const MAP = "bovenste-extremiteit";

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

const specs = JSON.parse(await readFile(path.join(bron, "proefset", "specs.json"), "utf8"));
const omschrijving = new Map(leesCsv(await readFile(path.join(bron, "omschrijvingen.csv"), "utf8")).map((r) => [r.naam, r.omschrijving.trim()]));
const catalogusPad = path.join(root, "public", "oefeningen-v2.json");
const registerPad = path.join(root, "content", "nieuwe-lijntekeningen.json");
const catalogus = JSON.parse(await readFile(catalogusPad, "utf8"));
const register = JSON.parse(await readFile(registerPad, "utf8"));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

let nieuw = 0;
for (const spec of specs) {
  if (LATER.has(spec.slug)) continue;
  const uitleg = omschrijving.get(spec.naam);
  if (!uitleg) throw new Error(`Geen omschrijving voor ${spec.naam}`);
  const img = `images/${MAP}/${spec.slug}-line-v1.png`;
  const kaartImg = `images/${MAP}/${spec.slug}-avatar-v8.jpg`;
  const lijnBron = path.join(bron, "proefset", `${spec.slug}.png`);
  const avatarBron = path.join(bron, "proefset", `${spec.slug}-avatar.png`);
  const lijn = await sharp(lijnBron).flatten({ background: "#fff" })
    .resize(800, 1200, { fit: "contain", background: "#fff" })
    .png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer();
  const avatar = await sharp(avatarBron).flatten({ background: "#fff" })
    .resize(800, 1200, { fit: "contain", background: "#fff" })
    .jpeg({ quality: 86, mozjpeg: true }).toBuffer();

  const bestaand = catalogus.find((e) => e.naam === spec.naam);
  if (bestaand && bestaand.img !== img) throw new Error(`${spec.naam} bestaat al met een ander beeld`);
  const record = bestaand || { naam: spec.naam, groep: GROEP, img };
  record.uitleg = uitleg;
  record.kaartImg = kaartImg;
  if (!bestaand) { catalogus.push(record); nieuw++; }

  const entry = {
    nieuweOefening: true, exerciseId: exerciseId(record), naam: spec.naam, groep: GROEP, img, sha256: sha(lijn),
    bron: null, bronTitel: "Physitrack-richting elleboog, pols en hand (2026-11-09)",
    kaartImg, kaartSha256: sha(avatar), kaartBron: `output/elleboog-pols-hand/proefset/${spec.slug}-avatar.png`,
  };
  const i = register.lijntekeningen.findIndex((e) => e.naam === spec.naam);
  if (i >= 0) register.lijntekeningen[i] = entry; else register.lijntekeningen.push(entry);
  if (schrijf) {
    await writeFile(path.join(root, "public", img), lijn);
    await writeFile(path.join(root, "public", kaartImg), avatar);
  }
}
if (schrijf) {
  await writeFile(catalogusPad, `${JSON.stringify(catalogus, null, 1)}\n`);
  await writeFile(registerPad, `${JSON.stringify(register, null, 2)}\n`);
}
console.log(JSON.stringify({ schrijf, oefeningen: specs.length - LATER.size, nieuweRecords: nieuw }));
