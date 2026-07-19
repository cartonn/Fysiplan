import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { graphLayers, runDag } from "../lib/dag-runner.js";

const root = resolve(new URL("../", import.meta.url).pathname);
const cataloguePath = join(root, "public", "oefeningen.json");
const productionPath = join(root, "content", "video-productie-215.json");
const qaOverridesPath = join(root, "content", "oefenbeeld-qa-overrides.json");
const exercises = JSON.parse(await readFile(cataloguePath, "utf8"));
const production = JSON.parse(await readFile(productionPath, "utf8")).exercises;
const qaOverrides = JSON.parse(await readFile(qaOverridesPath, "utf8"));
const seamApprovals = new Map(qaOverrides.seamApprovals.map((entry) => [entry.exerciseId, entry]));
const productionByName = new Map(production.map((entry) => [entry.sourceName, entry]));

const GRAPH_VERSION = 4;
const ASSET_VERSION = 5;
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "plan";

function valueAfter(flag, fallback = "") {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : String(args[index + 1] || fallback);
}

function csv(flag) {
  return valueAfter(flag).split(",").map((value) => value.trim()).filter(Boolean);
}

const provider = valueAfter("--provider", "runway");
const workDir = resolve(valueAfter("--work-dir", join(root, "image-work")));
const statePath = join(workDir, "state.json");
const executeApproved = args.includes("--execute");
const publishConcepts = args.includes("--publish-concepts");
const quiet = args.includes("--quiet");
const seamRecovery = args.includes("--seam-recovery");
const forceGptLow = args.includes("--force-gpt-low");
const forceGeminiFlash = args.includes("--force-gemini-flash");
const concurrency = Math.max(1, Math.min(4, Number(valueAfter("--concurrency", "4")) || 4));
const budgetCredits = Number(valueAfter("--budget-credits", "0"));
const limit = Math.max(0, Number(valueAfter("--limit", "0")) || 0);
const only = new Set(csv("--only").map((value) => value.toLowerCase()));
const orders = new Set(csv("--orders").map(Number).filter(Number.isFinite));
const groups = new Set(csv("--groups").map((value) => value.toLowerCase()));
if (!['local', 'runway'].includes(provider)) throw new Error("--provider moet local of runway zijn");

const selected = exercises.filter((entry, index) => {
  const meta = productionByName.get(entry.naam);
  if (only.size && !only.has(entry.naam.toLowerCase()) && !only.has(meta?.exerciseId?.toLowerCase())) return false;
  if (orders.size && !orders.has(index + 1)) return false;
  if (groups.size && !groups.has(entry.groep.toLowerCase())) return false;
  return true;
}).slice(0, limit || undefined);
if ((only.size || orders.size || groups.size) && !selected.length) throw new Error("Geen oefeningen gevonden voor de selectie");

const avatarPath = join(root, "video-work", "runway-pilot", "artifacts", "avatar", "fysiplan-avatar-master.png");
const complexGroups = new Set(["Apparaten", "TRX", "Bosu", "Bodyblade", "Cardio", "Kettlebell", "Foam roller", "Speedladder"]);
const complexNames = /pully|pulley|bench press|incline fly|lat pull|one arm bent over row|leg curl|leg extension|leg press|hack squat/i;
const horizontalNames = /pull over|pullover|bench press|flyes|nose breakers|lying|bridge|bruggen|plank|push up|bear crawl|benen laten zakken|bicycle|crunch|curl up|dead bug|leg raise|mountain climber|rug extensie|superman|roeier|cobra|child|puppy|frog|boat|glute stretch|half monkey|hamstring stretch|happy baby|knee to chest|pigeon|plow|snake|foam rol|abroller/i;
const detailNames = /wrist|endo pull|exo pull/i;

function slugFromImage(image) {
  return basename(image, extname(image));
}

function publicOutput(entry) {
  const directory = dirname(entry.img);
  return join(directory, `${slugFromImage(entry.img)}-avatar-v${ASSET_VERSION}.jpg`);
}

