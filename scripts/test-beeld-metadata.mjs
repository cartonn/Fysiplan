// Security 2026-11-20 (art. 5 lid 1 c en art. 25 AVG): een eigen-oefeningfoto of praktijklogo die buiten
// de app om (rechtstreeks via de API) werd geüpload, hield zijn Exif/XMP/tekst: plek van opnemen (GPS),
// merk en type van de telefoon. Die foto's staan op de patiëntkaart. Nu haalt de server ze eruit vóór
// het bewaren (lib/beeld-metadata.js); de Exif-oriëntatie blijft, zodat een staande foto staand blijft.
// Deel 1 test de functie, deel 2 de uploads via de echte server. Zonder browser (draait ook in CI).
// `npm run test:beeldmetadata`, ook onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { zonderBeeldMetadata } from "../lib/beeld-metadata.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPOREN = ["52.3731", "GPSLatitude", "iPhone", "Jan Jansen"];
const sporen = (b) => { const s = b.toString("latin1"); return SPOREN.filter((x) => s.includes(x)); };

const seg = (marker, inhoud) => {
  const lijf = Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud, "latin1");
  const kop = Buffer.from([0xff, marker, 0, 0]);
  kop.writeUInt16BE(lijf.length + 2, 2);
  return Buffer.concat([kop, lijf]);
};
// Exif zoals een telefoon hem maakt (little-endian): IFD0 met Orientation=6 en Make, plus GPS-tekst erachter
function exif(orientatie) {
  const t = Buffer.alloc(8 + 2 + 24 + 4);
  t.write("II", 0, "latin1"); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4);
  t.writeUInt16LE(2, 8);
  t.writeUInt16LE(0x010f, 10); t.writeUInt16LE(2, 12); t.writeUInt32LE(4, 14); t.write("Appl", 18, "latin1");
  t.writeUInt16LE(0x0112, 22); t.writeUInt16LE(3, 24); t.writeUInt32LE(1, 26); t.writeUInt16LE(orientatie, 30);
  t.writeUInt32LE(0, 34);
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t, Buffer.from("Apple iPhone 15 GPSLatitude 52.3731N", "latin1")]);
}
const echteJpeg = await readFile(join(root, "public/images/seated-chair/standing-chair-hip-extension-avatar-v8.jpg"));
const echtePng = await readFile(join(root, "public/images/cardio/jumping-jacks-line-v1.png"));
const sosVan = (b) => { for (let i = 2; i < b.length - 1; i++) if (b[i] === 0xff && b[i + 1] === 0xda) return i; return -1; };
const maakJpeg = (orientatie = 6) => Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  seg(0xe1, exif(orientatie)),
  seg(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>exif:GPSLatitude 52,22.386N</x:xmpmeta>"),
  seg(0xed, "Photoshop 3.0\0 By-line Jan Jansen"),
  seg(0xfe, "Jan Jansen thuis"),
  echteJpeg.subarray(2)
]);
const pngStuk = (type, inhoud) => {
  const lijf = Buffer.from(inhoud, "latin1");
  const kop = Buffer.alloc(8); kop.writeUInt32BE(lijf.length); kop.write(type, 4, "latin1");
  return Buffer.concat([kop, lijf, Buffer.alloc(4)]);
};
const maakPng = () => {
  const iend = echtePng.length - 12;
  return Buffer.concat([echtePng.subarray(0, iend), pngStuk("tEXt", "Author\0Jan Jansen"),
    pngStuk("eXIf", "MM\0*GPSLatitude 52.3731"), pngStuk("iTXt", "XML:com.adobe.xmp\0\0\0\0\0iPhone"), echtePng.subarray(iend)]);
};

