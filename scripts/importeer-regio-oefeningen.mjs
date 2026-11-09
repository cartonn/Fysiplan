#!/usr/bin/env node
// Zet de goedgekeurde oefeningen van één regio (Physitrack-richting, eigen tekst en beeld) in de
// V2-catalogus en voegt de bijbehorende behandelkaarten toe. Opvolger van
// scripts/importeer-elleboog-pols-hand.mjs, voor alle volgende regio's (Ahmed 2026-11-09:
// "akkoord, maak alle ontbrekende oefeningen ...", "merge alles, volg je eigen advies").
//
// Bron (map van de werkbranch claude/project-thread-f3nc3q-<regio>, output/<regio>/):
//   omschrijvingen.csv        naam, omschrijving (eigen tekst)
//   proefset/ of beelden/: beoordeling.md met tabel "| slug | oefening | **oordeel** | opmerking |"
//   proefset/<slug>.png en <slug>-avatar.png
//   kaarten.json              voorgestelde kaarten in het formaat van public/sjablonen.json
//
// Alleen oefeningen met oordeel "goed" gaan erin. Een oefening die al in de catalogus staat maar
// nog geen beeld had, houdt haar record, pad en uitleg en krijgt alleen de beelden. Een kaart komt
// er alleen als er na het weglaten van niet-gepubliceerde oefeningen minstens 3 overblijven.
//
//   node scripts/importeer-regio-oefeningen.mjs --bron <map> --groep "Bovenste extremiteit" [--write]
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { exerciseId } from "../lib/exercise-id.js";

const root = path.resolve(import.meta.dirname, "..");
const arg = (naam) => { const i = process.argv.indexOf(naam); return i > 0 ? process.argv[i + 1] : null; };
const bron = arg("--bron");
const GROEP = arg("--groep");
if (!bron || !GROEP) throw new Error('Gebruik: --bron <map> --groep "<catalogusgroep>" [--write]');
const schrijf = process.argv.includes("--write");
const MAP = GROEP.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const regio = path.basename(path.resolve(bron));
const BEELDEN = existsSync(path.join(bron, "beelden")) ? "beelden" : "proefset";

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

// Bijna-wit, kleurloos vlak (lichtgrijs tafelblad of mat in een close-up) wordt wit, zodat de
// avatar de witte achtergrond van de rest heeft (validate-exercise-backgrounds: minstens 30 % wit).
async function witAandeel(beeld) {
  const { data, info } = await beeld.clone().resize(80, 120, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let wit = 0;
  for (let o = 0; o < data.length; o += info.channels) if (data[o] >= 245 && data[o + 1] >= 245 && data[o + 2] >= 245) wit++;
  return wit / (info.width * info.height);
}
async function maakLichtVlakWit(beeld) {
  const { data, info } = await beeld.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let o = 0; o < data.length; o += info.channels) {
    const min = Math.min(data[o], data[o + 1], data[o + 2]);
    const max = Math.max(data[o], data[o + 1], data[o + 2]);
    if (max - min > 14 || min < 218) continue;
    const t = Math.min(1, (min - 218) / 14);
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(data[o + c] + (255 - data[o + c]) * t);
  }
  return sharp(data, { raw: info });
}

const oordelen = [];
for (const regel of (await readFile(path.join(bron, BEELDEN, "beoordeling.md"), "utf8")).split("\n")) {
  const m = regel.match(/^\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*\*\*(goed|matig|fout)\*\*\s*\|/);
  if (m) oordelen.push({ slug: m[1], naam: m[2], oordeel: m[3] });
}
if (!oordelen.length) throw new Error("Geen eindstand-tabel met slugs in beoordeling.md");
const omschrijving = new Map(leesCsv(await readFile(path.join(bron, "omschrijvingen.csv"), "utf8")).map((r) => [r.naam.trim(), r.omschrijving.trim()]));
const catalogusPad = path.join(root, "public", "oefeningen-v2.json");
const registerPad = path.join(root, "content", "nieuwe-lijntekeningen.json");
const catalogus = JSON.parse(await readFile(catalogusPad, "utf8"));
const register = JSON.parse(await readFile(registerPad, "utf8"));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const bestaat = (rel) => existsSync(path.join(root, "public", rel));

