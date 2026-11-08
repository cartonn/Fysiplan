// Contactvellen per groep: lijntekening | oude avatar | nieuwe avatar (3 oefeningen per rij).
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const dir = resolve(new URL("./", import.meta.url).pathname), root = resolve(dir, "../../../");
const cat = JSON.parse(readFileSync(join(root, "public/oefeningen-v2.json"), "utf8"));
const tek = JSON.parse(readFileSync(join(dir, "tekening-specs.json"), "utf8"));
const specs = [...JSON.parse(readFileSync(join(dir, "avatar-specs.json"), "utf8")), ...JSON.parse(readFileSync(join(dir, "avatar-specs-rest.json"), "utf8"))];
const lijn = (nr) => { const t = tek.find((s) => s.nr === nr); if (t) for (const x of ["-r3", "-r2", ""]) { const p = join(dir, "tekeningen", `${nr}-${t.slug}${x}.png`); if (existsSync(p)) return p; } return join(root, "public", cat[nr].img); };
const nieuw = (a) => { for (const x of ["-r2", ""]) { const p = join(dir, "avatars", `${a.nr}-${a.slug}-avatar${x}.png`); if (existsSync(p)) return p; } return null; };
const groepen = {};
for (const a of specs) (groepen[cat[a.nr].groep] ||= []).push(a);
const W = 240, H = 360, LAB = 40, COLS = 9, esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
for (const [g, lijst] of Object.entries(groepen)) {
  const cells = lijst.flatMap((a) => [[lijn(a.nr), "lijntekening"], [cat[a.nr].kaartImg && join(root, "public", cat[a.nr].kaartImg), "oud"], [nieuw(a), nieuw(a) ? "nieuw" : "NIET GEMAAKT"]].map(([p, t]) => ({ a, p, t })));
  const tiles = [];
  for (const [k, c] of cells.entries()) {
    const x = (k % COLS) * W, y = Math.floor(k / COLS) * (H + LAB);
    if (c.p) tiles.push({ input: await sharp(c.p).resize(W, H, { fit: "contain", background: "#fff" }).png().toBuffer(), left: x, top: y });
    tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="5" y="16" font-family="Arial" font-size="12" font-weight="bold">${c.a.nr} ${esc(cat[c.a.nr].naam).slice(0, 30)}</text><text x="5" y="33" font-family="Arial" font-size="12">${c.t}</text></svg>`), left: x, top: y + H });
  }
  const f = join(dir, "avatars", `_contactvel-${g.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
  await sharp({ create: { width: COLS * W, height: Math.ceil(cells.length / COLS) * (H + LAB), channels: 3, background: "#fff" } }).composite(tiles).png().toFile(f);
  console.log(g, lijst.length, f.split("/").pop());
}
