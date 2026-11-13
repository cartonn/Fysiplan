// /health is openbaar en mag de foutmelding van de database niet tonen. `npm run test:healthdbfout`
//
// Een foutmelding van PostgreSQL noemt de interne host, poort of gebruiker ("getaddrinfo ENOTFOUND
// <host>", "password authentication failed for user …"). Op /health staat alleen dát er een fout is;
// de tekst zelf ziet alleen beheer op /api/beheer/database. Draait zonder PostgreSQL: de host bestaat niet.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-healthdb-"));
const vrij = createServer();
await new Promise((r) => vrij.listen(0, "127.0.0.1", r));
const port = vrij.address().port;
await new Promise((r) => vrij.close(r));
const origin = `http://127.0.0.1:${port}`;
const SLEUTEL = "test-beheersleutel-" + Date.now();
const HOST = "geheime-db-host.invalid";
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit",
  DATABASE_URL: `postgres://geheimegebruiker:geheimwachtwoord@${HOST}:5432/fysiplan`, DATABASE_MEESCHRIJVEN: "aan" };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_|MAIL_)/.test(k) || k === "NODE_ENV") delete env[k];
let uit = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  // wacht tot de start van de database is mislukt
  let h;
  for (let i = 0; i < 200; i++) { h = await (await fetch(origin + "/health")).json(); if (h.database && h.database.startFout) break; await wacht(50); }
  assert.equal(h.ok, true);
  assert.ok(h.database && h.database.startFout, "/health zegt dat de database niet start: " + JSON.stringify(h.database));
  const tekst = JSON.stringify(h);
  for (const geheim of [HOST, "geheime-db-host", "geheimegebruiker", "geheimwachtwoord", "ENOTFOUND", "getaddrinfo", "5432"]) {
    assert.ok(!tekst.includes(geheim), "/health noemt '" + geheim + "': " + JSON.stringify(h.database));
  }
  assert.ok(Object.values(h.database).every((v) => typeof v !== "string" || /^[a-z]+$/.test(v)), "alleen een korte stand, geen vrije tekst: " + JSON.stringify(h.database));
  // beheer ziet de melding wel
  const b = await (await fetch(origin + "/api/beheer/database", { headers: { "x-admin-sleutel": SLEUTEL } })).json();
  assert.equal(b.ok, true);
  assert.match(String(b.startFout || ""), new RegExp(HOST.replace(/\./g, "\\.")), "beheer ziet de foutmelding: " + JSON.stringify(b));
  // zonder sleutel niet
  assert.notEqual((await fetch(origin + "/api/beheer/database")).status, 200);
  console.log("test-health-database-fout: ok (/health zonder host, gebruiker of melding; beheer ziet de melding)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
}
