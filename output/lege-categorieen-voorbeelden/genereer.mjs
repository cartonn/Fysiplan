// Eenmalig: 7 VOORBEELD-lijntekeningen voor lege categorieën, ter beoordeling.
// Niets hiervan gaat naar public/ of de catalogus.
// Gebruik: node output/lege-categorieen-voorbeelden/genereer.mjs [nummer ...]
// De sleutel komt uit RUNWAYML_API_SECRET (omgeving of .env in de projectmap) en wordt nooit gelogd.
import RunwayML from "@runwayml/sdk";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("../../", import.meta.url).pathname);
const outDir = resolve(new URL("./", import.meta.url).pathname);
if (!process.env.RUNWAYML_API_SECRET && existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");

const REF = (id) => join(root, "public/images/beginhouding-pijl-v1", `${id}.webp`);
const STAAND = "001", STOEL = "287", MAT = "085";

const STYLE = [
  "Draw ONE new black-and-white exercise illustration in exactly the same style as the reference image(s):",
  "the same woman (ponytail, short-sleeved t-shirt, long joggers, athletic sneakers), the same clean single-weight black contour lines,",
  "pure white background, no shading, no grey, no color, no hatching.",
  "Show exactly ONE figure in the STARTING position of the exercise, and exactly ONE solid black curved or straight arrow",
  "with a filled arrowhead, like the arrow in the reference, indicating the movement toward the end position.",
  "Never two figures, no ghost figure, no text, no letters except where stated, no labels, no logo, no watermark, no border.",
  "Anatomically correct hands, feet and joints. Friendly, calm, simple face.",
].join(" ");

const TEKENINGEN = [
  { nr: "01", slug: "nek-kin-intrekken-zittend", refs: [STOEL],
    pose: "Side view. She sits upright on a simple chair, feet flat on the floor, hands resting on her thighs, looking straight ahead, head held slightly forward. A short horizontal arrow just in front of her chin points straight backward (chin tuck, gliding the head back, not nodding)." },
  { nr: "02", slug: "balans-tandemstand-met-steun", refs: [STAAND, STOEL],
    pose: "Strict side view (profile), she faces right. A simple chair stands beside her on the far side, and her near hand rests lightly on top of its backrest. Both feet are flat on the floor: one foot in front, the other foot one short step BEHIND it. One clearly visible solid black curved arrow starts at the toes of the REAR foot, arcs forward over the front foot, and ends with its arrowhead just in front of the toes of the front foot, showing the rear foot being placed directly in front so its heel touches the toes of the other foot (tandem stance)." },
  { nr: "03", slug: "werk-voorwerp-van-vloer-tillen", refs: [STAAND],
    pose: "Strict side view (profile). A plain closed cardboard box stands ON THE FLOOR directly in front of her feet. She squats with knees bent, back straight, feet hip-width apart, and holds the box with both hands on its sides while the box still rests on the floor. One solid black straight arrow points straight up, close along the front of her body, showing her standing up with the box kept close." },
  { nr: "04", slug: "sportrevalidatie-landing-twee-benen", refs: [STAAND],
    pose: "Side view (profile), facing right. She stands upright on a low aerobic step platform, both feet together near the front edge of the step; a flat exercise mat lies on the floor directly in front of the step. One solid black curved arrow starts at her feet and arcs forward and down onto the mat in front of the step, showing a soft two-footed landing forward with knees over the toes." },
  { nr: "05", slug: "neuro-symmetrisch-opstaan-met-steun", refs: [STOEL],
    pose: "Side view. She sits fully UPRIGHT on the front part of a simple chair: trunk vertical, back straight, shoulders above the hips, NOT leaning forward, head level, hands resting on her thighs, both feet flat side by side slightly behind the knees. One solid black curved arrow starts at her chest and sweeps forward and then upward, showing that she will lean forward and stand up with weight equal on both legs." },
  { nr: "06", slug: "vestibulair-blikstabilisatie-horizontaal", refs: [STOEL],
    pose: "Front view. She sits upright on a simple chair, holding a small card at arm's length in front of her eyes; the card shows only the single capital letter A. Above her head is one double-headed curved arrow pointing left and right, showing the head turning side to side while the eyes stay on the letter." },
  { nr: "07", slug: "bekken-postpartum-bekkenkanteling", refs: [MAT],
    pose: "Strict side view. The figure is LARGE and fills the width of the image, like the other illustrations. She lies on her back on an exercise mat, knees bent, feet flat, arms resting alongside her body, neutral spine with a small visible gap under her lower back. Draw one small solid black curved arrow as a short rotation arc placed BELOW the waistband, at the side of the hip/pelvis bone (between the waist and the top of the thigh), NOT above the belly or stomach. The arc curls around the pelvis showing it rotating backward: the pubic bone tilts up toward the ribs and the lower back flattens onto the mat. Her buttocks stay on the mat (this is not a bridge)." },
];

const dataUri = async (path) => `data:image/webp;base64,${(await readFile(path)).toString("base64")}`;
const client = new RunwayML();
const kies = process.argv.slice(2);
const log = [];

for (const t of TEKENINGEN) {
  if (kies.length && !kies.includes(t.nr)) continue;
  const referenceImages = await Promise.all(t.refs.map(async (id) => ({ uri: await dataUri(REF(id)) })));
  const task = await client.textToImage.create({
    model: "gpt_image_2",
    promptText: `${STYLE} ${t.pose}`,
    referenceImages,
    ratio: "1280:1920", // 832:1248 wordt niet meer geaccepteerd; zelfde 2:3-verhouding,
    quality: "medium",
    background: "opaque",
    outputCount: 1,
  }).waitForTaskOutput({ timeout: 10 * 60_000 });
  const url = task.output?.[0];
  if (!url) throw new Error(`${t.nr}: geen output (${task.status})`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${t.nr}: download HTTP ${res.status}`);
  const file = join(outDir, `${t.nr}-${t.slug}.png`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  log.push({ nr: t.nr, taskId: task.id, file });
  console.log(`${t.nr} klaar -> ${file}`);
}
console.log(JSON.stringify(log, null, 2));
