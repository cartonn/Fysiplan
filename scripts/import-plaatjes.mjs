// Leest een bestand van Carla in dat zo is opgebouwd:
//
//   Oefeningnaam
//   plaatje1.png
//   plaatje2.png
//   <lege regel>
//   Volgende oefeningnaam
//   plaatje.png
//   ...
//
// en maakt daar public/oefening-plaatjes.json van (oefeningnaam -> plaatje(s)).
// De app vervangt daarmee automatisch de placeholders.
//
// Gebruik:
//   node scripts/import-plaatjes.mjs <bestand>            (dry-run: alleen rapport)
//   node scripts/import-plaatjes.mjs <bestand> --write    (schrijft het manifest)

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const input = args.find((a) => !a.startsWith("--"));

if (!input) {
  console.error("Gebruik: node scripts/import-plaatjes.mjs <bestand> [--write]");
  process.exit(1);
}

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// 1) oefeningnamen uit de app halen (enige bron van waarheid)
const html = readFileSync(join(root, "public", "index.html"), "utf8");
const appNames = [...html.matchAll(/\["([^"]+)","(?:onder|boven|romp|divers)"/g)].map((m) => m[1]);
const byNorm = new Map(appNames.map((n) => [norm(n), n]));

// 2) Carla's bestand in blokken splitsen (gescheiden door lege regel)
const raw = readFileSync(input, "utf8").replace(/\r\n?/g, "\n");
const blocks = raw
  .split(/\n[ \t]*\n+/)
  .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
  .filter((b) => b.length);

function suggest(naam) {
  const a = norm(naam);
  let best = null;
  let score = 0;
  for (const [k, orig] of byNorm) {
    const set = new Set(a);
    let c = 0;
    for (const ch of k) if (set.has(ch)) c++;
    const s = c / Math.max(a.length, k.length, 1);
    if (s > score) {
      score = s;
      best = orig;
    }
  }
  return score > 0.6 ? best : null;
}

const manifest = {};
const matched = [];
const unmatched = [];
let totalImgs = 0;

for (const block of blocks) {
  const naam = block[0];
  const files = block.slice(1);
  totalImgs += files.length;
  const value = files.length === 1 ? files[0] : files;
  const hit = byNorm.get(norm(naam));
  if (hit) {
    manifest[hit] = value;
    matched.push([hit, files.length]);
  } else {
    manifest[naam] = value; // alvast meenemen; naam evt. later corrigeren
    unmatched.push([naam, files.length, suggest(naam)]);
  }
}

console.log(
  `Blokken: ${blocks.length} | gekoppeld: ${matched.length} | niet herkend: ${unmatched.length} | plaatjes totaal: ${totalImgs}`
);

if (unmatched.length) {
  console.log("\nNIET herkende oefeningnamen (controleer spelling / hernoem):");
  for (const [naam, cnt, sug] of unmatched) {
    console.log(`  - "${naam}" (${cnt} plaatjes)${sug ? `   → lijkt op: "${sug}"` : ""}`);
  }
}

const appWithout = appNames.filter((n) => !manifest[n]);
if (appWithout.length) {
  console.log(`\nOefeningen in de app zonder plaatje (houden placeholder): ${appWithout.length}`);
}

if (write) {
  const out = join(root, "public", "oefening-plaatjes.json");
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nGeschreven: ${out}`);
  console.log("Zet de bijbehorende afbeeldingen in public/images/ en push.");
} else {
  console.log("\n(Dry-run — voeg --write toe om public/oefening-plaatjes.json te schrijven.)");
}
