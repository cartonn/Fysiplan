// Lijntekeningen (beginhouding + één pijl) voor veelvoorkomende fysio-oefeningen die V2 nog mist, op basis van specs/spec-*.json.
// Alleen output/veelvoorkomend/<categorie>/; niets in public/ of de oefeningen-json.
// Gebruik:
//   node genereer-batch.mjs gen <catslug> [slug ...]   genereer (ontbrekende of genoemde) tekeningen
//   node genereer-batch.mjs sheet <catslug>             maak contactsheet
//   node genereer-batch.mjs csv                          schrijf omschrijvingen.csv
// De sleutel komt uit RUNWAYML_API_SECRET (omgeving of .env) en wordt nooit gelogd.
import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("../../", import.meta.url).pathname);
const dir = resolve(new URL("./", import.meta.url).pathname);
// Ondergrens 650: de avatars van de lege categorieën hebben ~640 credits nodig; deze set mag daar niet aan komen.
const MIN_SALDO = Number(process.env.MIN_SALDO || 650);

const specs = readdirSync(join(dir, "specs")).filter((f) => /^spec-.*\.json$/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, "specs", f), "utf8")));

const STYLE = [
  "Draw ONE new black-and-white exercise illustration in exactly the same style as the reference image:",
  "the same woman (ponytail, short-sleeved t-shirt, long joggers, athletic sneakers), the same clean single-weight black contour lines,",
  "pure white background, no shading, no grey, no color, no hatching.",
  "Show exactly ONE figure in the true STARTING position of the exercise (never halfway through the movement), and exactly ONE solid black arrow",
  "with a filled arrowhead, like the arrow in the reference, attached to the moving body part and indicating the movement toward the end position.",
  "Never two figures, no ghost figure, no second person, no text, no labels, no logo, no watermark, no border.",
  "Anatomically correct hands, feet and joints. Friendly, calm, simple face. The figure is large in the frame.",
].join(" ");

const [cmd, cat, ...only] = process.argv.slice(2);

function client() {
  if (!process.env.RUNWAYML_API_SECRET && existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
  if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
  return new RunwayML();
}

const csvCell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;

if (cmd === "gen") {
  const rw = client();
  const list = specs.filter((s) => s.catslug === cat && (only.length ? only.includes(s.slug) : !existsSync(join(dir, cat, `${s.slug}.png`))));
  await mkdir(join(dir, cat), { recursive: true });
  for (const s of list) {
    const saldo = (await rw.organization.retrieve()).creditBalance;
    if (saldo < MIN_SALDO) { console.log(`STOP: saldo ${saldo} < ${MIN_SALDO}`); process.exit(2); }
    const ref = `data:image/webp;base64,${(await readFile(join(root, "public/images/beginhouding-pijl-v1", `${s.ref}.webp`))).toString("base64")}`;
    const extra = s.extra_en ? ` ${s.extra_en}` : "";
    try {
      const task = await rw.textToImage.create({
        model: "gpt_image_2", promptText: `${s.no_arrow ? STYLE.replace(/, and exactly ONE solid black arrow[^.]*\./, ". This is a STATIC stance: draw NO arrow at all.") : STYLE} ${s.pose_en}${extra}`, referenceImages: [{ uri: ref }],
        ratio: "1280:1920", quality: "medium", background: "opaque", outputCount: 1,
      }).waitForTaskOutput({ timeout: 10 * 60_000 });
      const res = await fetch(task.output[0]);
      await writeFile(join(dir, cat, `${s.slug}.png`), Buffer.from(await res.arrayBuffer()));
      await appendFile(join(dir, "taken.log"), `${new Date().toISOString()} ${cat}/${s.slug} ${task.id}\n`);
      console.log(`klaar ${cat}/${s.slug}`);
    } catch (e) {
      console.log(`FOUT ${cat}/${s.slug}: ${String(e.message).slice(0, 300)}`);
    }
  }
  console.log(`saldo ${(await rw.organization.retrieve()).creditBalance}`);
} else if (cmd === "sheet") {
  const items = specs.filter((s) => s.catslug === cat && existsSync(join(dir, cat, `${s.slug}.png`)));
  const W = 320, H = 480, LAB = 40, COLS = 5, rows = Math.ceil(items.length / COLS);
  const tiles = await Promise.all(items.map(async (s, i) => {
    const img = await sharp(join(dir, cat, `${s.slug}.png`)).resize(W, H).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="6" y="26" font-family="Arial" font-size="14">${(i + 1) + ". " + s.naam.replaceAll("&", "&amp;").slice(0, 42)}</text></svg>`);
    return [{ input: img, left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LAB) }, { input: label, left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LAB) + H }];
  }));
  await sharp({ create: { width: COLS * W, height: rows * (H + LAB), channels: 3, background: "#ffffff" } })
    .composite(tiles.flat()).png().toFile(join(dir, cat, "_contactsheet.png"));
  console.log(`sheet ${cat}: ${items.length}`);
} else if (cmd === "csv") {
  const head = ["naam", "groep", "bestand", "bron_url", "bron_titel", "beginhouding", "pijl", "aanzicht", "stijlreferentie"];
  const rows = specs.map((s) => [s.naam, s.groep, `${s.catslug}/${s.slug}.png`, s.bron_url, s.bron_titel, s.beginhouding_nl, s.pijl_nl, s.view, `${s.ref}.webp`].map(csvCell).join(","));
  await writeFile(join(dir, "omschrijvingen.csv"), [head.join(","), ...rows].join("\n") + "\n");
  console.log(`csv: ${rows.length}`);
}
