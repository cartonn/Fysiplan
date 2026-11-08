// Herteken in de pijl-v1-huisstijl (public/images/beginhouding-pijl-v1). Alleen in beelden/pijlstijl/; niets in public/ of de catalogus.
// Referenties: 1) een pijl-v1-beeld als stijl (001 staand, 085 liggend, 287 zittend); 2) optioneel de huidige tekening als inhoud
// (alleen als die zelf correct is en geen watermerk heeft). Er gaat niets van Physitrack naar Runway: pose_en is eigen tekst.
// Gebruik: node genereer.mjs gen [nr ...] [--suffix=-r2]  |  node genereer.mjs sheet
// Sleutel uit /Users/builder/Fysiplan/.env, wordt nooit gelogd. MIN_SALDO = ondergrens.
import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const dir = resolve(new URL("./", import.meta.url).pathname);
const root = resolve(dir, "../../../../");
const out = join(dir, process.env.OUT || "nieuw");
const MIN_SALDO = Number(process.env.MIN_SALDO || 1000);
const specs = JSON.parse(readFileSync(join(dir, process.env.SPECS || "specs.json"), "utf8"));
const cat = JSON.parse(readFileSync(join(root, "public/oefeningen-v2.json"), "utf8"));
const pijl = JSON.parse(readFileSync(join(root, "content/beginhouding-pijl.json"), "utf8"));

const STYLE = [
  "Draw ONE new black-and-white exercise illustration in exactly the same style as the FIRST reference image:",
  "the same woman (ponytail, short-sleeved t-shirt, long joggers, athletic sneakers), the same thin clean black contour lines,",
  "pure white background, no shading, no grey fill, no colour, no hatching, the same size of the figure in the frame and the same white margin.",
  "If she stands or lies on the floor, draw the same exercise mat in perspective as in the first reference.",
  "Show exactly ONE figure in the true STARTING position of the exercise (never halfway), and exactly ONE solid black curved or straight arrow",
  "with a filled arrowhead, like the arrow in the first reference, next to the moving body part, pointing toward the end position.",
  "Never two figures, no ghost figure, no text, no letters, no numbers, no brand names, no logo, no watermark, no border.",
  "Anatomically correct hands, feet and joints. Calm, friendly, simple face.",
].join(" ");
const CONTENT = "The SECOND reference shows the content (equipment and/or pose); keep its content but redraw it completely in the style of the first reference.";

const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const dataUri = async (abs) => `data:${mime[extname(abs)]};base64,${(await readFile(abs)).toString("base64")}`;
const appBeeld = (nr) => { const p = pijl.entries.find((e) => e.source === cat[nr].img); return join(root, "public", p?.img || cat[nr].img); };

const args = process.argv.slice(2), cmd = args[0];
const suffix = (args.find((a) => a.startsWith("--suffix=")) || "--suffix=").slice(9);
const only = args.slice(1).filter((a) => !a.startsWith("--")).map(Number);

if (cmd === "gen") {
  process.loadEnvFile("/Users/builder/Fysiplan/.env");
  const rw = new RunwayML();
  await mkdir(out, { recursive: true });
  const start = (await rw.organization.retrieve()).creditBalance;
  console.log(`saldo voor: ${start}`);
  for (const s of specs.filter((s) => !only.length || only.includes(s.nr))) {
    const file = join(out, `${s.nr}-${s.slug}${suffix}.png`);
    if (existsSync(file)) { console.log(`bestaat al ${file}`); continue; }
    const saldo = (await rw.organization.retrieve()).creditBalance;
    if (saldo < MIN_SALDO) { console.log(`STOP: saldo ${saldo} < ${MIN_SALDO}`); break; }
    const refs = [{ uri: await dataUri(join(root, "public/images/beginhouding-pijl-v1", `${s.stijl}.webp`)) }];
    if (s.content_ref) refs.push({ uri: await dataUri(join(root, s.content_ref)) });
    try {
      const task = await rw.textToImage.create({
        model: "gpt_image_2", promptText: `${STYLE} ${s.content_ref ? CONTENT : ""} ${s.pose_en}`, referenceImages: refs,
        ratio: "1280:1920", quality: "medium", background: "opaque", outputCount: 1,
      }).waitForTaskOutput({ timeout: 10 * 60_000 });
      const buf = Buffer.from(await (await fetch(task.output[0])).arrayBuffer());
      await writeFile(file, await sharp(buf).resize(800, 1200, { fit: "contain", background: "#fff" }).png().toBuffer());
      await appendFile(join(dir, "taken.log"), `${new Date().toISOString()} pijlstijl ${s.nr}${suffix} ${task.id}\n`);
      console.log(`klaar ${s.nr} ${s.slug}${suffix}`);
    } catch (e) { console.log(`FOUT ${s.nr}: ${String(e.message).slice(0, 300)}`); }
  }
  const eind = (await rw.organization.retrieve()).creditBalance;
  console.log(`saldo ${start} -> ${eind} (gebruikt ${start - eind})`);
} else if (cmd === "sheet") {
  // per groep (GROEP=1) of alles: app-beeld nu | nieuw (laatste herkansing)
  const W = 300, H = 450, LAB = 44, COLS = 4;
  const esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const groepen = {};
  for (const s of specs) {
    const kand = ["-r3", "-r2", ""].map((x) => join(out, `${s.nr}-${s.slug}${x}.png`)).filter(existsSync);
    if (!kand.length) continue;
    const g = process.env.GROEP ? (cat[s.nr].groep || cat[s.nr].categorie || "overig") : "alle";
    (groepen[g] ||= []).push([s, kand[0]]);
  }
  for (const [g, lijst] of Object.entries(groepen)) {
    const tiles = []; let k = 0;
    for (const [s, nieuw] of lijst) for (const [p, t] of [[appBeeld(s.nr), "app nu"], [nieuw, "nieuw pijlstijl" + (nieuw.match(/-(r\d)\.png$/) ? ` (${nieuw.match(/-(r\d)\.png$/)[1]})` : "")]]) {
      const x = (k % COLS) * W, y = Math.floor(k / COLS) * (H + LAB); k++;
      tiles.push({ input: await sharp(p).resize(W, H, { fit: "contain", background: "#fff" }).png().toBuffer(), left: x, top: y });
      tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><text x="6" y="18" font-family="Arial" font-size="14" font-weight="bold">${s.nr} ${esc(cat[s.nr].naam).slice(0, 34)}</text><text x="6" y="36" font-family="Arial" font-size="13">${t}</text></svg>`), left: x, top: y + H });
    }
    const naam = process.env.SHEET ? `${process.env.SHEET}-${g.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png` : "_contactvel-voorbeeld-10.png";
    await sharp({ create: { width: COLS * W, height: Math.max(1, Math.ceil(k / COLS)) * (H + LAB), channels: 3, background: "#ffffff" } })
      .composite(tiles).png().toFile(join(dir, naam));
    console.log(`${naam}: ${lijst.length} oefeningen`);
  }
}