function classify(entry, index) {
  const meta = productionByName.get(entry.naam);
  if (!meta) throw new Error(`Productiegegevens ontbreken voor ${entry.naam}`);
  const complex = complexGroups.has(entry.groep) || complexNames.test(entry.naam);
  const layout = horizontalNames.test(entry.naam) || entry.groep === "Apparaten" ? "stacked" : "side-by-side";
  const framing = detailNames.test(entry.naam) ? "active-chain-detail" : "full-body";
  const instructionSensitive = !complex && (layout === "stacked" || entry.groep === "Core" || entry.groep === "Yoga");
  const model = forceGeminiFlash ? "gemini_2.5_flash" : forceGptLow || complex || instructionSensitive ? "gpt_image_2" : "seedream5_lite";
  const quality = forceGeminiFlash ? null : forceGptLow ? "low" : complex ? "medium" : instructionSensitive ? "low" : null;
  return {
    order: index + 1,
    exerciseId: meta.exerciseId,
    sourceName: entry.naam,
    titleNl: meta.titleNl,
    group: entry.groep,
    sourceImage: entry.img,
    outputImage: publicOutput(entry),
    layout,
    framing,
    model,
    quality,
    credits: model === "gemini_2.5_flash" ? 5 : quality === "medium" ? 5 : quality === "low" ? 1 : 4,
    script: meta.script,
  };
}

const plans = selected.map((entry) => classify(entry, exercises.indexOf(entry)));

function artifact(...parts) {
  return join(workDir, "artifacts", ...parts);
}

function buildGraph() {
  const avatar = { id: "source:avatar", kind: "source-avatar", dependencies: [], output: avatarPath, costCredits: 0 };
  const branches = plans.flatMap((plan) => {
    const id = plan.exerciseId;
    const nodes = [
      { id: `audit:${id}`, kind: "audit", plan, dependencies: [], output: artifact("audit", `${id}.json`), costCredits: 0 },
      { id: `prepare-reference:${id}`, kind: "prepare-reference", plan, dependencies: [`audit:${id}`], output: artifact("references", `${id}.png`), costCredits: 0 },
      { id: `generate:${id}`, kind: "generate", plan, dependencies: [avatar.id, `prepare-reference:${id}`], output: artifact("generated", `${id}.png`), costCredits: plan.credits },
      { id: `compose:${id}`, kind: "compose", plan, dependencies: [`generate:${id}`], output: artifact("cards", `${id}.jpg`), costCredits: 0 },
      { id: `qa:${id}`, kind: "qa", plan, dependencies: [`compose:${id}`], output: artifact("qa", `${id}.json`), costCredits: 0 },
      { id: `review-ready:${id}`, kind: "review-ready", plan, dependencies: [`qa:${id}`], output: artifact("review-ready", `${id}.json`), costCredits: 0 },
    ];
    if (publishConcepts) nodes.push({ id: `publish:${id}`, kind: "publish", plan, dependencies: [`review-ready:${id}`], output: join(root, "public", plan.outputImage), costCredits: 0 });
    return nodes;
  });
  return [avatar, ...branches];
}

const nodes = buildGraph();
const nodesById = new Map(nodes.map((node) => [node.id, node]));
graphLayers(nodes);

