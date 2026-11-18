// Security-routine 2026-11-09, audit (e) uploads: POST /api/praktijken (profiel + logo) gebruikte
// `eisPraktijk`, die bij een praktijk zonder wachtwoord alles doorlaat. Het profiel van zo'n praktijk
// (telefoon, e-mail, website, logo) staat op elke gedeelde patiëntkaart (/api/kaart → praktijk).
// Met alleen de praktijknaam (staat op de geprinte kaart) kon iedereen daar een eigen telefoonnummer,
// website of logo neerzetten: phishing namens de praktijk. Nu: `eisBeveiligdePraktijk`, zoals de
// therapeutroutes op een kaart: zonder wachtwoord alleen v1 en een eigen beheersleutel.
// `npm run test:profielovername`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-profielovername-"));
const ID = "b1c2d3e4f5a6";
const PRAKTIJK = "fysio oud zonder wachtwoord";
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  [PRAKTIJK]: { jan: { id: ID, naam: "Jan", ts: Date.now(), chosen: [], client: { c_naam: "Jan" }, metingen: [], gedaan: [] } }
}));
await writeFile(join(dataDir, "praktijken.json"), JSON.stringify({
  [PRAKTIJK]: { praktijk: "Fysio Oud zonder wachtwoord", adres: "Echte straat 1", tel: "030-1234567", website: "fysio-oud.nl" }
}));
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, {
  method: "POST",
  headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", "x-forwarded-for": "10.79.0." + (ip++ % 250), ...extra },
  body: JSON.stringify(body)
});
const kaartProfiel = async () => (await (await fetch(origin + "/api/kaart?id=" + ID, { headers: { "x-forwarded-for": "10.80.0.1" } })).json()).praktijk;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // 1) aanvaller zonder login, met alleen de praktijknaam van de geprinte kaart
  const vals = { praktijk: "Fysio Oud zonder wachtwoord", adres: "Echte straat 1", tel: "0900-OPLICHTER", website: "betaal-hier.example" };
  let r = await post("/api/praktijken", vals);
  assert.equal(r.status, 401, "profiel van een praktijk zonder wachtwoord overschrijven zonder login geeft 401 (was " + r.status + ")");
  assert.equal((await r.json()).beveilig, true, "v2 krijgt de vraag om eerst te beveiligen");
  r = await post("/api/praktijken", { ...vals, logo: "data:image/png;base64," + png.toString("base64") });
  assert.equal(r.status, 401, "logo zetten zonder login geeft 401");
  let p = await kaartProfiel();
  assert.equal(p.tel, "030-1234567", "patiëntkaart toont nog het echte telefoonnummer");
  assert.equal(p.website, "fysio-oud.nl", "patiëntkaart toont nog de echte website");
  assert.ok(!p.logo, "geen vreemd logo op de patiëntkaart");

  // 2) een nieuwe naam aanmaken zonder login kan ook niet meer (geen profielen van onbeveiligde praktijken)
  assert.equal((await post("/api/praktijken", { praktijk: "Nieuw zonder wachtwoord", adres: "X 1" })).status, 401);

  // 3) de eigen beheersleutel mag het nog
  r = await post("/api/praktijken", { ...vals, tel: "030-7654321" }, { "x-admin-sleutel": SLEUTEL });
  assert.equal(r.status, 200, "beheer met eigen sleutel werkt nog");
  assert.equal((await kaartProfiel()).tel, "030-7654321");

  // 4) een beveiligde, ingelogde praktijk bewaart gewoon haar eigen profiel en logo
  const c = await post("/api/praktijk/claim", { praktijk: "Fysio Nieuw", wachtwoord: "wachtwoord-nieuw", akkoord: true });
  assert.equal(c.status, 200);
  // deze test stuurt de koppen van een browser mee, en een browser krijgt de sessie alleen
  // in de cookie (HttpOnly): die gaat terug zoals de browser dat doet
  assert.equal((await c.json()).sessie, "cookie");
  const S = { cookie: (c.headers.getSetCookie().find((k) => k.startsWith("fpsessie=")) || "").split(";")[0] };
  assert.match(S.cookie, /^fpsessie=[a-f0-9]{48}$/);
  r = await post("/api/praktijken", { praktijk: "Fysio Nieuw", adres: "Laan 2", tel: "010-1111111", logo: "data:image/png;base64," + png.toString("base64") }, S);
  assert.equal(r.status, 200, "ingelogde praktijk bewaart haar profiel");
  assert.ok((await r.json()).logo.startsWith("uploads/logo-"));
  // ...maar zonder sessie niet
  assert.equal((await post("/api/praktijken", { praktijk: "Fysio Nieuw", adres: "Vals 9" })).status, 401);
  console.log("test-profiel-overname: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
