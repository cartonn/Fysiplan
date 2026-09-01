#!/usr/bin/env node
/*
 * V2-only avatar pipeline for the Carla additions. It never reads or writes the
 * V1 catalogue/assets. Generated sources are normalised to the card format,
 * then linked only when their quality gate succeeds.
 *
 * Usage:
 *   node scripts/carla-avatar-pipeline.mjs status
 *   node scripts/carla-avatar-pipeline.mjs import --name "Box jumps" --source /absolute/generated.png
 *   node scripts/carla-avatar-pipeline.mjs check
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const cataloguePath = path.join(root, "public", "oefeningen-v2.json");
const command = process.argv[2] || "status";
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? "" : String(process.argv[index + 1] || "");
};
const avatarPath = (exercise) => String(exercise.img).replace(/-line-v1\.png$/, "-avatar-v8.jpg");

async function readCatalogue() {
  const catalogue = JSON.parse(await fs.readFile(cataloguePath, "utf8"));
  const carla = catalogue.filter((exercise) => exercise.v1Source === "carla");
  if (carla.length !== 104) throw new Error(`Verwacht 104 Carla-oefeningen; gevonden ${carla.length}`);
  return { catalogue, carla };
}

async function quality(file) {
  const image = sharp(file);
  const metadata = await image.metadata();
  const { data, info } = await image.resize(80, 120, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let nearWhite = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset] >= 245 && data[offset + 1] >= 245 && data[offset + 2] >= 245) nearWhite += 1;
  }
  return { width: metadata.width, height: metadata.height, nearWhiteRatio: nearWhite / (info.width * info.height) };
}

async function existing(exercise) {
  const relative = avatarPath(exercise);
  const file = path.join(root, "public", relative);
  try {
    await fs.access(file);
    const gate = await quality(file);
    return { relative, valid: gate.width === 800 && gate.height === 1200 && gate.nearWhiteRatio >= 0.3, ...gate };
  } catch (error) {
    if (error.code === "ENOENT") return { relative, valid: false, missing: true };
    throw error;
  }
}

async function writeCatalogue(catalogue) {
  await fs.writeFile(cataloguePath, `${JSON.stringify(catalogue, null, 1)}\n`);
}

if (!['status', 'import', 'check'].includes(command)) throw new Error('Gebruik status, import of check');
const { catalogue, carla } = await readCatalogue();

if (command === 'import') {
  const name = valueAfter('--name');
  const source = valueAfter('--source');
  if (!name || !source) throw new Error('import vereist --name en --source');
  const exercise = carla.find((entry) => entry.naam === name);
  if (!exercise) throw new Error(`Geen Carla-oefening gevonden: ${name}`);
  const relative = avatarPath(exercise);
  const destination = path.join(root, 'public', relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await sharp(source).flatten({ background: '#FFFFFF' }).resize(800, 1200, { fit: 'fill' }).jpeg({ quality: 94, mozjpeg: true }).toFile(destination);
  const gate = await quality(destination);
  if (gate.width !== 800 || gate.height !== 1200 || gate.nearWhiteRatio < 0.3) {
    await fs.unlink(destination);
    throw new Error(`Kwaliteitsgate mislukt voor ${name}: ${JSON.stringify(gate)}`);
  }
  const target = catalogue.find((entry) => entry.exerciseId === exercise.exerciseId);
  target.kaartImg = relative;
  target.avatarStatus = 'generated-v8';
  await writeCatalogue(catalogue);
  console.log(JSON.stringify({ imported: name, output: relative, ...gate }, null, 2));
  process.exit(0);
}

const entries = await Promise.all(carla.map(async (exercise) => ({ name: exercise.naam, group: exercise.groep, ...(await existing(exercise)), linked: exercise.kaartImg === avatarPath(exercise) })));
const ready = entries.filter((entry) => entry.valid && entry.linked);
const invalid = entries.filter((entry) => !entry.valid || !entry.linked);
const byGroup = Object.fromEntries([...new Set(entries.map((entry) => entry.group))].map((group) => [group, {
  ready: ready.filter((entry) => entry.group === group).length,
  remaining: invalid.filter((entry) => entry.group === group).length,
}]));
console.log(JSON.stringify({ total: entries.length, ready: ready.length, remaining: invalid.length, byGroup, pending: invalid.map(({ name, group, relative, missing, linked }) => ({ name, group, output: relative, missing: !!missing, linked })) }, null, 2));
if (command === 'check' && invalid.length) process.exitCode = 1;
