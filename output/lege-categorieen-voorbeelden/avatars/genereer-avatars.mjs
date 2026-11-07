// VOORBEELDSET avatartekeningen (2 standen: begin + eind) voor de 7 voorbeeldoefeningen.
// Ter beoordeling door Ahmed; niets hiervan gaat naar public/ of de catalogus.
// Referenties: de goedgekeurde lijntekening (beginhouding + pijl, die WINT bij conflict)
// en één bestaande avatar-v7 van de 319 als stijlvoorbeeld (zelfde vrouw, kleding, wit).
// Gebruik: node output/lege-categorieen-voorbeelden/avatars/genereer-avatars.mjs [nummer ...]
// De sleutel komt uit RUNWAYML_API_SECRET (omgeving of .env) en wordt nooit gelogd.
import RunwayML from "@runwayml/sdk";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(new URL("../../../", import.meta.url).pathname);
const outDir = resolve(new URL("./", import.meta.url).pathname);
if (!process.env.RUNWAYML_API_SECRET && existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");

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
  "No text, no letters except where stated, no logo, no watermark, no border. Anatomically correct hands and feet, calm friendly face.",
].join(" ");

const AVATARS = [
  { nr: "01", lijn: "public/images/nek/kin-intrekken-zittend-actief-line-v1.png", stijl: "stoel",
    eind: "Both figures in STRICT side profile facing right. TOP: head clearly poked FORWARD, chin jutting out in front of the chest line, ear well in front of the shoulder. BOTTOM: chin tucked, head glided straight back so the ear is directly above the shoulder, a visible double chin, eyes still level and looking straight ahead, no nodding. The difference in head position between top and bottom must be obvious." },
  { nr: "02", lijn: "public/images/balans-en-valpreventie/tandemstand-met-steun-line-v1.png", stijl: "staand",
    eind: "Both figures in STRICT side profile, feet fully visible. TOP: exactly as the line drawing, one foot a short step behind the other, near hand lightly on the chair backrest. BOTTOM: TANDEM STANCE: both feet on ONE straight line, the heel of the front foot directly touching the toes of the back foot (heel-to-toe, like walking on a tightrope), standing upright, hand lightly on the backrest. The feet must clearly be one in front of the other, not side by side." },
  { nr: "03", lijn: "public/images/werk-en-dagelijkse-handelingen/voorwerp-van-vloer-tillen-ergonomische-basis-line-v1.png", stijl: "staand",
    eind: "End position: standing fully upright, holding the same cardboard box close against the front of her body with both hands, back straight." },
  { nr: "04", lijn: "public/images/sportrevalidatie/landing-op-twee-benen-techniek-langzaam-line-v1.png", stijl: "staand",
    eind: "End position: landed on the mat in front of the step on both feet, hip-width apart, knees softly bent over the toes, hips back, arms forward for balance." },
  { nr: "05", lijn: "public/images/neurologische-revalidatie/symmetrisch-opstaan-met-fysieke-steun-line-v1.png", stijl: "stoel",
    eind: "End position: standing fully upright in front of the same chair, weight equal on both legs, feet side by side, arms relaxed." },
  { nr: "06", lijn: "public/images/vestibulair/blikstabilisatie-horizontaal-zittend-langzaam-line-v1.png", stijl: "stoel",
    eind: "Both figures in front view, seated, holding the card with the letter A at arm's length straight in front of her nose, the card stays in the same place. TOP: head and face facing straight forward. BOTTOM: the whole head clearly rotated about 40 degrees to her left (face in three-quarter view, nose pointing left of the card) while the EYES stay fixed on the letter A; shoulders and arms do not move. The head rotation must be obvious." },
  { nr: "07", lijn: "public/images/bekken-postpartum/bekkenkanteling-postpartum-eerste-fase-rustig-line-v1.png", stijl: "mat",
    eind: "End position: same back-lying position on the mat, knees bent, feet flat, the pelvis tilted backward so the lower back is flat on the mat; buttocks stay on the mat (not a bridge)." },
];

const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const dataUri = async (rel) => `data:${mime[extname(rel)]};base64,${(await readFile(join(root, rel))).toString("base64")}`;
const client = new RunwayML();
const kies = process.argv.slice(2);
const log = [];

for (const a of AVATARS) {
  if (kies.length && !kies.includes(a.nr)) continue;
  const task = await client.textToImage.create({
    model: "gpt_image_2",
    promptText: `${STYLE} ${a.eind}`,
    referenceImages: [{ uri: await dataUri(a.lijn) }, { uri: await dataUri(STIJL[a.stijl]) }],
    ratio: "1280:1920",
    quality: "medium",
    background: "opaque",
    outputCount: 1,
  }).waitForTaskOutput({ timeout: 10 * 60_000 });
  const url = task.output?.[0];
  if (!url) throw new Error(`${a.nr}: geen output (${task.status})`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${a.nr}: download HTTP ${res.status}`);
  const file = join(outDir, `${a.nr}-avatar${process.env.SUFFIX || ""}.png`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  log.push({ nr: a.nr, taskId: task.id, file });
  console.log(`${a.nr} klaar -> ${file}`);
}
console.log(JSON.stringify(log, null, 2));
