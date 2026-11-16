// Regressietest security 2026-11-16 16u (melding gebruikers-sweep 2026-11-15 22u, Sanne): na 30 gegokte
// kaart-id's gaf de rem 429, maar het échte id gaf daarna nog 200 met de hele kaart. 429 betekende dus "mis"
// en 200 "raak", en de rem hield doorraden niet tegen. Nu krijgt een verbinding die de rem raakte op elke route
// waar het id de enige sleutel is ook voor een bestaand id een 429; een andere verbinding merkt niets.
// `npm run test:kaartraden`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartraden-"));
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
    headers: { "content-type": "application/json", "x-forwarded-for": "10.71.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Raadrem";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "raadrem-wachtwoord", akkoord: true })).json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Kaart", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

  const rader = { "x-forwarded-for": "10.71.9.9" };
  const ander = { "x-forwarded-for": "10.71.8.8" };
  const get = (pad, h) => fetch(origin + pad, { headers: h });
  assert.equal((await get("/api/kaart?id=" + id, rader)).status, 200, "vóór het raden opent de echte link gewoon");

  // 31 gokken: de rem gaat dicht
  let laatst = 0;
  for (let i = 0; i < 31; i++) laatst = (await get("/api/kaart?id=" + (0xa0000000 + i).toString(16) + "beef", rader)).status;
  assert.equal(laatst, 429, "na 30 missers remt de server");

  // de echte kaart verraadt zich nu niet meer met een 200, op geen enkele route met alleen het id
  for (const pad of ["/api/kaart?id=", "/api/kaart/manifest?id=", "/api/kaart/agenda?id=", "/api/kaart/vertaal?taal=en&id=", "/api/kaart/afspraak.ics?id="]) {
    const r = await get(pad + id, rader);
    assert.equal(r.status, 429, pad + " gaf " + r.status + " voor het echte id na de rem: raak en mis zijn te onderscheiden");
  }
  const g = await fetch(origin + "/api/kaart/gedaan", { method: "POST",
    headers: { "content-type": "application/json", ...rader }, body: JSON.stringify({ id, i: 0, aan: true }) });
  assert.equal(g.status, 429, "patiënt-POST met het echte id na de rem gaf " + g.status);

  // een andere verbinding (de patiënt zelf) merkt niets
  const k = await get("/api/kaart?id=" + id, ander);
  assert.equal(k.status, 200, "andere verbinding opent de kaart gewoon");
  assert.equal((await k.json()).ok, true);
  console.log("test-kaart-raden: ok");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true });
}
