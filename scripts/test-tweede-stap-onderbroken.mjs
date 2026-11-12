// Gebruikers-sweep 2026-11-12 18u (Sanne, desktop): wie het beveiligen onderbrak vóór de tweede stap
// (herladen, tab dicht), zag "Deze praktijk is beveiligd", een leeg e-mailveld en het advies "Kies
// 'Andere praktijk met deze naam'". Dat advies maakte een tweede praktijk met dezelfde naam en
// hetzelfde adres; daarna gaf inloggen 409 "kies" met twee gelijke namen: buitengesloten.
// - De status zegt op het apparaat van de proef dat de naam van haar is (vanMij) en dat de tweede
//   stap nog open staat (stapOpen); een ander apparaat hoort dat niet.
// - "Andere praktijk met deze naam" met hetzelfde e-mailadres geeft 409 en maakt niets aan.
// - Opnieuw inloggen gaat verder met de tweede stap; daarna is stapOpen weg.
// - Een echte andere praktijk (ander adres) kan nog steeds dezelfde naam kiezen.
// Zonder browser, past in CI. `npm run test:tweedestaponderbroken`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. de app ----
{
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  assert.match(idx, /PRAKSLOT\.vanMij=!!d\.vanMij;PRAKSLOT\.stapOpen=!!d\.stapOpen/, "de app leest vanMij en stapOpen uit de status");
  assert.match(idx, /function andereNaamZin\(\)/, "de zin over een andere praktijk hangt af van vanMij");
  assert.doesNotMatch(idx, /niet ingelogd\. Log in (via|onder) Kaarten\. Heet een andere praktijk/, "geen vast advies 'Andere praktijk' meer in het QR-vak of de melding");
  assert.match(idx, /if\(nw&&PRAKSLOT\.vanMij\)\{nw\.remove\(\)/, "het slot biedt 'Andere praktijk met deze naam' niet aan bij de eigen praktijk");
  assert.match(idx, /PRAKSLOT\.vanMij&&!em\.value&&PRAKSLOT\.voorstel&&PRAKSLOT\.voorstel\.email\)em\.value=/, "het e-mailveld staat al ingevuld");
  assert.match(idx, /je tweede stap is nog niet af/, "het slot zegt dat de tweede stap nog open staat");
}

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-stapopen-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const tokA = randomBytes(24).toString("hex"), tokB = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proefsanne000001: { id: "proefsanne000001", email: "sanne@nieuw.invalid", naam: "Sanne de Vries", tel: "+31612340000", akkoord: "x",
    praktijk: "Fysio Duin", gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, tokens: [sha(tokA)] },
  proefander000001: { id: "proefander000001", email: "ander@elders.invalid", naam: "Piet Ander", tel: "+31612340001", akkoord: "x",
    praktijk: "Fysio Duin", gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, tokens: [sha(tokB)] }
}));
const A = { cookie: "fpproef=" + tokA }, B = { cookie: "fpproef=" + tokB };

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
  ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "", EIGEN_LOGIN_VERPLICHT: "aan", PROEF_VERPLICHT: "aan" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV") delete kind[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.77.0." + (ip++ % 250 + 1), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const status = async (naam, extra) => (await fetch(origin + "/api/praktijk/status?praktijk=" + encodeURIComponent(naam), { headers: kop(extra) })).json();
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const aantal = async (naam) => Object.values(await accounts()).filter((a) => a.naam === naam).length;
const claimLijf = (email, extra = {}) => ({ praktijk: "Fysio Duin", wachtwoord: "Lang-wachtwoord-2026!", naam: "Sanne de Vries", email,
  akkoord: true, regels: true, ...extra });

try {
  // beveiligen: eigen login gemaakt, tweede stap nog niet ingesteld ... en dan herlaadt Sanne
  let r = await post("/api/praktijk/claim", claimLijf("sanne@nieuw.invalid"), A);
  let d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.stapInstellen, true);

  d = await status("Fysio Duin", A);
  assert.equal(d.geclaimd, true);
  assert.equal(d.ingelogd, false);
  assert.equal(d.vanMij, true, "op het apparaat van de proef is de naam van haar: " + JSON.stringify(d));
  assert.equal(d.stapOpen, true, "en de tweede stap staat nog open");
  assert.equal(d.voorstel.email, "sanne@nieuw.invalid");
  const vreemd = await status("Fysio Duin", {});
  assert.equal(vreemd.vanMij, undefined, "een ander apparaat hoort niets over de login");
  assert.equal(vreemd.stapOpen, undefined);
  const anderePr = await status("Fysio Duin", B);
  assert.equal(anderePr.vanMij, undefined, "een andere proef (ander adres) is niet de eigenaar");

  // het oude advies volgen: andere praktijk met deze naam, zelfde adres -> geweigerd, niets aangemaakt
  r = await post("/api/praktijk/claim", claimLijf("Sanne@Nieuw.invalid", { nieuw: true }), A);
  d = await r.json();
  assert.equal(r.status, 409, JSON.stringify(d));
  assert.equal(d.vanMij, true);
  assert.match(d.fout, /die van jou/);
  assert.equal(await aantal("Fysio Duin"), 1, "geen tweede praktijk met dezelfde naam en hetzelfde adres");

  // opnieuw inloggen: de tweede stap gaat verder, en met de code is ze binnen
  r = await post("/api/praktijk/login", { email: "sanne@nieuw.invalid", wachtwoord: "Lang-wachtwoord-2026!" }, A);
  d = await r.json();
  assert.equal(d.stapInstellen, true, JSON.stringify(d));
  r = await post("/api/praktijk/login", { email: "sanne@nieuw.invalid", wachtwoord: "Lang-wachtwoord-2026!", geheim: d.geheim, code: codeVoor(d.geheim, stapVan(Date.now())) }, A);
  d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.ok(d.sessie);
  d = await status("Fysio Duin", A);
  assert.equal(d.stapOpen, undefined, "na het instellen staat er niets meer open (niet ingelogd op dit verzoek)");
  assert.equal(d.vanMij, true);

  // een echt andere praktijk met dezelfde naam kan nog steeds
  r = await post("/api/praktijk/claim", { ...claimLijf("ander@elders.invalid", { nieuw: true }), naam: "Piet Ander" }, B);
  d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(await aantal("Fysio Duin"), 2);
  assert.doesNotMatch(log, /TypeError|ReferenceError/);
  console.log("PASS tweede stap onderbroken: status vanMij/stapOpen, geen tweede praktijk met hetzelfde adres, inloggen gaat verder, andere praktijk kan nog");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
