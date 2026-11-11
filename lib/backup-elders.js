// Reservekopie buiten Railway. De dagelijkse kopie in /data/backups staat op hetzelfde
// volume als de gegevens zelf: gaat dat volume verloren, dan is alles weg. Daarom gaat
// dezelfde set bestanden elke dag versleuteld naar een opslagbak elders (elke
// S3-compatibele dienst: Scaleway, Cloudflare R2, Backblaze B2, AWS).
//
// - Versleuteld vóór verzenden (AES-256-GCM, sleutel via scrypt uit BACKUP_SLEUTEL):
//   de opslagdienst kan de inhoud niet lezen.
// - Eén vast bestand per weekdag (fysiplan-ma.fpb … fysiplan-zo.fpb): de oudste wordt
//   vanzelf overschreven, dus elders staat nooit meer dan 7 dagen, zoals de
//   privacyverklaring belooft ("hooguit 7 dagen in de reservekopie").
// - Alleen fetch en node:crypto, geen SDK. Zonder de variabelen gebeurt er niets.
//
// Terugzetten: node scripts/backup-terugzetten.mjs <bestand.fpb> <doelmap>
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("FPB1");
export const WEEKDAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

// instellingen uit de omgeving; null als iets ontbreekt (dan staat het uit)
export function backupInstellingen(env = process.env) {
  const url = String(env.BACKUP_S3_URL || "").trim().replace(/\/+$/, "");
  const id = String(env.BACKUP_S3_SLEUTEL_ID || "").trim();
  const geheim = String(env.BACKUP_S3_GEHEIM || "").trim();
  const sleutel = String(env.BACKUP_SLEUTEL || "");
  if (!url || !id || !geheim || !sleutel) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  // https verplicht, behalve voor een lokale testserver
  if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(127\.0\.0\.1|localhost)$/.test(u.hostname))) return null;
  if (!u.pathname || u.pathname === "/") return null; // de bak hoort in het pad: https://host/bak
  if (sleutel.length < 24) return null; // te korte wachtzin: liever uit dan zwak
  return { url, id, geheim, sleutel, regio: String(env.BACKUP_S3_REGIO || "auto").trim() || "auto",
    leverancier: String(env.BACKUP_LEVERANCIER || "").trim().slice(0, 120) };
}

// --- versleutelen -------------------------------------------------------------
// formaat: "FPB1" | zout (16) | iv (12) | tag (16) | versleutelde gzip van JSON
export function versleutel(bestanden, wachtzin, gemaakt = Date.now()) {
  const inhoud = { versie: 1, gemaakt: new Date(gemaakt).toISOString(), bestanden: {} };
  for (const [naam, buf] of Object.entries(bestanden)) inhoud.bestanden[naam] = Buffer.from(buf).toString("base64");
  const zout = randomBytes(16), iv = randomBytes(12);
  const sleutel = scryptSync(wachtzin, zout, 32);
  const c = createCipheriv("aes-256-gcm", sleutel, iv);
  c.setAAD(MAGIC);
  const geheim = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(inhoud)))), c.final()]);
  return Buffer.concat([MAGIC, zout, iv, c.getAuthTag(), geheim]);
}

export function ontsleutel(buf, wachtzin) {
  buf = Buffer.from(buf);
  if (buf.length < 48 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error("geen Fysiplan-reservekopie");
  const zout = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48);
  const d = createDecipheriv("aes-256-gcm", scryptSync(wachtzin, zout, 32), iv);
  d.setAAD(MAGIC);
  d.setAuthTag(tag);
  const inhoud = JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(48)), d.final()])).toString("utf8"));
  const bestanden = {};
  for (const [naam, b64] of Object.entries(inhoud.bestanden || {})) bestanden[naam] = Buffer.from(b64, "base64");
  return { gemaakt: inhoud.gemaakt, bestanden };
}

