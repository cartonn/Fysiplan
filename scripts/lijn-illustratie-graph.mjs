// Lijn-illustratiegraph: tekent elke goedgekeurde V2-kleurkaart ná als schone
// zwart-wit-illustratie (stijlvoorbeeld: rustige, zelfverzekerde contourlijnen,
// een eenvoudig vriendelijk gezicht, spaarzame plooilijnen, geen arcering).
// De gegenereerde tekening vervangt de deterministische contourdetectie op
// hetzelfde -line-v1.png-pad en wordt vastgelegd in content/lijn-illustraties.json,
// zodat scripts/v2-line-art-graph.mjs een illustratie nooit meer overschrijft
// zolang de onderliggende kleurkaart ongewijzigd is. Wijzigt de kleurkaart wél,
// dan vervalt de registratie vanzelf en herstelt de keten zich met een verse
// deterministische lijn tot er opnieuw geïllustreerd is.
import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { graphLayers, runDag } from "../lib/dag-runner.js";
import { isRunwayCapacityError } from "../lib/runway-errors.js";
import {
  LINE_HEIGHT,
  LINE_WIDTH,
  analyzeBinaryLineArt,
  linePathForColor,
  publicAssetPath,
} from "../lib/v2-line-art.js";

const root = resolve(new URL("../", import.meta.url).pathname);
const publicDir = join(root, "public");
const cataloguePath = join(publicDir, "oefeningen-v2.json");
const registryPath = join(root, "content", "lijn-illustraties.json");
const workDir = join(root, "image-work", "lijn-illustraties");
const statePath = join(workDir, "state.json");

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "status";
const executeApproved = args.includes("--execute");
const maxBatchIndex = args.indexOf("--max-batch");
const maxBatch = maxBatchIndex === -1 ? 6 : Math.max(1, Math.min(50, Number(args[maxBatchIndex + 1]) || 6));
const onlyIndex = args.indexOf("--alleen");
const alleen = onlyIndex === -1 ? "" : String(args[onlyIndex + 1] || "");
const injectIndex = args.indexOf("--inject");
const inject = injectIndex === -1 ? "" : String(args[injectIndex + 1] || "");
if (!["status", "plan", "run"].includes(command)) throw new Error(`Onbekend commando: ${command}`);
if (command === "run" && !executeApproved) throw new Error("Gebruik run --execute om illustraties te genereren en te publiceren");

// zwart-op-wit-poort: de gegenereerde tekening heeft antialiasing en moet dus
// hard worden omgezet; onder deze grens wordt een pixel inkt, erboven papier
const BINARIZE_THRESHOLD = 176;

const catalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
const registry = await readJson(registryPath, { schemaVersion: 1, illustraties: [] });
const registryByName = new Map((registry.illustraties || []).map((entry) => [entry.naam, entry]));
const state = await readJson(statePath, { nodes: {} });

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fileSha(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function exists(path) {
  try { return (await stat(path)).size > 100; }
  catch { return false; }
}

function stylePrompt() {
  return [
    "Redraw this exact reference photograph as one clean black-and-white exercise illustration in a friendly, professional coloring-book line style.",
    "Keep the exact same composition and camera angle: the same two poses in the same positions, the same body proportions, the same clothing (t-shirt, joggers, athletic shoes), the same ponytail hairstyle and exactly the same exercise equipment, in the same places.",
    "Draw smooth, confident, single-weight black outline strokes on one continuous pure #FFFFFF background.",
    "Give the woman a simple, pleasant, realistic face using very few clean lines: thin eyebrows, simple calm eyes, a small nose and a relaxed mouth. The face must look friendly and professionally drawn, never scribbled or distorted.",
    "Use only sparse short fold lines in the clothing. No hatching, no shading, no grey tones, no color, no background, no floor line, no shadows.",
    "No text, labels, arrows, logo, watermark, border, panels or split-screen graphics. Anatomically correct hands, feet, joints and equipment.",
  ].join(" ");
}

let runwayClient;
function runway() {
  if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
  runwayClient ||= new RunwayML();
  return runwayClient;
}

async function dataUri(path) {
  const bytes = await readFile(path);
  const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function download(url, target) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download gaf HTTP ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

// zelfde deterministische branding als de kleurgraph, maar in puur lijnwerk
function logoSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${LINE_WIDTH}" height="${LINE_HEIGHT}">
    <g transform="translate(20 22)">
      <rect width="42" height="42" rx="10" fill="#000000"/>
      <path d="M8 22h7l4-8 7 17 5-10h5" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="52" y="31" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#000000">Fysiplan</text>
    </g>
  </svg>`);
}

// generatie -> 800x1200 -> logo -> harde binarisatie -> dezelfde QA als de
// deterministische lijnkaarten (formaat, puur zwart-wit, plausibele dekking)
async function finalizeIllustration(generatedPath, outputPath) {
  const { data, info } = await sharp(generatedPath)
    .flatten({ background: "#ffffff" })
    .resize(LINE_WIDTH, LINE_HEIGHT, { fit: "fill" })
    .composite([{ input: logoSvg(), top: 0, left: 0 }])
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = data[i * info.channels] < BINARIZE_THRESHOLD ? 0 : 255;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp.png`;
  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png({ compressionLevel: 9, colours: 2 })
    .toFile(temporary);
  await rename(temporary, outputPath);
  return analyzeBinaryLineArt(outputPath);
}

const kandidaten = [];
for (const exercise of catalogue) {
  if (alleen && exercise.naam !== alleen) continue;
  const colorSource = exercise.kaartImg || "";
  if (!colorSource) continue;
  const colorPath = publicAssetPath(publicDir, colorSource);
  if (!await exists(colorPath)) continue;
  const lineSource = linePathForColor(colorSource);
  const linePath = publicAssetPath(publicDir, lineSource);
  const colorSha = await fileSha(colorPath);
  const registered = registryByName.get(exercise.naam);
  const klaar = Boolean(registered && registered.colorSha === colorSha && await exists(linePath));
  kandidaten.push({ exercise, colorPath, linePath, lineSource, colorSha, klaar });
}

const openstaand = kandidaten.filter((entry) => !entry.klaar);
const batch = openstaand.slice(0, maxBatch);

if (command !== "run") {
  console.log(JSON.stringify({
    architecture: "Goedgekeurde kleurkaart -> Runway-illustratie in vaste stijl -> logo + binarisatie -> QA -> registratie",
    catalogus: catalogue.length,
    metKleurkaart: kandidaten.length,
    geillustreerd: kandidaten.length - openstaand.length,
    openstaand: openstaand.length,
    volgendeBatch: batch.map((entry) => entry.exercise.naam),
    kostenIndicatie: `${openstaand.length} x 5 credits (gpt_image_2, medium)`,
  }, null, 2));
  process.exit(0);
}

let capaciteitBereikt = false;
const nodes = [
  { id: "catalog", kind: "catalog", dependencies: [] },
  ...batch.map((entry, index) => ({
    id: `illustreer:${String(index + 1).padStart(3, "0")}`,
    kind: "illustreer",
    entry,
    dependencies: ["catalog"],
  })),
];
nodes.push({ id: "publiceer", kind: "publiceer", dependencies: nodes.filter((node) => node.kind === "illustreer").map((node) => node.id) });
graphLayers(nodes);

async function execute(node, results) {
  if (node.kind === "catalog") return { batch: batch.length };
  if (node.kind === "illustreer") {
    const { entry } = node;
    const stateKey = `illustreer:${entry.exercise.naam}`;
    const generatedPath = join(workDir, "generated", `${entry.colorSha.slice(0, 16)}.png`);
    try {
      if (!await exists(generatedPath)) {
        if (inject) {
          await mkdir(dirname(generatedPath), { recursive: true });
          await writeFile(generatedPath, await readFile(inject));
        } else {
          const created = await runway().textToImage.create({
            model: "gpt_image_2",
            promptText: stylePrompt(),
            referenceImages: [{ uri: await dataUri(entry.colorPath) }],
            ratio: "832:1248",
            quality: "medium",
            background: "opaque",
            outputCount: 1,
          });
          const task = await runway().tasks.retrieve(created.id).waitForTaskOutput({ timeout: 12 * 60 * 1000 });
          if (!task.output?.[0]) throw new Error("Runway-task leverde geen afbeelding op");
          await download(task.output[0], generatedPath);
        }
      }
      const qa = await finalizeIllustration(generatedPath, entry.linePath);
      state.nodes[stateKey] = { status: "succeeded", colorSha: entry.colorSha, completedAt: new Date().toISOString(), qa: { blackRatio: qa.blackRatio, sha256: qa.sha256 } };
      return { naam: entry.exercise.naam, status: "geillustreerd", colorSha: entry.colorSha, lineSource: entry.lineSource, qa };
    } catch (error) {
      if (isRunwayCapacityError(error)) capaciteitBereikt = true;
      state.nodes[stateKey] = { status: "failed", colorSha: entry.colorSha, failedAt: new Date().toISOString(), error: String(error.message || error).slice(0, 300) };
      return { naam: entry.exercise.naam, status: "mislukt", fout: String(error.message || error).slice(0, 300) };
    }
  }

  const geslaagd = nodes
    .filter((candidate) => candidate.kind === "illustreer")
    .map((candidate) => results.get(candidate.id))
    .filter((result) => result && result.status === "geillustreerd");
  for (const result of geslaagd) {
    registryByName.set(result.naam, { naam: result.naam, colorSha: result.colorSha, lineSource: result.lineSource, geillustreerdOp: new Date().toISOString() });
  }
  const bijgewerkt = {
    schemaVersion: 1,
    stijl: "schone contour-illustratie met eenvoudig vriendelijk gezicht (voorbeeldstijl eigenaar, 2026-08-28)",
    illustraties: Array.from(registryByName.values()).sort((a, b) => a.naam.localeCompare(b.naam, "nl")),
  };
  await mkdir(dirname(registryPath), { recursive: true });
  const temporaryRegistry = `${registryPath}.tmp`;
  await writeFile(temporaryRegistry, JSON.stringify(bijgewerkt, null, 1) + "\n");
  await rename(temporaryRegistry, registryPath);
  await mkdir(workDir, { recursive: true });
  const temporaryState = `${statePath}.tmp`;
  await writeFile(temporaryState, JSON.stringify(state, null, 1) + "\n");
  await rename(temporaryState, statePath);
  return { geillustreerd: geslaagd.length, mislukt: batch.length - geslaagd.length, capaciteitBereikt };
}

const results = await runDag({
  nodes,
  concurrency: 2,
  canRun: (node, completed) => node.dependencies.every((dependency) => completed.has(dependency)),
  execute,
  shouldStop: () => capaciteitBereikt,
});
const slot = results.get("publiceer") || { geillustreerd: 0, mislukt: batch.length, capaciteitBereikt };
console.log(JSON.stringify({
  batch: batch.length,
  geillustreerd: slot.geillustreerd,
  mislukt: slot.mislukt,
  capaciteitBereikt: slot.capaciteitBereikt,
  restOpenstaand: openstaand.length - slot.geillustreerd,
}, null, 2));
