import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, access, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join, extname, normalize, sep } from "node:path";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const publicDir = join(process.cwd(), "public");

// Beheer: /admin88 toont de beheer-weergave; mutatie-API's eisen deze sleutel als header.
// Let op: dit is afscherming-door-verhulling, geen echte authenticatie.
const ADMIN_KEY = process.env.ADMIN_KEY || "admin88";
const isAdmin = (req) => req.headers["x-admin-sleutel"] === ADMIN_KEY;

// versie-info voor /health: welke commit draait er en hoeveel oefeningen levert de server
let buildInfo = {};
try { buildInfo = JSON.parse(await readFile(join(process.cwd(), "dist", "build-info.json"), "utf8")); } catch {}

// Opslag voor beheer-wijzigingen. Op Railway is de containerschijf vluchtig: koppel
// een Volume met mount path /data, dan blijven wijzigingen ook na een redeploy
// bewaard (wordt automatisch gebruikt). Anders: DATA_DIR, of lokaal ./data.
async function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { await access("/data", constants.W_OK); return "/data"; } catch {}
  return join(process.cwd(), "data");
}
const dataDir = await resolveDataDir();
const uploadsDir = join(dataDir, "uploads");
const renamesPath = join(dataDir, "naam-wijzigingen.json");
const praktijkenPath = join(dataDir, "praktijken.json");
const extraPath = join(dataDir, "oefeningen-extra.json");
const deletedPath = join(dataDir, "oefeningen-verwijderd.json");

// renames: sleutel = oorspronkelijke naam uit oefeningen.json, waarde = huidige naam
let renames = {};
try { renames = JSON.parse(await readFile(renamesPath, "utf8")); } catch {}
// praktijkprofielen (naam + adresblok), gedeeld over alle apparaten
let praktijken = {};
try { praktijken = JSON.parse(await readFile(praktijkenPath, "utf8")); } catch {}
// door de beheerder toegevoegde oefeningen: [{naam, groep, img}]
let extra = [];
try { extra = JSON.parse(await readFile(extraPath, "utf8")); } catch {}
// door de beheerder verwijderde oefeningen (oorspronkelijke namen uit oefeningen.json)
let deleted = [];
try { deleted = JSON.parse(await readFile(deletedPath, "utf8")); } catch {}
// categorie-wijzigingen: sleutel = oorspronkelijke naam, waarde = {groep, ook}
const catsPath = join(dataDir, "categorie-wijzigingen.json");
let catOverrides = {};
try { catOverrides = JSON.parse(await readFile(catsPath, "utf8")); } catch {}

async function saveJson(path, obj) {
  await mkdir(dataDir, { recursive: true });
  const tmp = path + ".tmp";
  await writeFile(tmp, JSON.stringify(obj, null, 2));
  await rename(tmp, path);
}

const CATS = ["Bovenste extremiteit", "Onderste extremiteit", "Core", "Cardio", "Bosu", "TRX",
  "Yoga", "Kettlebell", "Bodyblade", "Foam roller", "Speedladder", "Apparaten"];
const catOrder = (g) => { const i = CATS.indexOf(g); return i < 0 ? 999 : i; };

async function readBaseManifest() {
  return JSON.parse(await readFile(join(publicDir, "oefeningen.json"), "utf8"));
}
// het geserveerde manifest = basis + naam-/categoriewijzigingen − verwijderd + toegevoegd
async function buildManifest() {
  const del = new Set(deleted);
  const base = (await readBaseManifest())
    .filter((e) => !del.has(e.naam))
    .map((e) => {
      const o = { ...e };
      const c = catOverrides[e.naam];
      if (c) {
        o.groep = c.groep;
        if (c.ook && c.ook.length) o.ook = c.ook; else delete o.ook;
      }
      if (renames[e.naam]) o.naam = renames[e.naam];
      return o;
    });
  return base.concat(extra)
    .sort((a, b) => catOrder(a.groep) - catOrder(b.groep) || a.naam.localeCompare(b.naam, "nl"));
}
const currentNames = (manifest) => manifest.map((e) => e.naam.toLowerCase());

function slug(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}
const cleanName = (v, max) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max);

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
const denied = (res) => sendJson(res, 403, { ok: false, fout: "Alleen beschikbaar voor beheer." });

