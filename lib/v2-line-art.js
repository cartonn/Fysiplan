import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const LINE_ASSET_VERSION = 1;
export const LINE_WIDTH = 800;
export const LINE_HEIGHT = 1200;
// Lijnkaarten worden getekend door scripts/lijnkaarten-hertekenen.py: de ruwe
// contourlijn wordt neuraal nagetekend (Virtual Sketching) tot doorlopende
// penstreken met vaste lijndikte, en de figuren worden slim passend in het
// staande 2:3-vakje gezet.
export const LINE_DRAWER = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "lijnkaarten-hertekenen.py");
// QA: zoveel van de rand moet papierwit blijven (de tekening raakt het vakje niet)
export const LINE_PAPER_BORDER = 8;

export function linePathForColor(colorSource) {
  const source = String(colorSource || "").replace(/^\/+/, "");
  if (!source) throw new Error("Kleurbron ontbreekt voor V2-lijnvariant");
  const extension = extname(source);
  const stem = source.slice(0, -extension.length).replace(/-avatar-v\d+$/i, "");
  return `${stem}-line-v${LINE_ASSET_VERSION}.png`;
}

export function publicAssetPath(publicDir, source) {
  return join(publicDir, String(source || "").replace(/^\/+/, ""));
}

export async function assetExists(path) {
  try { return (await stat(path)).size > 100; }
  catch { return false; }
}

function runDrawer(args) {
  return new Promise((resolvePromise, reject) => {
    execFile(process.env.PYTHON || "python3", [LINE_DRAWER, ...args], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`Lijntekenaar faalde: ${String(stderr || error.message).trim().slice(-600)}`));
      else resolvePromise(stdout);
    });
  });
}

// nieuwe lijnkaart bij een kleurkaart: ruwe contour -> neuraal natekenen (zelfde tekenaar als de bulkrun)
export async function createLineArt(inputPath, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await runDrawer(["--kleur", inputPath, "--naar", outputPath]);
  return analyzeLineArt(outputPath);
}

// maak een (gegenereerde) lijnillustratie passend: panelen, schaal, lijndikte
export async function fitLineIllustration(inputPath, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await runDrawer(["--illustratie", inputPath, "--naar", outputPath]);
  return analyzeLineArt(outputPath);
}

export async function analyzeLineArt(path) {
  const bytes = await readFile(path);
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let ink = 0;
  let paper = 0;
  let colored = 0;
  let borderInk = 0;
  const edge = LINE_PAPER_BORDER;
  for (let i = 0, p = 0; i < data.length; i += channels, p += 1) {
    const value = data[i];
    if (channels >= 3 && (data[i + 1] !== value || data[i + 2] !== value)) colored += 1;
    if (value < 128) ink += 1;
    if (value === 255) paper += 1;
    const x = p % width;
    const y = (p - x) / width;
    if (value !== 255 && (x < edge || y < edge || x >= width - edge || y >= height - edge)) borderInk += 1;
  }
  const total = width * height;
  const report = {
    width,
    height,
    inkPixels: ink,
    paperPixels: paper,
    antialiasPixels: total - ink - paper,
    blackRatio: Number((ink / total).toFixed(6)),
    whiteRatio: Number((paper / total).toFixed(6)),
    grayscale: colored === 0,
    clearBorder: borderInk === 0,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  };
  if (report.width !== LINE_WIDTH || report.height !== LINE_HEIGHT) {
    throw new Error(`Lijnkaart heeft formaat ${report.width}x${report.height}; verwacht ${LINE_WIDTH}x${LINE_HEIGHT}`);
  }
  if (!report.grayscale) throw new Error(`Lijnkaart bevat ${colored} gekleurde pixels`);
  if (!report.clearBorder) throw new Error(`Lijnkaart raakt de rand (${borderInk} inktpixels binnen ${edge}px van de kant)`);
  if (report.blackRatio < 0.002 || report.blackRatio > 0.25) {
    throw new Error(`Onwaarschijnlijke zwarte-lijndekking: ${report.blackRatio}`);
  }
  return report;
}
