// Eenmalige conversie: zware BMP/PNG/JPG uit de WeTransfer-upload -> compacte,
// web-vriendelijke JPEG's, plus een server-side manifest (public/oefeningen.json)
// zodat de oefeningen voor IEDEREEN die de URL opent beschikbaar zijn.
//
//   node scripts/convert-images.mjs
//
import Jimp from "jimp";
import { readdir, stat, mkdir, writeFile, rm } from "node:fs/promises";
import { join, extname, relative, dirname } from "node:path";

const IMAGES = new URL("../public/images/", import.meta.url).pathname;
const MANIFEST = new URL("../public/oefeningen.json", import.meta.url).pathname;
const MAX = 900;      // langste zijde in px
const QUALITY = 82;   // JPEG-kwaliteit

// top-map -> nette categorienaam (volgorde bepaalt de chip-volgorde)
const CAT = [
  ["Bovenste Extremiteit", "Bovenste extremiteit"],
  ["Onderste Extremiteit", "Onderste extremiteit"],
  ["Core", "Core"],
  ["Kracht", "Kracht"],
  ["Stabiliteit", "Stabiliteit"],
  ["Cardio", "Cardio"],
  ["Bosuball", "Bosu"],
  ["TRX oef", "TRX"],
  ["Yoga oef", "Yoga"],
  ["Kettlebell oefeningen", "Kettlebell"],
  ["Foam roller", "Foam roller"],
  ["Speedfootladder oef", "Speedladder"],
];
const catLabel = (top) => (CAT.find(([k]) => k === top)?.[1]) || top;
const catOrder = (label) => {
  const i = CAT.findIndex(([, v]) => v === label);
  return i < 0 ? 999 : i;
};

function slug(s) {
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}
function niceName(file) {
  let n = file.replace(/\.[^.]+$/, "");
  n = n.replace(/\s*-\s*/g, " ").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(bmp|png|jpe?g|gif|webp)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const files = (await walk(IMAGES)).sort();
const entries = [];
const usedSlugs = new Set();
const usedPaths = new Set();
const failed = [];

for (const abs of files) {
  const relPath = relative(IMAGES, abs);            // bv. "Yoga oef/yoga cobra.bmp"
  const parts = relPath.split("/");
  const top = parts[0];
  const label = catLabel(top);
  const base = parts[parts.length - 1];
  const naam = niceName(base);

  const catSlug = slug(label);
  let s = slug(base.replace(/\.[^.]+$/, ""));
  let key = catSlug + "/" + s, i = 2;
  while (usedSlugs.has(key)) { key = catSlug + "/" + s + "-" + i++; }
  usedSlugs.add(key);
  const outRel = key + ".jpg";                       // bv. "yoga/yoga-cobra.jpg"
  const outAbs = join(IMAGES, outRel);

  try {
    const img = await Jimp.read(abs);
    if (img.bitmap.width > MAX || img.bitmap.height > MAX) img.scaleToFit(MAX, MAX);
    img.background(0xffffffff);                       // transparantie -> wit (voor print)
    img.quality(QUALITY);
    await mkdir(dirname(outAbs), { recursive: true });
    await img.writeAsync(outAbs);
    entries.push({ naam, groep: label, img: "images/" + outRel });
    usedPaths.add(outRel);
  } catch (e) {
    failed.push(relPath + "  (" + e.message + ")");
  }
}

// oude bronmappen (met spaties/BMP) verwijderen; alleen de nieuwe slug-mappen blijven
for (const e of await readdir(IMAGES, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const keep = [...usedPaths].some((p) => p.startsWith(e.name + "/"));
  if (!keep) await rm(join(IMAGES, e.name), { recursive: true, force: true });
}

entries.sort((a, b) =>
  catOrder(a.groep) - catOrder(b.groep) || a.naam.localeCompare(b.naam, "nl")
);

await writeFile(MANIFEST, JSON.stringify(entries, null, 0) + "\n");

const cats = [...new Set(entries.map((e) => e.groep))];
console.log(`Geconverteerd: ${entries.length} afbeeldingen`);
console.log(`Categorieën (${cats.length}): ${cats.join(", ")}`);
if (failed.length) { console.log(`\nMislukt (${failed.length}):`); failed.forEach((f) => console.log("  - " + f)); }
console.log(`\nManifest: public/oefeningen.json`);
