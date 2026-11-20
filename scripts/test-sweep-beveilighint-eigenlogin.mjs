// Gebruikers-sweep 2026-11-20 06u (Sanne, desktop): met een verplichte eigen login zei de app
// "Zet eerst een wachtwoord op je praktijk … Zonder wachtwoord deelt Fysiplan geen patiëntkaarten"
// (A4-hint) en "eerst beveiligd zijn met een wachtwoord" (printvenster), terwijl /v2/proef en het
// beveiligvenster om een eigen login vragen. De app wist pas na het openen van Kaarten dat de
// eigen login verplicht is. Nu zegt de weigering van de server het zelf (`eigenLogin`) en neemt de
// app dat meteen over. Zonder browser, past in CI. `npm run test:beveilighint`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");
assert.match(html, /if\(d\.beveilig\)\{\n\s*if\(d\.eigenLogin\)PRAKSLOT\.eigenLogin=true;\n\s*toonQrHint\(PRAKSLOT\.eigenLogin\?/, "A4-hint neemt eigenLogin van de server over");
assert.match(html, /if\(IS_V2&&d\.beveilig\)\{if\(d\.eigenLogin\)PRAKSLOT\.eigenLogin=true;prMelding\(/, "printvenster neemt eigenLogin van de server over");
// hertest Sanne: het printvenster was daarna neutraal; nu noemt het, net als de A4-hint, de eigen login
assert.match(html, /beveiligd zijn'\+\(PRAKSLOT\.eigenLogin\?' met je eigen login':' met een wachtwoord'\)/, "printvenster noemt de eigen login");

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function weigering(eigen) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-beveilighint-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: eigen, PROEF_VERPLICHT: "uit" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = "";
  const bij = (c) => { if (uit.length < 20000) uit += c; };
  app.stdout.on("data", bij);
  app.stderr.on("data", bij);
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const r = await fetch(origin + "/api/kaarten", { method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.7.32." + (eigen === "aan" ? 1 : 2) },
      body: JSON.stringify({ praktijk: "Fysio Onbeveiligd " + eigen, naam: "Sanne", client: { c_naam: "Sanne" },
        chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }) });
    const d = await r.json();
    assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
    return { status: r.status, d };
  } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}

const aan = await weigering("aan");
assert.equal(aan.status, 401);
assert.equal(aan.d.beveilig, true, "onbeveiligde praktijk: delen geweigerd met beveilig");
assert.equal(aan.d.eigenLogin, true, "eigen login verplicht: de weigering zegt het");
assert.doesNotMatch(aan.d.fout, /wachtwoord/i, "eigen login: geen praktijkwachtwoord in de fout");
const uitStand = await weigering("uit");
assert.equal(uitStand.d.beveilig, true);
assert.equal(uitStand.d.eigenLogin, false, "zonder schakelaar: oude uitleg");

console.log("beveilighint: ok (weigering zegt of de eigen login verplicht is; A4-hint en printvenster nemen dat over)");
