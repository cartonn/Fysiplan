import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { exerciseId } from "../lib/exercise-id.js";
import { GUIDANCE_NL } from "./video-guidance-nl.mjs";

const root = new URL("../", import.meta.url);
const libraryUrl = new URL("public/oefeningen.json", root);
const manifestUrl = new URL("content/video-productie-215.json", root);
const oefeningen = JSON.parse(await readFile(libraryUrl, "utf8"));
const SAFETY = "Stop bij scherpe of toenemende pijn en volg de dosering van je fysiotherapeut.";
const MANIFEST_VERSION = 1;

const highRisk = new Map([
  ["Barbell neck press", "Belastende positie achter de nek; alleen opnemen en publiceren na expliciete schouderscreening."],
  ["Dumbell neck press", "Naam en bedoelde bewegingsbaan moeten vóór motion capture door twee fysiotherapeuten worden bevestigd."],
  ["Nose breakers", "Gewicht beweegt dicht langs hoofd en ellebogen; spotting en techniekcontrole zijn vereist."],
  ["Jefferson squat", "Gevorderde belaste romp- en heupbeweging; individuele geschiktheid en lichte demonstratiebelasting vereist."],
  ["Yoga ear pressure", "Gevorderde omgekeerde houding met nekbelasting; contra-indicaties en veilige uitstap moeten apart worden beoordeeld."],
  ["Yoga noose", "Gevorderde diepe squat met rotatie; knie-, rug- en schouderbelasting moeten apart worden beoordeeld."],
  ["Yoga plow", "Gevorderde omgekeerde houding met nekbelasting; contra-indicaties en veilige uitstap moeten apart worden beoordeeld."],
  ["TRX saw pikes", "Combinatiebeweging met hoge rompvraag; alleen publiceren als beide fasen visueel foutloos zijn."],
  ["Endy Rotator", "Merkspecifieke bewegingsbaan is uit de bronafbeelding niet eenduidig; verifiëren op het fysieke apparaat."],
  ["Dorsi-pecto (apparaat)", "Merkspecifieke machine en variant moeten op locatie door de fysiotherapeut worden bevestigd."],
]);

const batchByGroup = {
  "Bovenste extremiteit": "01-kracht-bovenlichaam",
  "Onderste extremiteit": "02-kracht-onderlichaam",
  Core: "03-mat-core",
  Cardio: "04-cardio",
  Bosu: "05-bosu",
  TRX: "06-trx",
  Yoga: "07-yoga",
  Kettlebell: "08-kettlebell",
  Bodyblade: "09-bodyblade",
  "Foam roller": "10-foamroller",
  Speedladder: "11-speedladder",
  Apparaten: "12-apparaten",
};

const propsByGroup = {
  "Bovenste extremiteit": ["bank", "dumbbells", "barbell", "kabelstation"],
  "Onderste extremiteit": ["mat", "bank", "barbell", "dumbbells"],
  Core: ["mat", "fitball", "barbell"],
  Cardio: ["cardioapparaat of step"],
  Bosu: ["Bosu", "mat", "dumbbells"],
  TRX: ["TRX met gecontroleerd ankerpunt", "mat"],
  Yoga: ["yogamat", "twee blokken", "riem", "deken"],
  Kettlebell: ["lichte kettlebell", "vrije veiligheidszone"],
  Bodyblade: ["Bodyblade", "vrije veiligheidszone"],
  "Foam roller": ["foamroller", "mat"],
  Speedladder: ["speedladder", "vrije loopzone"],
  Apparaten: ["exact afgebeeld apparaat"],
};

function shotPlan(oefening) {
  const group = oefening.groep;
  const floorExercise = ["Core", "Yoga", "Foam roller"].includes(group);
  const machineExercise = ["Cardio", "Apparaten"].includes(group);
  return {
    captureBatch: batchByGroup[group] || "99-controleren",
    primaryCamera: machineExercise ? "driekwart voor, volledige machine en gewrichten in beeld" : "driekwart voor, avatar volledig in beeld",
    secondaryCamera: floorExercise ? "zijaanzicht op heuphoogte" : "zijaanzicht op gewrichtshoogte",
    repetitions: machineExercise ? 3 : 2,
    targetDurationSeconds: highRisk.has(oefening.naam) ? 32 : 26,
    props: propsByGroup[group] || [],
    wardrobe: "effen contrasterende sportkleding; gewrichten en voetplaatsing zichtbaar",
  };
}

