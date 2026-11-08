// Beheersleutel: de openbare standaardsleutel "admin88" mag live nooit werken en
// staat nergens meer in een publiek bestand. Lokaal (zonder productie-omgeving)
// blijft hij werken, zodat ontwikkelen en de andere tests niet veranderen.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 1. geen hard ingebakken sleutel in de pagina's die het publiek kan downloaden
for (const f of ["public/index.html", "public/dashboard.html", "public/content1000.html"]) {
  const html = await readFile(f, "utf8");
  assert.doesNotMatch(html, /x-admin-sleutel['"]?\s*:\s*['"]admin88['"]/, `${f} bevat de beheersleutel`);
  assert.match(html, /sessionStorage[^\n]*fysiplan-beheersleutel/, `${f} vraagt de sleutel niet zelf`);
}

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

// zonder geërfde productie- of sleutelvariabelen, zodat de test overal hetzelfde doet
function schoneEnv(extra) {
  const env = { ...process.env };
  for (const k of ["ADMIN_KEY", "RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "NODE_ENV"]) delete env[k];
  return { ...env, ...extra };
}

async function metServer(extraEnv, fn) {
  const port = await vrijePoort();
  const data = await mkdtemp(join(tmpdir(), "fysiplan-beheer-"));
  const kind = spawn(process.execPath, ["server.js"], {
    env: schoneEnv({ HOST: "127.0.0.1", PORT: String(port), DATA_DIR: data, ...extraEnv }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  kind.stdout.on("data", (b) => (log += b));
  kind.stderr.on("data", (b) => (log += b));
  const basis = `http://127.0.0.1:${port}`;
  try {
    let klaar = false;
    for (let i = 0; i < 150 && !klaar; i++) {
      try { await fetch(basis + "/health"); klaar = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(klaar, log);
    await fn(basis, () => log);
  } finally {
    kind.kill();
    await rm(data, { recursive: true, force: true });
  }
}

const dash = (basis, sleutel) =>
  fetch(basis + "/api/dashboard", { headers: sleutel == null ? {} : { "x-admin-sleutel": sleutel } }).then((r) => r.status);

// 2. productie zonder eigen ADMIN_KEY: beheer dicht, ook met admin88 of een lege sleutel
await metServer({ RAILWAY_ENVIRONMENT_NAME: "production" }, async (basis, log) => {
  assert.notEqual(await dash(basis, "admin88"), 200, "admin88 opent beheer in productie");
  assert.notEqual(await dash(basis, ""), 200, "lege sleutel opent beheer in productie");
  assert.notEqual(await dash(basis), 200);
  assert.match(log(), /Beheer staat dicht/);
});

// 3. productie met ADMIN_KEY=admin88 telt als 'geen eigen sleutel'
await metServer({ NODE_ENV: "production", ADMIN_KEY: "admin88" }, async (basis) => {
  assert.notEqual(await dash(basis, "admin88"), 200, "expliciete admin88 opent beheer in productie");
});

// 4. productie met een eigen sleutel: alleen die werkt
await metServer({ RAILWAY_ENVIRONMENT: "production", ADMIN_KEY: "test-eigen-sleutel-123" }, async (basis) => {
  assert.notEqual(await dash(basis, "admin88"), 200);
  assert.equal(await dash(basis, "test-eigen-sleutel-123"), 200, "eigen sleutel werkt niet meer");
});

// 5. lokaal zonder sleutel: ongewijzigd, admin88 werkt voor ontwikkelen
await metServer({}, async (basis) => {
  assert.equal(await dash(basis, "admin88"), 200, "lokale standaardsleutel werkt niet meer");
});

// 6. de rem op foute sleutels houdt raden echt tegen: wie op de rem staat, komt ook met de
// juiste sleutel niet binnen; een ander IP (de echte beheerder) merkt er niets van
await metServer({ RAILWAY_ENVIRONMENT: "production", ADMIN_KEY: "test-eigen-sleutel-123" }, async (basis) => {
  const met = (sleutel, ip) =>
    fetch(basis + "/api/dashboard", { headers: { "x-admin-sleutel": sleutel, "x-forwarded-for": ip } }).then((r) => r.status);
  for (let i = 0; i < 21; i++) await met("fout-" + i, "10.66.0.1");
  assert.equal(await met("nog-fout", "10.66.0.1"), 429, "rem op foute sleutels staat niet aan");
  assert.equal(await met("test-eigen-sleutel-123", "10.66.0.1"), 429, "juiste sleutel komt door de rem heen: raden wordt niet tegengehouden");
  assert.equal(await met("test-eigen-sleutel-123", "10.66.0.2"), 200, "rem van één IP sluit beheer voor iedereen");
});

console.log("test-beheersleutel: ok");
