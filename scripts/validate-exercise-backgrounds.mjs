import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(new URL("../", import.meta.url).pathname);
const catalogue = JSON.parse(await readFile(join(root, "public", "oefeningen-v2.json"), "utf8"));
const report = JSON.parse(await readFile(join(root, "content", "oefenbeeld-background-qa-v7.json"), "utf8"));

if (report.schemaVersion !== 1 || report.assetVersion !== 7 || report.background !== "#FFFFFF") {
  throw new Error("Oefenbeeldrapport heeft een onbekende versie of achtergrond");
}
const legacyCatalogue = catalogue.filter((exercise) => !exercise.coreExerciseId);
const top500Expansion = catalogue.filter((exercise) => exercise.coreExerciseId);
if (legacyCatalogue.length !== 215 || report.cards.length !== legacyCatalogue.length) {
  throw new Error(`Verwacht 215 vaste legacykaarten; catalogus=${legacyCatalogue.length}, rapport=${report.cards.length}`);
}
if (top500Expansion.length !== 285 || catalogue.length !== 500) {
  throw new Error(`Verwacht 285 uitbreidingskaarten en 500 totaal; uitbreiding=${top500Expansion.length}, totaal=${catalogue.length}`);
}

const reportByName = new Map(report.cards.map((entry) => [entry.name, entry]));
if (reportByName.size !== report.cards.length) throw new Error("Dubbele oefening in oefenbeeldrapport");

const ratios = [];
await Promise.all(legacyCatalogue.map(async (exercise) => {
  const check = reportByName.get(exercise.naam);
  if (!check) throw new Error(`Oefening ontbreekt in oefenbeeldrapport: ${exercise.naam}`);
  if (exercise.kaartImg !== check.output || !exercise.kaartImg.endsWith("-avatar-v7.jpg")) {
    throw new Error(`Verkeerde v7-kaartkoppeling voor ${exercise.naam}`);
  }
  const path = join(root, "public", exercise.kaartImg);
  const bytes = await readFile(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== check.sha256) throw new Error(`Oefenbeeld gewijzigd na witte-achtergrond-QA: ${exercise.naam}`);
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== 800 || metadata.height !== 1200) throw new Error(`Verkeerd kaartformaat voor ${exercise.naam}`);
  if (check.nearWhiteRatio < 0.3) throw new Error(`Onvoldoende wit vlak voor ${exercise.naam}: ${check.nearWhiteRatio}`);
  ratios.push(check.nearWhiteRatio);
}));

const expansionRatios = [];
const pendingExpansion = [];
await Promise.all(top500Expansion.map(async (exercise) => {
  if (!exercise.kaartImg || exercise.img !== exercise.kaartImg || !exercise.kaartImg.endsWith("-avatar-v8.jpg")) {
    throw new Error(`Verkeerde v8-kaartkoppeling voor ${exercise.naam}`);
  }
  const path = join(root, "public", exercise.kaartImg);
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code === "ENOENT") { pendingExpansion.push(exercise.naam); return; }
    throw error;
  }
  const image = sharp(bytes);
  const metadata = await image.metadata();
  if (metadata.width !== 800 || metadata.height !== 1200) throw new Error(`Verkeerd kaartformaat voor ${exercise.naam}`);
  const { data, info } = await image.resize(80, 120, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let nearWhite = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] >= 245 && data[offset + 1] >= 245 && data[offset + 2] >= 245) nearWhite += 1;
  }
  const nearWhiteRatio = nearWhite / (info.width * info.height);
  if (nearWhiteRatio < 0.3) throw new Error(`Onvoldoende wit vlak voor ${exercise.naam}: ${nearWhiteRatio.toFixed(5)}`);
  expansionRatios.push(nearWhiteRatio);
}));

if (process.argv.includes("--strict") && pendingExpansion.length) {
  throw new Error(`Nog ${pendingExpansion.length} uitbreidingskaarten niet gepubliceerd: ${pendingExpansion.join(", ")}`);
}

ratios.sort((a, b) => a - b);
expansionRatios.sort((a, b) => a - b);
console.log(`Legacy-oefenbeelden geldig: ${legacyCatalogue.length}/215 op #FFFFFF; minimum witvlak ${ratios[0]}; mediaan ${ratios[Math.floor(ratios.length / 2)]}.`);
console.log(`Top-500-uitbreidingsbeelden geldig: ${expansionRatios.length}/285 op #FFFFFF; nog niet gepubliceerd: ${pendingExpansion.length}; minimum witvlak ${expansionRatios[0]}; mediaan ${expansionRatios[Math.floor(expansionRatios.length / 2)]}.`);
