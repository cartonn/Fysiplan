import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const publicDir = join(process.cwd(), "public");

// versie-info voor /health: welke commit draait er en hoeveel oefeningen levert de server
let buildInfo = {};
try { buildInfo = JSON.parse(await readFile(join(process.cwd(), "dist", "build-info.json"), "utf8")); } catch {}
let oefeningenCount = null;
try { oefeningenCount = JSON.parse(await readFile(join(publicDir, "oefeningen.json"), "utf8")).length; } catch {}

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

const server = createServer(async (request, response) => {
  if (request.url === "/health") {
    await send(response, 200, "application/json; charset=utf-8", JSON.stringify({
      ok: true,
      service: "Fysiplan",
      commit: buildInfo.commit || "onbekend",
      builtAt: buildInfo.builtAt || null,
      oefeningen: oefeningenCount
    }));
    return;
  }

  let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = normalize(join(publicDir, urlPath));
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) {
    await send(response, 403, "text/plain; charset=utf-8", "Forbidden");
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
  console.log(`Fysiplan listening on ${host}:${port}`);
});
