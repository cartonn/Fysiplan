import RunwayML from "@runwayml/sdk";
import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const source = resolve(process.argv[2] || "");
const language = String(process.argv[3] || "").toLowerCase();
const output = resolve(process.argv[4] || "");
const execute = process.argv.includes("--execute");
const reuseAudio = process.argv.includes("--reuse-audio");

const locales = {
  fr: {
    label: "Français",
    metadataLanguage: "fra",
    narration: "Voici l’élévation des bras vers l’avant. Tenez-vous debout, les épaules détendues et les bras le long du corps. Levez lentement les deux bras tendus vers l’avant jusqu’à la hauteur convenue, puis redescendez-les de manière contrôlée. Gardez le tronc immobile et ne haussez pas les épaules. Arrêtez en cas de douleur vive ou croissante et respectez les consignes de votre kinésithérapeute.",
  },
  ar: {
    label: "العربية",
    metadataLanguage: "ara",
    narration: "هذا هو رفع الذراعين إلى الأمام. قف باستقامة مع إرخاء الكتفين والذراعين بجانب الجسم. ارفع الذراعين ممدودتين ببطء إلى الأمام حتى الارتفاع المحدد، ثم اخفضهما بتحكم. حافظ على ثبات الجذع ولا ترفع كتفيك إلى الأعلى. توقف إذا شعرت بألم حاد أو متزايد، واتبع البرنامج الذي حدده أخصائي العلاج الطبيعي.",
  },
};

if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !locales[language]) {
  throw new Error("Gebruik: node runway-localized-voice-pilot.mjs <bronvideo.mp4> <fr|ar> <uitvoer.mp4> --execute");
}
if (!execute) throw new Error("Droge stand: voeg --execute toe om de gelokaliseerde video te maken.");

const voicePath = output.replace(/\.mp4$/i, `.${language}.mp3`);
const vttPath = output.replace(/\.mp4$/i, `.${language}.vtt`);
await mkdir(dirname(output), { recursive: true });
let taskId = "reused-existing-serene-audio";
if (reuseAudio) {
  if ((await stat(voicePath)).size < 10_000) throw new Error("Bestaande Serene-audio is leeg of ontbreekt");
} else {
  if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
  const client = new RunwayML();
  const organization = await client.organization.retrieve();
  if (Number(organization.creditBalance) < 15) {
    throw new Error("Minder dan 15 bestaande credits beschikbaar; er wordt niets bijgekocht.");
  }
  const pending = client.textToSpeech.create({
    model: "eleven_multilingual_v2",
    promptText: locales[language].narration,
    voice: { type: "runway-preset", presetId: "Serene" },
  });
  pending.catch(() => {});
  const task = await pending.waitForTaskOutput({ timeout: 12 * 60 * 1000 });
  if (!task.output?.[0]) throw new Error("Runway leverde geen audio-URL");
  const response = await fetch(task.output[0], { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Audio-download gaf HTTP ${response.status}`);
  await writeFile(voicePath, Buffer.from(await response.arrayBuffer()));
  taskId = task.id;
}

const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", voicePath]);
const duration = Number(stdout.trim());
const timestamp = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
const narrationWords = locales[language].narration.trim().split(/\s+/u);
const segments = [];
let segment = [];
for (const word of narrationWords) {
  const candidate = [...segment, word].join(" ");
  if (segment.length && (candidate.length > 68 || segment.length >= 10)) {
    segments.push(segment.join(" "));
    segment = [word];
  } else segment.push(word);
  if (segment.length >= 5 && /[.!?؟;:]$/u.test(word)) {
    segments.push(segment.join(" "));
    segment = [];
  }
}
if (segment.length) segments.push(segment.join(" "));
const captionLines = (text) => {
  if (text.length <= 42) return text;
  const parts = text.split(/\s+/u);
  let best = null;
  for (let index = 1; index < parts.length; index++) {
    const left = parts.slice(0, index).join(" ");
    const right = parts.slice(index).join(" ");
    if (left.length <= 42 && right.length <= 42) {
      const score = Math.abs(left.length - right.length);
      if (!best || score < best.score) best = { left, right, score };
    }
  }
  return best ? `${best.left}\n${best.right}` : text;
};
const totalWords = segments.reduce((sum, text) => sum + text.trim().split(/\s+/u).length, 0);
let cursor = 0;
const cues = segments.map((text, index) => {
  const words = text.trim().split(/\s+/u).length;
  const start = cursor;
  const end = index === segments.length - 1 ? duration : cursor + duration * words / totalWords;
  cursor = end;
  return `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${captionLines(text.trim())}\n`;
});
await writeFile(vttPath, `WEBVTT\n\n${cues.join("\n")}`, "utf8");

await exec("ffmpeg", [
  "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", source, "-i", voicePath,
  "-t", String(duration + 0.35), "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
  "-metadata:s:a:0", `language=${locales[language].metadataLanguage}`, "-movflags", "+faststart", output,
]);

await writeFile(`${output}.json`, JSON.stringify({
  schemaVersion: 1,
  language,
  languageLabel: locales[language].label,
  voiceProvider: "runway",
  voiceModel: "eleven_multilingual_v2",
  voicePreset: "Serene",
  voiceIdentity: "fysiplan-serene-v1",
  narration: locales[language].narration,
  durationSeconds: duration,
  taskId,
  sourceVideo: source,
  webVtt: vttPath,
}, null, 2) + "\n");

console.log(JSON.stringify({ complete: true, language, voiceIdentity: "fysiplan-serene-v1", durationSeconds: duration, output, webVtt: vttPath }, null, 2));
