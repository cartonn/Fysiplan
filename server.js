import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, access, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
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
const kaartenPath = join(dataDir, "kaarten.json");
const videolinksPath = join(dataDir, "videolinks.json");
const extraPath = join(dataDir, "oefeningen-extra.json");
const deletedPath = join(dataDir, "oefeningen-verwijderd.json");

// renames: sleutel = oorspronkelijke naam uit oefeningen.json, waarde = huidige naam
let renames = {};
try { renames = JSON.parse(await readFile(renamesPath, "utf8")); } catch {}
// praktijkprofielen (naam + adresblok), gedeeld over alle apparaten
let praktijken = {};
try { praktijken = JSON.parse(await readFile(praktijkenPath, "utf8")); } catch {}

// gedeelde kaarten per praktijk: { praktijkKey: { kaartKey: kaart } }; elke kaart heeft
// een onraadbaar id waarmee de digitale kaart achter de QR-code wordt opgehaald
let kaarten = {};
try { kaarten = JSON.parse(await readFile(kaartenPath, "utf8")); } catch {}

// oefenvideo's per oefening (huidige naam als sleutel): YouTube-id en/of eigen opname
let videolinks = {};
try { videolinks = JSON.parse(await readFile(videolinksPath, "utf8")); } catch {}

// lopende video-opnames: de scherm-QR bevat een kortlevend token; de telefoon uploadt
// ermee en het beeldscherm ziet via polling dat de video binnen is
const opnames = new Map();
let lopendeUploads = 0;
function opnameOpschonen() {
  const nu = Date.now();
  for (const [t, o] of opnames) if (nu - o.made > 15 * 60 * 1000) opnames.delete(t);
}
// persoonlijke videobestanden weggooien zodra geen enkele kaart (of oefening) ze nog gebruikt;
// juist bij beelden van cliënten hoort er niets achter te blijven
async function ruimKaartVideosOp(paden) {
  for (const pad of paden) {
    if (!/^uploads\/videos\/v-[a-f0-9]+\.(mp4|webm)$/.test(pad)) continue;
    let inGebruik = Object.values(videolinks).some((v) => v.eigen === pad);
    for (const pk of Object.keys(kaarten)) {
      if (inGebruik) break;
      for (const kk of Object.keys(kaarten[pk])) {
        if (Object.values(kaarten[pk][kk].vids || {}).includes(pad)) { inGebruik = true; break; }
      }
    }
    if (!inGebruik) { try { await unlink(join(dataDir, pad)); } catch {} }
  }
}

