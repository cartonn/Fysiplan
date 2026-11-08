// Meet per getoonde tekening: kader (donkere rand), bounding box van de inhoud (fractie van hoogte/breedte).
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const dir = resolve(new URL("./", import.meta.url).pathname), root = resolve(dir, "../../../../");
const g = JSON.parse(readFileSync(join(root, "output/physitrack-crosscheck/stijl-inventaris/getoonde-tekeningen.json"), "utf8"));
const res = [];
for (const r of g) {
  const { data, info } = await sharp(join(root, "public", r.shown)).greyscale().resize(400, 600, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, dark = (x, y) => data[y * W + x] < 160;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  const m = 6; // binnenrand overslaan voor bbox
  for (let y = m; y < H - m; y++) for (let x = m; x < W - m; x++) if (dark(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  // kader: lange donkere lijn binnen 25 px van een rand
  const rij = (y) => { let n = 0; for (let x = 0; x < W; x++) n += dark(x, y); return n / W; };
  const kol = (x) => { let n = 0; for (let y = 0; y < H; y++) n += dark(x, y); return n / H; };
  let kader = 0; for (let i = 0; i < 25; i++) kader = Math.max(kader, rij(i), rij(H - 1 - i), kol(i), kol(W - 1 - i));
  res.push({ nr: r.nr, fam: r.fam, groep: r.groep, naam: r.naam, hoogte: +((y1 - y0) / H).toFixed(2), breedte: +((x1 - x0) / W).toFixed(2), top: +(y0 / H).toFixed(2), bodem: +(y1 / H).toFixed(2), kader: +kader.toFixed(2) });
}
writeFileSync(join(dir, "schaal-meting.json"), JSON.stringify(res, null, 1));
