// Security-routine 2026-11-20 12u (vraag gebruikers-sweep 2026-11-20 02u, Karin):
// de lees- en schrijfrem met een sessie telde per praktijk voor het hele team samen
// (600 lezen / 200 schrijven per 5 min). Eén collega, of één vastgelopen tabblad, die
// dat haalde, zette iedereen in de praktijk vijf minuten op 429. Nu heeft elke login
// een eigen bak met die grens, en is de praktijkbak een plafond voor het hele team.
// Zonder browser, past in CI. `npm run test:remperlogin`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const s0 = createServer();
await new Promise((r) => s0.listen(0, "127.0.0.1", r));
const port = s0.address().port;
await new Promise((r) => s0.close(r));
const data = await mkdtemp(join(tmpdir(), "fysiplan-remlogin-"));
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || ["NODE_ENV", "EIGEN_LOGIN_VERPLICHT", "PROEF_VERPLICHT"].includes(k)) delete env[k];
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: data, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
app.stdout.on("data", (b) => (log += b));
app.stderr.on("data", (b) => (log += b));
const basis = `http://127.0.0.1:${port}`;
const WIFI = "10.94.0.1"; // het hele team zit achter één wifi
const post = (pad, body, extra = {}) => fetch(basis + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": WIFI, ...extra }, body: JSON.stringify(body) });
const get = (pad, extra = {}) => fetch(basis + pad, { headers: { "x-forwarded-for": WIFI, ...extra } });
const adres = (naam) => [naam, "remlogin.nl"].join("@");
const P = "Fysio Remlogin";

try {
  let klaar = false;
  for (let i = 0; i < 150 && !klaar; i++) {
    try { await fetch(basis + "/health"); klaar = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(klaar, log);

  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200, "claimen lukt");
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const a = await post("/api/praktijk/team/eigen-login", { naam: "Anna de Vries", email: adres("anna"), wachtwoord: "anna-wachtwoord", regels: true }, G);
  assert.equal(a.status, 200, "eigen login Anna");
  const A = { "x-praktijk-sessie": (await a.json()).sessie };
  const b = await post("/api/praktijk/team/eigen-login", { naam: "Bas Bakker", email: adres("bas"), wachtwoord: "bas-wachtwoord", regels: true }, G);
  assert.equal(b.status, 200, "eigen login Bas");
  const B = { "x-praktijk-sessie": (await b.json()).sessie };

  // 1) Anna ververst 600 keer: dat mag, de 601e niet (grens per login blijft 600)
  for (let i = 0; i < 600; i++) {
    const r = await get("/api/praktijk/status", A);
    assert.notEqual(r.status, 429, "leesactie " + (i + 1) + " van Anna gaf al 429");
    await r.arrayBuffer();
  }
  const vol = await get("/api/praktijk/status", A);
  assert.equal(vol.status, 429, "Anna zelf loopt na 600 keer lezen vast");
  // 2) Bas en het gedeelde wachtwoord merken daar niets van (was: hele praktijk 429)
  const bas = await get("/api/praktijk/status", B);
  assert.equal(bas.status, 200, "Bas kan nog lezen terwijl Anna vastzit (was 429 voor het hele team)");
  assert.equal((await get("/api/praktijk/status", G)).status, 200, "het gedeelde wachtwoord kan nog lezen");

  // 3) schrijven: Anna haalt 200, Bas schrijft gewoon door
  let annaUit = 0;
  for (let i = 0; i < 201; i++) annaUit = (await post("/api/praktijken", { praktijk: P, adres: "Laan " + i }, A)).status;
  assert.equal(annaUit, 429, "Anna loopt na 200 schrijfacties zelf vast");
  assert.equal((await post("/api/praktijken", { praktijk: P, adres: "Weg 1" }, B)).status, 200, "Bas kan nog schrijven");

  // 4) een sessie is geen vrijbrief: het team samen heeft een plafond (4 × 200 schrijven)
  let teller = 0, eerste429 = 0;
  const logins = [B, G];
  for (let i = 0; i < 4; i++) {
    const c = await post("/api/praktijk/team/eigen-login", { naam: "Collega " + i, email: adres("c" + i), wachtwoord: "collega-ww-" + i, regels: true }, G);
    assert.equal(c.status, 200, "eigen login collega " + i);
    logins.push({ "x-praktijk-sessie": (await c.json()).sessie });
  }
  outer: for (const L of logins) {
    for (let i = 0; i < 150; i++) { // onder de grens per login: alleen het plafond kan hier 429 geven
      teller++;
      const r = await post("/api/praktijken", { praktijk: P, adres: "Pad " + teller }, L);
      if (r.status === 429) { eerste429 = teller; break outer; }
    }
  }
  // Anna 200 + Bas 1 + team samen tot 800: het plafond valt rond 600 extra, niet pas bij 6 × 200
  assert.ok(eerste429 > 500 && eerste429 <= 600,"praktijkplafond houdt het team samen tegen (eerste 429 na " + eerste429 + ")");

  assert.ok(!/TypeError|ReferenceError|at .*server\.js:\d+/.test(log), "geen fout in het serverlog:\n" + log);
  console.log("ok: lees- en schrijfrem per login; één collega zet alleen zichzelf vast, het team heeft een plafond");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r)));
  await rm(data, { recursive: true, force: true });
}
