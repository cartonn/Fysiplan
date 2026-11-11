// Security (2026-11-11, doorgezet door de gebruikers-sweep): POST /api/praktijken had alleen
// `eisBeveiligdePraktijk`. Een collega met rol therapeut kon zo telefoon, e-mail, website en
// logo van de praktijk vervangen; die staan bij de praktijknaam op elke patiëntkaart (/k).
// Repro: therapeut stuurt {tel:"0900-OPLICHTER", website:"https://example.org/phish"} → 200,
// en elke patiënt zag dat nummer en die link; geen regel in het logboek.
// Nu: wijzigen alleen door een beheerder (403 voor een therapeut), een ongewijzigd profiel
// blijft 200 (de app stuurt het bij elk verlaten van een veld), en elke wijziging staat als
// "profiel-gewijzigd" met wie het deed in Activiteit.
// Zonder browser. `npm run test:profielbeheer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-profielbeheer-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.61.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.61.1." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Profiel", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Sanne Beheer", email: "sanne@profiel.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const S = ses(await eigen.json());

  const echt = { praktijk: "Fysio Profiel", adres: "Echte straat 1", plaats: "Utrecht", tel: "030-1234567", email: "info@profiel.nl", website: "https://profiel.nl" };
  let r = await post("/api/praktijken", echt, S);
  assert.equal(r.status, 200, "beheerder bewaart het profiel");

  // collega met rol therapeut
  const uitn = await post("/api/praktijk/team/uitnodigen", { email: "joris@profiel.nl", naam: "Joris", rol: "therapeut" }, S);
  assert.equal(uitn.status, 200);
  const token = new URL((await uitn.json()).link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: token, naam: "Joris Therapeut", wachtwoord: "joris-wachtwoord", regels: "1" })).status, 200);
  const lJ = await post("/api/praktijk/login", { email: "joris@profiel.nl", wachtwoord: "joris-wachtwoord" });
  assert.equal(lJ.status, 200);
  const J = ses(await lJ.json());

  // kaart, zodat we zien wat de patiënt te zien krijgt
  const kaart = await post("/api/kaarten", { praktijk: "Fysio Profiel", naam: "Anna", client: { c_naam: "Anna" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, J);
  assert.equal(kaart.status, 200);
  const kid = (await kaart.json()).id;
  const opKaart = async () => (await (await get("/api/kaart?id=" + kid)).json()).praktijk;

  // 1. therapeut stuurt het ongewijzigde profiel (de app doet dat bij elk verlaten van een veld): gewoon 200
  r = await post("/api/praktijken", echt, J);
  assert.equal(r.status, 200, "ongewijzigd profiel door een therapeut blijft 200");

  // 2. therapeut vervangt telefoon en website: geweigerd, patiënt ziet nog het echte nummer
  r = await post("/api/praktijken", { ...echt, tel: "0900-OPLICHTER", website: "https://example.org/phish" }, J);
  assert.equal(r.status, 403, "therapeut mag het praktijkprofiel niet wijzigen (was " + r.status + ")");
  assert.match((await r.json()).fout, /beheerder/);
  r = await post("/api/praktijken", { ...echt, logo: "data:image/png;base64," + png.toString("base64") }, J);
  assert.equal(r.status, 403, "therapeut mag het logo niet vervangen");
  let p = await opKaart();
  assert.equal(p.tel, "030-1234567", "patiënt ziet het echte nummer");
  assert.equal(p.website, "https://profiel.nl", "patiënt ziet de echte website");
  assert.ok(!p.logo, "geen logo van de therapeut");

  // 3. beheerder wijzigt: mag, en staat in Activiteit met wie het deed
  r = await post("/api/praktijken", { ...echt, tel: "030-7654321" }, S);
  assert.equal(r.status, 200, "beheerder wijzigt het profiel");
  assert.equal((await opKaart()).tel, "030-7654321");
  const act = await (await get("/api/praktijk/activiteit?praktijk=Fysio%20Profiel", S)).json();
  assert.ok(act.activiteit.some((e) => e.actie === "profiel-gewijzigd" && e.wie === "Sanne Beheer"), "wijziging staat in Activiteit");

  // 4. gedeeld praktijkwachtwoord (geen lid) is beheer zoals voorheen
  r = await post("/api/praktijken", { ...echt, tel: "030-1111111" }, G);
  assert.equal(r.status, 200, "sessie met het gedeelde praktijkwachtwoord blijft beheer");

  const audit = await readFile(join(dataDir, "praktijk-audit.json"), "utf8").catch(() => "");
  if (audit) assert.doesNotMatch(audit, /030-1111111|OPLICHTER/, "logboek bevat geen profielinhoud");
  assert.doesNotMatch(uit, /verzoek mislukt/);
  console.log("test-profiel-beheer: ok");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
