// Legal 2026-11-18 (art. 5 lid 1 c en art. 25 AVG, /privacy#opnames): een video die een therapeut
// op /o uit de galerij van de telefoon kiest, droeg de plek van opnemen (GPS) en het toesteltype
// ongewijzigd mee naar de server en naar de patiënt. Nu gaan `udta`, `meta` en een XMP-`uuid`
// eruit vóór het bewaren, zonder dat de video zelf of zijn lengte verandert.
// Deel 1 test lib/video-locatie.js los, deel 2 de upload via de echte server.
// Zonder browser (draait ook in CI). Onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wisVideoLocatie } from "../lib/video-locatie.js";

const doos = (type, ...inhoud) => {
  const lijf = Buffer.concat(inhoud.map((x) => (Buffer.isBuffer(x) ? x : Buffer.from(x, "latin1"))));
  const kop = Buffer.alloc(8);
  kop.writeUInt32BE(8 + lijf.length);
  kop.write(type, 4, "latin1");
  return Buffer.concat([kop, lijf]);
};
const PLEK = "+52.3731+004.8922/";
const XMP = Buffer.from("be7acfcb97a942e89c71999491e3afac", "hex");
// zoals een telefoon hem maakt: plek in moov/udta/©xyz en in moov/meta (Apple), merk in trak/udta
const maakVideo = (opvulling = 12 * 1024) => Buffer.concat([
  doos("ftyp", "qt  ", Buffer.alloc(4), "qt  "),
  doos("uuid", XMP, "<x:xmpmeta>exif:GPSLatitude 52,22.386N</x:xmpmeta>"),
  doos("moov",
    doos("mvhd", Buffer.alloc(100, 1)),
    doos("trak", doos("tkhd", Buffer.alloc(84, 2)), doos("udta", doos("\xa9mak", "Apple iPhone 15")), doos("mdia", Buffer.alloc(40, 3))),
    doos("udta", doos("\xa9xyz", Buffer.alloc(4), PLEK)),
    doos("meta", Buffer.alloc(4), "com.apple.quicktime.location.ISO6709", PLEK)),
  doos("mdat", Buffer.alloc(opvulling, 7))
]);
const heeftSporen = (b) => {
  const s = b.toString("latin1");
  return ["52.3731", "GPSLatitude", "iPhone", "ISO6709"].filter((x) => s.includes(x));
};

// deel 1: de functie
{
  const v = maakVideo(64);
  const voor = Buffer.from(v);
  assert.deepEqual(heeftSporen(voor).length, 4, "testvideo draagt plek en toestel");
  assert.equal(wisVideoLocatie(v), 4, "uuid (XMP), trak/udta, moov/udta en moov/meta gewist");
  assert.deepEqual(heeftSporen(v), [], "geen plek of toestel meer in de video");
  assert.equal(v.length, voor.length, "lengte gelijk: verwijzingen naar het beeld blijven kloppen");
  for (const deel of ["mvhd", "tkhd", "mdia", "mdat"]) {
    const i = voor.indexOf(deel, 0, "latin1");
    assert.equal(v.indexOf(deel, 0, "latin1"), i, deel + " staat nog op dezelfde plek");
  }
  assert.ok(v.subarray(v.length - 64).equals(voor.subarray(voor.length - 64)), "beelddata (mdat) onveranderd");
  // geen mp4 of een kapotte doos: niets veranderen, niet vastlopen
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(wisVideoLocatie(Buffer.from(webm)), 0);
  const kapot = Buffer.from(voor); kapot.writeUInt32BE(0xfffffff0, voor.indexOf("moov", 0, "latin1") - 4);
  assert.doesNotThrow(() => wisVideoLocatie(kapot));
  console.log("ok: lib/video-locatie.js haalt plek en toestel eruit, video blijft gelijk");
}

// deel 2: upload via /o naar een kaart
const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-video-locatie-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra }, body: JSON.stringify(body) });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Plek", wachtwoord: "wachtwoord-plek-test", akkoord: true });
  assert.equal(claim.status, 200, "claim\n" + uit);
  const sessie = (await claim.json()).sessie;
  const st = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": sessie });
  assert.equal(st.status, 200, "opname start");
  const { token } = await st.json();
  const video = maakVideo();
  const up = await fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.8.1.1" }, body: video });
  assert.equal(up.status, 200, "upload lukt");
  const pad = (await up.json()).video;
  const opgeslagen = await readFile(join(dataDir, pad));
  assert.deepEqual(heeftSporen(opgeslagen), [], "de bewaarde video draagt geen plek of toestel meer");
  assert.equal(opgeslagen.length, video.length, "zelfde lengte");
  assert.ok(opgeslagen.subarray(-1024).equals(video.subarray(-1024)), "beeld onveranderd");
  const privacy = await (await fetch(origin + "/privacy", { headers: { "x-forwarded-for": "10.8.2.1" } })).text();
  assert.match(privacy, /uit de galerij van je telefoon, dan haalt Fysiplan de plek waar hij is opgenomen/, "/privacy#opnames zegt het");
  console.log("ok: een gekozen video komt zonder plek en toestel op de server");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
