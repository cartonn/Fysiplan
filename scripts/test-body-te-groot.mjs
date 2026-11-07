// Security-routine 2026-11-07:
// 1. Een te grote request-body kreeg geen antwoord: de body-lezer deed req.destroy(),
//    de browser toonde een lege foutpagina of "Failed to fetch" (sweep: Truus, Sanne).
//    Nu altijd een 413 met een korte melding, ook bij chunked uploads, en de server
//    blijft daarna gewoon antwoorden.
// 2. /api/opname/upload stond niet onder het proefslot: een opname-QR van vlak voor het
//    verlopen bleef nog een kwartier bruikbaar. Nu weigert de upload na het verlopen.
// `npm run test:tegroot`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tegroot-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const proefToken = randomBytes(24).toString("hex");
const VERLOOPT_OVER = 4000;
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  bijna00000000001: { id: "bijna00000000001", email: "bijna@praktijk.nl", naam: "Bea Bijna", tel: "+31612340002",
    praktijk: "Fysio Bijna", gestart: Date.now() - 14 * 86400000 + VERLOOPT_OVER, verloopt: Date.now() + VERLOOPT_OVER,
    akkoord: "x", tokens: [sha(proefToken)] }
}));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.11.0." + (ip++), ...extra });

// chunked POST zonder content-length: de grens moet onderweg vallen, niet vooraf
function chunked(pad, bytes) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(origin + pad, { method: "POST", headers: kop({ "transfer-encoding": "chunked" }) }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, body, conn: res.headers.connection }));
    });
    req.on("error", reject);
    const blok = Buffer.alloc(16 * 1024, 97);
    let verstuurd = 0;
    const schrijf = () => {
      while (verstuurd < bytes) {
        verstuurd += blok.length;
        if (!req.write(blok)) { req.once("drain", schrijf); return; }
      }
      req.end();
    };
    req.on("error", () => {});
    schrijf();
  });
}

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // ---- 1. te grote body ----
  for (const pad of ["/api/kaart/meting", "/api/kaarten", "/api/praktijk/claim"]) {
    let r;
    try {
      r = await fetch(origin + pad, { method: "POST", headers: kop(), body: "x".repeat(2 * 1024 * 1024) });
    } catch (e) {
      assert.fail(pad + ": geen antwoord op een te grote body (" + (e.cause?.code || e.message) + ")");
    }
    assert.equal(r.status, 413, pad + " geeft 413");
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.match(j.fout, /te groot/, pad + " noemt dat het te groot is");
  }
  const c = await chunked("/api/kaart/meting", 400 * 1024).catch((e) => assert.fail("chunked: geen antwoord (" + (e.code || e.message) + ")"));
  assert.equal(c.status, 413, "chunked te groot geeft 413");
  assert.equal(c.conn, "close", "de verbinding gaat na een 413 dicht");
  // een gewoon verzoek daarna werkt nog
  const gewoon = await fetch(origin + "/api/kaart/meting", { method: "POST", headers: kop(), body: JSON.stringify({ id: "bestaatniet0", score: 3 }) });
  assert.equal(gewoon.status, 404, "gewone verzoeken blijven werken");
  assert.equal((await fetch(origin + "/health")).status, 200);

  // ---- 2. opname-upload na het verlopen van de proef ----
  const cookie = "fpproef=" + proefToken;
  const claim = await fetch(origin + "/api/praktijk/claim", { method: "POST", headers: kop({ cookie }),
    body: JSON.stringify({ praktijk: "Fysio Bijna", wachtwoord: "bijna-wachtwoord-1", akkoord: true }) });
  assert.equal(claim.status, 200, "praktijk beveiligen tijdens de proef");
  const sessie = (await claim.json()).sessie;
  const start = async (extra) => {
    const r = await fetch(origin + "/api/opname/start", { method: "POST", headers: kop({ "x-praktijk-sessie": sessie, ...extra }), body: JSON.stringify({ doel: "kaart" }) });
    assert.equal(r.status, 200, "opname starten tijdens de proef");
    return (await r.json()).token;
  };
  const metCookie = await start({ cookie });
  const zonderCookie = await start({});
  const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
  const upload = (token) => fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.11.1." + (ip++) }, body: video });
  await wacht(VERLOOPT_OVER + 500);
  for (const [naam, token] of [["proefapparaat", metCookie], ["praktijksessie", zonderCookie]]) {
    const r = await upload(token);
    assert.equal(r.status, 403, "upload na het verlopen geweigerd (" + naam + ")");
    assert.equal((await r.json()).proefVerlopen, true);
  }
  console.log("test-body-te-groot: te grote body geeft 413 (ook chunked), opname-upload dicht na verlopen proef");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
