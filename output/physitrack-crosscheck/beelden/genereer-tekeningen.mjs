// Nieuwe lijntekeningen na de Physitrack-crosscheck (stijl gelijk aan output/lege-categorieen-voorbeelden/genereer-batch.mjs).
// Alleen in output/physitrack-crosscheck/beelden/tekeningen/; niets in public/ of oefeningen-v2.json.
// Gebruik: node genereer-tekeningen.mjs gen [nr ...] [--suffix=-r2]   |   node genereer-tekeningen.mjs sheet
// Sleutel: RUNWAYML_API_SECRET uit omgeving of /Users/builder/Fysiplan/.env; wordt nooit gelogd.
import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dir = resolve(new URL("./", import.meta.url).pathname);
const root = resolve(dir, "../../../");
const out = join(dir, "tekeningen");
const MIN_SALDO = Number(process.env.MIN_SALDO || 150);
const specs = JSON.parse(readFileSync(join(dir, "tekening-specs.json"), "utf8"));
const cat = JSON.parse(readFileSync(join(root, "public/oefeningen-v2.json"), "utf8"));

const STYLE = [
  "Draw ONE new black-and-white exercise illustration in exactly the same style as the reference image:",
  "the same woman (ponytail, short-sleeved t-shirt, long joggers, athletic sneakers), the same clean single-weight black contour lines,",
  "pure white background, no shading, no grey, no color, no hatching.",
  "Show exactly ONE figure in the true STARTING position of the exercise (never halfway through the movement), and exactly ONE solid black arrow",
  "with a filled arrowhead, like the arrow in the reference, attached to the moving body part and indicating the movement toward the end position.",
  "Never two figures, no ghost figure, no second person, no text, no labels, no logo, no watermark, no border.",
  "Anatomically correct hands, feet and joints. Friendly, calm, simple face. The figure is large in the frame.",
].join(" ");

const args = process.argv.slice(2);
const cmd = args[0];
const suffix = (args.find((a) => a.startsWith("--suffix=")) || "--suffix=").slice(9);
const only = args.slice(1).filter((a) => !a.startsWith("--")).map(Number);

function client() {
  if (!process.env.RUNWAYML_API_SECRET) process.loadEnvFile("/Users/builder/Fysiplan/.env");
  return new RunwayML();
}

if (cmd === "gen") {
  const rw = client();
  await mkdir(out, { recursive: true });
  const start = (await rw.organization.retrieve()).creditBalance;
  for (const s of specs.filter((s) => !only.length || only.includes(s.nr))) {
    const file = join(out, `${s.nr}-${s.slug}${suffix}.png`);
    if (existsSync(file)) { console.log(`bestaat al ${file}`); continue; }
    const saldo = (await rw.organization.retrieve()).creditBalance;
    if (saldo < MIN_SALDO) { console.log(`STOP: saldo ${saldo} < ${MIN_SALDO}`); break; }
    const ref = `data:image/webp;base64,${(await readFile(join(root, "public/images/beginhouding-pijl-v1", `${s.ref}.webp`))).toString("base64")}`;
    const style = s.no_arrow ? STYLE.replace(/, and exactly ONE solid black arrow[^.]*\./, ". This is a STATIC stance: draw NO arrow at all.") : STYLE;
    try {
      const task = await rw.textToImage.create({
        model: "gpt_image_2", promptText: `${style} ${s.pose_en}`, referenceImages: [{ uri: ref }],
        ratio: "1280:1920", quality: "medium", background: "opaque", outputCount: 1,
      }).waitForTaskOutput({ timeout: 10 * 60_000 });
      const res = await fetch(task.output[0]);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      await appendFile(join(dir, "taken.log"), `${new Date().toISOString()} tekening ${s.nr}${suffix} ${task.id}\n`);
      console.log(`klaar ${s.nr} ${s.slug}${suffix}`);
    } catch (e) { console.log(`FOUT ${s.nr}: ${String(e.message).slice(0, 300)}`); }
  }
  const eind = (await rw.organization.retrieve()).creditBalance;
  console.log(`saldo ${start} -> ${eind} (gebruikt ${start - eind})`);
} else if (cmd === "sheet") {
  // per oefening: oud | nieuw (laatste herkansing als die er is)
  const W = 300, H = 450, LAB = 44, rows = [];
  for (const s of specs) {
    const r2 = join(out, `${s.nr}-${s.slug}-r2.png`), r1 = join(out, `${s.nr}-${s.slug}.png`);
    const nieuw = existsSync(r2) ? r2 : existsSync(r1) ? r1 : null;
    if (!nieuw) continue;
    rows.push({ s, oud: join(root, "public", cat[s.nr].img), nieuw, tag: nieuw === r2 ? "nieuw (r2)" : "nieuw" });
  }
  const COLS = 4, cells = rows.length * 2, nrows = Math.max(1, Math.ceil(cells / COLS));
  const esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const tiles = [];
  for (const [i, r] of rows.entries()) for (const [j, [p, t]] of [[r.oud, "oud"], [r.nieuw, r.tag]].entries()) {
    const k = i * 2 + j, x = (k % COLS) * W, y = Math.floor(k / COLS) * (H + LAB);
    tiles.push({ input: await sharp(p).resize(W, H, { fit: "contain", background: "#fff" }).png().toBuffer(), left: x, top: y });
    tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="6" y="18" font-family="Arial" font-size="14" font-weight="bold">${r.s.nr} ${esc(cat[r.s.nr].naam).slice(0, 34)}</text><text x="6" y="36" font-family="Arial" font-size="13">${t}</text></svg>`), left: x, top: y + H });
  }
  await sharp({ create: { width: COLS * W, height: nrows * (H + LAB), channels: 3, background: "#ffffff" } })
    .composite(tiles).png().toFile(join(out, "_contactvel-tekeningen.png"));
  console.log(`contactvel: ${rows.length} oefeningen`);
}
