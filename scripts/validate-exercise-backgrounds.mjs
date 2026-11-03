import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { analyzeBinaryLineArt, linePathForColor } from "../lib/v2-line-art.js";

const root = resolve(new URL("../", import.meta.url).pathname);
const catalogue = JSON.parse(await readFile(join(root, "public", "oefeningen-v2.json"), "utf8"));
const v1Catalogue = JSON.parse(await readFile(join(root, "public", "oefeningen.json"), "utf8"));
const report = JSON.parse(await readFile(join(root, "content", "oefenbeeld-background-qa-v7.json"), "utf8"));

if (report.schemaVersion !== 1 || report.assetVersion !== 7 || report.background !== "#FFFFFF") {
  throw new Error("Oefenbeeldrapport heeft een onbekende versie of achtergrond");
}
const carlaCatalogue = catalogue.filter((exercise) => !exercise.coreExerciseId && String(exercise.img || "").endsWith("-line-v1.png"));
const legacyCatalogue = catalogue.filter((exercise) => !exercise.coreExerciseId && !String(exercise.img || "").endsWith("-line-v1.png"));
const top500Expansion = catalogue.filter((exercise) => exercise.coreExerciseId);
const v1ByName = new Map(v1Catalogue.map((exercise) => [exercise.naam, exercise]));
if (legacyCatalogue.length !== 215 || report.cards.length !== legacyCatalogue.length) {
  throw new Error(`Verwacht 215 vaste legacykaarten; catalogus=${legacyCatalogue.length}, rapport=${report.cards.length}`);
}
if (carlaCatalogue.length !== 104) {
  throw new Error(`Verwacht 104 Carla-kaarten met V1-lijnreferentie; gevonden ${carlaCatalogue.length}`);
}
if (top500Expansion.length !== 285 || catalogue.length !== 604) {
  throw new Error(`Verwacht 285 Core-uitbreidingskaarten en 604 totaal; uitbreiding=${top500Expansion.length}, totaal=${catalogue.length}`);
}

const reportByName = new Map(report.cards.map((entry) => [entry.name, entry]));
if (reportByName.size !== report.cards.length) throw new Error("Dubbele oefening in oefenbeeldrapport");

const ratios = [];
await Promise.all(legacyCatalogue.map(async (exercise) => {
  const v1Exercise = v1ByName.get(exercise.naam);
  if (!v1Exercise || exercise.img !== v1Exercise.img) {
    throw new Error(`V2 gebruikt niet exact de V1-afbeelding voor ${exercise.naam}`);
  }
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
  if (!exercise.kaartImg || exercise.img !== linePathForColor(exercise.kaartImg) || !exercise.kaartImg.endsWith("-avatar-v8.jpg")) {
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

const pairRatios = [];
const pendingPairs = [];
let legacyPairs = 0;
await Promise.all(catalogue.map(async (exercise) => {
  const isLegacy = !exercise.coreExerciseId;
  const expectedLine = isLegacy ? v1ByName.get(exercise.naam)?.img : linePathForColor(exercise.kaartImg);
  if (!exercise.kaartImg || exercise.img !== expectedLine) {
    throw new Error(`Geen geldige 1-op-1 kleur/lijn-koppeling voor ${exercise.naam}`);
  }
  const colorPath = join(root, "public", exercise.kaartImg);
  const linePath = join(root, "public", exercise.img);
  let colorExists = true;
  let lineExists = true;
  try { await readFile(colorPath); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    colorExists = false;
  }
  try { await readFile(linePath); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    lineExists = false;
  }
  if (colorExists !== lineExists) throw new Error(`Half gepubliceerd kleur/lijn-paar voor ${exercise.naam}`);
  if (!colorExists) {
    pendingPairs.push(exercise.naam);
    return;
  }
  if (isLegacy) {
    legacyPairs += 1;
    return;
  }
  const qa = await analyzeBinaryLineArt(linePath);
  pairRatios.push(qa.blackRatio);
}));

// Expliciete V2-kaartbeelduitzonderingen (content/v2-avatar-overrides.json). Dit is een
// extra eis, geen versoepeling: elke uitzondering moet precies zo in de catalogus staan,
// aan haar bytes gebonden zijn en het lijnbeeld moet gelijk blijven aan V1. Zo kan een
// latere bewerking of pijplijnrun de correctie niet stilzwijgend terugdraaien.
const avatarOverrides = JSON.parse(await readFile(join(root, "content", "v2-avatar-overrides.json"), "utf8"));
if (avatarOverrides.schemaVersion !== 1 || !Array.isArray(avatarOverrides.overrides)) {
  throw new Error("content/v2-avatar-overrides.json heeft een onbekende vorm");
}
for (const override of avatarOverrides.overrides) {
  const matches = catalogue.filter((exercise) => exercise.exerciseId === override.exerciseId);
  if (matches.length !== 1 || matches[0].naam !== override.name) {
    throw new Error(`V2-uitzondering ${override.exerciseId} (${override.name}) staat niet precies één keer onder die naam in de catalogus`);
  }
  const [exercise] = matches;
  if (exercise.kaartImg !== override.kaartImg) {
    throw new Error(`V2-kaartbeeld van ${override.name} wijkt af van de vastgelegde uitzondering: ${exercise.kaartImg} in plaats van ${override.kaartImg}`);
  }
  if (exercise.img !== override.lineImg || v1ByName.get(override.name)?.img !== override.lineImg) {
    throw new Error(`Lijnbeeld van ${override.name} is niet meer exact het V1-beeld van de uitzondering`);
  }
  const digest = createHash("sha256").update(await readFile(join(root, "public", override.kaartImg))).digest("hex");
  if (digest !== override.assetSha256) throw new Error(`Kaartbeeld van ${override.name} is gewijzigd na de vastgelegde uitzondering`);
  const sharing = catalogue.filter((other) => other.kaartImg === override.kaartImg);
  if (sharing.length !== 1) throw new Error(`Kaartbeeld ${override.kaartImg} wordt door ${sharing.length} oefeningen gebruikt`);
}

if (process.argv.includes("--strict") && pendingExpansion.length) {
  throw new Error(`Nog ${pendingExpansion.length} uitbreidingskaarten niet gepubliceerd: ${pendingExpansion.join(", ")}`);
}

ratios.sort((a, b) => a - b);
expansionRatios.sort((a, b) => a - b);
pairRatios.sort((a, b) => a - b);
const bereik = (waarden) => waarden.length
  ? `minimum ${waarden[0]}; mediaan ${waarden[Math.floor(waarden.length / 2)]}`
  : "n.v.t.";
console.log(`Legacy-oefenbeelden geldig: ${legacyCatalogue.length}/215 op #FFFFFF; minimum witvlak ${ratios[0]}; mediaan ${ratios[Math.floor(ratios.length / 2)]}.`);
console.log(`Top-500-uitbreidingsbeelden geldig: ${expansionRatios.length}/285 op #FFFFFF; nog niet gepubliceerd: ${pendingExpansion.length}; ${bereik(expansionRatios)}.`);
console.log(`V2-beeldparen geldig: ${legacyPairs + pairRatios.length}/500; nog niet gepubliceerd: ${pendingPairs.length}; ${legacyPairs} legacykaarten gebruiken exact de V1-afbeelding.`);
console.log(`V2-kaartbeelduitzonderingen: ${avatarOverrides.overrides.length} expliciet vastgelegd en aan pad, hash en V1-lijnbeeld gebonden.`);