function generatedEntry(oefening, position, previous = {}) {
  const [titleNl, setup, movement, cue] = GUIDANCE_NL[oefening.naam];
  const narration = `Dit is de ${titleNl}. ${setup} ${movement} ${cue} ${SAFETY}`;
  const id = exerciseId(oefening);
  const scriptChanged = !!previous.script?.narration && previous.script.narration !== narration;
  const defaultApprovals = {
    script: { status: "draft", approvedBy: [], approvedAt: null },
    motion: { status: "pending", approvedBy: [], approvedAt: null },
    finalVideo: { status: "pending", approvedBy: [], approvedAt: null },
  };
  const approvals = scriptChanged
    ? { ...defaultApprovals, motion: previous.approvals?.motion || defaultApprovals.motion }
    : previous.approvals || defaultApprovals;
  const assets = scriptChanged
    ? { ...(previous.assets || {}), audioNl: null, renderMaster: null, cloudflareUid: null }
    : previous.assets || { motionCapture: null, audioNl: null, renderMaster: null, cloudflareUid: null };
  return {
    order: position + 1,
    exerciseId: id,
    sourceName: oefening.naam,
    titleNl,
    category: oefening.groep,
    referenceImage: oefening.img,
    script: { language: "nl-NL", setup, movement, cue, safety: SAFETY, narration },
    shotPlan: shotPlan(oefening),
    risk: highRisk.has(oefening.naam)
      ? { level: "extra-review", reason: highRisk.get(oefening.naam) }
      : { level: "standard", reason: "Standaard dubbele klinische beoordeling blijft vereist." },
    // Handmatig aangescherpte bewegingsbanen blijven behouden wanneer de overige
    // productiemetadata opnieuw uit de bibliotheek wordt gesynchroniseerd.
    ...(previous.motionPromptEn ? { motionPromptEn: previous.motionPromptEn } : {}),
    ...(previous.motionNegativePromptEn ? { motionNegativePromptEn: previous.motionNegativePromptEn } : {}),
    ...(previous.motionKeyframes ? { motionKeyframes: previous.motionKeyframes } : {}),
    approvals,
    assets,
    publication: scriptChanged
      ? { status: "blocked", reason: "Het script is gewijzigd; script- en eindreview zijn automatisch ingetrokken." }
      : previous.publication || { status: "blocked", reason: "Twee klinische reviewers moeten de eindvideo goedkeuren." },
  };
}

