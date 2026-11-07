// Avatartekeningen (begin boven + eind onder) voor de 120 oefeningen uit specs/spec-*.json.
// Referenties: de goedgekeurde lijntekening (beginhouding + pijl, die WINT bij conflict)
// en één bestaande avatar-v7 als stijlvoorbeeld. Eindhouding uit specs/avatar-eind.json.
// Niets hiervan gaat naar public/ of de catalogus.
// Gebruik: node genereer-avatars-batch.mjs <catslug> [slug ...]   (zonder slugs: alleen ontbrekende)
//         node genereer-avatars-batch.mjs sheet <catslug>        contactsheet
// Lijnbeeld uit public/ via content/nieuwe-lijntekeningen.json (op naam).
// Stopt als het saldo onder MIN_SALDO (standaard 50) komt. De sleutel wordt nooit gelogd.
import RunwayML from "@runwayml/sdk";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(new URL("../../../", import.meta.url).pathname);
const outDir = resolve(new URL("./", import.meta.url).pathname);
const lijnDir = resolve(outDir, "..");
const MIN_SALDO = Number(process.env.MIN_SALDO || 50);
const lijnPad = Object.fromEntries(JSON.parse(readFileSync(join(root, "content/nieuwe-lijntekeningen.json"), "utf8")).lijntekeningen.map((l) => [l.naam, join(root, "public", l.img)]));
const TANDEM = /tandem|hiel-tegen-teen|hiel-teen/;

const specs = readdirSync(join(lijnDir, "specs")).filter((f) => /^spec-.*\.json$/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(join(lijnDir, "specs", f), "utf8")));
const eind = Object.fromEntries(JSON.parse(readFileSync(join(lijnDir, "specs", "avatar-eind.json"), "utf8"))
  .map((e) => [`${e.catslug}/${e.slug}`, e.eind_en]));

const STIJL = {
  "287": "public/images/onderste-extremiteit/chair-squat-avatar-v7.jpg",
  "085": "public/images/onderste-extremiteit/glute-bridges-avatar-v7.jpg",
  "001": "public/images/onderste-extremiteit/standing-abduction-avatar-v7.jpg",
};

const STYLE = [
  "Create ONE photorealistic exercise image in exactly the same style as the colour photo reference:",
  "the same woman (brown hair in a ponytail, light grey short-sleeved t-shirt, dark grey joggers, white sneakers),",
  "soft even studio light, pure white seamless background, no floor line, no shadows beyond a faint contact shadow.",
  "The image shows the SAME woman TWICE: the TOP figure is the STARTING position, the BOTTOM figure is the END position,",
  "both from the same viewing angle, same scale, fully visible, not overlapping.",
  "The black-and-white line drawing reference is the authority for the starting position, viewing angle and equipment:",
  "copy its starting pose exactly and move in the direction of its arrow. Do not draw the arrow itself.",
  "No text, no letters except where stated, no logo, no watermark, no border. Anatomically correct hands and feet, calm friendly face.",
].join(" ");

const [cat, ...only] = process.argv.slice(2);
if (!cat) throw new Error("Gebruik: node genereer-avatars-batch.mjs <catslug> [slug ...]");
if (cat === "sheet") {
  const sharp = (await import("sharp")).default;
  const c = only[0];
  const items = specs.filter((s) => s.catslug === c && existsSync(join(outDir, c, `${s.slug}-avatar.png`)));
  const W = 320, H = 480, LAB = 40, COLS = 5, rows = Math.ceil(items.length / COLS);
  const tiles = await Promise.all(items.map(async (s, i) => {
    const img = await sharp(join(outDir, c, `${s.slug}-avatar.png`)).resize(W, H).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="6" y="26" font-family="Arial" font-size="14">${(i + 1) + ". " + s.naam.replaceAll("&", "&amp;").slice(0, 42)}</text></svg>`);
    return [{ input: img, left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LAB) }, { input: label, left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LAB) + H }];
  }));
  await sharp({ create: { width: COLS * W, height: rows * (H + LAB), channels: 3, background: "#ffffff" } })
    .composite(tiles.flat()).png().toFile(join(outDir, c, "_contactsheet.png"));
  console.log(`sheet ${c}: ${items.length}`);
  process.exit(0);
}

if (!process.env.RUNWAYML_API_SECRET && existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
const client = new RunwayML();

const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const dataUri = async (abs) => `data:${mime[extname(abs)]};base64,${(await readFile(abs)).toString("base64")}`;

const list = specs.filter((s) => s.catslug === cat
  && (only.length ? only.includes(s.slug) : !existsSync(join(outDir, cat, `${s.slug}-avatar.png`))));
await mkdir(join(outDir, cat), { recursive: true });

for (const s of list) {
  const tekst = eind[`${s.catslug}/${s.slug}`];
  if (!tekst) { console.log(`OVERGESLAGEN ${cat}/${s.slug}: geen eindhouding`); continue; }
  const saldo = (await client.organization.retrieve()).creditBalance;
  if (saldo < MIN_SALDO) { console.log(`STOP: saldo ${saldo} < ${MIN_SALDO}`); process.exit(2); }
  const lijn = lijnPad[s.naam];
  if (!lijn || !existsSync(lijn)) { console.log(`OVERGESLAGEN ${cat}/${s.slug}: geen lijnbeeld in public/`); continue; }
  const stijl = s.no_arrow
    ? STYLE.replace(/The image shows the SAME woman TWICE:[^.]*\.,?/, "The image shows the woman ONCE, holding the static starting position (this is a static hold, there is no end position).").replace("both from the same viewing angle, same scale, fully visible, not overlapping.", "Fully visible.").replace(" and move in the direction of its arrow", "")
    : STYLE;
  const extra = TANDEM.test(s.slug) ? " Use a THREE-QUARTER front view (oblique, from front-left) for both figures so both feet are clearly visible on one straight line." : "";
  try {
    const task = await client.textToImage.create({
      model: "gpt_image_2",
      promptText: `${stijl} ${s.no_arrow ? "" : tekst}${extra}${process.env.EXTRA ? " " + process.env.EXTRA : ""}`,
      referenceImages: [{ uri: await dataUri(lijn) }, { uri: await dataUri(join(root, STIJL[s.ref])) }],
      ratio: "1280:1920", quality: "medium", background: "opaque", outputCount: 1,
    }).waitForTaskOutput({ timeout: 10 * 60_000 });
    const res = await fetch(task.output[0]);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    await writeFile(join(outDir, cat, `${s.slug}-avatar${process.env.SUFFIX || ""}.png`), Buffer.from(await res.arrayBuffer()));
    await appendFile(join(lijnDir, "taken.log"), `${new Date().toISOString()} avatar ${cat}/${s.slug} ${task.id}\n`);
    console.log(`klaar ${cat}/${s.slug}`);
  } catch (e) {
    console.log(`FOUT ${cat}/${s.slug}: ${String(e.message).slice(0, 300)}`);
  }
}
console.log(`saldo ${(await client.organization.retrieve()).creditBalance}`);