async function readState() {
  try { return JSON.parse(await readFile(statePath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { schemaVersion: 1, graphVersion: GRAPH_VERSION, provider, nodes: {} };
  }
}

const state = await readState();
if (state.provider && state.provider !== provider && command === "run") {
  throw new Error(`Werkmap hoort bij provider ${state.provider}; gebruik een andere --work-dir voor ${provider}`);
}
state.provider = provider;
state.graphVersion = GRAPH_VERSION;
let stateChain = Promise.resolve();
let catalogueChain = Promise.resolve();

function saveState() {
  stateChain = stateChain.then(async () => {
    await mkdir(dirname(statePath), { recursive: true });
    const temporary = `${statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + "\n");
    await rename(temporary, statePath);
  });
  return stateChain;
}

function hashNode(node, memo = new Map()) {
  if (memo.has(node.id)) return memo.get(node.id);
  const dependencyHashes = (node.dependencies || []).map((id) => hashNode(nodesById.get(id), memo));
  const hash = createHash("sha256").update(JSON.stringify({
    graphVersion: GRAPH_VERSION,
    assetVersion: ASSET_VERSION,
    kind: node.kind,
    plan: node.plan,
    provider,
    seamRecovery,
    forceGptLow,
    forceGeminiFlash,
    dependencyHashes,
  })).digest("hex").slice(0, 20);
  memo.set(node.id, hash);
  return hash;
}

async function validCompleted(node) {
  const record = state.nodes[node.id];
  if (!record || record.status !== "succeeded" || record.inputHash !== hashNode(node)) return false;
  try { return (await stat(node.output)).size > 100; }
  catch { return false; }
}

async function dataUri(path) {
  const bytes = await readFile(path);
  const mime = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" })[extname(path).toLowerCase()] || "application/octet-stream";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function download(url, target) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download gaf HTTP ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

let runwayClient;
const modelSlots = new Map();
function runway() {
  if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
  runwayClient ||= new RunwayML();
  return runwayClient;
}

async function withModelSlot(model, action) {
  const slot = modelSlots.get(model) || { active: 0, queue: [] };
  modelSlots.set(model, slot);
  if (slot.active >= 2) await new Promise((resolveWaiter) => slot.queue.push(resolveWaiter));
  slot.active += 1;
  try { return await action(); }
  finally {
    slot.active -= 1;
    slot.queue.shift()?.();
  }
}

async function remoteImage(body, target) {
  return withModelSlot(body.model, async () => {
    const task = await runway().textToImage.create(body).waitForTaskOutput({ timeout: 12 * 60 * 1000 });
    if (!task.output?.[0]) throw new Error("Runway-task leverde geen afbeelding op");
    await download(task.output[0], target);
    const normalized = `${target}.normalized`;
    await sharp(target).png().toFile(normalized);
    await rename(normalized, target);
    return { taskId: task.id, model: body.model, quality: body.quality || null, credits: body.model === "gpt_image_2" ? (body.quality === "low" ? 1 : 5) : body.model === "gemini_2.5_flash" ? 5 : 4 };
  });
}

function compositionInstruction(plan) {
  if (plan.layout === "stacked") {
    if (seamRecovery) return "Create one single tall camera photograph in one shared white studio. Arrange the START version above and the END version below while keeping one continuous background, floor, lighting and shadows across the whole frame. Absolutely no panels, frames, horizontal seam, split or before-after graphic.";
    return "Show exactly two large views in one continuous studio: START on the upper half and END on the lower half. No panel border or dividing line.";
  }
  if (seamRecovery) return "Create one single camera photograph of two identical-twin versions of the woman together in the same shared white studio: START left and END right. The floor, background, lighting and shadows must continue uninterrupted across the centre. Absolutely no panels, frames, vertical seam, split or before-after graphic.";
  return "Show exactly two large views in one continuous studio: START on the left and END on the right. No panel border or dividing line.";
}

function equipmentInstruction(plan) {
  if (plan.group === "Apparaten") {
    return "In both START and END, show her correctly positioned on or in the same exercise machine and actively using it; never show her standing beside the machine unless the Dutch instructions explicitly require standing.";
  }
  if (plan.group === "TRX") return "Show the complete identical suspension straps, handles and their upper anchor in both poses.";
  if (plan.group === "Bosu") return "Show the complete identical BOSU trainer and correct contact points in both poses.";
  return "Use only equipment explicitly required by the Dutch instructions or the secondary movement reference.";
}

function clinicalPromptName(plan) {
  if (plan.sourceName.toLowerCase() === "superman") return "prone trunk, arm and leg lift (romp- en ledematenlift in buiklig)";
  return plan.sourceName;
}

function prompt(plan) {
  const framing = plan.framing === "active-chain-detail"
    ? "Frame the torso, arms and hands tightly while keeping every active joint visible."
    : "Frame both poses tightly and large, with the complete active body chain, feet, hands and needed equipment visible.";
  return [
    "Create one photorealistic vertical physiotherapy exercise card using @avatar as the exact same adult woman: same face, hair, age and proportions.",
    "Change only her top to a plain light-grey short-sleeve T-shirt; keep charcoal trousers and grey-white trainers.",
    `The Dutch instructions are authoritative for '${clinicalPromptName(plan)}': ${plan.script.setup} ${plan.script.movement} Technique: ${plan.script.cue}`,
    "Use @movement only as a secondary pose hint; ignore any part that conflicts with the Dutch instructions and never copy its drawing style or branding.",
    compositionInstruction(plan),
    equipmentInstruction(plan),
    framing,
    "Use a 20-35 degree three-quarter angle unless the reference requires a clear side view. Keep the joint path unobstructed.",
    "Clean bright-white seamless physiotherapy studio and white floor, with soft natural contact shadows and subtle contour light so the light-grey shirt remains distinct in grayscale print. Leave the top-left corner clear for branding.",
    "No text, labels, arrows, logo, watermark, border, split screen, duplicate limbs or extra people. Anatomically correct hands, feet, joints and equipment.",
  ].join(" ");
}

function providerPrompt(plan) {
  const complete = prompt(plan);
  if (plan.model === "seedream5_lite") return complete.replaceAll("@avatar", "Figure 1").replaceAll("@movement", "Figure 2");
  if (plan.model !== "gen4_image_turbo") return complete;
  const framing = plan.framing === "active-chain-detail" ? "Tight active-joint framing." : "Large poses; all active joints and equipment visible.";
  const concise = [
    "Photorealistic vertical physiotherapy card. @avatar is the exact woman: same face, hair, age and build; plain light-grey T-shirt, charcoal trousers, grey-white trainers.",
    `Dutch instructions are authoritative for ${clinicalPromptName(plan)}: ${plan.script.setup} ${plan.script.movement}`,
    "@movement is only a secondary pose hint; ignore it if it conflicts.",
    compositionInstruction(plan),
    equipmentInstruction(plan),
    framing,
    "Use a clear 20-35 degree three-quarter view unless a side view is clinically needed.",
    "Pure white seamless studio and floor, soft contact shadow and contour light, strong grayscale-print contrast; top-left clear.",
    "No text, labels, arrows, logo, watermark, border, split screen, extra people or limbs. Correct anatomy and equipment.",
  ].join(" ");
  if (concise.length > 1000) throw new Error(`Gen-4-prompt is te lang voor ${plan.sourceName}: ${concise.length}`);
  return concise;
}

async function sourceAvatar(node) {
  const metadata = await sharp(node.output).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Avatarbron is niet leesbaar");
  return { width: metadata.width, height: metadata.height };
}

async function audit(node) {
  const source = join(root, "public", node.plan.sourceImage);
  const metadata = await sharp(source).metadata();
  const report = {
    ...node.plan,
    source: { width: metadata.width, height: metadata.height, format: metadata.format },
    truthPriority: ["individual-dutch-script", "original-reference-image-as-secondary-hint"],
    ignored: ["batch-level-video-props"],
    clinicalStatus: "awaiting-physiotherapist-review",
  };
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, JSON.stringify(report, null, 2) + "\n");
  return report;
}

async function prepareReference(node) {
  const source = join(root, "public", node.plan.sourceImage);
  await mkdir(dirname(node.output), { recursive: true });
  await sharp(source)
    .flatten({ background: "#ffffff" })
    .resize(1200, 1200, { fit: "contain", background: "#ffffff", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(node.output);
  return { width: 1200, height: 1200, fit: "contain", background: "white" };
}

async function generate(node) {
  const source = artifact("references", `${node.plan.exerciseId}.png`);
  await mkdir(dirname(node.output), { recursive: true });
  if (provider === "local") {
    await sharp(source).resize(800, 1200, { fit: "contain", background: "#ecebe7" }).png().toFile(node.output);
    return { source: "local-reference", credits: 0 };
  }
  const [avatar, movement] = await Promise.all([dataUri(avatarPath), dataUri(source)]);
  const common = {
    model: node.plan.model,
    promptText: providerPrompt(node.plan),
    referenceImages: [{ uri: avatar, tag: "avatar" }, { uri: movement, tag: "movement" }],
  };
  if (node.plan.model === "gpt_image_2") {
    return remoteImage({ ...common, ratio: "1280:1920", quality: node.plan.quality, background: "opaque", outputCount: 1 }, node.output);
  }
  if (node.plan.model === "seedream5_lite") {
    return remoteImage({
      model: node.plan.model,
      promptText: providerPrompt(node.plan),
      referenceImages: [{ uri: avatar }, { uri: movement }],
      ratio: "1664:2496",
      outputCount: 1,
      outputFormat: "png",
    }, node.output);
  }
  if (node.plan.model === "gemini_2.5_flash") {
    return remoteImage({ ...common, ratio: "832:1248" }, node.output);
  }
  return remoteImage({ ...common, ratio: "720:1280", seed: 17_000 + node.plan.order }, node.output);
}

function logoSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200">
    <g transform="translate(20 22)">
      <rect width="42" height="42" rx="10" fill="#1769d2"/>
      <path d="M8 22h7l4-8 7 17 5-10h5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="52" y="31" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#111827">Fysiplan</text>
    </g>
  </svg>`);
}

async function compose(node) {
  const generated = artifact("generated", `${node.plan.exerciseId}.png`);
  await mkdir(dirname(node.output), { recursive: true });
  await sharp(generated)
    .resize(800, 1200, { fit: "cover", position: "centre" })
    .composite([{ input: logoSvg(), top: 0, left: 0 }])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(node.output);
  return { width: 800, height: 1200, format: "jpeg", brand: "deterministic-overlay" };
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] || 0;
}

async function imageStructure(path) {
  const { data, info } = await sharp(path).greyscale().resize(100, 150, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const columnGradients = Array.from({ length: info.width - 1 }, (_, x) => {
    let total = 0;
    for (let y = 16; y < info.height - 4; y += 1) total += Math.abs(data[y * info.width + x + 1] - data[y * info.width + x]);
    return total / (info.height - 20);
  });
  const medianGradient = quantile(columnGradients, 0.5);
  const centre = columnGradients.slice(45, 55);
  const centreGradient = Math.max(...centre);
  const rowGradients = Array.from({ length: info.height - 1 }, (_, y) => {
    let total = 0;
    for (let x = 3; x < info.width - 3; x += 1) total += Math.abs(data[(y + 1) * info.width + x] - data[y * info.width + x]);
    return total / (info.width - 6);
  });
  const medianRowGradient = quantile(rowGradients, 0.5);
  const middleRow = rowGradients.slice(70, 80);
  const middleRowGradient = Math.max(...middleRow);
  const stats = await sharp(path).greyscale().stats();
  return {
    mean: Number(stats.channels[0].mean.toFixed(2)),
    stdev: Number(stats.channels[0].stdev.toFixed(2)),
    centreGradient: Number(centreGradient.toFixed(2)),
    medianGradient: Number(medianGradient.toFixed(2)),
    middleRowGradient: Number(middleRowGradient.toFixed(2)),
    medianRowGradient: Number(medianRowGradient.toFixed(2)),
    verticalDividerLikely: centreGradient > Math.max(32, medianGradient * 4.2),
    horizontalDividerLikely: middleRowGradient > Math.max(32, medianRowGradient * 4.2),
  };
}

async function qa(node) {
  const card = artifact("cards", `${node.plan.exerciseId}.jpg`);
  const metadata = await sharp(card).metadata();
  const size = (await stat(card)).size;
  const structure = await imageStructure(card);
  const seamApproval = seamApprovals.get(node.plan.exerciseId) || null;
  const checks = {
    exactPortraitCard: metadata.width === 800 && metadata.height === 1200,
    printableContrast: structure.stdev >= 24,
    printableBrightness: structure.mean >= 95 && structure.mean <= 242,
    noHardCentreDivider: seamApproval ? true : node.plan.layout === "stacked" ? !structure.horizontalDividerLikely : !structure.verticalDividerLikely,
    sensibleFileSize: size >= 45 * 1024 && size <= 1_500 * 1024,
  };
  const report = {
    exerciseId: node.plan.exerciseId,
    sourceName: node.plan.sourceName,
    passed: Object.values(checks).every(Boolean),
    checks,
    structure,
    sizeBytes: size,
    manualSeamApproval: seamApproval,
    clinicalReview: "required",
  };
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, JSON.stringify(report, null, 2) + "\n");
  if (!report.passed) throw new Error(`Technische beeld-QA faalde: ${JSON.stringify(checks)}`);
  return report;
}

async function reviewReady(node) {
  const report = {
    exerciseId: node.plan.exerciseId,
    sourceName: node.plan.sourceName,
    generatedCard: relative(root, artifact("cards", `${node.plan.exerciseId}.jpg`)),
    originalReference: node.plan.sourceImage,
    layout: node.plan.layout,
    status: "awaiting-physiotherapist-review",
    requiredChecks: [
      "beginhouding klopt met de bronoefening",
      "eindhouding klopt met de bronoefening",
      "gewrichtsstand en bewegingsrichting zijn anatomisch veilig",
      "materiaal en handplaatsing zijn correct",
      "beide poses blijven duidelijk op scherm en in zwart-witprint",
    ],
  };
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, JSON.stringify(report, null, 2) + "\n");
  return report;
}

function updateCatalogue(plan) {
  catalogueChain = catalogueChain.then(async () => {
    const catalogue = JSON.parse(await readFile(cataloguePath, "utf8"));
    const entry = catalogue.find((item) => item.naam === plan.sourceName);
    if (!entry) throw new Error(`Catalogusitem ontbreekt: ${plan.sourceName}`);
    entry.kaartImg = plan.outputImage;
    const temporary = `${cataloguePath}.tmp`;
    await writeFile(temporary, JSON.stringify(catalogue));
    await rename(temporary, cataloguePath);
  });
  return catalogueChain;
}

async function publish(node) {
  const source = artifact("cards", `${node.plan.exerciseId}.jpg`);
  await mkdir(dirname(node.output), { recursive: true });
  await copyFile(source, node.output);
  await updateCatalogue(node.plan);
  return { catalogue: "public/oefeningen.json", publicImage: node.plan.outputImage, status: "concept-awaiting-physio-review" };
}

const actions = { "source-avatar": sourceAvatar, audit, "prepare-reference": prepareReference, generate, compose, qa, "review-ready": reviewReady, publish };

function countBy(items, classifier) {
  return Object.fromEntries(items.reduce((map, item) => {
    const key = classifier(item);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map()));
}

function summarizePlan() {
  const cost = nodes.reduce((sum, node) => sum + node.costCredits, 0);
  return {
    architecture: "directed-acyclic-graph",
    exercises: plans.length,
    nodes: nodes.length,
    layers: graphLayers(nodes).length,
    concurrency,
    provider,
    publishConcepts,
    seamRecovery,
    forceGptLow,
    forceGeminiFlash,
    estimatedCredits: cost,
    estimatedUsd: Number((cost * 0.01).toFixed(2)),
    models: countBy(plans, (plan) => `${plan.model}${plan.quality ? `:${plan.quality}` : ""}`),
    layouts: countBy(plans, (plan) => plan.layout),
    groups: countBy(plans, (plan) => plan.group),
    nodeKinds: countBy(nodes, (node) => node.kind),
  };
}

if (command === "plan") {
  console.log(JSON.stringify(summarizePlan(), null, 2));
  process.exit(0);
}

if (command === "status") {
  console.log(JSON.stringify({ ...summarizePlan(), state: countBy(Object.values(state.nodes), (record) => record.status) }, null, 2));
  process.exit(0);
}

if (command !== "run") throw new Error("Gebruik plan, run of status");
if (!executeApproved) throw new Error("Run is droog zonder --execute; dit voorkomt onbedoeld tegoedgebruik.");
const completionChecks = await Promise.all(nodes.map(async (node) => [node, await validCompleted(node)]));
const remainingCredits = completionChecks.filter(([, complete]) => !complete).reduce((sum, [node]) => sum + node.costCredits, 0);
if (provider === "runway" && (!budgetCredits || remainingCredits > budgetCredits)) {
  throw new Error(`Resterende kosten ${remainingCredits} credits overschrijden --budget-credits ${budgetCredits}.`);
}

await mkdir(workDir, { recursive: true });
await saveState();
const results = await runDag({
  nodes,
  concurrency,
  canRun: (node) => (node.dependencies || []).every((dependency) => state.nodes[dependency]?.status === "succeeded"),
  execute: async (node) => {
    if (await validCompleted(node)) {
      if (!quiet) console.log(`cached\t${node.id}`);
      return state.nodes[node.id];
    }
    state.nodes[node.id] = { status: "running", inputHash: hashNode(node), startedAt: new Date().toISOString(), costCredits: node.costCredits };
    await saveState();
    try {
      const metadata = await actions[node.kind](node);
      state.nodes[node.id] = { ...state.nodes[node.id], status: "succeeded", completedAt: new Date().toISOString(), output: relative(workDir, node.output), metadata };
      await saveState();
      if (!quiet) console.log(`succeeded\t${node.id}`);
      return state.nodes[node.id];
    } catch (error) {
      state.nodes[node.id] = { ...state.nodes[node.id], status: "failed", completedAt: new Date().toISOString(), error: String(error?.message || error).slice(0, 1500) };
      await saveState();
      console.error(`failed\t${node.id}\t${state.nodes[node.id].error}`);
      return state.nodes[node.id];
    }
  },
});
await saveState();
await catalogueChain;
const failed = Array.from(results.values()).filter((result) => result.status === "failed").length;
const ready = Object.keys(state.nodes).filter((id) => id.startsWith("review-ready:") && state.nodes[id].status === "succeeded").length;
const published = Object.keys(state.nodes).filter((id) => id.startsWith("publish:") && state.nodes[id].status === "succeeded").length;
console.log(JSON.stringify({ complete: failed === 0, failed, reviewReady: ready, published, remainingCreditsEstimate: remainingCredits, workDir }, null, 2));
if (failed) process.exitCode = 1;