// deel 1: de functie
{
  const vuil = maakJpeg(6);
  assert.deepEqual(sporen(vuil).sort(), [...SPOREN].sort(), "testfoto draagt alle sporen");
  const schoon = zonderBeeldMetadata(vuil, "jpeg");
  assert.deepEqual(sporen(schoon), [], "JPEG zonder plek, toestel en naam");
  assert.equal(schoon[0], 0xff); assert.equal(schoon[1], 0xd8);
  assert.ok(schoon.subarray(sosVan(schoon)).equals(echteJpeg.subarray(sosVan(echteJpeg))), "beelddata ongewijzigd");
  // oriëntatie 6 blijft in een minimale Exif (big-endian), direct leesbaar
  const i = schoon.indexOf(Buffer.from("Exif\0\0MM", "latin1"));
  assert.ok(i > 0, "minimale Exif aanwezig");
  assert.equal(schoon.readUInt16BE(i + 6 + 8 + 2), 0x0112);
  assert.equal(schoon.readUInt16BE(i + 6 + 8 + 2 + 8), 6, "oriëntatie 6 behouden");
  // de JFIF/kleur-segmenten van het origineel blijven
  for (const m of [0xe0, 0xe2, 0xee]) {
    const heeft = (b) => { for (let p = 2; p < sosVan(b); p++) if (b[p] === 0xff && b[p + 1] === m) return true; return false; };
    assert.equal(heeft(schoon), heeft(echteJpeg), "segment " + m.toString(16) + " blijft zoals het was");
  }
  // oriëntatie 1 (rechtop): geen Exif nodig
  assert.equal(zonderBeeldMetadata(maakJpeg(1), "jpeg").indexOf(Buffer.from("Exif", "latin1")), -1);
  const p = zonderBeeldMetadata(maakPng(), "png");
  assert.deepEqual(sporen(p), [], "PNG zonder tekst en eXIf");
  assert.ok(p.equals(echtePng), "PNG verder byte voor byte gelijk");
  // kapot of geen beeld: ongewijzigd terug, geen fout
  const kapot = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), Buffer.alloc(50)]);
  assert.equal(zonderBeeldMetadata(kapot, "jpeg"), kapot);
  assert.equal(zonderBeeldMetadata(Buffer.from("geen png"), "png").toString(), "geen png");
}

// deel 2: via de echte server (eigen oefening en logo)
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-beeldmeta-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["ser" + "ver.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.74.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Beeldmeta";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "beeldmeta-wachtwoord", akkoord: true })).json()).sessie };
  const url = (b, soort) => "data:image/" + soort + ";base64," + b.toString("base64");

  const r1 = await post("/api/praktijk/oefeningen", { praktijk: P, naam: "Eigen brug Beeldmeta", uitleg: "Rustig omhoog.", img: url(maakJpeg(6), "jpeg") }, S);
  assert.equal(r1.status, 200, "eigen oefening bewaard");
  const oef = (await r1.json()).oefeningen.find((o) => o.naam === "Eigen brug Beeldmeta");
  const foto = await readFile(join(dataDir, oef.img));
  assert.deepEqual(sporen(foto), [], "eigen-oefeningfoto op de server zonder sporen");
  assert.ok(foto.indexOf(Buffer.from("Exif\0\0MM", "latin1")) > 0, "oriëntatie bewaard");

  const r2 = await post("/api/praktijken", { praktijk: P, adres: "Straat 1", plaats: "Utrecht", tel: "", email: "", logo: url(maakPng(), "png") }, S);
  assert.equal(r2.status, 200, "logo bewaard: " + r2.status);
  const logo = (await r2.json()).logo;
  assert.ok(logo, "logopad terug");
  const lb = await readFile(join(dataDir, logo));
  assert.deepEqual(sporen(lb), [], "logo op de server zonder sporen");
  // legal 2026-11-21 (art. 13 en 25 AVG): /privacy#inhoud zegt dit ook, net als #opnames bij de video's
  const privacy = await (await fetch(origin + "/privacy")).text();
  const inhoud = (privacy.match(/<tr id="inhoud">[\s\S]*?<\/tr>/) || [""])[0];
  assert.match(inhoud, /Uit een foto of logo haalt Fysiplan de plek waar hij is gemaakt en het merk en type telefoon/,
    "/privacy#inhoud noemt het weghalen van plek en toestel uit foto's en logo's");
  console.log("test-beeld-metadata: ok");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true });
}