const server = createServer(async (request, response) => {
  let urlPath = decodeURIComponent((request.url || "/").split("?")[0]);

  // beheer-URL zonder slash, zodat relatieve paden (images/, api/) blijven kloppen
  if (urlPath === "/admin88/") { response.writeHead(301, { location: "/admin88" }); response.end(); return; }

  if (urlPath === "/health") {
    let count = null;
    try { count = (await buildManifest()).length; } catch {}
    await sendJson(response, 200, {
      ok: true,
      service: "Fysiplan",
      commit: buildInfo.commit || "onbekend",
      builtAt: buildInfo.builtAt || null,
      oefeningen: count,
      hernoemd: Object.keys(renames).length,
      toegevoegd: extra.length,
      verwijderd: deleted.length,
      verplaatst: Object.keys(catOverrides).length
    });
    return;
  }

  // ---- beheer-API's (alleen met admin-sleutel) ----

  // oefeningnaam wijzigen; geldt daarna voor iedereen op beide URL's
  if (urlPath === "/api/hernoem" && request.method === "POST") {
    if (!isAdmin(request)) { await denied(response); return; }
    try {
      const { van, naar } = JSON.parse(await readBody(request));
      const nieuw = cleanName(naar, 80);
      const oud = String(van || "").trim();
      if (!oud || !nieuw) { await sendJson(response, 400, { ok: false, fout: "Geef de huidige en de nieuwe naam op." }); return; }
      const manifest = await buildManifest();
      if (manifest.some((e) => e.naam.toLowerCase() === nieuw.toLowerCase() && e.naam.toLowerCase() !== oud.toLowerCase())) {
        await sendJson(response, 409, { ok: false, fout: "Er bestaat al een oefening met de naam “" + nieuw + "”." }); return;
      }
      const ex = extra.find((e) => e.naam === oud);
      if (ex) { ex.naam = nieuw; await saveJson(extraPath, extra); await sendJson(response, 200, { ok: true, naam: nieuw }); return; }
      const base = await readBaseManifest();
      const orig = base.find((e) => (renames[e.naam] || e.naam) === oud && !deleted.includes(e.naam));
      if (!orig) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden: " + oud }); return; }
      if (nieuw === orig.naam) delete renames[orig.naam];
      else renames[orig.naam] = nieuw;
      await saveJson(renamesPath, renames);
      await sendJson(response, 200, { ok: true, naam: nieuw });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // oefening toevoegen (naam + categorie + plaatje); direct live op beide URL's
  if (urlPath === "/api/oefeningen" && request.method === "POST") {
    if (!isAdmin(request)) { await denied(response); return; }
    try {
      const b = JSON.parse(await readBody(request, 4 * 1024 * 1024));
      const naam = cleanName(b.naam, 80);
      const groep = cleanName(b.groep, 40);
      if (!naam || !groep) { await sendJson(response, 400, { ok: false, fout: "Geef een naam en een categorie op." }); return; }
      const manifest = await buildManifest();
      if (currentNames(manifest).includes(naam.toLowerCase())) { await sendJson(response, 409, { ok: false, fout: "Er bestaat al een oefening met de naam “" + naam + "”." }); return; }
      const m = String(b.img || "").match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) { await sendJson(response, 400, { ok: false, fout: "Voeg een plaatje toe (JPEG of PNG)." }); return; }
      const buf = Buffer.from(m[2], "base64");
      if (buf.length < 100 || buf.length > 2.5 * 1024 * 1024) { await sendJson(response, 400, { ok: false, fout: "Plaatje is te groot (max. 2,5 MB)." }); return; }
      await mkdir(uploadsDir, { recursive: true });
      const file = `${slug(naam)}-${Date.now()}.${m[1] === "png" ? "png" : "jpg"}`;
      await writeFile(join(uploadsDir, file), buf);
      extra.push({ naam, groep, img: "uploads/" + file });
      await saveJson(extraPath, extra);
      await sendJson(response, 200, { ok: true, naam });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek (of plaatje te groot)." });
    }
    return;
  }

  // categorie wijzigen (verplaatsen en/of 2e categorie); direct live op beide URL's
  if (urlPath === "/api/oefeningen/categorie" && request.method === "POST") {
    if (!isAdmin(request)) { await denied(response); return; }
    try {
      const b = JSON.parse(await readBody(request));
      const naam = String(b.naam || "").trim();
      const g = cleanName(b.groep, 40);
      const ookList = Array.isArray(b.ook)
        ? [...new Set(b.ook.map((v) => cleanName(v, 40)).filter((v) => v && v !== g))].slice(0, 3)
        : [];
      if (!naam || !g) { await sendJson(response, 400, { ok: false, fout: "Geef een naam en categorie op." }); return; }
      if (!CATS.includes(g) || ookList.some((v) => !CATS.includes(v))) { await sendJson(response, 400, { ok: false, fout: "Onbekende categorie." }); return; }
      const ex = extra.find((e) => e.naam === naam);
      if (ex) {
        ex.groep = g;
        if (ookList.length) ex.ook = ookList; else delete ex.ook;
        await saveJson(extraPath, extra);
        await sendJson(response, 200, { ok: true }); return;
      }
      const base = await readBaseManifest();
      const orig = base.find((e) => (renames[e.naam] || e.naam) === naam && !deleted.includes(e.naam));
      if (!orig) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden: " + naam }); return; }
      const origOok = (orig.ook || []).slice().sort().join("|");
      if (g === orig.groep && ookList.slice().sort().join("|") === origOok) delete catOverrides[orig.naam];
      else catOverrides[orig.naam] = { groep: g, ook: ookList };
      await saveJson(catsPath, catOverrides);
      await sendJson(response, 200, { ok: true });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // oefening verwijderen; direct weg op beide URL's
  if (urlPath === "/api/oefeningen/verwijder" && request.method === "POST") {
    if (!isAdmin(request)) { await denied(response); return; }
    try {
      const naam = String(JSON.parse(await readBody(request)).naam || "").trim();
      const i = extra.findIndex((e) => e.naam === naam);
      if (i > -1) {
        const [gone] = extra.splice(i, 1);
        await saveJson(extraPath, extra);
        if (gone.img.startsWith("uploads/")) { try { await unlink(join(dataDir, gone.img)); } catch {} }
        await sendJson(response, 200, { ok: true }); return;
      }
      const base = await readBaseManifest();
      const orig = base.find((e) => (renames[e.naam] || e.naam) === naam && !deleted.includes(e.naam));
      if (!orig) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden: " + naam }); return; }
      deleted.push(orig.naam);
      delete renames[orig.naam];
      await saveJson(deletedPath, deleted);
      await saveJson(renamesPath, renames);
      await sendJson(response, 200, { ok: true });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // ---- gedeelde API's ----

  // praktijkprofielen: ophalen en opslaan/bijwerken (gedeeld over alle apparaten)
  if (urlPath === "/api/praktijken" && request.method === "GET") {
    const list = Object.values(praktijken).sort((a, b) => a.praktijk.localeCompare(b.praktijk, "nl"));
    await sendJson(response, 200, list);
    return;
  }
  if (urlPath === "/api/praktijken" && request.method === "POST") {
    try {
      const b = JSON.parse(await readBody(request));
      const p = {
        praktijk: cleanName(b.praktijk, 80),
        adres: cleanName(b.adres, 120),
        plaats: cleanName(b.plaats, 120),
        tel: cleanName(b.tel, 40),
        email: cleanName(b.email, 120)
      };
      if (!p.praktijk || !p.adres) { await sendJson(response, 400, { ok: false, fout: "Vul minimaal praktijknaam en adres in." }); return; }
      const key = p.praktijk.toLowerCase();
      if (!praktijken[key] && Object.keys(praktijken).length >= 200) { await sendJson(response, 400, { ok: false, fout: "Maximum aantal praktijken bereikt." }); return; }
      praktijken[key] = p;
      await saveJson(praktijkenPath, praktijken);
      await sendJson(response, 200, { ok: true });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // door beheer geüploade plaatjes (staan in de datamap, niet in public/)
  if (urlPath.startsWith("/uploads/")) {
    const file = normalize(join(uploadsDir, urlPath.slice("/uploads/".length)));
    if (!file.startsWith(uploadsDir + sep) || ![".jpg", ".png"].includes(extname(file))) {
      await send(response, 403, "text/plain; charset=utf-8", "Forbidden");
      return;
    }
    try { await send(response, 200, MIME[extname(file)], await readFile(file)); }
    catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  const filePath = normalize(join(publicDir, urlPath));
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) {
    await send(response, 403, "text/plain; charset=utf-8", "Forbidden");
    return;
  }

  // het manifest wordt geserveerd mét beheer-wijzigingen (hernoemd/toegevoegd/verwijderd)
  if (urlPath === "/oefeningen.json") {
    try { await sendJson(response, 200, await buildManifest()); }
    catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
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