function buildManifest(previous) {
  const prior = new Map((previous?.exercises || []).map((entry) => [entry.exerciseId, entry]));
  return {
    schemaVersion: MANIFEST_VERSION,
    collection: "Fysiplan uitlegvideo's — 215 oefeningen",
    language: "nl-NL",
    avatar: {
      platform: "Runway multi-model graph; MetaHuman/motion capture blijft de latere premium-vervanging",
      profile: "Fysiplan Video-avatar v2 — fotorealistische vrouw met blauw shirt; oefenafbeeldingen behouden afzonderlijk hun lichtgrijze printshirt",
      bodyMotionSource: "AI-concept via poseframe en motionvideo; fysiotherapeuten beoordelen en vervangen fouten vóór klinische goedkeuring",
      facialAnimationSource: "Runway Serene via Eleven Multilingual v2; exact dezelfde vrouwelijke stemidentiteit in alle talen; demonstratievideo bevat geen pratende mond nodig",
      rule: "Generatieve lichaamsbeweging mag uitsluitend als duidelijk gemarkeerd concept zichtbaar zijn; nooit als klinisch gecontroleerd publiceren zonder twee fysioreviewers.",
    },
    render: {
      resolution: "1920x1080",
      frameRate: 25,
      codec: "H.264 high profile",
      audio: "AAC-LC 48 kHz",
      background: "rustige lichte studio met sterk contrast tussen avatar, hulpmiddel en achtergrond",
      captions: "Getimede WebVTT-sidecar per taal plus een rustig tekstblok onder de speler; nooit ingebakken over gezicht of beweging",
    },
    qualityGate: {
      requiredFinalReviewers: 2,
      publicationDefault: "blocked",
      checks: [
        "De beweging, startpositie, ademhaling en belangrijkste compensaties zijn klinisch juist.",
        "De heenfase verloopt vloeiend zonder tik, bounce, overshoot of wisseling van bewegingsvlak; de terugweg is de exacte lokale reverse.",
        "De avatar, alle relevante gewrichten en het volledige hulpmiddel blijven zichtbaar.",
        "Nederlands klinkt natuurlijk en uitspraak van anatomische termen is gecontroleerd.",
        "Per taal zijn audio, WebVTT en patiënttekstblok afgeleid van exact dezelfde goedgekeurde narration en gebruiken alle audiosporen stemidentiteit fysiplan-serene-v1.",
        "Beeld, audio en ondertiteling zijn synchroon en bevatten geen merk- of bronmateriaal zonder rechten.",
        "Bestand doorstaat technische controle en heeft geen zwarte frames, clipping of zichtbare motion-capturefouten.",
      ],
    },
    exercises: oefeningen.map((o, i) => generatedEntry(o, i, prior.get(exerciseId(o)))),
  };
}

function validateSource() {
  const errors = [];
  const sourceNames = new Set(oefeningen.map((o) => o.naam));
  const guidanceNames = new Set(Object.keys(GUIDANCE_NL));
  if (oefeningen.length !== 215) errors.push(`verwacht 215 oefeningen, gevonden ${oefeningen.length}`);
  if (sourceNames.size !== oefeningen.length) errors.push("de oefenbibliotheek bevat dubbele namen");
  const ids = oefeningen.map(exerciseId);
  if (new Set(ids).size !== ids.length) errors.push("de oefenbibliotheek bevat dubbele stabiele exerciseId's");
  for (const name of sourceNames) {
    if (!guidanceNames.has(name)) errors.push(`conceptscript ontbreekt: ${name}`);
  }
  for (const name of guidanceNames) {
    if (!sourceNames.has(name)) errors.push(`conceptscript hoort niet bij de bibliotheek: ${name}`);
    const parts = GUIDANCE_NL[name];
    if (!Array.isArray(parts) || parts.length !== 4 || parts.some((part) => !String(part).trim())) {
      errors.push(`conceptscript heeft niet exact vier gevulde onderdelen: ${name}`);
    }
  }
  return errors;
}

