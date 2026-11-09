#!/usr/bin/env node
// Werkt na een oefening-import de afgeleide bestanden bij: mobiele beeldbeoordeling, de tellers
// in public/mobile-narration-review.json en het categorierapport. Daarna: npm run build en de tests.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
execFileSync(process.execPath, ["scripts/build-mobile-media-review.mjs"], { stdio: "ignore" });
const catalogus = JSON.parse(readFileSync("public/oefeningen-v2.json", "utf8"));
const beschikbaar = catalogus.filter((e) => existsSync(path.join("public", e.kaartImg || e.img))).length;
const p = "public/mobile-narration-review.json";
const tekst = readFileSync(p, "utf8")
  .replace(/"rawV2Entries": \d+/, `"rawV2Entries": ${catalogus.length}`)
  .replace(/"effectiveEntries": \d+/, `"effectiveEntries": ${beschikbaar}`);
writeFileSync(p, tekst);
execFileSync(process.execPath, ["scripts/category-coverage.mjs", "--write"], { stdio: "ignore" });
console.log(JSON.stringify({ records: catalogus.length, metBeeld: beschikbaar }));