// --- S3 (AWS Signature Version 4) --------------------------------------------
const sha256hex = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();
const padCoderen = (p) => p.split("/").map((s) => encodeURIComponent(decodeURIComponent(s))
  .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

// de headers voor één S3-verzoek (PUT of GET van één object)
export function s3Headers({ methode, url, regio, id, geheim, body = Buffer.alloc(0), nu = new Date() }) {
  const u = new URL(url);
  const amzDatum = nu.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dag = amzDatum.slice(0, 8);
  const hash = sha256hex(body);
  const headers = { host: u.host, "x-amz-content-sha256": hash, "x-amz-date": amzDatum };
  const namen = Object.keys(headers).sort();
  const rfc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const vraag = [...u.searchParams].map(([k, v]) => rfc(k) + "=" + rfc(v)).sort().join("&");
  const canoniek = [methode, padCoderen(u.pathname), vraag, namen.map((n) => n + ":" + headers[n] + "\n").join(""), namen.join(";"), hash].join("\n");
  const scope = dag + "/" + regio + "/s3/aws4_request";
  const teTekenen = ["AWS4-HMAC-SHA256", amzDatum, scope, sha256hex(canoniek)].join("\n");
  const kSign = hmac(hmac(hmac(hmac("AWS4" + geheim, dag), regio), "s3"), "aws4_request");
  const handtekening = createHmac("sha256", kSign).update(teTekenen).digest("hex");
  return { ...headers, authorization: "AWS4-HMAC-SHA256 Credential=" + id + "/" + scope + ", SignedHeaders=" + namen.join(";") + ", Signature=" + handtekening };
}

export const objectNaam = (datum = new Date()) =>
  "fysiplan-" + WEEKDAGEN[new Date(datum.toLocaleString("en-US", { timeZone: "Europe/Amsterdam" })).getDay()] + ".fpb";

// versleutelt en verstuurt; gooit bij een fout (de server logt en probeert morgen opnieuw)
export async function stuurNaarElders(inst, bestanden, nu = new Date()) {
  const body = versleutel(bestanden, inst.sleutel, nu.getTime());
  if (body.length > MAX_BACKUP_BYTES) throw new Error("versleutelde reservekopie overschrijdt 200 MiB");
  const url = inst.url + "/" + objectNaam(nu);
  const headers = s3Headers({ methode: "PUT", url, regio: inst.regio, id: inst.id, geheim: inst.geheim, body, nu });
  const r = await fetch(url, { method: "PUT", headers: { ...headers, "content-type": "application/octet-stream" }, body,
    signal: AbortSignal.timeout(60 * 1000) });
  if (!r.ok) throw new Error("opslag " + r.status);
  return { object: objectNaam(nu), bytes: body.length };
}

// ophalen (voor het terugzet-script)
export async function haalVanElders(inst, object) {
  const url = inst.url + "/" + object;
  const headers = s3Headers({ methode: "GET", url, regio: inst.regio, id: inst.id, geheim: inst.geheim });
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(60 * 1000) });
  if (!r.ok) throw new Error("opslag " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Bovengrens houdt geheugen, opslag en dagelijks verkeer begrensd. Geen stille deelkopie.
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
export async function verzamelBackup(dataDir, paden, maxBytes = MAX_BACKUP_BYTES, { uploads = true } = {}) {
  const bestanden = Object.create(null);
  let totaal = 0;
  async function voegToe(pad, optioneel = false) {
    let st;
    try { st = await lstat(pad); } catch (e) { if (optioneel && e.code === 'ENOENT') return; throw e; }
    if (st.isSymbolicLink()) throw new Error('symbolische link in reservekopie');
    if (st.isDirectory()) {
      for (const naam of await readdir(pad)) await voegToe(join(pad, naam));
      return;
    }
    if (!st.isFile()) throw new Error('onbekend bestandstype in reservekopie');
    if (totaal + st.size > maxBytes) throw new Error('reservekopie overschrijdt budgetgrens van 200 MiB');
    const buf = await readFile(pad);
    totaal += buf.length;
    if (totaal > maxBytes) throw new Error('reservekopie overschrijdt budgetgrens van 200 MiB');
    const naam = relative(dataDir, pad).split(sep).join('/');
    if (!veiligBackupPad(naam)) throw new Error('ongeldig reservekopiepad');
    bestanden[naam] = buf;
  }
  for (const pad of paden) await voegToe(pad, true);
  if (uploads) await voegToe(join(dataDir, 'uploads'), true);
  return bestanden;
}
// Passen de uploads (video's, foto's, logo's) niet meer binnen de grens, dan gaat de kopie niet
// helemaal niet door: de gegevensbestanden (kaarten, accounts, aanmeldingen) zijn klein en het
// belangrijkst, en gaan dan alleen. Nooit stil: `deels` is true, /health zegt "deels" en de
// beheerder krijgt een mail. Passen ook de gegevensbestanden niet, dan is het een fout.
export async function verzamelBackupMetTerugval(dataDir, paden, maxBytes = MAX_BACKUP_BYTES) {
  try {
    return { bestanden: await verzamelBackup(dataDir, paden, maxBytes), deels: false };
  } catch (e) {
    if (!/overschrijdt/.test(String(e && e.message))) throw e;
    return { bestanden: await verzamelBackup(dataDir, paden, maxBytes, { uploads: false }), deels: true };
  }
}
export function veiligBackupPad(naam) {
  return typeof naam === 'string' && naam.length > 0 && !naam.includes('\\') && !naam.includes('\0')
    && !naam.startsWith('/') && naam.split('/').every(p => p && p !== '.' && p !== '..');
}
