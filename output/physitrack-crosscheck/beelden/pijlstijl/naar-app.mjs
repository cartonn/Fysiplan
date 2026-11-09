// Zet goedgekeurde pijlstijl-tekeningen (voorbeeldset + ronde 2) in de app (akkoord Ahmed 9 nov "Akkoord app").
// - beelden: zelfde verwerking als scripts/publish-arrow-assets.mjs (lege rand weg, 2,5% marge, 800x1200 webp)
//   naar public/images/beginhouding-pijl-r2/<id>.webp
// - content/beginhouding-pijl.json: bestaande entry krijgt nieuw img; oefeningen zonder pijlbeeld krijgen een entry.
//   Catalogus-img blijft gelijk, dus exerciseId blijft stabiel.
// - public/oefeningen-v2.json: 20 uitleggen uit ronde2/nieuwe-uitleg.csv.
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const dir = resolve(new URL("./", import.meta.url).pathname), root = resolve(dir, "../../../../");
const cat = JSON.parse(readFileSync(join(root, "public/oefeningen-v2.json"), "utf8"));
const pijlFile = join(root, "content/beginhouding-pijl.json");
const pijl = JSON.parse(readFileSync(pijlFile, "utf8"));
const dest = join(root, "public/images/beginhouding-pijl-r2"); mkdirSync(dest, { recursive: true });

const laatste = (map, nr, slug) => ["-r3", "-r2", ""].map((x) => join(dir, map, `${nr}-${slug}${x}.png`)).find(existsSync);
const items = [];
const s1 = JSON.parse(readFileSync(join(dir, "specs.json"), "utf8"));
for (const s of s1) if ([153, 166, 193, 195, 196, 212].includes(s.nr)) items.push([s.nr, laatste("nieuw", s.nr, s.slug)]);
for (const s of JSON.parse(readFileSync(join(dir, "ronde2-specs.json"), "utf8"))) items.push([s.nr, laatste("ronde2/nieuw", s.nr, s.slug)]);

