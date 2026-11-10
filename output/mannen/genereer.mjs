// Proefset schouder: per oefening lijntekening (beginhouding + pijl) en daarna avatar (begin boven, eind onder).
// Alleen output/schouder/proefset/; niets in public/ of de oefeningen-json.
// Gebruik: node genereer.mjs lijn|avatar [slug ...]  ·  node genereer.mjs sheet
// Harde stop: BUDGET credits (standaard 120) sinds start-saldo in budget.json. De sleutel wordt nooit gelogd.
import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const dir = resolve(new URL("./", import.meta.url).pathname);
const main = "/Users/builder/Fysiplan"; // refs en .env uit de hoofdcheckout
const specs = JSON.parse(readFileSync(join(dir, "specs.json"), "utf8"));
const BUDGET = Number(process.env.BUDGET || 120), PER = 10; // max credits per beeld als veiligheidsmarge
const AV = { "287": "public/images/onderste-extremiteit/chair-squat-avatar-v7.jpg", "001": "public/images/onderste-extremiteit/standing-abduction-avatar-v7.jpg" };
const MANNEN = {
  A: { l: "a man of about 35 with fair (white) skin, short light-brown hair, clean-shaven", a: "a man of about 35 with fair, light (white European) skin, short light-brown hair, clean-shaven, friendly face, slim athletic build" },
  B: { l: "a man of about 35 with light-brown skin (draw only contour lines, no shading), short black curly hair, a short neat beard", a: "a man of about 35 with medium-brown skin (clearly a shade darker than lightly tanned; mixed North-African/Middle-Eastern), short black curly hair, a short neat beard, friendly face, slim athletic build" },
};
const MAN = MANNEN[process.env.MAN || "A"], MAN_L = MAN.l, MAN_A = MAN.a;
const LIJN = [
  "Draw ONE new black-and-white exercise illustration in exactly the same style as the reference image:",
  `the same clean single-weight black contour lines and the same drawing style, BUT the figure is NOT the woman of the reference: draw this man instead: ${MAN_L}, short-sleeved t-shirt, long joggers, athletic sneakers.`,
  "pure white background, no shading, no grey, no color, no hatching.",
  "Show exactly ONE figure in the true STARTING position of the exercise (never halfway through the movement), and exactly ONE solid black arrow",
  "with a filled arrowhead, like the arrow in the reference, attached to the moving body part and indicating the movement toward the end position.",
  "Never two figures, no ghost figure, no second person, no text, no labels, no logo, no watermark, no border.",
  "Anatomically correct hands (five fingers), wrists and joints. Friendly, calm, simple face. The figure is large in the frame.",
].join(" ");
const AVATAR = [
  "Create ONE photorealistic exercise image in exactly the same style as the colour photo reference:",
  `same light, framing and clothing style, BUT the person is NOT the woman of the photo reference: show this man instead: ${MAN_A}, light grey short-sleeved t-shirt, dark grey joggers, white sneakers.`,
  "soft even studio light, pure white seamless background, no floor line, no shadows beyond a faint contact shadow.",
  "The image shows the SAME man TWICE: the TOP figure is the STARTING position, the BOTTOM figure is the END position,",
  "both from the same viewing angle, same scale, fully visible, not overlapping.",
  "The black-and-white line drawing reference is the authority for the starting position, viewing angle and equipment:",
  "copy its starting pose exactly and move in the direction of its arrow. Do not draw the arrow itself.",
  "No text, no logo, no watermark, no border. Anatomically correct hands (five fingers) and feet, calm friendly face.",
].join(" ");
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const uri = async (p) => `data:${mime[extname(p)]};base64,${(await readFile(p)).toString("base64")}`;
const [cmd, ...only] = process.argv.slice(2);
const ZOOM_L = " Frame the picture CLOSER than the reference: show him from the waist up (or only the forearm and hand where stated), so the forearm, wrist, hand and fingers are large and every finger is clearly drawn.";
const ZOOM_A = " Use a CLOSER framing for both figures (from the waist up, table edge visible where there is a table), so the forearm, wrist, hand and fingers are large and the movement is clearly visible.";
const STATIC_A = (a) => a.replace(/The image shows the SAME man TWICE:[^.]*\.,?/, "The image shows the man ONCE, holding the drawn position (a static hold).").replace("both from the same viewing angle, same scale, fully visible, not overlapping.", "").replace(" and move in the direction of its arrow", "");

