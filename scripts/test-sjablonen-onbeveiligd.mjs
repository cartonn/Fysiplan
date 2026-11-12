// Security-routine 2026-11-10, audit (d): teamsjablonen lezen en verwijderen gebruikten `eisPraktijk`,
// die bij een praktijk zonder wachtwoord alles doorlaat. Sjablonen blijven staan als beheer een claim
// reset (`/api/praktijk/reset`) of als ze onder een oude naamsleutel staan. Dan kon iedereen met alleen
// de praktijknaam de teamsjablonen lezen (GET) en weghalen (verwijder). Nu: `eisBeveiligdePraktijk`,
// net als het opslaan en de therapeutroutes op een kaart. `npm run test:sjablonenslot`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sjablonenslot-"));
const PRAKTIJK = "fysio zonder claim";
await writeFile(join(dataDir, "praktijk-sjablonen.json"), JSON.stringify({
  [PRAKTIJK]: [{ naam: "Knie na VKB", oefeningen: [{ n: "Squat", s: "3", h: "10" }], t: Date.now() }]
}));

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
const kop = (extra = {}) => ({ "content-type": "application/json", origin, "sec-fetch-site": "same-origin", "x-forwarded-for": "10.81.0." + (ip++ % 250), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // 1) zonder login, met alleen de praktijknaam: niet lezen
  let r = await get("/api/praktijk/sjablonen?praktijk=" + encodeURIComponent("Fysio zonder claim"));
  assert.equal(r.status, 401, "teamsjablonen van een praktijk zonder wachtwoord lezen zonder login geeft 401 (was " + r.status + ")");
  assert.equal((await r.json()).beveilig, true, "v2 krijgt de vraag om eerst te beveiligen");

  // 2) ...en niet weghalen
  r = await post("/api/praktijk/sjablonen/verwijder", { praktijk: "Fysio zonder claim", naam: "Knie na VKB" });
  assert.equal(r.status, 401, "teamsjabloon verwijderen zonder login geeft 401 (was " + r.status + ")");

  // 3) de eigen beheersleutel ziet ze nog, dus ze staan er nog
  r = await get("/api/praktijk/sjablonen?praktijk=" + encodeURIComponent(PRAKTIJK), { "x-admin-sleutel": SLEUTEL });
  assert.equal(r.status, 200, "beheer met eigen sleutel leest nog");
  assert.equal((await r.json()).sjablonen.length, 1, "het sjabloon is niet weggehaald");

  // 4) een beveiligde, ingelogde praktijk deelt, leest en verwijdert gewoon haar eigen sjablonen
  const c = await post("/api/praktijk/claim", { praktijk: "Fysio Team", wachtwoord: "wachtwoord-team", akkoord: true });
  assert.equal(c.status, 200);
  // deze test stuurt de koppen van een browser mee, en een browser krijgt de sessie alleen
  // in de cookie (HttpOnly): die gaat terug zoals de browser dat doet
  assert.equal((await c.json()).sessie, "cookie");
  const S = { cookie: (c.headers.getSetCookie().find((k) => k.startsWith("fpsessie=")) || "").split(";")[0] };
  assert.match(S.cookie, /^fpsessie=[a-f0-9]{48}$/);
  r = await post("/api/praktijk/sjablonen", { praktijk: "Fysio Team", naam: "Schouder", oefeningen: [{ n: "Pendel" }] }, S);
  assert.equal(r.status, 200, "ingelogde praktijk deelt een sjabloon");
  r = await get("/api/praktijk/sjablonen?praktijk=" + encodeURIComponent("Fysio Team"), S);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).sjablonen[0].naam, "Schouder");
  // zonder sessie: 401
  assert.equal((await get("/api/praktijk/sjablonen?praktijk=" + encodeURIComponent("Fysio Team"))).status, 401);
  r = await post("/api/praktijk/sjablonen/verwijder", { praktijk: "Fysio Team", naam: "Schouder" }, S);
  assert.equal(r.status, 200, "ingelogde praktijk verwijdert haar sjabloon");
  assert.equal((await r.json()).sjablonen.length, 0);
  console.log("test-sjablonen-onbeveiligd: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
