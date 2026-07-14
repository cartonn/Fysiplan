import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, access, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
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

// ---- gebruiksstatistieken (anoniem) + security-log voor het eigenaars-dashboard ----
const statsPath = join(dataDir, "statistieken.json");
let stats = { dagen: {}, security: { geweigerd: 0, laatste: [] } };
try { stats = { ...stats, ...JSON.parse(await readFile(statsPath, "utf8")) }; } catch {}
const startTijd = Date.now();
let statsTimer = null;
function bewaarStats() { // gebundeld wegschrijven, max 1x per 2s
  if (statsTimer) return;
  statsTimer = setTimeout(() => { statsTimer = null; saveJson(statsPath, stats).catch(() => {}); }, 2000);
}
const vandaagKey = () => new Date().toISOString().slice(0, 10);
function dagStats(d) {
  if (!stats.dagen[d]) stats.dagen[d] = { bezoek: 0, admin: 0, uniek: [], print: 0, kaartOpgeslagen: 0, kaartVerwijderd: 0 };
  return stats.dagen[d];
}
function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "?";
}
function telBezoek(req, isAdminPagina) {
  const d = dagStats(vandaagKey());
  if (isAdminPagina) d.admin++; else d.bezoek++;
  // unieke bezoekers: dag-gebonden hash van IP+browser — geen herleidbare gegevens opgeslagen
  const h = createHash("sha256").update(clientIp(req) + "|" + (req.headers["user-agent"] || "") + "|" + vandaagKey()).digest("hex").slice(0, 12);
  if (!d.uniek.includes(h) && d.uniek.length < 5000) d.uniek.push(h);
  bewaarStats();
}
function maskIp(ip) {
  if (ip.includes(".")) { const p = ip.split("."); return p[0] + "." + p[1] + ".x.x"; }
  return ip.split(":").slice(0, 3).join(":") + ":…";
}
function logGeweigerd(req, pad) {
  stats.security.geweigerd++;
  stats.security.laatste.unshift({ t: new Date().toISOString(), ip: maskIp(clientIp(req)), pad });
  stats.security.laatste = stats.security.laatste.slice(0, 20);
  bewaarStats();
}

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
    .sort((a, b) => catOrder(a.groep) - catOrder(b.groep)
      || a.groep.localeCompare(b.groep, "nl")
      || a.naam.localeCompare(b.naam, "nl"));
}
// alle categorieën die nu bestaan (vaste volgorde + door beheer aangemaakte)
async function knownCategories() {
  const manifest = await buildManifest();
  return [...new Set([...CATS, ...manifest.map((e) => e.groep), ...manifest.flatMap((e) => e.ook || [])])];
}
// hergebruik een bestaande categorie bij ander hoofdlettergebruik; anders is het een nieuwe
const canonCategory = (list, g) => list.find((c) => c.toLowerCase() === g.toLowerCase()) || g;
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

