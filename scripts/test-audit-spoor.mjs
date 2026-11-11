// Het logboek per praktijk (Activiteit) is een spoor dat niet door een buitenstaander
// weg te drukken is, en een definitief verwijderde patiëntkaart staat erin.
// Eerst: (1) POST /api/kaarten/verwijder schreef niets in het logboek, terwijl elke
// therapeut van de praktijk elke kaart met video's kon weghalen; (2) het logboek was één
// lijst van 500 regels voor alle praktijken samen: wie zonder login een paar honderd keer
// een kaartroute opvroeg of foute logins op verzonnen namen stuurde, schoof het spoor van
// iedere praktijk eruit (security 2026-11-11 00u). Zonder browser. `npm run test:auditspoor`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, readFile } from "node:fs/promises";
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
const data = await mkdtemp(join(tmpdir(), "fysiplan-audit-"));
const kind = spawn(process.execPath, ["server.js"], {
  env: { ...env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: data, ANTHROPIC_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
kind.stdout.on("data", (b) => (log += b));
kind.stderr.on("data", (b) => (log += b));
const basis = `http://127.0.0.1:${port}`;
let ip = 1;
const nieuwIp = () => { const n = ip++; return "10.14." + (n >> 8) + "." + (n & 255); };
const post = (pad, body, extra = {}) => fetch(basis + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": nieuwIp(), ...extra }, body: JSON.stringify(body) });
const get = (pad, extra = {}) => fetch(basis + pad, { headers: { "x-forwarded-for": nieuwIp(), ...extra } });
const P = "Fysio Auditspoor";

try {
  let klaar = false;
  for (let i = 0; i < 150 && !klaar; i++) {
    try { await fetch(basis + "/health"); klaar = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(klaar, log);

  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "audit-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200, "claimen lukt");
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Piet Jansen", email: "piet@audit.nl", wachtwoord: "piet-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login aangemaakt");
  const S = { "x-praktijk-sessie": (await eigen.json()).sessie };

  const deel = await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
  assert.equal(deel.status, 200, "kaart gedeeld");
  const weg = await post("/api/kaarten/verwijder", { praktijk: P, naam: "Truus" }, S);
  assert.equal(weg.status, 200, "kaart verwijderd");

  // een buitenstaander zonder login: kaartroutes van deze praktijk en foute logins op verzonnen namen
  for (let i = 0; i < 300; i++) {
    const r = await get("/api/kaarten?praktijk=" + encodeURIComponent(P));
    assert.equal(r.status, 401, "zonder login geen kaarten");
  }
  for (let i = 0; i < 300; i++) {
    const r = await post("/api/praktijk/login", { praktijk: "Verzonnen " + i, wachtwoord: "gok" });
    assert.ok([401, 403].includes(r.status), "foute login geweigerd: " + r.status);
  }

  const act = await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), G);
  assert.equal(act.status, 200, "activiteit lezen");
  const lijst = (await act.json()).activiteit;
  const verwijderd = lijst.find((e) => e.actie === "kaart-verwijderd");
  assert.ok(verwijderd, "het verwijderen van de patiëntkaart staat in Activiteit: " + JSON.stringify(lijst.map((e) => e.actie)));
  assert.equal(verwijderd.wie, "Piet Jansen", "met wie het deed");
  assert.ok(lijst.some((e) => e.actie === "geclaimd"), "het beveiligen staat er na de vloed nog in");

  await new Promise((r) => setTimeout(r, 300));
  const bestand = await readFile(join(data, "praktijk-audit.json"), "utf8");
  assert.ok(!bestand.includes("Truus"), "geen kaartnaam in het logboek");
  const regels = JSON.parse(bestand);
  const ruisP = regels.filter((e) => e.praktijk === P.toLowerCase() && e.actie === "toegang-geweigerd").length;
  assert.ok(ruisP <= 50, "geweigerde toegang zonder login heeft een eigen plafond per praktijk: " + ruisP);

  assert.ok(!/TypeError|ReferenceError|at .*server\.js:\d+/.test(log), "geen fout in het serverlog:\n" + log);
  console.log("Auditspoor: kaart verwijderen staat in Activiteit, en een buitenstaander drukt het spoor er niet uit.");
} finally {
  kind.kill();
  await rm(data, { recursive: true, force: true });
}
