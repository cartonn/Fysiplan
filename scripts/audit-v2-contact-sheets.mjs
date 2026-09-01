import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(new URL("../", import.meta.url).pathname);
const outputDir = resolve(process.argv[2] || "/private/tmp/fysiplan-v2-audit");
const detailIndices = new Set((process.argv[3] || "")
  .split(",")
  .map((value) => Number.parseInt(value, 10))
  .filter(Number.isFinite));
const catalogue = JSON.parse(await readFile(join(root, "public", "oefeningen-v2.json"), "utf8"));
const publicDir = join(root, "public");

const exists = async (path) => {
  try { await readFile(path); return true; } catch { return false; }
};
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
}[char]));
const short = (value, max = 34) => value.length > max ? value.slice(0, max - 1) + "…" : value;

const entries = [];
for (let index = 0; index < catalogue.length; index += 1) {
  const exercise = catalogue[index];
  const colorPath = join(publicDir, exercise.kaartImg || "");
  const linePath = join(publicDir, exercise.img || "");
  entries.push({
    catalogIndex: index + 1,
    name: exercise.naam,
    legacy: !exercise.coreExerciseId,
    colorSource: exercise.kaartImg,
    lineSource: exercise.img,
    ready: await exists(colorPath) && await exists(linePath),
    colorPath,
    linePath
  });
}

await mkdir(outputDir, { recursive: true });
const tileWidth = 240;
const tileHeight = 240;
const columns = 6;
const rows = 8;
const perSheet = columns * rows;

async function tile(entry) {
  const [color, line] = await Promise.all([
    sharp(entry.colorPath).resize(108, 168, { fit: "contain", background: "white" }).png().toBuffer(),
    sharp(entry.linePath).resize(108, 168, { fit: "contain", background: "white" }).png().toBuffer()
  ]);
  const label = `<svg width="${tileWidth}" height="64" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="6" y="17" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#111">#${entry.catalogIndex} ${esc(short(entry.name))}</text>
    <text x="6" y="37" font-family="Arial,sans-serif" font-size="11" fill="#175cd3">KLEUR</text>
    <text x="126" y="37" font-family="Arial,sans-serif" font-size="11" fill="#111">LIJN</text>
  </svg>`;
  return sharp({ create: { width: tileWidth, height: tileHeight, channels: 3, background: "white" } })
    .composite([
      { input: Buffer.from(label), left: 0, top: 0 },
      { input: color, left: 6, top: 58 },
      { input: line, left: 126, top: 58 }
    ])
    .png()
    .toBuffer();
}

async function sheets(name, selected) {
  for (let offset = 0; offset < selected.length; offset += perSheet) {
    const page = selected.slice(offset, offset + perSheet);
    const buffers = await Promise.all(page.map(tile));
    const height = Math.ceil(page.length / columns) * tileHeight;
    const composites = buffers.map((input, index) => ({
      input,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight
    }));
    const number = String(Math.floor(offset / perSheet) + 1).padStart(2, "0");
    await sharp({ create: { width: columns * tileWidth, height, channels: 3, background: "#d9dee7" } })
      .composite(composites)
      .png()
      .toFile(join(outputDir, `${name}-${number}.png`));
  }
}

async function detailTile(entry) {
  const width = 600;
  const height = 720;
  const [color, line] = await Promise.all([
    sharp(entry.colorPath).resize(270, 600, { fit: "contain", background: "white" }).png().toBuffer(),
    sharp(entry.linePath).resize(270, 600, { fit: "contain", background: "white" }).png().toBuffer()
  ]);
  const label = `<svg width="${width}" height="96" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <text x="12" y="28" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#111">#${entry.catalogIndex} ${esc(entry.name)}</text>
    <text x="12" y="62" font-family="Arial,sans-serif" font-size="16" fill="#175cd3">KLEUR</text>
    <text x="318" y="62" font-family="Arial,sans-serif" font-size="16" fill="#111">LIJN</text>
  </svg>`;
  return sharp({ create: { width, height, channels: 3, background: "white" } })
    .composite([
      { input: Buffer.from(label), left: 0, top: 0 },
      { input: color, left: 12, top: 92 },
      { input: line, left: 318, top: 92 }
    ])
    .png()
    .toBuffer();
}

async function detailSheet(selected) {
  if (!selected.length) return;
  const columns = 3;
  const width = 600;
  const height = 720;
  const buffers = await Promise.all(selected.map(detailTile));
  await sharp({
    create: {
      width: columns * width,
      height: Math.ceil(selected.length / columns) * height,
      channels: 3,
      background: "#d9dee7"
    }
  }).composite(buffers.map((input, index) => ({
    input,
    left: (index % columns) * width,
    top: Math.floor(index / columns) * height
  }))).png().toFile(join(outputDir, "details.png"));
}

const legacy = entries.filter((entry) => entry.legacy && entry.ready);
const legacySample = Array.from({ length: 48 }, (_, index) => legacy[Math.floor(index * legacy.length / 48)]);
const expansionReady = entries.filter((entry) => !entry.legacy && entry.ready);
await sheets("legacy-sample", legacySample);
await sheets("extension", expansionReady);
await detailSheet(entries.filter((entry) => detailIndices.has(entry.catalogIndex) && entry.ready));
const fingerprints = await Promise.all(expansionReady.map(async (entry) => ({
  entry,
  data: await sharp(entry.colorPath).resize(48, 72, { fit: "fill" }).grayscale().raw().toBuffer()
})));
const similarities = [];
for (let left = 0; left < fingerprints.length; left += 1) {
  for (let right = left + 1; right < fingerprints.length; right += 1) {
    const a = fingerprints[left].data;
    const b = fingerprints[right].data;
    let active = 0;
    let shared = 0;
    let difference = 0;
    for (let pixel = 0; pixel < a.length; pixel += 1) {
      const aInk = a[pixel] < 248;
      const bInk = b[pixel] < 248;
      if (!aInk && !bInk) continue;
      active += 1;
      if (aInk && bInk) shared += 1;
      difference += Math.abs(a[pixel] - b[pixel]);
    }
    const meanDifference = active ? difference / active : 255;
    const overlap = active ? shared / active : 0;
    similarities.push({
      left: fingerprints[left].entry.catalogIndex,
      leftName: fingerprints[left].entry.name,
      right: fingerprints[right].entry.catalogIndex,
      rightName: fingerprints[right].entry.name,
      meanDifference: Number(meanDifference.toFixed(2)),
      overlap: Number(overlap.toFixed(3))
    });
  }
}
similarities.sort((a, b) => a.meanDifference - b.meanDifference || b.overlap - a.overlap);
await writeFile(join(outputDir, "similarity.json"), JSON.stringify(similarities.slice(0, 250), null, 2) + "\n");
await writeFile(join(outputDir, "mapping.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  legacyCount: legacy.length,
  extensionReadyCount: expansionReady.length,
  extension: expansionReady.map(({ catalogIndex, name, colorSource, lineSource }) => ({ catalogIndex, name, colorSource, lineSource }))
}, null, 2) + "\n");
console.log(`Auditbladen: ${outputDir}; legacy=${legacy.length}; uitbreiding gereed=${expansionReady.length}.`);
