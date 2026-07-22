import sharp from "sharp";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const selection = JSON.parse(await readFile(join(root, "content", "top-500-selection.json"), "utf8"));
const rawDir = resolve(process.argv[2] || join(root, "image-work-top500", "imagegen-raw"));
const write = process.argv.includes("--write");

function logoSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200">
    <g transform="translate(20 22)">
      <rect width="42" height="42" rx="10" fill="#1769d2"/>
      <path d="M8 22h7l4-8 7 17 5-10h5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="52" y="31" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#111827">Fysiplan</text>
    </g>
  </svg>`);
}

async function exists(path) {
  try { return (await stat(path)).size > 100; } catch { return false; }
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] || 0;
}

async function structure(path) {
  const { data, info } = await sharp(path).resize(80, 120, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const edge = [];
  const centreDifferences = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (x < 18 && y < 14) continue;
      const offset = (y * info.width + x) * 3;
      const channels = [data[offset], data[offset + 1], data[offset + 2]];
      if (x < 5 || x >= info.width - 5 || y < 5 || y >= info.height - 5) edge.push((channels[0] + channels[1] + channels[2]) / 3);
      if (x === 39 && y > 12 && y < info.height - 5) {
        const next = offset + 3;
        centreDifferences.push((Math.abs(data[offset] - data[next]) + Math.abs(data[offset + 1] - data[next + 1]) + Math.abs(data[offset + 2] - data[next + 2])) / 3);
      }
    }
  }
  return {
    edgeMedian: Number(quantile(edge, 0.5).toFixed(2)),
    centreMedian: Number(quantile(centreDifferences, 0.5).toFixed(2)),
    centreP95: Number(quantile(centreDifferences, 0.95).toFixed(2))
  };
}

const results = [];
for (const item of selection.selected) {
  const input = join(rawDir, `${item.coreExerciseId}.png`);
  const output = join(root, "public", item.outputImage);
  if (!(await exists(input))) {
    results.push({ coreExerciseId: item.coreExerciseId, naam: item.naam, status: "missing" });
    continue;
  }
  if (write) {
    await mkdir(dirname(output), { recursive: true });
    const { data, info } = await sharp(input)
      .flatten({ background: "#ffffff" })
      .resize(800, 1200, { fit: "cover", position: "centre" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let offset = 0; offset < data.length; offset += 3) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (Math.min(red, green, blue) >= 247 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 8) {
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      }
    }
    await sharp(data, { raw: info })
      .composite([{ input: logoSvg(), top: 0, left: 0 }])
      .jpeg({ quality: 91, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(output);
  }
  if (!(await exists(output))) {
    results.push({ coreExerciseId: item.coreExerciseId, naam: item.naam, status: "not-finalized" });
    continue;
  }
  const metadata = await sharp(output).metadata();
  const metrics = await structure(output);
  const sizeBytes = (await stat(output)).size;
  const checks = {
    exactCard: metadata.width === 800 && metadata.height === 1200,
    whiteBackground: metrics.edgeMedian >= 248,
    noCentreDivider: metrics.centreMedian < 16,
    sensibleFileSize: sizeBytes >= 45 * 1024 && sizeBytes <= 1_500 * 1024
  };
  results.push({
    coreExerciseId: item.coreExerciseId,
    naam: item.naam,
    outputImage: item.outputImage,
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks,
    metrics,
    sizeBytes
  });
}

const report = {
  schemaVersion: 1,
  graph: "imagegen -> pure-white normalization -> deterministic Fysiplan brand -> technical QA",
  total: selection.selected.length,
  raw: results.filter((item) => item.status !== "missing").length,
  passed: results.filter((item) => item.status === "passed").length,
  failed: results.filter((item) => item.status === "failed").length,
  missing: results.filter((item) => item.status === "missing").length,
  results
};
await mkdir(join(root, "image-work-top500"), { recursive: true });
await writeFile(join(root, "image-work-top500", "imagegen-qa.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ total: report.total, raw: report.raw, passed: report.passed, failed: report.failed, missing: report.missing }, null, 2));
if (report.failed) process.exitCode = 1;
