import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import sharp from "sharp";

export const LINE_ASSET_VERSION = 1;
export const LINE_WIDTH = 800;
export const LINE_HEIGHT = 1200;
export const LINE_THRESHOLD = 90;
export const LINE_BLUR_RADIUS = 1.4;

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

export async function createBinaryLineArt(inputPath, outputPath) {
  const { data: gray, info } = await sharp(inputPath)
    .flatten({ background: "#ffffff" })
    .resize(LINE_WIDTH, LINE_HEIGHT, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: blurred, info: blurredInfo } = await sharp(gray, { raw: info })
    .blur(LINE_BLUR_RADIUS)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = Buffer.alloc(width * height, 255);
  const at = (x, y) => blurred[((y * width) + x) * blurredInfo.channels];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx = (
        -at(x - 1, y - 1) + at(x + 1, y - 1)
        - (2 * at(x - 1, y)) + (2 * at(x + 1, y))
        - at(x - 1, y + 1) + at(x + 1, y + 1)
      );
      const gy = (
        -at(x - 1, y - 1) - (2 * at(x, y - 1)) - at(x + 1, y - 1)
        + at(x - 1, y + 1) + (2 * at(x, y + 1)) + at(x + 1, y + 1)
      );
      if (Math.hypot(gx, gy) >= LINE_THRESHOLD) pixels[(y * width) + x] = 0;
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp.png`;
  await sharp(pixels, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 9, colours: 2 })
    .toFile(temporary);
  await rename(temporary, outputPath);
  return analyzeBinaryLineArt(outputPath);
}

export async function analyzeBinaryLineArt(path) {
  const bytes = await readFile(path);
  const { data, info } = await sharp(bytes)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let black = 0;
  let white = 0;
  let other = 0;
  for (const value of data) {
    if (value === 0) black += 1;
    else if (value === 255) white += 1;
    else other += 1;
  }
  const total = data.length;
  const report = {
    width: info.width,
    height: info.height,
    blackPixels: black,
    whitePixels: white,
    nonBinaryPixels: other,
    blackRatio: Number((black / total).toFixed(6)),
    whiteRatio: Number((white / total).toFixed(6)),
    pureBinary: other === 0,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  };
  if (report.width !== LINE_WIDTH || report.height !== LINE_HEIGHT) {
    throw new Error(`Lijnkaart heeft formaat ${report.width}x${report.height}; verwacht ${LINE_WIDTH}x${LINE_HEIGHT}`);
  }
  if (!report.pureBinary) throw new Error(`Lijnkaart bevat ${report.nonBinaryPixels} grijze of gekleurde pixels`);
  if (report.blackRatio < 0.002 || report.blackRatio > 0.25) {
    throw new Error(`Onwaarschijnlijke zwarte-lijndekking: ${report.blackRatio}`);
  }
  return report;
}