if (cmd === "sheet") {
  const W = 300, H = 450, LAB = 36;
  const rows = specs.filter((s) => existsSync(join(dir, `${s.slug}.png`)));
  const tiles = [];
  for (const [i, s] of rows.entries()) {
    for (const [j, f] of [`${s.slug}.png`, `${s.slug}-avatar.png`].entries()) {
      if (!existsSync(join(dir, f))) continue;
      tiles.push({ input: await sharp(join(dir, f)).resize(W, H, { fit: "contain", background: "#fff" }).png().toBuffer(), left: (i % 3) * 2 * W + j * W, top: Math.floor(i / 3) * (H + LAB) });
    }
    tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * W}" height="${LAB}"><text x="8" y="24" font-family="Arial" font-size="16">${i + 1}. ${s.naam}</text></svg>`), left: (i % 3) * 2 * W, top: Math.floor(i / 3) * (H + LAB) + H });
  }
  await sharp({ create: { width: 6 * W, height: Math.ceil(rows.length / 3) * (H + LAB), channels: 3, background: "#ffffff" } }).composite(tiles).png().toFile(join(dir, "_contactvel.png"));
  console.log("contactvel", rows.length); process.exit(0);
}

if (!process.env.RUNWAYML_API_SECRET) process.loadEnvFile(join(main, ".env"));
const rw = new RunwayML();
const saldo = async () => (await rw.organization.retrieve()).creditBalance;
const bf = resolve(dir, process.env.BUDGETFILE || "budget.json");
if (!existsSync(bf)) await writeFile(bf, JSON.stringify({ start: await saldo() }) + "\n");
const start = JSON.parse(readFileSync(bf, "utf8")).start;

for (const s of specs.filter((s) => (only.length ? only.includes(s.slug) : !existsSync(join(dir, cmd === "lijn" ? `${s.slug}.png` : `${s.slug}-avatar.png`))))) {
  const nu = await saldo();
  if (start - nu + PER > BUDGET) { console.log(`STOP: verbruikt ${start - nu}, budget ${BUDGET}`); break; }
  const lijn = join(dir, `${s.slug}.png`);
  if (cmd === "avatar" && !existsSync(lijn)) { console.log(`OVERGESLAGEN ${s.slug}: geen lijntekening`); continue; }
  const suf = process.env.SUFFIX || "";
  const out = join(dir, cmd === "lijn" ? `${s.slug}${suf}.png` : `${s.slug}-avatar${suf}.png`);
  try {
    const task = await rw.textToImage.create({
      model: "gpt_image_2",
      promptText: cmd === "lijn" ? `${LIJN} ${s.pose_en}${s.zoom ? ZOOM_L : ""}${process.env.EXTRA ? " " + process.env.EXTRA : ""}` : `${s.static ? STATIC_A(AVATAR) : AVATAR} ${s.eind_en}${s.extra_avatar ? " IMPORTANT: " + s.extra_avatar : s.zoom ? ZOOM_A : ""}${process.env.EXTRA ? " " + process.env.EXTRA : ""}`,
      referenceImages: cmd === "lijn" ? [{ uri: await uri(join(main, "public/images/beginhouding-pijl-v1", `${s.ref}.webp`)) }] : [{ uri: await uri(lijn) }, { uri: await uri(join(main, AV[s.ref])) }],
      ratio: "1280:1920", quality: "medium", background: "opaque", outputCount: 1,
    }).waitForTaskOutput({ timeout: 10 * 60_000 });
    const res = await fetch(task.output[0]);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    await appendFile(join(dir, "taken.log"), `${new Date().toISOString()} ${cmd} ${s.slug}${suf} ${task.id}\n`);
    console.log(`klaar ${cmd} ${s.slug}${suf}`);
  } catch (e) { console.log(`FOUT ${s.slug}: ${String(e.message).slice(0, 300)}`); }
}
const eind = await saldo();
console.log(`saldo ${eind}, verbruikt sinds start ${start - eind}`);
