import RunwayML, { toFile } from "@runwayml/sdk";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const source = resolve(process.argv[2] || "");
const avatar = resolve(process.argv[3] || "");
const output = resolve(process.argv[4] || "");
const execute = process.argv.includes("--execute");
if (!source || !avatar || !output) {
  throw new Error("Gebruik: node runway-motion-transfer-pilot.mjs <motion.mp4> <avatar.png> <output.mp4> --execute");
}
if (!execute) throw new Error("Droge stand: voeg --execute toe voor precies één betaalde Runway-aanvraag.");
if (!process.env.RUNWAYML_API_SECRET) throw new Error("RUNWAYML_API_SECRET ontbreekt");
try {
  if ((await stat(output)).size > 10_000) {
    console.log(JSON.stringify({ complete: true, cached: true, output }));
    process.exit(0);
  }
} catch {}

const client = new RunwayML();
const organization = await client.organization.retrieve();
// 6,1 seconden × 11 credits + één beeldreferentie; afronden naar boven met marge.
const requiredCredits = 70;
if (Number(organization.creditBalance) < requiredCredits) {
  throw new Error(`Onvoldoende bestaand tegoed: minimaal ${requiredCredits} credits vereist; er wordt niets bijgekocht.`);
}

const [motionBytes, avatarBytes] = await Promise.all([readFile(source), readFile(avatar)]);
const [motionUpload, avatarUpload] = await Promise.all([
  client.uploads.createEphemeral({ file: await toFile(motionBytes, "anteflexie-motion-master.mp4", { type: "video/mp4" }) }),
  client.uploads.createEphemeral({ file: await toFile(avatarBytes, "fysiplan-avatar-light-grey.png", { type: "image/png" }) }),
]);

const promptText = [
  "Preserve the input video's exact camera, duration, timing and human joint trajectory frame by frame.",
  "The exercise is bilateral shoulder flexion: both nearly straight arms travel forward in front of the shoulders to shoulder height and return; never move sideways and never perform a lateral raise.",
  "Replace only the demonstrator's appearance with the same adult female physiotherapist from the reference image, including her natural face, tied-back hair, light-grey T-shirt, charcoal trousers and white trainers.",
  "Use a clean pure-white physiotherapy studio. Keep the dumbbells, full body, hands and feet visible. No text, logo, cuts, camera movement, extra people or changed equipment.",
].join(" ").slice(0, 1000);

const pending = client.videoToVideo.create({
  model: "gemini_omni_flash",
  videoUri: motionUpload.uri,
  references: [{ uri: avatarUpload.uri }],
  promptText,
});
pending.catch(() => {});
const task = await pending.waitForTaskOutput({ timeout: 12 * 60 * 1000 });
if (!task.output?.[0]) throw new Error("Runway leverde geen video-URL");
const response = await fetch(task.output[0], { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`Download gaf HTTP ${response.status}`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.from(await response.arrayBuffer()));
await writeFile(`${output}.json`, JSON.stringify({
  schemaVersion: 1,
  taskId: task.id,
  model: "gemini_omni_flash",
  sourceMotion: source.replace(root, ""),
  avatarReference: avatar.replace(root, ""),
  requiredCredits,
  reviewStatus: "awaiting-visual-review",
}, null, 2) + "\n");
console.log(JSON.stringify({ complete: true, cached: false, taskId: task.id, output }, null, 2));
