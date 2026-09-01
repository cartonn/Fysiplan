import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  containsFullDate,
  hasForbiddenDirectIdentifiers,
  migratePatientCardStore,
  normalizePatientCode,
  patientCodeFromNameAndBirthDate,
  sanitizePatientClient
} from "../lib/patient-privacy.js";

assert.equal(patientCodeFromNameAndBirthDate("Carla Mastenbroek", "04-10-1977"), "CM77");
assert.equal(patientCodeFromNameAndBirthDate("Éva van den Berg", "1977-10-04"), "EB77");
assert.equal(patientCodeFromNameAndBirthDate("Carla Mastenbroek", "31-02-1977"), "");
assert.equal(normalizePatientCode(" cm77 "), "CM77");
assert.equal(normalizePatientCode("Carla Mastenbroek"), "");
assert.equal(normalizePatientCode("CM77-2"), "CM77-2");
assert.equal(hasForbiddenDirectIdentifiers({ c_naam: "Carla" }), true);
assert.equal(hasForbiddenDirectIdentifiers({ c_code: "CM77" }), false);
assert.equal(containsFullDate("geboren 04-10-1977"), true);

const clean = sanitizePatientClient({
  c_naam: "Carla Mastenbroek",
  c_leeftijd: "48",
  c_hf: "170",
  c_opm: "Geboortedatum 04-10-1977"
}, "CM77");
assert.deepEqual(clean, { c_code: "CM77", c_hf: "170", c_opm: "Geboortedatum [datum verwijderd]" });

const migrated = migratePatientCardStore({
  praktijk: {
    "carla mastenbroek": {
      id: "abc123",
      naam: "Carla Mastenbroek",
      client: { c_naam: "Carla Mastenbroek", c_leeftijd: "48", c_doel: "Sterker worden" },
      chosen: []
    },
    "carla meijer": {
      id: "def456",
      naam: "Carla Meijer",
      client: { c_naam: "Carla Meijer", c_leeftijd: "48" },
      chosen: []
    }
  }
});
assert.equal(migrated.changed, true);
assert.deepEqual(Object.keys(migrated.cards.praktijk), ["cm48", "cm48-2"]);
assert.equal(migrated.cards.praktijk.cm48.naam, "CM48");
assert.deepEqual(migrated.cards.praktijk.cm48.client, { c_code: "CM48", c_doel: "Sterker worden" });
assert.equal(JSON.stringify(migrated.cards).includes("Mastenbroek"), false);

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-patient-privacy-"));
const legacyStore = {
  testpraktijk: {
    "carla mastenbroek": {
      id: "a1b2c3d4e5f6", praktijk: "Testpraktijk", naam: "Carla Mastenbroek", ts: Date.now(),
      client: { c_naam: "Carla Mastenbroek", c_leeftijd: "48", c_doel: "Sterker worden" },
      chosen: [], rows: {}, cells: {}, vids: {}, metingen: [], gedaan: []
    }
  }
};
await mkdir(join(dataDir, "backups", "2026-08-31"), { recursive: true });
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(legacyStore));
await writeFile(join(dataDir, "backups", "2026-08-31", "kaarten.json"), JSON.stringify(legacyStore));

const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
app.stdout.on("data", (chunk) => { output += chunk; });
app.stderr.on("data", (chunk) => { output += chunk; });

async function post(path, body) {
  const response = await fetch(origin + path, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + "/health")).ok) break; } catch {}
    if (i === 99) throw new Error("Testserver startte niet.\n" + output);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const disk = await readFile(join(dataDir, "kaarten.json"), "utf8");
  const backup = await readFile(join(dataDir, "backups", "2026-08-31", "kaarten.json"), "utf8");
  assert.equal(disk.includes("Mastenbroek"), false);
  assert.equal(backup.includes("Mastenbroek"), false);
  assert.match(disk, /CM48/);

  const forbidden = await post("/api/kaarten", {
    praktijk: "Testpraktijk", naam: "Carla Mastenbroek",
    client: { c_naam: "Carla Mastenbroek", c_leeftijd: "48" }
  });
  assert.equal(forbidden.response.status, 400);

  const fullDate = await post("/api/kaarten", {
    praktijk: "Testpraktijk", naam: "CM77", client: { c_code: "CM77", c_opm: "Geboren 04-10-1977" }
  });
  assert.equal(fullDate.response.status, 400);

  const created = await post("/api/kaarten", {
    praktijk: "Testpraktijk", naam: "CM77", client: { c_code: "CM77", c_doel: "Sterker worden" },
    chosen: [{ n: "Squat", i: 0 }], rows: {}, cells: {}, vids: {}
  });
  assert.equal(created.response.status, 200);
  assert.match(created.body.id, /^[a-f0-9]{12}$/);

  const collision = await post("/api/kaarten", {
    praktijk: "Testpraktijk", naam: "CM77", client: { c_code: "CM77" }
  });
  assert.equal(collision.response.status, 409);

  const updated = await post("/api/kaarten", {
    id: created.body.id, praktijk: "Testpraktijk", naam: "CM77",
    client: { c_code: "CM77", c_doel: "Bijgewerkt" }, chosen: [], rows: {}, cells: {}, vids: {}
  });
  assert.equal(updated.response.status, 200);

  const publicCardResponse = await fetch(origin + "/api/kaart?id=" + created.body.id);
  const publicCard = await publicCardResponse.json();
  assert.equal(publicCard.kaart.client.c_code, "CM77");
  assert.equal("c_naam" in publicCard.kaart.client, false);
  assert.equal("c_leeftijd" in publicCard.kaart.client, false);
} finally {
  app.kill("SIGTERM");
  await new Promise((resolve) => app.once("exit", resolve));
  await rm(dataDir, { recursive: true, force: true });
}

console.log("OK: patiëntcode, API-blokkade en opslag/back-upmigratie verwijderen directe identificatoren.");