const verslag = { regio, schrijf, nieuw: [], beeldBijBestaand: [], overgeslagen: [], weinigWit: [] };
for (const o of oordelen) {
  if (o.oordeel !== "goed") { verslag.overgeslagen.push(`${o.naam} (${o.oordeel})`); continue; }
  const lijnBron = path.join(bron, BEELDEN, `${o.slug}.png`);
  const avatarBron = path.join(bron, BEELDEN, `${o.slug}-avatar.png`);
  if (!existsSync(lijnBron) || !existsSync(avatarBron)) { verslag.overgeslagen.push(`${o.naam} (beeld ontbreekt)`); continue; }
  const bestaand = catalogus.find((e) => e.naam === o.naam);
  let img, record, nieuweOefening = false;
  if (bestaand) {
    if (!/-line-v1\.png$/.test(bestaand.img) || !bestaand.coreExerciseId) { verslag.overgeslagen.push(`${o.naam} (bestaat al met eigen beeld)`); continue; }
    const inRegister = register.lijntekeningen.find((e) => e.naam === o.naam);
    if (bestaat(bestaand.img) && !(inRegister && inRegister.regio === regio)) { verslag.overgeslagen.push(`${o.naam} (heeft al een beeld)`); continue; }
    record = bestaand; img = bestaand.img;
  } else {
    const uitleg = omschrijving.get(o.naam);
    if (!uitleg) { verslag.overgeslagen.push(`${o.naam} (geen omschrijving)`); continue; }
    img = `images/${MAP}/${o.slug}-line-v1.png`;
    if (catalogus.some((e) => e.img === img)) { verslag.overgeslagen.push(`${o.naam} (pad ${img} is al in gebruik)`); continue; }
    record = { naam: o.naam, groep: GROEP, img, uitleg };
    nieuweOefening = true;
  }
  const kaartImg = img.replace(/-line-v1\.png$/, "-avatar-v8.jpg");
  const lijn = await sharp(lijnBron).flatten({ background: "#fff" })
    .resize(800, 1200, { fit: "contain", background: "#fff" })
    .png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer();
  let avatarBeeld = sharp(await sharp(avatarBron).flatten({ background: "#fff" })
    .resize(800, 1200, { fit: "contain", background: "#fff" }).png().toBuffer());
  if (await witAandeel(avatarBeeld) < 0.34) {
    avatarBeeld = sharp(await (await maakLichtVlakWit(avatarBeeld)).png().toBuffer());
    if (await witAandeel(avatarBeeld) < 0.32) { verslag.weinigWit.push(o.naam); verslag.overgeslagen.push(`${o.naam} (avatar heeft te weinig wit vlak)`); continue; }
  }
  const avatar = await avatarBeeld.jpeg({ quality: 86, mozjpeg: true }).toBuffer();

  record.kaartImg = kaartImg;
  if (nieuweOefening) { catalogus.push(record); verslag.nieuw.push(o.naam); } else verslag.beeldBijBestaand.push(o.naam);
  const entry = {
    ...(nieuweOefening ? { nieuweOefening: true } : {}), regio,
    exerciseId: exerciseId(record), naam: o.naam, groep: record.groep, img, sha256: sha(lijn),
    bron: null, bronTitel: `Physitrack-richting ${regio} (2026-11)`,
    kaartImg, kaartSha256: sha(avatar), kaartBron: `output/${regio}/${BEELDEN}/${o.slug}-avatar.png`,
  };
  const i = register.lijntekeningen.findIndex((e) => e.naam === o.naam);
  if (i >= 0) register.lijntekeningen[i] = entry; else register.lijntekeningen.push(entry);
  if (schrijf) {
    await mkdir(path.dirname(path.join(root, "public", img)), { recursive: true });
    await writeFile(path.join(root, "public", img), lijn);
    await writeFile(path.join(root, "public", kaartImg), avatar);
  }
}

// ---- kaarten ----
const sjabPad = path.join(root, "public", "sjablonen.json");
const sjabRaw = await readFile(sjabPad, "utf8");
const sjablonen = JSON.parse(sjabRaw);
const gepubliceerd = new Set(catalogus.filter((e) => {
  const b = String(e.kaartImg || e.img || "");
  return b && (bestaat(b) || (schrijf === false && register.lijntekeningen.some((r) => r.naam === e.naam && r.regio === regio)));
}).map((e) => e.naam));
const kaartenPad = path.join(bron, "kaarten.json");
verslag.kaartenNieuw = []; verslag.kaartenAangevuld = []; verslag.kaartenNiet = [];
if (existsSync(kaartenPad)) {
  for (const k of JSON.parse(await readFile(kaartenPad, "utf8"))) {
    const naamVan = (x) => (typeof x === "string" ? x : x.n);
    const oef = (k.oefeningen || []).filter((x) => gepubliceerd.has(naamVan(x))).slice(0, 12);
    const bestaandeKaart = sjablonen.find((s) => s.naam === k.naam);
    if (bestaandeKaart) {
      const heeft = new Set(bestaandeKaart.oefeningen.map(naamVan));
      const erbij = oef.filter((x) => !heeft.has(naamVan(x)));
      if (!erbij.length || bestaandeKaart.oefeningen.length + erbij.length > 12) continue;
      // een kaart met één dosering voor alles houdt losse namen; anders per oefening s en h
      const perOefening = bestaandeKaart.oefeningen.some((x) => typeof x === "object");
      for (const x of erbij) {
        const d = typeof x === "object" ? x : { n: x, ...(k.dosering || {}) };
        bestaandeKaart.oefeningen.push(perOefening ? { n: d.n, s: d.s || "3", h: d.h || "10" } : d.n);
      }
      verslag.kaartenAangevuld.push(k.naam);
      continue;
    }
    if (oef.length < 3) { verslag.kaartenNiet.push(`${k.naam} (${oef.length} oefeningen)`); continue; }
    const kaart = { naam: k.naam, sub: k.sub, categorie: k.categorie };
    if (k.fase) kaart.fase = k.fase;
    kaart.oefeningen = oef;
    if (k.dosering && oef.some((x) => typeof x === "string")) kaart.dosering = k.dosering;
    sjablonen.push(kaart);
    verslag.kaartenNieuw.push(k.naam);
  }
}

if (schrijf) {
  await writeFile(catalogusPad, `${JSON.stringify(catalogus, null, 1)}\n`);
  await writeFile(registerPad, `${JSON.stringify(register, null, 2)}\n`);
  const ind = sjabRaw.match(/\n( +)[{"]/)[1].length;
  await writeFile(sjabPad, `${JSON.stringify(sjablonen, null, ind)}\n`);
}
console.log(JSON.stringify({ ...verslag, aantallen: { nieuw: verslag.nieuw.length, beeldBijBestaand: verslag.beeldBijBestaand.length,
  overgeslagen: verslag.overgeslagen.length, kaartenNieuw: verslag.kaartenNieuw.length, kaartenAangevuld: verslag.kaartenAangevuld.length, kaartenNiet: verslag.kaartenNiet.length } }, null, 1));