// YouTube-id uit een geplakte link (watch/shorts/embed/youtu.be) of een los id
function ytId(u) {
  const s = String(u || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
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

// eenvoudige schrijflimiet per IP voor de open API's (kaarten, opnames, praktijkprofielen):
// normaal praktijkgebruik haalt dit nooit, maar het stopt scripts die de opslag volpompen.
// Venster van 5 minuten, max. 40 schrijfacties per IP; overschrijding wordt gelogd.
const schrijfTeller = new Map();
function schrijfLimiet(req, res) {
  const nu = Date.now();
  if (schrijfTeller.size > 5000) {
    for (const [k, v] of schrijfTeller) if (nu - v.start > 5 * 60 * 1000) schrijfTeller.delete(k);
  }
  const ip = clientIp(req);
  const t = schrijfTeller.get(ip);
  if (!t || nu - t.start > 5 * 60 * 1000) {
    schrijfTeller.set(ip, { start: nu, n: 1 });
    return false;
  }
  if (++t.n > 40) {
    if (t.n === 41) logGeweigerd(req, "limiet");
    sendJson(res, 429, { ok: false, fout: "Even te veel verzoeken achter elkaar; probeer het over een paar minuten opnieuw." });
    return true;
  }
  return false;
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
    .map((e) => (videolinks[e.naam] ? { ...e, video: videolinks[e.naam] } : e))
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
// als readBody, maar levert de ruwe bytes (voor video-uploads)
function readBodyRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body te groot")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
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
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

// Pagina's en data nooit lokaal bewaren: zo kan ook een eerder bezochte pagina niet
// na een deploy uit een browser- of proxycache terugkomen. Afbeeldingen en fonts zijn
// onveranderlijke assets (uploads krijgen een unieke bestandsnaam) en mogen één dag
// gecachet worden.
function cacheHeaders(type) {
  if (type.startsWith("image/") || type.startsWith("font/") || type.startsWith("video/")) {
    return { "cache-control": "public, max-age=86400" };
  }
  return {
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    expires: "0"
  };
}
async function send(res, status, type, body) {
  // nosniff en een sobere referrer-policy op alles: puur verhardend, verandert geen gedrag
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin", ...cacheHeaders(type) });
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
      // eventuele oefenvideo verhuist mee met de nieuwe naam
      const migreerVideo = async () => {
        if (videolinks[oud] && oud !== nieuw) {
          videolinks[nieuw] = videolinks[oud];
          delete videolinks[oud];
          await saveJson(videolinksPath, videolinks);
        }
      };
      const ex = extra.find((e) => e.naam === oud);
      if (ex) { ex.naam = nieuw; await saveJson(extraPath, extra); await migreerVideo(); await sendJson(response, 200, { ok: true, naam: nieuw }); return; }
      const base = await readBaseManifest();
      const orig = base.find((e) => (renames[e.naam] || e.naam) === oud && !deleted.includes(e.naam));
      if (!orig) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden: " + oud }); return; }
      if (nieuw === orig.naam) delete renames[orig.naam];
      else renames[orig.naam] = nieuw;
      await saveJson(renamesPath, renames);
      await migreerVideo();
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
      // bijbehorende oefenvideo (link + eigen opnamebestand) mee opruimen
      if (videolinks[naam]) {
        if (videolinks[naam].eigen) { try { await unlink(join(dataDir, videolinks[naam].eigen)); } catch {} }
        delete videolinks[naam];
        await saveJson(videolinksPath, videolinks);
      }
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
    if (schrijfLimiet(request, response)) return;
    try {
      const b = JSON.parse(await readBody(request, 1024 * 1024));
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
      // praktijklogo: meegestuurd als dataURL, opgeslagen als bestand; zonder nieuw
      // logo blijft het bestaande logo van deze praktijk gewoon staan
      const oud = praktijken[key];
      if (b.logo) {
        const m = String(b.logo).match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
        if (!m) { await sendJson(response, 400, { ok: false, fout: "Logo moet een JPEG of PNG zijn." }); return; }
        const buf = Buffer.from(m[2], "base64");
        if (buf.length < 100 || buf.length > 400 * 1024) { await sendJson(response, 400, { ok: false, fout: "Logo is te groot (max. 400 kB)." }); return; }
        await mkdir(uploadsDir, { recursive: true });
        const file = `logo-${slug(p.praktijk)}-${Date.now()}.${m[1] === "png" ? "png" : "jpg"}`;
        await writeFile(join(uploadsDir, file), buf);
        p.logo = "uploads/" + file;
        if (oud && oud.logo && oud.logo.startsWith("uploads/")) { try { await unlink(join(dataDir, oud.logo)); } catch {} }
      } else if (oud && oud.logo) {
        p.logo = oud.logo;
      }
      praktijken[key] = p;
      await saveJson(praktijkenPath, praktijken);
      await sendJson(response, 200, { ok: true, logo: p.logo || "" });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek (of logo te groot)." });
    }
    return;
  }

  // ---- oefenvideo's: YouTube-link per oefening (beheer) en eigen opnames via scherm-QR ----

  // videolink instellen/wissen en eigen opname wissen (beheer)
  if (urlPath === "/api/oefeningen/video" && request.method === "POST") {
    if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
    try {
      const b = JSON.parse(await readBody(request));
      const naam = String(b.naam || "").trim();
      const manifest = await buildManifest();
      if (!manifest.some((e) => e.naam === naam)) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden: " + naam }); return; }
      const cur = videolinks[naam] || {};
      if (b.eigenWissen && cur.eigen) {
        try { await unlink(join(dataDir, cur.eigen)); } catch {}
        delete cur.eigen;
      }
      if (typeof b.yt === "string") {
        const id = ytId(b.yt);
        if (b.yt.trim() && !id) { await sendJson(response, 400, { ok: false, fout: "Dat is geen geldige YouTube-link." }); return; }
        if (id) cur.yt = id; else delete cur.yt;
      }
      if (cur.yt || cur.eigen) videolinks[naam] = cur; else delete videolinks[naam];
      await saveJson(videolinksPath, videolinks);
      await sendJson(response, 200, { ok: true, video: videolinks[naam] || null });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // opname starten: geeft een kortlevend token terug; de scherm-QR wijst naar /opname/<token>
  if (urlPath === "/api/opname/start" && request.method === "POST") {
    if (schrijfLimiet(request, response)) return;
    try {
      const b = JSON.parse(await readBody(request));
      const doel = b.doel === "oefening" ? "oefening" : "kaart";
      if (doel === "oefening") {
        if (!isAdmin(request)) { await denied(request, response, urlPath); return; }
        const naam = String(b.naam || "").trim();
        const manifest = await buildManifest();
        if (!manifest.some((e) => e.naam === naam)) { await sendJson(response, 404, { ok: false, fout: "Oefening niet gevonden." }); return; }
        b.naam = naam;
      }
      opnameOpschonen();
      if (opnames.size >= 200) { await sendJson(response, 429, { ok: false, fout: "Te veel gelijktijdige opnames; probeer het zo weer." }); return; }
      // kort token: de QR-URL (/o/<token>) moet in een kleine, snel scanbare code passen
      const token = randomBytes(6).toString("hex");
      opnames.set(token, { doel, naam: doel === "oefening" ? b.naam : null, made: Date.now(), video: null });
      await sendJson(response, 200, { ok: true, token });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // het beeldscherm pollt tot de telefoon de video heeft geüpload
  if (urlPath === "/api/opname/status" && request.method === "GET") {
    opnameOpschonen();
    const q = new URLSearchParams((request.url || "").split("?")[1] || "");
    const o = opnames.get(String(q.get("token") || ""));
    if (!o) { await sendJson(response, 404, { ok: false, fout: "Opname verlopen. Sluit dit venster en begin opnieuw." }); return; }
    await sendJson(response, 200, { ok: true, klaar: !!o.video, video: o.video, doel: o.doel, naam: o.naam });
    return;
  }

  // de telefoon uploadt de opname (ruwe videobody, max 60 MB)
  if (urlPath === "/api/opname/upload" && request.method === "POST") {
    if (schrijfLimiet(request, response)) return;
    const q = new URLSearchParams((request.url || "").split("?")[1] || "");
    const token = String(q.get("token") || "");
    const o = opnames.get(token);
    if (!o || o.video) { await sendJson(response, 404, { ok: false, fout: "Opname verlopen of al afgerond. Scan de QR-code opnieuw." }); return; }
    // te grote uploads meteen afwijzen (vóór het bufferen) en het aantal gelijktijdige
    // uploads begrenzen: elke upload staat kort in het geheugen
    if (Number(request.headers["content-length"] || 0) > 60 * 1024 * 1024) {
      await sendJson(response, 413, { ok: false, fout: "De video is te groot (max. 60 MB). Neem een kortere opname." });
      return;
    }
    if (lopendeUploads >= 4) {
      await sendJson(response, 429, { ok: false, fout: "Het is even druk; probeer het over een minuut opnieuw." });
      return;
    }
    lopendeUploads++;
    try {
      const ct = String(request.headers["content-type"] || "");
      const ext = ct.startsWith("video/mp4") ? ".mp4" : ct.startsWith("video/webm") ? ".webm" : null;
      if (!ext) { await sendJson(response, 400, { ok: false, fout: "Alleen mp4- of webm-video." }); return; }
      const buf = await readBodyRaw(request, 60 * 1024 * 1024);
      if (buf.length < 10 * 1024) { await sendJson(response, 400, { ok: false, fout: "De opname is leeg of te kort." }); return; }
      await mkdir(join(uploadsDir, "videos"), { recursive: true });
      const pad = "uploads/videos/v-" + token + ext;
      await writeFile(join(dataDir, pad), buf);
      if (o.doel === "oefening" && o.naam) {
        const cur = videolinks[o.naam] || {};
        if (cur.eigen) { try { await unlink(join(dataDir, cur.eigen)); } catch {} }
        cur.eigen = pad;
        videolinks[o.naam] = cur;
        await saveJson(videolinksPath, videolinks);
      }
      o.video = pad;
      await sendJson(response, 200, { ok: true, video: pad });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Upload mislukt (video te groot?)." });
    } finally {
      lopendeUploads--;
    }
    return;
  }

  // de opnamepagina die de telefoon opent na het scannen van de scherm-QR
  if (urlPath.startsWith("/o/")) {
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("permissions-policy", "camera=(self), microphone=(self), geolocation=()");
    response.setHeader("content-security-policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; media-src 'self' blob:; frame-src 'none'; " +
      "connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'");
    try { await send(response, 200, "text/html; charset=utf-8", await readFile(join(publicDir, "opname.html"))); }
    catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
    return;
  }

  // ---- gedeelde kaarten per praktijk + de digitale kaart achter de QR-code ----

  // lijst van kaarten van één praktijk (licht: alleen naam, datum en aantal oefeningen)
  if (urlPath === "/api/kaarten" && request.method === "GET") {
    const q = new URLSearchParams((request.url || "").split("?")[1] || "");
    const pk = String(q.get("praktijk") || "").trim().toLowerCase();
    const map = kaarten[pk] || {};
    const list = Object.values(map)
      .map((k) => ({ id: k.id, naam: k.naam, ts: k.ts, aantal: (k.chosen || []).length }))
      .sort((a, b) => b.ts - a.ts);
    await sendJson(response, 200, list);
    return;
  }

  // kaart opslaan of bijwerken (sleutel: praktijk + kaartnaam); geeft het kaart-id terug
  if (urlPath === "/api/kaarten" && request.method === "POST") {
    if (schrijfLimiet(request, response)) return;
    try {
      const b = JSON.parse(await readBody(request, 256 * 1024));
      const praktijk = cleanName(b.praktijk, 80);
      const naam = cleanName(b.naam, 60);
      if (!praktijk || !naam) { await sendJson(response, 400, { ok: false, fout: "Geef de praktijknaam en een kaartnaam op." }); return; }
      const pk = praktijk.toLowerCase();
      const kk = naam.toLowerCase();
      if (!kaarten[pk] && Object.keys(kaarten).length >= 300) { await sendJson(response, 400, { ok: false, fout: "Maximum aantal praktijken met gedeelde kaarten bereikt." }); return; }
      const map = (kaarten[pk] = kaarten[pk] || {});
      if (!map[kk] && Object.keys(map).length >= 100) { await sendJson(response, 400, { ok: false, fout: "Maximum aantal kaarten voor deze praktijk bereikt." }); return; }
      const sanStr = (v, m) => String(v == null ? "" : v).slice(0, m);
      const cells = {};
      if (b.cells && typeof b.cells === "object") {
        for (const k of Object.keys(b.cells).slice(0, 800)) { const v = sanStr(b.cells[k], 60); if (v) cells[sanStr(k, 80)] = v; }
      }
      const rows = {};
      if (b.rows && typeof b.rows === "object") {
        for (const k of Object.keys(b.rows).slice(0, 40)) { const v = sanStr(b.rows[k], 20); if (v) rows[sanStr(k, 12)] = v; }
      }
      const client = {};
      for (const k of ["c_naam", "c_leeftijd", "c_hf", "c_zone", "c_opm", "c_cave", "c_doel"]) {
        if (b.client && b.client[k]) client[k] = sanStr(b.client[k], 500);
      }
      const chosen = (Array.isArray(b.chosen) ? b.chosen : []).slice(0, 12)
        .map((x) => ({ n: sanStr(x && x.n, 80), i: Math.max(0, Math.min(9, Number(x && x.i) || 0)) }))
        .filter((x) => x.n);
      // persoonlijke video's per oefening (alleen paden van eigen opnames toegestaan)
      const vids = {};
      if (b.vids && typeof b.vids === "object") {
        for (const k of Object.keys(b.vids).slice(0, 12)) {
          const v = String(b.vids[k] || "");
          if (/^uploads\/videos\/v-[a-f0-9]+\.(mp4|webm)$/.test(v)) vids[sanStr(k, 80)] = v;
        }
      }
      const oudeVids = map[kk] ? Object.values(map[kk].vids || {}) : [];
      map[kk] = { id: map[kk] ? map[kk].id : randomBytes(6).toString("hex"),
        praktijk, naam, ts: Date.now(), client, chosen, rows, cells, vids };
      await saveJson(kaartenPath, kaarten);
      await ruimKaartVideosOp(oudeVids.filter((p) => !Object.values(vids).includes(p)));
      await sendJson(response, 200, { ok: true, id: map[kk].id });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek (of kaart te groot)." });
    }
    return;
  }

  // kaart verwijderen uit het praktijkoverzicht
  if (urlPath === "/api/kaarten/verwijder" && request.method === "POST") {
    if (schrijfLimiet(request, response)) return;
    try {
      const b = JSON.parse(await readBody(request));
      const pk = String(b.praktijk || "").trim().toLowerCase();
      const kk = String(b.naam || "").trim().toLowerCase();
      if (!kaarten[pk] || !kaarten[pk][kk]) { await sendJson(response, 404, { ok: false, fout: "Kaart niet gevonden." }); return; }
      const wegVids = Object.values(kaarten[pk][kk].vids || {});
      delete kaarten[pk][kk];
      if (!Object.keys(kaarten[pk]).length) delete kaarten[pk];
      await saveJson(kaartenPath, kaarten);
      await ruimKaartVideosOp(wegVids);
      await sendJson(response, 200, { ok: true });
    } catch {
      await sendJson(response, 400, { ok: false, fout: "Ongeldig verzoek." });
    }
    return;
  }

  // één kaart op id (voor de digitale kaart die de cliënt via de QR-code opent)
  if (urlPath === "/api/kaart" && request.method === "GET") {
    const q = new URLSearchParams((request.url || "").split("?")[1] || "");
    const id = String(q.get("id") || "");
    let found = null;
    if (/^[a-f0-9]{8,16}$/.test(id)) {
      for (const pk of Object.keys(kaarten)) {
        for (const kk of Object.keys(kaarten[pk])) {
          if (kaarten[pk][kk].id === id) { found = kaarten[pk][kk]; break; }
        }
        if (found) break;
      }
    }
    if (!found) { await sendJson(response, 404, { ok: false, fout: "Kaart niet gevonden." }); return; }
    const prof = praktijken[found.praktijk.toLowerCase()] || { praktijk: found.praktijk };
    await sendJson(response, 200, { ok: true, kaart: found, praktijk: prof });
    return;
  }

  // de digitale kaart zelf: /k/<id> (de pagina haalt de kaart via de API op)
  if (urlPath === "/k" || urlPath.startsWith("/k/")) {
    telBezoek(request, false);
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    // defensielaag: de patiëntpagina mag alleen laden van de eigen server (+ de YouTube-speler)
    response.setHeader("content-security-policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; media-src 'self'; frame-src https://www.youtube-nocookie.com; " +
      "connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'");
    try { await send(response, 200, "text/html; charset=utf-8", await readFile(join(publicDir, "kaart.html"))); }
    catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
    return;
  }

  // door beheer geüploade plaatjes en video's (staan in de datamap, niet in public/)
  if (urlPath.startsWith("/uploads/")) {
    const file = normalize(join(uploadsDir, urlPath.slice("/uploads/".length)));
    const ext = extname(file);
    if (!file.startsWith(uploadsDir + sep) || ![".jpg", ".png", ".mp4", ".webm"].includes(ext)) {
      await send(response, 403, "text/plain; charset=utf-8", "Forbidden");
      return;
    }
    try {
      const data = await readFile(file);
      // video: Range-verzoeken beantwoorden, anders speelt iOS Safari niets af
      const range = request.headers.range;
      if ((ext === ".mp4" || ext === ".webm") && range) {
        const m = String(range).match(/bytes=(\d*)-(\d*)/);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? Math.min(parseInt(m[2], 10), data.length - 1) : data.length - 1;
        if (!m || start > end || start >= data.length) {
          response.writeHead(416, { "content-range": `bytes */${data.length}` });
          response.end();
          return;
        }
        response.writeHead(206, {
          "content-type": MIME[ext],
          "content-range": `bytes ${start}-${end}/${data.length}`,
          "accept-ranges": "bytes",
          "content-length": end - start + 1,
          ...cacheHeaders(MIME[ext])
        });
        response.end(data.subarray(start, end + 1));
        return;
      }
      response.writeHead(200, { "content-type": MIME[ext], "accept-ranges": "bytes", ...cacheHeaders(MIME[ext]) });
      response.end(data);
    } catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
    return;
  }

  // v2: landingspagina op /v2, de vernieuwde app op /v2/app (zelfde index.html met
  // een v2-vlag en -stylesheet erin gezet; de bestaande app op / blijft ongewijzigd)
  if (urlPath === "/v2" || urlPath === "/v2/") {
    if (urlPath === "/v2/") { response.writeHead(301, { location: "/v2" }); response.end(); return; }
    telBezoek(request, false);
    response.setHeader("x-frame-options", "DENY");
    try { await send(response, 200, "text/html; charset=utf-8", await readFile(join(publicDir, "v2.html"))); }
    catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
    return;
  }
  if (urlPath === "/v2/app" || urlPath === "/v2/app/") {
    if (urlPath === "/v2/app/") { response.writeHead(301, { location: "/v2/app" }); response.end(); return; }
    telBezoek(request, false);
    response.setHeader("x-frame-options", "DENY");
    try {
      let html = await readFile(join(publicDir, "index.html"), "utf8");
      html = html.replace("<head>", '<head><base href="/"/><meta name="color-scheme" content="light"/><script>window.FYSIPLAN_V2=true</script>');
      html = html.replace("</head>", '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'8\' fill=\'%232456a6\'/%3E%3Cpath d=\'M5 16h5l2.5 6 5-12 2.5 7h7\' fill=\'none\' stroke=\'%23fff\' stroke-width=\'2.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E"/><link rel="stylesheet" href="/v2.css"/><script src="/qr.js" defer></script></head>');
      await send(response, 200, "text/html; charset=utf-8", html);
    } catch { await send(response, 404, "text/plain; charset=utf-8", "Not found"); }
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