function validateManifest(manifest, generated) {
  const errors = [];
  if (manifest.schemaVersion !== MANIFEST_VERSION) errors.push("manifest schemaVersion is ongeldig");
  if (!Array.isArray(manifest.exercises) || manifest.exercises.length !== 215) errors.push("manifest moet 215 oefeningen bevatten");
  const generatedById = new Map(generated.exercises.map((entry) => [entry.exerciseId, entry]));
  const seen = new Set();
  for (const entry of manifest.exercises || []) {
    if (seen.has(entry.exerciseId)) errors.push(`dubbele manifest-ID: ${entry.exerciseId}`);
    seen.add(entry.exerciseId);
    const expected = generatedById.get(entry.exerciseId);
    if (!expected) {
      errors.push(`onbekende manifest-ID: ${entry.exerciseId}`);
      continue;
    }
    if (entry.script?.narration !== expected.script.narration) errors.push(`script niet gesynchroniseerd: ${entry.sourceName}`);
    if (entry.publication?.status === "published") {
      const reviewers = entry.approvals?.finalVideo?.approvedBy || [];
      if (entry.approvals?.finalVideo?.status !== "approved" || new Set(reviewers).size < 2) {
        errors.push(`publicatie zonder twee unieke eindreviewers: ${entry.sourceName}`);
      }
      if (!entry.assets?.renderMaster || !entry.assets?.cloudflareUid) errors.push(`publicatie mist render of Stream-UID: ${entry.sourceName}`);
    }
  }
  return errors;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function printCaptureCsv(manifest) {
  const headings = ["volgorde", "exerciseId", "oefening", "categorie", "opnamebatch", "risico", "doelduur_sec", "props", "scriptstatus", "motionstatus", "videostatus"];
  console.log(headings.map(csvCell).join(","));
  for (const entry of manifest.exercises) {
    console.log([
      entry.order,
      entry.exerciseId,
      entry.sourceName,
      entry.category,
      entry.shotPlan.captureBatch,
      entry.risk.level,
      entry.shotPlan.targetDurationSeconds,
      entry.shotPlan.props.join(" | "),
      entry.approvals.script.status,
      entry.approvals.motion.status,
      entry.approvals.finalVideo.status,
    ].map(csvCell).join(","));
  }
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(manifestUrl, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function synthesizeApprovedAudio(manifest, outputDir) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("ELEVENLABS_API_KEY en ELEVENLABS_VOICE_ID zijn vereist voor --tts-dir");
  const approved = manifest.exercises.filter((entry) => {
    const review = entry.approvals?.script;
    return review?.status === "approved" && new Set(review.approvedBy || []).size >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(review.approvedAt || "");
  });
  if (!approved.length) throw new Error("Geen scripts met twee reviewers zijn goedgekeurd; audio is bewust niet gegenereerd.");
  const destination = resolve(outputDir);
  await mkdir(destination, { recursive: true });
  for (const entry of approved) {
    const target = resolve(destination, `${entry.exerciseId}.mp3`);
    if (!process.argv.includes("--force-tts")) {
      try {
        const existingAudio = await stat(target);
        if (existingAudio.size > 10 * 1024) {
          console.error(`overslaan: ${basename(target)} bestaat al; gebruik --force-tts om opnieuw te genereren`);
          continue;
        }
      } catch {}
    }
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text: entry.script.narration,
        model_id: "eleven_multilingual_v2",
        language_code: "nl",
        voice_settings: { stability: 0.62, similarity_boost: 0.78, style: 0.12, use_speaker_boost: true },
      }),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status} voor ${entry.sourceName}: ${(await response.text()).slice(0, 500)}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.error(`audio: ${basename(target)} — ${entry.sourceName}`);
  }
}

const sourceErrors = validateSource();
if (sourceErrors.length) {
  console.error("Videoproductiebron ongeldig:\n- " + sourceErrors.join("\n- "));
  process.exit(1);
}

const existing = await readExisting();
const generated = buildManifest(existing);

if (process.argv.includes("--write")) {
  await writeFile(manifestUrl, JSON.stringify(generated, null, 2) + "\n");
  console.log(`Productiemanifest geschreven: ${generated.exercises.length} oefeningen.`);
  process.exit(0);
}

const manifest = existing || generated;
const manifestErrors = validateManifest(manifest, generated);
if (manifestErrors.length) {
  console.error("Videoproductiemanifest ongeldig:\n- " + manifestErrors.join("\n- "));
  console.error("Voer `npm run videos:production:write` uit om conceptscripts te synchroniseren; reviewvelden blijven behouden.");
  process.exit(1);
}

if (process.argv.includes("--export-csv")) {
  printCaptureCsv(manifest);
  process.exit(0);
}

const ttsIndex = process.argv.indexOf("--tts-dir");
if (ttsIndex !== -1) {
  const outputDir = process.argv[ttsIndex + 1];
  if (!outputDir || outputDir.startsWith("--")) throw new Error("Geef na --tts-dir een uitvoermap op");
  await synthesizeApprovedAudio(manifest, outputDir);
  process.exit(0);
}

const extraReview = manifest.exercises.filter((entry) => entry.risk.level === "extra-review").length;
console.log(`Videoproductie geldig: ${manifest.exercises.length}/215 conceptscripts; ${extraReview} met extra klinische review; publicatie standaard geblokkeerd.`);
