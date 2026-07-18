import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("content/video-productie-215.json", root), "utf8"));
const args = process.argv.slice(2);

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? "" : String(args[index + 1] || "");
}

const sourceDir = valueAfter("--dir");
const baseUrl = valueAfter("--base-url").replace(/\/$/, "");
const confirmUpload = args.includes("--confirm-upload");
const adminKey = process.env.FYSIPLAN_ADMIN_KEY;

if (!sourceDir) throw new Error("Gebruik --dir <map-met-gerenderde-video's>.");
if (!baseUrl || !/^https?:\/\/[^/]+(?::\d+)?$/.test(baseUrl)) throw new Error("Gebruik --base-url https://jouwdomein.nl zonder pad.");
if (confirmUpload && !adminKey) throw new Error("FYSIPLAN_ADMIN_KEY is vereist voor --confirm-upload.");

const approved = manifest.exercises.filter((entry) => {
  const review = entry.approvals?.finalVideo;
  return review?.status === "approved"
    && new Set(review.approvedBy || []).size >= 2
    && /^\d{4}-\d{2}-\d{2}$/.test(review.approvedAt || "");
});

const ready = [];
for (const entry of approved) {
  let found = "";
  for (const extension of [".mp4", ".webm"]) {
    const candidate = resolve(sourceDir, entry.exerciseId + extension);
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        found = candidate;
        break;
      }
    } catch {}
  }
  if (!found) {
    console.error(`overslaan: ${entry.exerciseId} — geen MP4/WebM voor ${entry.sourceName}`);
    continue;
  }
  const size = (await stat(found)).size;
  if (size < 10 * 1024 || size > 200 * 1024 * 1024) throw new Error(`${entry.sourceName}: bestandsgrootte ${size} is niet toegestaan`);
  ready.push({ entry, file: found, size });
}

if (!confirmUpload) {
  console.log(`Droge controle: ${ready.length} video('s) met dubbele klinische goedkeuring klaar voor upload.`);
  console.log("Er is niets geüpload. Voeg --confirm-upload en FYSIPLAN_ADMIN_KEY toe na controle van de lijst.");
  for (const item of ready) console.log(`${item.entry.exerciseId}\t${item.entry.sourceName}\t${(item.size / 1024 / 1024).toFixed(1)} MB`);
  process.exit(0);
}

if (!ready.length) throw new Error("Geen dubbel goedgekeurde video's gevonden; upload is bewust gestopt.");

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { fout: text.slice(0, 300) }; }
  if (!response.ok || body.ok === false) throw new Error(`${response.status}: ${body.fout || "onbekende API-fout"}`);
  return body;
}

for (const [index, item] of ready.entries()) {
  const extension = extname(item.file).toLowerCase();
  const mime = extension === ".webm" ? "video/webm" : "video/mp4";
  const bytes = await readFile(item.file);
  const headers = { "x-admin-sleutel": adminKey };
  const start = await jsonRequest(`${baseUrl}/api/oefeningen/video/upload/start`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ exerciseId: item.entry.exerciseId, bestandsnaam: `${item.entry.exerciseId}${extension}` }),
  });
  if (Number(start.maxBytes || 0) && item.size > Number(start.maxBytes)) {
    throw new Error(`${item.entry.sourceName}: ${(item.size / 1024 / 1024).toFixed(1)} MB is groter dan de providerlimiet van ${(start.maxBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  if (start.provider === "cloudflare-stream") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `${item.entry.exerciseId}${extension}`);
    const upload = await fetch(start.uploadURL, { method: "POST", body: form });
    if (!upload.ok) throw new Error(`${item.entry.sourceName}: Cloudflare-upload gaf ${upload.status}`);
    await jsonRequest(`${baseUrl}/api/oefeningen/video/upload/complete`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ exerciseId: item.entry.exerciseId, uid: start.uid }),
    });
  } else if (start.provider === "railway-volume") {
    await jsonRequest(new URL(start.uploadURL, baseUrl).href, {
      method: "POST",
      headers: { ...headers, "content-type": mime, "content-length": String(bytes.length) },
      body: bytes,
    });
  } else {
    throw new Error(`${item.entry.sourceName}: onbekende uploadprovider ${start.provider}`);
  }
  console.log(`${index + 1}/${ready.length} gekoppeld: ${item.entry.exerciseId} — ${item.entry.sourceName}`);
}
