// Inlogrem per IP moet echt remmen. Na 20 foute pogingen vanaf één IP gaf inloggen
// wel 429 bij een fout wachtwoord, maar een goed wachtwoord kwam nog gewoon binnen:
// de rem veranderde alleen het antwoord, niet de uitkomst. Zo kon één IP over alle
// praktijknamen wachtwoorden blijven proberen (per naam 10, per IP alleen de
// schrijfrem). De scriptloze routes /v2/gegevens (download van alle kaarten) en
// /v2/proef/overzicht telden foute pogingen niet eens per IP (security 2026-11-10 16u).
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
const data = await mkdtemp(join(tmpdir(), "fysiplan-inlogrem-"));
const kind = spawn(process.execPath, ["server.js"], {
  env: { ...env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: data }, stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
kind.stdout.on("data", (b) => (log += b));
kind.stderr.on("data", (b) => (log += b));
const basis = `http://127.0.0.1:${port}`;
const json = (ip) => ({ "content-type": "application/json", "x-forwarded-for": ip });
const post = (pad, body, ip) => fetch(basis + pad, { method: "POST", headers: json(ip), body: JSON.stringify(body) });
const form = (pad, body, ip) => fetch(basis + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: new URLSearchParams(body).toString() });

try {
  let klaar = false;
  for (let i = 0; i < 150 && !klaar; i++) {
    try { await fetch(basis + "/health"); klaar = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(klaar, log);

  const c = await post("/api/praktijk/claim", { praktijk: "Fysio Doel", wachtwoord: "goed-wachtwoord", akkoord: true }, "10.9.0.1");
  assert.equal(c.status, 200, "claimen lukt");

  // 1. inloggen: 21 foute pogingen op steeds een andere naam (de rem per naam grijpt
  //    dus niet), daarna het goede wachtwoord vanaf hetzelfde IP: op de rem
  const A = "10.9.1.1";
  for (let i = 0; i < 21; i++) {
    const r = await post("/api/praktijk/login", { praktijk: "Fysio Gok " + i, wachtwoord: "welkom123" }, A);
    assert.ok([403, 429].includes(r.status), "foute poging geweigerd");
  }
  const raak = await post("/api/praktijk/login", { praktijk: "Fysio Doel", wachtwoord: "goed-wachtwoord" }, A);
  assert.equal(raak.status, 429, "na 20 missers vanaf dit IP komt ook het goede wachtwoord niet binnen");
  const ander = await post("/api/praktijk/login", { praktijk: "Fysio Doel", wachtwoord: "goed-wachtwoord" }, "10.9.1.2");
  assert.equal(ander.status, 200, "een ander IP logt gewoon in");

  // 2. herstel met herstelcode: zelfde rem
  const h = await post("/api/praktijk/herstel", { praktijk: "Fysio Doel", herstelcode: "FP-00000-00000-00000-00000", nieuw: "nieuw-wachtwoord" }, A);
  assert.equal(h.status, 429, "herstel vanaf een IP op de rem: 429");

  // 3. /v2/gegevens/download: foute pogingen tellen per IP, daarna ook goed = 429
  const B = "10.9.2.1";
  for (let i = 0; i < 21; i++) {
    const r = await form("/v2/gegevens/download", { praktijk: "Fysio Gok " + i, wachtwoord: "welkom123" }, B);
    assert.ok([403, 429].includes(r.status), "foute download geweigerd");
  }
  const dl = await form("/v2/gegevens/download", { praktijk: "Fysio Doel", wachtwoord: "goed-wachtwoord" }, B);
  assert.equal(dl.status, 429, "download na 20 missers vanaf dit IP: 429");
  const dlAnder = await form("/v2/gegevens/download", { praktijk: "Fysio Doel", wachtwoord: "goed-wachtwoord" }, "10.9.2.2");
  assert.equal(dlAnder.status, 200, "download vanaf een ander IP werkt");
  assert.match(dlAnder.headers.get("content-disposition") || "", /attachment/);

  // 4. een geslaagde login vanaf een schoon IP telt niet mee (gewoon gebruik blijft werken)
  const C = "10.9.3.1";
  for (let i = 0; i < 25; i++) {
    const r = await post("/api/praktijk/login", { praktijk: "Fysio Doel", wachtwoord: "goed-wachtwoord" }, C);
    if (r.status === 429) { assert.fail("goede logins mogen de rem niet vullen (poging " + i + ")"); }
  }

  console.log("inlogrem per IP: ok");
} finally {
  kind.kill();
  await rm(data, { recursive: true, force: true });
}