// Pagina's en data nooit lokaal bewaren: zo kan ook een eerder bezochte pagina niet
// na een deploy uit een browser- of proxycache terugkomen. Afbeeldingen en fonts zijn
// onveranderlijke assets (uploads krijgen een unieke bestandsnaam) en mogen één dag
// gecachet worden.
function cacheHeaders(type) {
  if (type.startsWith("image/") || type.startsWith("font/")) {
    return { "cache-control": "public, max-age=86400" };
  }
  return {
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    expires: "0"
  };
}
async function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, ...cacheHeaders(type) });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));
const denied = (req, res, pad) => { logGeweigerd(req, pad); return sendJson(res, 403, { ok: false, fout: "Alleen beschikbaar voor beheer." }); };

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
    if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
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
    if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
    try {
      const b = JSON.parse(await readBody(request, 4 * 1024 * 1024));
      const naam = cleanName(b.naam, 80);
      let groep = cleanName(b.groep, 40);
      if (!naam || !groep) { await sendJson(response, 400, { ok: false, fout: "Geef een naam en een categorie op." }); return; }
      // bestaande categorie hergebruiken (juiste spelling); bestaat hij niet, dan wordt hij aangemaakt
      groep = canonCategory(await knownCategories(), groep);
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
    if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
    try {
      const b = JSON.parse(await readBody(request));
      const naam = String(b.naam || "").trim();
      const cats = await knownCategories();
      const g = canonCategory(cats, cleanName(b.groep, 40));
      const ookList = Array.isArray(b.ook)
        ? [...new Set(b.ook.map((v) => canonCategory(cats, cleanName(v, 40))).filter((v) => v && v !== g))].slice(0, 3)
        : [];
      if (!naam || !g) { await sendJson(response, 400, { ok: false, fout: "Geef een naam en categorie op." }); return; }
      if (!cats.includes(g) || ookList.some((v) => !cats.includes(v))) { await sendJson(response, 400, { ok: false, fout: "Onbekende categorie." }); return; }
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
    if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
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

  // gebruiks-ping vanuit de app (anoniem, alleen tellers)
  if (urlPath === "/api/stats/event" && request.method === "POST") {
    try {
      const type = String(JSON.parse(await readBody(request)).type || "");
      const d = dagStats(vandaagKey());
      if (type === "print") d.print++;
      else if (type === "kaart-opgeslagen") d.kaartOpgeslagen++;
      else if (type === "kaart-verwijderd") d.kaartVerwijderd++;
      else { await sendJson(response, 400, { ok: false }); return; }
      bewaarStats();
      await sendJson(response, 200, { ok: true });
    } catch { await sendJson(response, 400, { ok: false }); }
    return;
  }

  // eigenaars-dashboard: samengevatte gebruiks-, bibliotheek- en security-gegevens
  if (urlPath === "/api/dashboard" && request.method === "GET") {
    if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
    const dagen = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const d = stats.dagen[dt] || {};
      dagen.push({ datum: dt, bezoek: d.bezoek || 0, admin: d.admin || 0, uniek: (d.uniek || []).length,
        print: d.print || 0, kaartOpgeslagen: d.kaartOpgeslagen || 0, kaartVerwijderd: d.kaartVerwijderd || 0 });
    }
    const alle = Object.values(stats.dagen);
    const som = (k) => alle.reduce((s, d) => s + (d[k] || 0), 0);
    let count = null, cats = 0;
    try { const m = await buildManifest(); count = m.length; cats = new Set(m.map((e) => e.groep)).size; } catch {}
    const eerste = Object.keys(stats.dagen).sort()[0] || vandaagKey();
    await sendJson(response, 200, {
      ok: true,
      meetSinds: eerste,
      dagen,
      totalen: { bezoek: som("bezoek"), admin: som("admin"), print: som("print"),
        kaartOpgeslagen: som("kaartOpgeslagen"), kaartVerwijderd: som("kaartVerwijderd") },
      bibliotheek: { oefeningen: count, categorieen: cats, hernoemd: Object.keys(renames).length,
        toegevoegd: extra.length, verwijderd: deleted.length, verplaatst: Object.keys(catOverrides).length,
        praktijken: Object.keys(praktijken).length },
      security: { geweigerd: stats.security.geweigerd, laatste: stats.security.laatste.slice(0, 10),
        adminSleutelAangepast: !!process.env.ADMIN_KEY, volumeActief: dataDir === "/data" || !!process.env.DATA_DIR },
      versie: { commit: buildInfo.commit || "onbekend", builtAt: buildInfo.builtAt || null,
        uptimeUren: Math.round((Date.now() - startTijd) / 360000) / 10 }
    });
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

  // eigenaars-dashboard (aparte, onopvallende URL; de data-API eist de beheer-sleutel)
  if (urlPath === "/dashboard88" || urlPath === "/dashboard88/") {
    try { await send(response, 200, "text/html; charset=utf-8", await readFile(join(publicDir, "dashboard.html"))); }
    catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
    return;
  }

  if (urlPath === "/") { telBezoek(request, false); urlPath = "/index.html"; }
  else if (urlPath === "/admin88") telBezoek(request, true);

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
