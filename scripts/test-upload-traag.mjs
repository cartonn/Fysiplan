// Security 2026-11-23 00u: er zijn vier plekken voor video-uploads tegelijk (`lopendeUploads`), en een upload hield
// zijn plek tot de body binnen was (requestTimeout 5 min). Eén praktijk (ook een gratis proef) opende met vier
// QR-tokens vier uploads, stuurde een paar kilobyte en daarna niets: de opname stond 5 minuten voor álle praktijken
// op 429, en dat kon ze steeds herhalen. Nu: hooguit twee lopende uploads per praktijk, en een upload die na de
// aanloop gemiddeld te traag binnenkomt, krijgt 408 en geeft zijn plek terug.
// Zonder browser (draait ook in CI), ~25 s. `npm run test:uploadtraag`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-upload-traag-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9." + Math.floor(ip / 250) + "." + (ip++ % 250), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

// een upload die de kop en 12 kB stuurt en daarna stilvalt; geeft het antwoord (of "dicht") zodra het komt
function stilleUpload(token) {
  let klaar;
  const uitkomst = new Promise((r) => { klaar = r; });
  const req = httpRequest(origin + "/api/opname/upload?token=" + token, {
    method: "POST",
    headers: { "content-type": "video/mp4", "content-length": String(2 * 1024 * 1024), "x-forwarded-for": "10.8.1." + (ip++ % 250) }
  }, (res) => {
    let tekst = "";
    res.on("data", (c) => { tekst += c; });
    res.on("end", () => klaar({ status: res.statusCode, tekst }));
    res.on("error", () => klaar({ status: res.statusCode, tekst }));
  });
  req.on("error", () => klaar({ status: "dicht" }));
  const begin = Buffer.alloc(12 * 1024); begin.write("ftypisom", 4, "latin1");
  req.write(begin);
  return { uitkomst, stop: () => req.destroy() };
}

const stil = [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = async (praktijk) => {
    const r = await post("/api/praktijk/claim", { praktijk, wachtwoord: "wachtwoord-" + praktijk.length + "-test", akkoord: true });
    assert.equal(r.status, 200, "claim " + praktijk);
    return (await r.json()).sessie;
  };
  const sA = await sessie("Fysio Stilstand"), sB = await sessie("Fysio Buurpraktijk");
  const token = async (s) => {
    const r = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": s });
    assert.equal(r.status, 200, "opname starten");
    return (await r.json()).token;
  };
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const upload = (t) => fetch(origin + "/api/opname/upload?token=" + t, { method: "POST",
    headers: { "content-type": "video/mp4", "x-forwarded-for": "10.8.0." + (ip++ % 250) }, body: video });

  // praktijk A opent vier uploads en laat ze stilvallen
  for (let i = 0; i < 4; i++) { stil.push(stilleUpload(await token(sA))); await wacht(100); }
  await wacht(500);
  const vroeg = await Promise.race([Promise.all(stil.slice(2).map((s) => s.uitkomst)), wacht(3000).then(() => null)]);
  assert.ok(vroeg, "de derde en vierde upload van één praktijk krijgen meteen antwoord");
  assert.deepEqual(vroeg.map((u) => u.status), [429, 429], "één praktijk mag niet meer dan twee uploads tegelijk open hebben");

  // praktijk B kan intussen gewoon een opname versturen (zonder fix: 429, alle vier de plekken bezet)
  const b = await upload(await token(sB));
  assert.equal(b.status, 200, "buurpraktijk uploadt terwijl A stilstaat: " + (await b.clone().text()));

  // na de aanloop worden de stille uploads van A afgebroken, met een begrijpelijk antwoord
  const laat = await Promise.race([Promise.all(stil.slice(0, 2).map((s) => s.uitkomst)), wacht(25000).then(() => null)]);
  assert.ok(laat, "een stilgevallen upload houdt zijn plek niet langer dan de aanloop vast");
  for (const u of laat) {
    assert.equal(u.status, 408, "te trage upload: " + JSON.stringify(u));
    assert.match(u.tekst, /te traag/);
  }

  // daarna heeft A haar plekken terug
  for (let i = 0; i < 2; i++) assert.equal((await upload(await token(sA))).status, 200, "A uploadt weer na het afbreken");
  // en een gewone, snelle upload bleef al die tijd werken
  assert.ok(!/TypeError|ReferenceError/.test(uit), "geen JS-fout in de serverlog:\n" + uit.slice(-2000));
  console.log("test:uploadtraag OK");
} finally {
  for (const s of stil) s.stop();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
