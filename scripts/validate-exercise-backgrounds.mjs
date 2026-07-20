import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(new URL("../", import.meta.url).pathname);
const catalogue = JSON.parse(await readFile(join(root, "public", "oefeningen.json"), "utf8"));
const report = JSON.parse(await readFile(join(root, "content", "oefenbeeld-background-qa-v7.json"), "utf8"));

if (report.schemaVersion !== 1 || report.assetVersion !== 7 || report.background !== "#FFFFFF") {
  throw new Error("Oefenbeeldrapport heeft een onbekende versie of achtergrond");
}
if (catalogue.length !== 215 || report.cards.length !== catalogue.length) {
  throw new Error(`Verwacht 215 kaarten; catalogus=${catalogue.length}, rapport=${report.cards.length}`);
}

const reportByName = new Map(report.cards.map((entry) => [entry.name, entry]));
if (reportByName.size !== report.cards.length) throw new Error("Dubbele oefening in oefenbeeldrapport");

const ratios = [];
await Promise.all(catalogue.map(async (exercise) => {
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

ratios.sort((a, b) => a - b);
console.log(`Oefenbeeldachtergronden geldig: ${catalogue.length}/215 op #FFFFFF; minimum witvlak ${ratios[0]}; mediaan ${ratios[Math.floor(ratios.length / 2)]}.`);
