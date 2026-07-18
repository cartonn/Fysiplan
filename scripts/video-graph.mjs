import RunwayML from "@runwayml/sdk";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { graphLayers, runDag } from "../lib/dag-runner.js";

const exec = promisify(execFile);
const root = resolve(new URL("../", import.meta.url).pathname);
const manifestPath = join(root, "content", "video-productie-215.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const GRAPH_VERSION = 2;
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "plan";

function valueAfter(flag, fallback = "") {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : String(args[index + 1] || fallback);
}

const provider = valueAfter("--provider", "local");
const workDir = resolve(valueAfter("--work-dir", join(root, "video-work")));
const statePath = join(workDir, "state.json");
const executeApproved = args.includes("--execute");
const concurrency = Math.max(1, Math.min(8, Number(valueAfter("--concurrency", "3")) || 3));
const budgetUsd = Number(valueAfter("--budget-usd", "0"));
const only = valueAfter("--only");
const uploadConcepts = args.includes("--upload-concepts");
const baseUrl = valueAfter("--base-url").replace(/\/$/, "");
const allExercises = manifest.exercises;
const selected = only
  ? allExercises.filter((entry) => entry.exerciseId === only || entry.sourceName.toLowerCase() === only.toLowerCase())
  : allExercises;
if (only && !selected.length) throw new Error(`Oefening niet gevonden: ${only}`);
if (!['local', 'runway'].includes(provider)) throw new Error("--provider moet local of runway zijn");

const modelPolicy = {
  avatarImage: "gemini_image3_pro",
  poseImage: "gemini_image3_pro",
  motionVideoStandard: "gemini_omni_flash",
  motionVideoComplex: "seedance2",
  complexRule: "risk.level === extra-review",
  voice: "eleven_multilingual_v2",
  motionSeconds: 6,
  voicePreset: "Marlene",
};

function artifact(...parts) {
  return join(workDir, "artifacts", ...parts);
}

function nodeCost(kind, entry) {
  if (provider !== "runway") return 0;
  if (kind === "avatar") return 0.20;
  if (kind === "pose") return 0.20;
  if (kind === "motion") return modelPolicy.motionSeconds * (entry.risk.level === "extra-review" ? 0.40 : 0.10);
  if (kind === "voice") return Math.ceil(entry.script.narration.length / 50) * 0.01;
  return 0;
}

function buildGraph() {
  const avatar = {
    id: "avatar:master",
    kind: "avatar",
    dependencies: [],
    output: artifact("avatar", "fysiplan-avatar-master.png"),
    costUsd: nodeCost("avatar"),
  };
  const branches = selected.flatMap((entry) => {
    const id = entry.exerciseId;
    const exerciseNodes = [
      { id: `pose:${id}`, kind: "pose", entry, dependencies: [avatar.id], output: artifact("poses", `${id}.png`), costUsd: nodeCost("pose", entry) },
      { id: `motion:${id}`, kind: "motion", entry, dependencies: [`pose:${id}`], output: artifact("motion", `${id}.mp4`), costUsd: nodeCost("motion", entry) },
      { id: `voice:${id}`, kind: "voice", entry, dependencies: [], output: artifact("voice", `${id}.mp3`), costUsd: nodeCost("voice", entry) },
      { id: `captions:${id}`, kind: "captions", entry, dependencies: [`voice:${id}`], output: artifact("captions", `${id}.vtt`), costUsd: 0 },
      { id: `compose:${id}`, kind: "compose", entry, dependencies: [`motion:${id}`, `voice:${id}`, `captions:${id}`], output: artifact("final", `${id}.mp4`), costUsd: 0 },
      { id: `qa:${id}`, kind: "qa", entry, dependencies: [`compose:${id}`], output: artifact("qa", `${id}.json`), costUsd: 0 },
      { id: `review-ready:${id}`, kind: "review-ready", entry, dependencies: [`qa:${id}`], output: artifact("review-ready", `${id}.json`), costUsd: 0 },
    ];
    if (uploadConcepts) exerciseNodes.push({ id: `concept-upload:${id}`, kind: "concept-upload", entry, dependencies: [`review-ready:${id}`], output: artifact("upload", `${id}.json`), costUsd: 0 });
    return exerciseNodes;
  });
  return [avatar, ...branches];
}

const nodes = buildGraph();
graphLayers(nodes);

async function readState() {
  try { return JSON.parse(await readFile(statePath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { schemaVersion: 1, provider, modelPolicy, nodes: {} };
  }
}

const state = await readState();
if (state.provider && state.provider !== provider && command === "run") {
  throw new Error(`Werkmap hoort bij provider ${state.provider}; kies een andere --work-dir voor ${provider}`);
}
state.provider = provider;
state.modelPolicy = modelPolicy;
let saveStateChain = Promise.resolve();

function saveState() {
  saveStateChain = saveStateChain.then(async () => {
    await mkdir(dirname(statePath), { recursive: true });
    const temporary = `${statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + "\n");
    await rename(temporary, statePath);
  });
  return saveStateChain;
}

function hashNode(node) {
  return createHash("sha256").update(JSON.stringify({
    graphVersion: GRAPH_VERSION,
    kind: node.kind,
    exerciseId: node.entry?.exerciseId,
    titleNl: node.entry?.titleNl,
    referenceImage: node.entry?.referenceImage,
    script: node.entry?.script,
    shotPlan: node.entry?.shotPlan,
    modelPolicy,
  })).digest("hex").slice(0, 20);
}

async function validCompleted(node) {
  const record = state.nodes[node.id];
  if (!record || record.status !== "succeeded" || record.inputHash !== hashNode(node)) return false;
  try { return (await stat(node.output)).size > 100; } catch { return false; }
}

function dataUri(path, mimeOverride) {
  return readFile(path).then((bytes) => {
    const mime = mimeOverride || ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" }[extname(path).toLowerCase()] || "application/octet-stream");
    return `data:${mime};base64,${bytes.toString("base64")}`;
  });
}

async function download(url, target) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`download gaf HTTP ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

function avatarPrompt() {
  return [
    "Create a photorealistic full-body Dutch physiotherapist for a medical exercise library.",
    "A warm, trustworthy adult woman around 38 years old, natural face, realistic anatomy, athletic but approachable build.",
    "She wears an unbranded cobalt-blue fitted physiotherapy top, charcoal training trousers and clean white trainers.",
    "Neutral bright physiotherapy studio, soft daylight, uncluttered pale background, full body and both feet visible.",
    "Documentary realism, accurate hands, natural skin texture, no text, no logo, no watermark, 16:9 landscape.",
  ].join(" ");
}

function posePrompt(entry) {
  return [
    "Use @fysio as the exact same person, face, hairstyle, clothing and proportions.",
    `Create a photorealistic full-body start frame for the physiotherapy exercise '${entry.titleNl}'.`,
    `The source reference @movement shows the intended exercise. Dutch instructions: ${entry.script.setup} ${entry.script.movement}`,
    `Required equipment: ${entry.shotPlan.props.join(", ") || "none"}.`,
    "Show the clinically intended starting pose in a bright neutral physiotherapy studio, three-quarter front camera, all joints, hands, feet and equipment visible.",
    "No text, no logo, no watermark, no extra person, no cropped limbs, anatomically correct hands and feet.",
  ].join(" ");
}

function motionPrompt(entry) {
  return [
    `The same physiotherapist demonstrates '${entry.titleNl}' slowly and precisely for a patient education video.`,
    `Start position: ${entry.script.setup}`,
    `Movement: ${entry.script.movement}`,
    `Technique: ${entry.script.cue}`,
    "Perform one complete controlled repetition and return to the exact starting pose, keeping the camera locked off and the full body visible.",
    "Natural biomechanics, no talking, no camera movement, no cuts, no added people, no changing clothes or equipment, no text or watermark.",
  ].join(" ");
}

let runwayClient;
function runway() {
  if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
  runwayClient ||= new RunwayML();
  return runwayClient;
}

async function remoteTask(createTask, target) {
  const task = await createTask().waitForTaskOutput({ timeout: 12 * 60 * 1000 });
  if (!task.output?.[0]) throw new Error("Runway-task leverde geen output-URL");
  await download(task.output[0], target);
  return { taskId: task.id, outputUrlStoredLocally: true };
}

async function createAvatar(node) {
  if (provider === "local") {
    await mkdir(dirname(node.output), { recursive: true });
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=#eef4fb:s=1920x1080", "-frames:v", "1", node.output]);
    return { source: "local-graph-test" };
  }
  const result = await remoteTask(() => runway().textToImage.create({
    model: modelPolicy.avatarImage,
    promptText: avatarPrompt(),
    ratio: "1344:768",
    outputCount: 1,
  }), node.output);
  await normalizeGeneratedPng(node.output);
  return result;
}

async function createPose(node) {
  const referencePath = join(root, "public", node.entry.referenceImage);
  await mkdir(dirname(node.output), { recursive: true });
  if (provider === "local") {
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", referencePath, "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white", "-frames:v", "1", node.output]);
    return { source: "exercise-reference" };
  }
  const [avatarReference, movementReference] = await Promise.all([dataUri(artifact("avatar", "fysiplan-avatar-master.png")), dataUri(referencePath)]);
  const result = await remoteTask(() => runway().textToImage.create({
    model: modelPolicy.poseImage,
    promptText: posePrompt(node.entry),
    ratio: "1344:768",
    outputCount: 1,
    referenceImages: [
      { uri: avatarReference, tag: "fysio", subject: "human" },
      { uri: movementReference, tag: "movement", subject: "object" },
    ],
  }), node.output);
  await normalizeGeneratedPng(node.output);
  return result;
}

async function createMotion(node) {
  await mkdir(dirname(node.output), { recursive: true });
  const posePath = artifact("poses", `${node.entry.exerciseId}.png`);
  if (provider === "local") {
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", posePath, "-vf", "zoompan=z='min(zoom+0.00025,1.025)':d=150:s=1280x720:fps=25,format=yuv420p", "-t", "6", "-an", "-c:v", "libx264", "-preset", "veryfast", node.output]);
    return { source: "local-graph-test" };
  }
  const pose = await dataUri(posePath);
  if (node.entry.risk.level === "extra-review") {
    return remoteTask(() => runway().imageToVideo.create({
      model: modelPolicy.motionVideoComplex,
      promptImage: [{ uri: pose, position: "first" }],
      promptText: motionPrompt(node.entry),
      ratio: "1920:1080",
      duration: modelPolicy.motionSeconds,
      audio: false,
    }), node.output);
  }
  return remoteTask(() => runway().imageToVideo.create({
    model: modelPolicy.motionVideoStandard,
    promptImage: pose,
    promptText: motionPrompt(node.entry),
    ratio: "1280:720",
    duration: modelPolicy.motionSeconds,
  }), node.output);
}

async function createVoice(node) {
  await mkdir(dirname(node.output), { recursive: true });
  if (provider === "local") {
    const aiff = node.output.replace(/\.mp3$/, ".aiff");
    await exec("say", ["-v", "Xander", "-r", "165", "-o", aiff, node.entry.script.narration]);
    if ((await stat(aiff)).size > 10 * 1024) {
      await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "48000", "-ac", "1", "-b:a", "160k", node.output]);
      return { source: "macOS-Xander-testvoice" };
    }
    const estimatedDuration = Math.max(10, node.entry.script.narration.split(/\s+/).length / 2.75);
    await exec("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(estimatedDuration), "-b:a", "160k", node.output]);
    return { source: "silent-local-graph-fallback", warning: "macOS-systeemstem leverde geen audio; alleen de graph wordt getest" };
  }
  return remoteTask(() => runway().textToSpeech.create({
    model: modelPolicy.voice,
    promptText: node.entry.script.narration,
    voice: { type: "runway-preset", presetId: modelPolicy.voicePreset },
  }), node.output);
}

async function mediaDuration(path) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", path]);
  return Number(stdout.trim());
}

function timestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

async function createCaptions(node) {
  const duration = await mediaDuration(artifact("voice", `${node.entry.exerciseId}.mp3`));
  const sentences = node.entry.script.narration.match(/[^.!?]+[.!?]+/g) || [node.entry.script.narration];
  const totalWords = sentences.reduce((sum, sentence) => sum + sentence.trim().split(/\s+/).length, 0);
  let cursor = 0;
  const cues = sentences.map((sentence, index) => {
    const words = sentence.trim().split(/\s+/).length;
    const start = cursor;
    const end = index === sentences.length - 1 ? duration : cursor + duration * words / totalWords;
    cursor = end;
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${sentence.trim()}\n`;
  });
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, `WEBVTT\n\n${cues.join("\n")}`);
  return { durationSeconds: duration, cues: cues.length };
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function wrapText(value, limit = 58) {
  return String(value).split(/\s+/).reduce((lines, word) => {
    const last = lines.at(-1) || "";
    if (!last || `${last} ${word}`.length > limit) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
    return lines;
  }, []).slice(0, 3);
}

function parseVtt(value) {
  const toSeconds = (stamp) => {
    const [hours, minutes, rest] = stamp.split(":");
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(rest);
  };
  return Array.from(value.matchAll(/\d+\n(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n([^\n]+)(?:\n|$)/g), (match) => ({
    start: toSeconds(match[1]),
    end: toSeconds(match[2]),
    text: match[3],
  }));
}

async function renderOverlay(path, svg) {
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(path);
}

async function normalizeGeneratedPng(path) {
  const normalized = `${path}.normalized`;
  await sharp(path).png().toFile(normalized);
  await rename(normalized, path);
}

async function compose(node) {
  const id = node.entry.exerciseId;
  const motion = artifact("motion", `${id}.mp4`);
  const voice = artifact("voice", `${id}.mp3`);
  const captions = artifact("captions", `${id}.vtt`);
  const duration = await mediaDuration(voice);
  await mkdir(dirname(node.output), { recursive: true });
  const overlayDir = artifact("overlays", id);
  const chromePath = join(overlayDir, "chrome.png");
  await renderOverlay(chromePath, `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <rect x="0" y="0" width="1920" height="106" fill="#073b5c" fill-opacity="0.94"/>
    <text x="64" y="68" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="600" fill="white">${xmlEscape(node.entry.titleNl)}</text>
    <rect x="0" y="1016" width="1920" height="64" fill="white" fill-opacity="0.92"/>
    <text x="960" y="1057" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="600" fill="#073b5c">AI-concept · beoordeling door fysiotherapeut volgt</text>
  </svg>`);
  const cues = parseVtt(await readFile(captions, "utf8"));
  const subtitlePaths = await Promise.all(cues.map(async (cue, index) => {
    const target = join(overlayDir, `caption-${String(index + 1).padStart(2, "0")}.png`);
    const lines = wrapText(cue.text);
    const firstY = 826 - (lines.length - 1) * 24;
    const tspans = lines.map((line, lineIndex) => `<tspan x="960" y="${firstY + lineIndex * 48}">${xmlEscape(line)}</tspan>`).join("");
    await renderOverlay(target, `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
      <rect x="230" y="${firstY - 43}" width="1460" height="${lines.length * 48 + 30}" rx="18" fill="#061927" fill-opacity="0.84"/>
      <text text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="37" font-weight="500" fill="white">${tspans}</text>
    </svg>`);
    return target;
  }));
  const inputArgs = ["-stream_loop", "-1", "-i", motion, "-i", voice, "-i", chromePath, ...subtitlePaths.flatMap((path) => ["-i", path])];
  const filters = ["[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#edf3f8[base]", "[base][2:v]overlay=0:0:format=auto[v0]"];
  cues.forEach((cue, index) => filters.push(`[v${index}][${index + 3}:v]overlay=0:0:format=auto:enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'[v${index + 1}]`));
  filters.push(`[v${cues.length}]format=yuv420p[outv]`);
  await exec("ffmpeg", ["-y", "-loglevel", "error", ...inputArgs, "-t", String(duration + 0.35), "-filter_complex", filters.join(";"), "-map", "[outv]", "-map", "1:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", "25", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", node.output]);
  return { durationSeconds: duration + 0.35 };
}

async function qa(node) {
  const video = artifact("final", `${node.entry.exerciseId}.mp4`);
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video]);
  const probe = JSON.parse(stdout);
  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
  const size = Number(probe.format?.size || 0);
  const duration = Number(probe.format?.duration || 0);
  const checks = {
    videoH264: videoStream?.codec_name === "h264",
    resolution1080p: videoStream?.width === 1920 && videoStream?.height === 1080,
    frameRate25: videoStream?.avg_frame_rate === "25/1",
    audioAac: audioStream?.codec_name === "aac",
    durationSafe: duration >= 10 && duration <= 45,
    uploadSizeSafe: size >= 10 * 1024 && size <= 60 * 1024 * 1024,
  };
  const report = { exerciseId: node.entry.exerciseId, sourceName: node.entry.sourceName, passed: Object.values(checks).every(Boolean), checks, duration, sizeBytes: size, review: "required" };
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, JSON.stringify(report, null, 2) + "\n");
  if (!report.passed) throw new Error(`technische QA faalde: ${JSON.stringify(checks)}`);
  return report;
}

async function reviewReady(node) {
  const qaReport = JSON.parse(await readFile(artifact("qa", `${node.entry.exerciseId}.json`), "utf8"));
  const review = {
    exerciseId: node.entry.exerciseId,
    sourceName: node.entry.sourceName,
    video: relative(workDir, artifact("final", `${node.entry.exerciseId}.mp4`)),
    referenceImage: node.entry.referenceImage,
    status: "awaiting-physiotherapist-review",
    technicalQa: qaReport.passed,
    requiredReviewers: 2,
    clinicalChecks: manifest.qualityGate.checks,
  };
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, JSON.stringify(review, null, 2) + "\n");
  return review;
}

async function jsonRequest(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { fout: text.slice(0, 500) }; }
  if (!response.ok || body.ok === false) throw new Error(`${response.status}: ${body.fout || "onbekende API-fout"}`);
  return body;
}

async function uploadConcept(node) {
  const adminKey = process.env.FYSIPLAN_ADMIN_KEY;
  if (!baseUrl || !/^https?:\/\/[^/]+(?::\d+)?$/.test(baseUrl)) throw new Error("--base-url ontbreekt of is ongeldig voor --upload-concepts");
  if (!adminKey) throw new Error("FYSIPLAN_ADMIN_KEY ontbreekt voor --upload-concepts");
  const file = artifact("final", `${node.entry.exerciseId}.mp4`);
  const bytes = await readFile(file);
  const headers = { "x-admin-sleutel": adminKey };
  const start = await jsonRequest(`${baseUrl}/api/oefeningen/video/upload/start`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ exerciseId: node.entry.exerciseId, bestandsnaam: `${node.entry.exerciseId}.mp4`, reviewStatus: "concept", aiGenerated: true }),
  });
  if (Number(start.maxBytes || 0) && bytes.length > Number(start.maxBytes)) throw new Error(`video is groter dan providerlimiet ${start.maxBytes}`);
  let receipt;
  if (start.provider === "cloudflare-stream") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "video/mp4" }), `${node.entry.exerciseId}.mp4`);
    const upload = await fetch(start.uploadURL, { method: "POST", body: form, signal: AbortSignal.timeout(10 * 60_000) });
    if (!upload.ok) throw new Error(`Cloudflare-upload gaf ${upload.status}`);
    receipt = await jsonRequest(`${baseUrl}/api/oefeningen/video/upload/complete`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ exerciseId: node.entry.exerciseId, uid: start.uid }),
    });
  } else if (start.provider === "railway-volume") {
    receipt = await jsonRequest(new URL(start.uploadURL, baseUrl).href, {
      method: "POST",
      headers: { ...headers, "content-type": "video/mp4", "content-length": String(bytes.length) },
      body: bytes,
    });
  } else throw new Error(`onbekende uploadprovider ${start.provider}`);
  const stored = { exerciseId: node.entry.exerciseId, provider: start.provider, reviewStatus: "concept", linked: receipt.ok === true };
  await mkdir(dirname(node.output), { recursive: true });
  await writeFile(node.output, JSON.stringify(stored, null, 2) + "\n");
  return stored;
}

