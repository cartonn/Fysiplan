import { readFile } from "node:fs/promises";
import { exerciseId } from "../lib/exercise-id.js";
import { STREAM_IFRAME_RE } from "../lib/video-catalog.js";

const root = new URL("../", import.meta.url);
const oefeningen = JSON.parse(await readFile(new URL("public/oefeningen-v2.json", root), "utf8"));
const catalogus = JSON.parse(await readFile(new URL("content/video-catalogus.json", root), "utf8"));
const ids = new Map(oefeningen.map((o) => [exerciseId(o), o.naam]));
const gezien = new Set();
const fouten = [];

if (process.argv.includes("--export-csv")) {
  const perId = new Map((catalogus.videos || []).map((v) => [v.exerciseId, v]));
  const csv = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  console.log(["exerciseId", "oefening", "categorie", "status", "talen", "versie"].map(csv).join(","));
  for (const o of oefeningen) {
    const id = exerciseId(o);
    const v = perId.get(id) || {};
    console.log([id, o.naam, o.groep, v.status || "todo", (v.languages || []).join("|"), v.version || ""].map(csv).join(","));
  }
  process.exit(0);
}

if (catalogus.schemaVersion !== 1) fouten.push("schemaVersion moet 1 zijn");
if (!Array.isArray(catalogus.videos)) fouten.push("videos moet een lijst zijn");
if (ids.size !== oefeningen.length) fouten.push("oefeningenbibliotheek bevat dubbele stabiele exerciseId's");

for (const [i, video] of (Array.isArray(catalogus.videos) ? catalogus.videos : []).entries()) {
  const waar = `videos[${i}]`;
  if (!ids.has(video.exerciseId)) fouten.push(`${waar}: onbekende exerciseId ${video.exerciseId || "(leeg)"}`);
  if (gezien.has(video.exerciseId)) fouten.push(`${waar}: exerciseId staat dubbel in de catalogus`);
  gezien.add(video.exerciseId);
  if (!['draft', 'review', 'approved', 'retired'].includes(video.status)) fouten.push(`${waar}: ongeldige status`);
  if (video.status === "approved") {
    if (video.provider !== "cloudflare-stream") fouten.push(`${waar}: approved video moet provider cloudflare-stream gebruiken`);
    if (!STREAM_IFRAME_RE.test(String(video.iframe || ""))) fouten.push(`${waar}: ongeldige Cloudflare Stream iframe-URL`);
    if (!Number.isInteger(video.version) || video.version < 1) fouten.push(`${waar}: version moet een positief geheel getal zijn`);
    if (!Array.isArray(video.languages) || !video.languages.includes("nl")) fouten.push(`${waar}: languages moet minstens nl bevatten`);
    if (!video.clinicalReview || !String(video.clinicalReview.reviewer || "").trim()) fouten.push(`${waar}: klinische reviewer ontbreekt`);
    if (!video.clinicalReview || !/^\d{4}-\d{2}-\d{2}$/.test(String(video.clinicalReview.approvedAt || ""))) fouten.push(`${waar}: approvedAt moet YYYY-MM-DD zijn`);
  }
}

if (fouten.length) {
  console.error("Videocatalogus ongeldig:\n- " + fouten.join("\n- "));
  process.exitCode = 1;
} else {
  const approved = (catalogus.videos || []).filter((v) => v.status === "approved").length;
  console.log(`Videocatalogus geldig: ${approved}/${oefeningen.length} oefeningen hebben een goedgekeurde video.`);
}
