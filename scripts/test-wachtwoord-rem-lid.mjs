// Foute pogingen van een collega bij "wachtwoord wijzigen" tellen op een eigen sleutel
// per lid, niet op die van de praktijk. Eerst kon één ingelogde collega met tien foute
// "huidige wachtwoorden" de beheerder een kwartier lang het praktijkwachtwoord laten
// wijzigen (429), en bij een praktijk met de naam als sleutel ook het gewone inloggen met
// het praktijkwachtwoord blokkeren. Een geslaagde wijziging door een collega wiste
// bovendien de teller van een lopende aanval op het praktijkwachtwoord
// (security 2026-11-10 20u). Zonder browser, past in CI. `npm run test:wachtwoordrem`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const env = { ...process.env };
for (const k of ["ADMIN_KEY", "RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "NODE_ENV"]) delete env[k];
const port = await vrijePoort();
const data = await mkdtemp(join(tmpdir(), "fysiplan-wwrem-"));
const kind = spawn(process.execPath, ["server.js"], {
  env: { ...env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: data, ANTHROPIC_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
kind.stdout.on("data", (b) => (log += b));
kind.stderr.on("data", (b) => (log += b));
const basis = `http://127.0.0.1:${port}`;
let ip = 1;
const post = (pad, body, extra = {}) => fetch(basis + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.12.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const P = "Fysio Wachtwoordrem";

try {
  let klaar = false;
  for (let i = 0; i < 150 && !klaar; i++) {
    try { await fetch(basis + "/health"); klaar = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(klaar, log);

  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200, "claimen lukt");
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Sanne de Wit", email: "sanne@wwrem.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login aangemaakt");
  const S = { "x-praktijk-sessie": (await eigen.json()).sessie };

  // 1. de collega tikt tien keer een fout eigen wachtwoord: zij gaat zelf op slot
  for (let i = 0; i < 10; i++) {
    const r = await post("/api/praktijk/wachtwoord", { praktijk: P, huidig: "fout-" + i, nieuw: "nieuw-wachtwoord" }, S);
    assert.equal(r.status, 403, "fout eigen wachtwoord: 403");
  }
  const lidSlot = await post("/api/praktijk/wachtwoord", { praktijk: P, huidig: "sanne-wachtwoord", nieuw: "nieuw-wachtwoord" }, S);
  assert.equal(lidSlot.status, 429, "na tien missers staat de collega zelf een kwartier op slot");

  // 2. de rest van de praktijk merkt daar niets van
  const login = await post("/api/praktijk/login", { praktijk: P, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(login.status, 200, "inloggen met het praktijkwachtwoord werkt nog");
  const G2 = { "x-praktijk-sessie": (await login.json()).sessie };
  const wijzig = await post("/api/praktijk/wachtwoord", { praktijk: P, huidig: "praktijk-wachtwoord", nieuw: "nieuw-praktijkwachtwoord" }, G2);
  assert.equal(wijzig.status, 200, "praktijkwachtwoord wijzigen werkt nog");

  // 3. een geslaagde wijziging door een collega wist de praktijkteller niet
  const eigen2 = await post("/api/praktijk/team/eigen-login", { naam: "Mark Bos", email: "mark@wwrem.nl", wachtwoord: "mark-wachtwoord", regels: true },
    { "x-praktijk-sessie": (await wijzig.json()).sessie });
  assert.equal(eigen2.status, 200, "tweede eigen login");
  const M = { "x-praktijk-sessie": (await eigen2.json()).sessie };
  for (let i = 0; i < 9; i++) {
    const r = await post("/api/praktijk/login", { praktijk: P, wachtwoord: "gok-" + i });
    assert.ok([401, 403].includes(r.status), "foute login geweigerd");
  }
  const mark = await post("/api/praktijk/wachtwoord", { praktijk: P, huidig: "mark-wachtwoord", nieuw: "mark-nieuw-ww" }, M);
  assert.equal(mark.status, 200, "collega wijzigt het eigen wachtwoord");
  await post("/api/praktijk/login", { praktijk: P, wachtwoord: "gok-9" });
  const dicht = await post("/api/praktijk/login", { praktijk: P, wachtwoord: "nieuw-praktijkwachtwoord" });
  assert.equal(dicht.status, 429, "de tiende misser zet de praktijk op slot: de teller liep door");

  assert.ok(!/TypeError|ReferenceError|at .*server\.js:\d+/.test(log), "geen fout in het serverlog:\n" + log);
  console.log("Wachtwoordrem per lid: een collega zet alleen zichzelf op slot, de praktijkteller blijft staan.");
} finally {
  kind.kill();
  await rm(data, { recursive: true, force: true });
}