async function verwerk(input, out) {
  const { data, info } = await sharp(input).flatten({ background: "#fff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const p = (y * info.width + x) * info.channels;
    if (Math.min(data[p], data[p + 1], data[p + 2]) < 245) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  const width = right - left + 1, height = bottom - top + 1, pad = Math.ceil(Math.max(width, height) * .025);
  const padded = await sharp(input).extract({ left, top, width, height }).flatten({ background: "#fff" })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#fff" }).png().toBuffer();
  await sharp(padded).resize(800, 1200, { fit: "contain", background: "#fff" }).webp({ quality: 94 }).toFile(out);
}
// Nieuwe lijntekeningen (content/nieuwe-lijntekeningen.json) leveren hun eigen img-pad (hash-gebonden):
// daar komt het nieuwe beeld op hetzelfde pad (png 800x1200) en wordt de sha256 bijgewerkt; geen pijl-entry.
const nlFile = join(root, "content/nieuwe-lijntekeningen.json");
const nl = JSON.parse(readFileSync(nlFile, "utf8"));
const { createHash } = await import("node:crypto");
let nieuw = 0, vervangen = 0, lijn = 0;
for (const [nr, file] of items) {
  if (!file) throw new Error(`geen beeld voor ${nr}`);
  const c = cat[nr], nlEntry = nl.lijntekeningen.find((x) => x.naam === c.naam && x.img === c.img);
  if (nlEntry) {
    const tmp = join(dest, `_tmp-${nr}.webp`); await verwerk(file, tmp);
    const png = await sharp(tmp).png().toBuffer(); writeFileSync(join(root, "public", c.img), png);
    (await import("node:fs")).unlinkSync(tmp);
    nlEntry.sha256 = createHash("sha256").update(png).digest("hex"); lijn++; continue;
  }
  const bestaand = pijl.entries.find((e) => e.source === c.img);
  const id = bestaand ? bestaand.id : `r2-${String(nr).padStart(3, "0")}`;
  const rel = `images/beginhouding-pijl-r2/${id}.webp`;
  await verwerk(file, join(root, "public", rel));
  if (bestaand) { bestaand.img = rel; vervangen++; }
  else { pijl.entries.push({ id, naam: c.naam, source: c.img, img: rel }); nieuw++; }
}
writeFileSync(pijlFile, JSON.stringify(pijl, null, 2) + "\n");
writeFileSync(nlFile, JSON.stringify(nl, null, 2) + "\n");
// uitleg
const csvText = readFileSync(join(dir, "ronde2/nieuwe-uitleg.csv"), "utf8");
const rows = []; { let f = [], cur = "", q = false, row = [];
  for (let i = 0; i < csvText.length; i++) { const ch = csvText[i];
    if (q) { if (ch === '"' && csvText[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; } else if (ch === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; } else cur += ch; }
  if (cur || row.length) { row.push(cur); rows.push(row); } }
const kop = rows.shift(); const iNr = kop.indexOf("nr"), iOud = kop.indexOf("oude_uitleg"), iNieuw = kop.indexOf("nieuwe_uitleg");
let uitleg = 0;
for (const r of rows) { if (!r[iNr]) continue; const c = cat[Number(r[iNr])];
  if (c.uitleg !== r[iOud]) throw new Error(`uitleg ${r[iNr]} is intussen gewijzigd`); c.uitleg = r[iNieuw]; uitleg++; }
const raw = readFileSync(join(root, "public/oefeningen-v2.json"), "utf8");
const indent = raw.startsWith("[\n  ") ? 2 : raw.startsWith("[\n ") ? 1 : 0;
writeFileSync(join(root, "public/oefeningen-v2.json"), JSON.stringify(cat, null, indent || undefined) + (raw.endsWith("\n") ? "\n" : ""));
// V1 deelt de uitleg met V2 (test-mobile-narration-review): zelfde tekst ook in public/oefeningen.json
const v1File = join(root, "public/oefeningen.json"), v1raw = readFileSync(v1File, "utf8"), v1 = JSON.parse(v1raw);
let v1n = 0; for (const r of rows) { if (!r[iNr]) continue; const naam = cat[Number(r[iNr])].naam;
  for (const e of v1) if (e.naam === naam) { if (e.uitleg !== r[iOud]) throw new Error(`V1-uitleg ${naam} wijkt af`); e.uitleg = r[iNieuw]; v1n++; } }
const v1ind = v1raw.startsWith("[\n  ") ? 2 : 1;
writeFileSync(v1File, JSON.stringify(v1, null, v1ind) + (v1raw.endsWith("\n") ? "\n" : ""));
// review-hashes van de uitleg (zelfde aanpak als commit 3bcc596)
const h = (t) => createHash("sha256").update(t).digest("hex");
const mmFile = join(root, "public/mobile-media-review.json"), mmraw = readFileSync(mmFile, "utf8"), mm = JSON.parse(mmraw);
const nrFile = join(root, "public/mobile-narration-review.json"), nrraw = readFileSync(nrFile, "utf8"), nrv = JSON.parse(nrraw);
const { exerciseId } = await import(join(root, "lib/exercise-id.js"));
let mmn = 0, holdn = 0;
for (const r of rows) { if (!r[iNr]) continue; const c = cat[Number(r[iNr])], id = exerciseId(c);
  for (const e of mm.entries) if (e.exerciseId === id) { e.explanationSha256 = h(c.uitleg); mmn++; }
  for (const x of nrv.holds) if (x.exerciseId === id) { x.text = c.uitleg; x.explanationSha256 = h(c.uitleg); x.narrationSha256 = h(c.naam + ". " + c.uitleg); holdn++; } }
const ind = (raw) => (raw.startsWith("{\n  ") ? 2 : 1);
writeFileSync(mmFile, JSON.stringify(mm, null, ind(mmraw)) + (mmraw.endsWith("\n") ? "\n" : ""));
writeFileSync(nrFile, JSON.stringify(nrv, null, ind(nrraw)) + (nrraw.endsWith("\n") ? "\n" : ""));
console.log(`pijlbeelden: ${vervangen} vervangen, ${nieuw} nieuw (totaal ${pijl.entries.length}); nieuwe lijntekeningen op eigen pad: ${lijn}; uitleg V2: ${uitleg}, V1: ${v1n}; media-review: ${mmn}, narration-holds: ${holdn}`);
