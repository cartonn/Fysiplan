import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, extname, normalize, sep } from "node:path";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const publicDir = join(process.cwd(), "public");

// versie-info voor /health: welke commit draait er en hoeveel oefeningen levert de server
let buildInfo = {};
try { buildInfo = JSON.parse(await readFile(join(process.cwd(), "dist", "build-info.json"), "utf8")); } catch {}

// Opslag voor naamwijzigingen. Op Railway is de containerschijf vluchtig: koppel
// een Volume met mount path /data, dan blijven wijzigingen ook na een redeploy
// bewaard (wordt automatisch gebruikt). Anders: DATA_DIR, of lokaal ./data.
async function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { await access("/data", constants.W_OK); return "/data"; } catch {}
  return join(process.cwd(), "data");
}
const dataDir = await resolveDataDir();
const renamesPath = join(dataDir, "naam-wijzigingen.json");
// sleutel = oorspronkelijke naam uit oefeningen.json, waarde = huidige naam
let renames = {};
try { renames = JSON.parse(await readFile(renamesPath, "utf8")); } catch {}

async function saveRenames() {
  await mkdir(dataDir, { recursive: true });
  const tmp = renamesPath + ".tmp";
  await writeFile(tmp, JSON.stringify(renames, null, 2));
  await rename(tmp, renamesPath);
}

async function readManifest() {
  return JSON.parse(await readFile(join(publicDir, "oefeningen.json"), "utf8"));
}
function applyRenames(entries) {
  return entries.map((e) => (renames[e.naam] ? { ...e, naam: renames[e.naam] } : e));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body te groot")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

async function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));

const server = createServer(async (request, response) => {
  let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);

  if (urlPath === "/health") {
    let count = null;
    try { count = (await readManifest()).length; } catch {}
    await sendJson(response, 200, {
      ok: true,
      service: "Fysiplan",
      commit: buildInfo.commit || "onbekend",
      builtAt: buildInfo.builtAt || null,
      oefeningen: count,
      hernoemd: Object.keys(renames).length
    });
    return;
  }

  // oefeningnaam wijzigen; de wijziging geldt daarna voor iedereen
  if (urlPath === "/api/hernoem" && request.method === "POST") {
    try {
      const { van, naar } = JSON.parse(await readBody(request));
      const nieuw = String(naar || "").trim().replace(/\s+/g, " ");
      const oud = String(van || "").trim();
      if (!oud || !nieuw) { await sendJson(response, 400, { ok: false, fout: "Geef de huidige en de nieuwe naam op." }); return; }
      if (nieuw.length > 80) { await sendJson(response, 400, { ok: false, fout: "Naam is te lang (max. 80 tekens)." }); return; }
      const entries = await readManifest();
      // zoek de oorspronkelijke sleutel: 'van' is de huidige (mogelijk al hernoemde) naam
      const orig = entries.find((e) => (renames[e.naam] || e.naam) === oud);
      if (!orig) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden: " + oud }); return; }
      const clash = entries.some((e) => e.naam !== orig.naam && (renames[e.naam] || e.naam).toLowerCase() === nieuw.toLowerCase());
      if (clash) { await sendJson(response, 409, { ok: false, fout: "Er bestaat al een oefening met de naam “" + nieuw + "”." }); return; }
      if (nieuw === orig.naam) delete renames[orig.naam]; // terug naar de oorspronkelijke naam
      else renames[orig.naam] = nieuw;
      await saveRenames();
      await sendJson(response, 200, { ok: true, naam: nieuw });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  const filePath = normalize(join(publicDir, urlPath));
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) {
    await send(response, 403, "text/plain; charset=utf-8", "Forbidden");
    return;
  }

  // het manifest wordt geserveerd mét toegepaste naamwijzigingen
  if (urlPath === "/oefeningen.json") {
    try {
      await sendJson(response, 200, applyRenames(await readManifest()));
    } catch {
      await send(response, 404, "text/plain; charset=utf-8", "Not found");
    }
    return;
  }

  try {
    const data = await readFile(filePath);
    await send(response, 200, MIME[extname(filePath)] || "application/octet-stream", data);
  } catch {
    try {
      const index = await readFile(join(publicDir, "index.html"));
      await send(response, 200, "text/html; charset=utf-8", index);
    } catch {
      await send(response, 404, "text/plain; charset=utf-8", "Not found");
    }
  }
});

server.listen(port, host, () => {
  console.log(`Fysiplan listening on ${host}:${port} (data: ${dataDir})`);
});
