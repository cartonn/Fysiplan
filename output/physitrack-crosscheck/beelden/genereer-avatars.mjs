// VOORBEELDSET nieuwe avatars (2 standen: boven begin, onder eind) na de Physitrack-crosscheck.
// Werkwijze gelijk aan output/lege-categorieen-voorbeelden/avatars/genereer-avatars.mjs:
// referenties = de lijntekening (wint bij conflict; bij een nieuwe tekening uit beelden/tekeningen die)
// + een bestaande, goedgekeurde avatar-v7 als stijlvoorbeeld. De huidige (foute) avatar van de oefening
// wordt bewust NIET als referentie gebruikt, zodat de fout niet wordt overgenomen.
// Alleen output/physitrack-crosscheck/beelden/avatars/; niets in public/ of oefeningen-v2.json.
// Gebruik: node genereer-avatars.mjs gen [nr ...] [--suffix=-r2]   |   node genereer-avatars.mjs sheet
import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const dir = resolve(new URL("./", import.meta.url).pathname);
const root = resolve(dir, "../../../");
const out = join(dir, "avatars");
const MIN_SALDO = Number(process.env.MIN_SALDO || 150);
const specs = JSON.parse(readFileSync(join(dir, process.env.SPECS || "avatar-specs.json"), "utf8"));
const cat = JSON.parse(readFileSync(join(root, "public/oefeningen-v2.json"), "utf8"));
const tekSpecs = JSON.parse(readFileSync(join(dir, "tekening-specs.json"), "utf8"));

const STIJL = {
  stoel: "public/images/onderste-extremiteit/chair-squat-avatar-v7.jpg",
  mat: "public/images/onderste-extremiteit/glute-bridges-avatar-v7.jpg",
  staand: "public/images/onderste-extremiteit/standing-abduction-avatar-v7.jpg",
};
const STYLE = [
  "Create ONE photorealistic exercise image in exactly the same style as the colour photo reference:",
  "the same woman (brown hair in a ponytail, light grey short-sleeved t-shirt, dark grey joggers, white sneakers),",
  "soft even studio light, pure white seamless background, no floor line, no shadows beyond a faint contact shadow.",
  "The image shows the SAME woman TWICE: the TOP figure is the STARTING position, the BOTTOM figure is the END position,",
  "both from the same viewing angle, same scale, fully visible, not overlapping.",
  "The black-and-white line drawing reference is the authority for the starting position, viewing angle and equipment:",
  "copy its starting pose exactly and move in the direction of its arrow. Do not draw the arrow itself.",
  "Ignore the pose of the woman in the colour photo; use it only for her appearance, clothing, light and background.",
  "No text, no letters, no logo, no watermark, no border. Anatomically correct hands and feet, calm friendly face.",
].join(" ");

const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const dataUri = async (abs) => `data:${mime[extname(abs)]};base64,${(await readFile(abs)).toString("base64")}`;
function lijnVoor(nr) {
  const t = tekSpecs.find((s) => s.nr === nr);
  if (t) for (const sfx of ["-r2", ""]) { const p = join(dir, "tekeningen", `${nr}-${t.slug}${sfx}.png`); if (existsSync(p)) return p; }
  return join(root, "public", cat[nr].img);
}

const args = process.argv.slice(2);
const cmd = args[0];
const suffix = (args.find((a) => a.startsWith("--suffix=")) || "--suffix=").slice(9);
const only = args.slice(1).filter((a) => !a.startsWith("--")).map(Number);

if (cmd === "gen") {
  if (!process.env.RUNWAYML_API_SECRET) process.loadEnvFile("/Users/builder/Fysiplan/.env");
  const rw = new RunwayML();
  await mkdir(out, { recursive: true });
  const start = (await rw.organization.retrieve()).creditBalance;
  for (const a of specs.filter((s) => !only.length || only.includes(s.nr))) {
    const file = join(out, `${a.nr}-${a.slug}-avatar${suffix}.png`);
    if (existsSync(file)) { console.log(`bestaat al ${file}`); continue; }
    const saldo = (await rw.organization.retrieve()).creditBalance;
    if (saldo < MIN_SALDO) { console.log(`STOP: saldo ${saldo} < ${MIN_SALDO}`); break; }
    try {
      const task = await rw.textToImage.create({
        model: "gpt_image_2", promptText: `${STYLE} ${a.eind}`,
        referenceImages: [{ uri: await dataUri(lijnVoor(a.nr)) }, { uri: await dataUri(join(root, STIJL[a.stijl])) }],
        ratio: "1280:1920", quality: "medium", background: "opaque", outputCount: 1,
      }).waitForTaskOutput({ timeout: 10 * 60_000 });
      const res = await fetch(task.output[0]);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      await appendFile(join(dir, "taken.log"), `${new Date().toISOString()} avatar ${a.nr}${suffix} ${task.id}\n`);
      console.log(`klaar ${a.nr} ${a.slug}${suffix}`);
    } catch (e) { console.log(`FOUT ${a.nr}: ${String(e.message).slice(0, 300)}`); }
  }
  const eind = (await rw.organization.retrieve()).creditBalance;
  console.log(`saldo ${start} -> ${eind} (gebruikt ${start - eind})`);
} else if (cmd === "sheet") {
  // per oefening: lijntekening | oude avatar | nieuwe avatar
  const W = 260, H = 390, LAB = 44, COLS = 6, tiles = [];
  const rows = specs.map((a) => {
    const r2 = join(out, `${a.nr}-${a.slug}-avatar-r2.png`), r1 = join(out, `${a.nr}-${a.slug}-avatar.png`);
    const nieuw = existsSync(r2) ? r2 : existsSync(r1) ? r1 : null;
    return nieuw && { a, cellen: [[lijnVoor(a.nr), "lijntekening"], [cat[a.nr].kaartImg ? join(root, "public", cat[a.nr].kaartImg) : null, "oude avatar"], [nieuw, nieuw === r2 ? "nieuw (r2)" : "nieuw"]] };
  }).filter(Boolean);
  const esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  let k = 0;
  for (const r of rows) for (const [p, t] of r.cellen) {
    const x = (k % COLS) * W, y = Math.floor(k / COLS) * (H + LAB); k++;
    if (p) tiles.push({ input: await sharp(p).resize(W, H, { fit: "contain", background: "#fff" }).png().toBuffer(), left: x, top: y });
    tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="6" y="18" font-family="Arial" font-size="13" font-weight="bold">${r.a.nr} ${esc(cat[r.a.nr].naam).slice(0, 30)}</text><text x="6" y="36" font-family="Arial" font-size="12">${t}</text></svg>`), left: x, top: y + H });
  }
  await sharp({ create: { width: COLS * W, height: Math.max(1, Math.ceil(k / COLS)) * (H + LAB), channels: 3, background: "#ffffff" } })
    .composite(tiles).png().toFile(join(out, process.env.SHEET || "_contactvel-avatars-voorbeeld.png"));
  console.log(`contactvel: ${rows.length} oefeningen`);
}