const actions = { avatar: createAvatar, pose: createPose, motion: createMotion, voice: createVoice, captions: createCaptions, compose, qa, "review-ready": reviewReady, "concept-upload": uploadConcept };

function countBy(items, classifier) {
  return Object.fromEntries(items.reduce((map, item) => {
    const key = classifier(item);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map()));
}

function summarizePlan() {
  const counts = countBy(nodes, (node) => node.kind);
  const cost = nodes.reduce((sum, node) => sum + node.costUsd, 0);
  return { architecture: "directed-acyclic-graph", exercises: selected.length, nodes: nodes.length, layers: graphLayers(nodes).length, concurrency, provider, modelPolicy, estimatedGenerationCostUsd: Number(cost.toFixed(2)), counts };
}

if (command === "plan") {
  console.log(JSON.stringify(summarizePlan(), null, 2));
  process.exit(0);
}

if (command === "status") {
  const statusCounts = countBy(Object.values(state.nodes), (record) => record.status);
  console.log(JSON.stringify({ ...summarizePlan(), state: statusCounts }, null, 2));
  process.exit(0);
}

if (command !== "run") throw new Error("Gebruik plan, run of status");
if (!executeApproved) throw new Error("Run is standaard droog. Voeg --execute toe om artifacts te maken en eventueel providertegoed te gebruiken.");
const completionChecks = await Promise.all(nodes.map(async (node) => [node, await validCompleted(node)]));
const remainingCost = completionChecks.filter(([, complete]) => !complete).reduce((sum, [node]) => sum + node.costUsd, 0);
if (provider === "runway" && (!budgetUsd || remainingCost > budgetUsd)) {
  throw new Error(`Resterende geschatte kosten $${remainingCost.toFixed(2)} overschrijden --budget-usd ${budgetUsd.toFixed(2)}.`);
}

await mkdir(workDir, { recursive: true });
await saveState();
const results = await runDag({
  nodes,
  concurrency,
  canRun: (node) => (node.dependencies || []).every((dependency) => state.nodes[dependency]?.status === "succeeded"),
  execute: async (node) => {
    if (await validCompleted(node)) {
      console.log(`cached\t${node.id}`);
      return state.nodes[node.id];
    }
    state.nodes[node.id] = { status: "running", inputHash: hashNode(node), startedAt: new Date().toISOString(), costUsd: node.costUsd };
    await saveState();
    try {
      const metadata = await actions[node.kind](node);
      state.nodes[node.id] = { ...state.nodes[node.id], status: "succeeded", completedAt: new Date().toISOString(), output: relative(workDir, node.output), metadata };
      await saveState();
      console.log(`succeeded\t${node.id}`);
      return state.nodes[node.id];
    } catch (error) {
      state.nodes[node.id] = { ...state.nodes[node.id], status: "failed", completedAt: new Date().toISOString(), error: String(error?.message || error).slice(0, 1000) };
      await saveState();
      console.error(`failed\t${node.id}\t${state.nodes[node.id].error}`);
      return state.nodes[node.id];
    }
  },
});
await saveState();
const failed = Array.from(results.values()).filter((result) => result.status === "failed").length;
const ready = Object.keys(state.nodes).filter((id) => id.startsWith("review-ready:") && state.nodes[id].status === "succeeded").length;
console.log(JSON.stringify({ complete: failed === 0, failed, reviewReady: ready, workDir }, null, 2));
if (failed) process.exitCode = 1;
