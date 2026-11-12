// Tekstantwoorden ingepakt versturen (platformreview 2026-11-11). De server stuurde alles
// onverpakt: de app-pagina ruim 400 kB aan HTML, en de patiëntkaart haalt bij het openen
// 1,9 MB aan tekst op (pagina, catalogus en de beoordelingsbestanden). Ingepakt blijft daar
// een kwart tot een tiende van over.
// - Alleen tekst (HTML, CSS, JavaScript, JSON, SVG). Beelden, geluid en video zijn al ingepakt.
// - Alleen als de browser erom vraagt (Accept-Encoding); brotli als het kan, anders gzip.
// - Kleine antwoorden blijven zoals ze waren: onder 1 kB levert inpakken niets op.
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

export const INPAK_VANAF = 1024;
const INPAKBAAR = /^(?:text\/|application\/(?:json|javascript|manifest\+json|xml)\b|image\/svg\+xml)/i;

// Wat de browser aankan: "br" boven "gzip". Een q van 0 is een uitdrukkelijk nee.
export function kiesInpak(acceptEncoding) {
  const kan = new Map();
  for (const deel of String(acceptEncoding || "").toLowerCase().split(",")) {
    const [naam, ...rest] = deel.split(";");
    const n = naam.trim();
    if (!n) continue;
    let q = 1;
    for (const r of rest) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(r);
      if (m) q = Number(m[1]);
    }
    kan.set(n, Number.isFinite(q) ? q : 0);
  }
  if ((kan.get("br") || 0) > 0) return "br";
  if ((kan.get("gzip") || 0) > 0) return "gzip";
  return "";
}

export function inpakbaar(type, lengte) {
  return lengte >= INPAK_VANAF && INPAKBAAR.test(String(type || ""));
}

// Bestanden die niet per verzoek verschillen (stijlblad, catalogus, beoordelingsbestanden) pakken
// we één keer in. Een pagina met een eigen nonce per verzoek is elke keer anders en komt nooit
// terug; daarom bewaren we een ingepakt antwoord pas als dezelfde inhoud een tweede keer
// langskomt. De sleutel is de hash van de inhoud: gelijke sleutel, gelijk antwoord.
const CACHE_MAX_BYTES = 24 * 1024 * 1024;
const cache = new Map(); // sleutel → ingepakte Buffer
let cacheBytes = 0;
const eerder = new Set(); // inhoud die één keer is langsgekomen

export async function pakIn(enc, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  const sleutel = enc + ":" + createHash("sha256").update(buf).digest("base64");
  const al = cache.get(sleutel);
  if (al) return al;
  const uit = enc === "br"
    ? await brotli(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
    : await gz(buf, { level: 6 });
  if (eerder.has(sleutel)) {
    eerder.delete(sleutel);
    if (!cache.has(sleutel) && uit.length <= CACHE_MAX_BYTES / 8) {
      cache.set(sleutel, uit);
      cacheBytes += uit.length;
      // de oudste eerst weg (een Map onthoudt de volgorde van toevoegen)
      for (const [k, v] of cache) {
        if (cacheBytes <= CACHE_MAX_BYTES) break;
        cache.delete(k); cacheBytes -= v.length;
      }
    }
  } else {
    if (eerder.size >= 4000) eerder.clear();
    eerder.add(sleutel);
  }
  return uit;
}

export function inpakStand() {
  return { bewaard: cache.size, bytes: cacheBytes };
}

// Komt de ETag van het bestand voor in If-None-Match? Een tussenstation dat het antwoord inpakt
// mag er een zwakke van maken (W/"…"); voor een GET telt die gewoon mee.
export function etagKomtOvereen(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;
  const kaal = (s) => s.trim().replace(/^W\//, "");
  const doel = kaal(etag);
  return String(ifNoneMatch).split(",").some((deel) => { const d = kaal(deel); return d === "*" || d === doel; });
}
