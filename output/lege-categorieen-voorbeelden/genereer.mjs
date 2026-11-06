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
    pose: "Three-quarter front view, the camera slightly lower so both feet are clearly visible and large enough. She stands next to the backrest of a simple chair, one hand resting lightly on top of the backrest, both feet side by side and parallel. One clearly visible solid black curved arrow starts at the toes of the foot farther from the chair and curves forward to a point directly in front of the toes of the other foot, showing that foot will be placed in a straight line in front, heel touching the toes of the other foot (tandem stance)." },
  { nr: "03", slug: "werk-voorwerp-van-vloer-tillen", refs: [STAAND],
    pose: "Side view. She is in a deep squat with knees bent, back straight, feet hip-width apart, holding a plain cardboard box close against her body. One arrow runs upward alongside her body, showing her standing up using her legs while the box stays close." },
  { nr: "04", slug: "sportrevalidatie-landing-twee-benen", refs: [STAAND],
    pose: "Front view. She stands on a low aerobic step platform, a flat exercise mat on the floor in front of it. One curved arrow goes from the step downward and forward onto the mat, showing a soft two-footed landing with knees over the toes." },
  { nr: "05", slug: "neuro-symmetrisch-opstaan-met-steun", refs: [STOEL],
    pose: "Side view. She sits on the front part of a simple chair, both feet side by side slightly behind the knees, trunk leaning slightly forward, hands on her thighs. One curved arrow starts at her chest and points forward and upward, showing her standing up with weight equal on both legs." },
  { nr: "06", slug: "vestibulair-blikstabilisatie-horizontaal", refs: [STOEL],
    pose: "Front view. She sits upright on a simple chair, holding a small card at arm's length in front of her eyes; the card shows only the single capital letter A. Above her head is one double-headed curved arrow pointing left and right, showing the head turning side to side while the eyes stay on the letter." },
  { nr: "07", slug: "bekken-postpartum-bekkenkanteling", refs: [MAT],
    pose: "Side view. She lies on her back on an exercise mat, knees bent, feet flat on the mat, arms resting alongside her body. One small curved arrow near her pelvis shows the pelvis tilting and the lower back pressing gently into the mat. Her hips stay on the mat (this is not a bridge)." },
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
