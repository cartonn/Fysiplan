// Mijn gegevens (/v2/gegevens): de rem telt per e-mailadres, niet per praktijknaam (security 2026-11-12 16u).
// Gebruikers-sweep 2026-11-12 14u (Karin): elke poging van een therapeut (juist wachtwoord, geen beheerder)
// telde als misser op de praktijknaam. Na tien pogingen kon ook de beheerder een kwartier niet downloaden of
// wissen, en dat kon iedereen die alleen de praktijknaam kende.
// - Een collega met het juiste wachtwoord maar zonder beheerdersrol krijgt 403, en dat telt niet als misser.
// - Tien foute wachtwoorden op een ander adres van dezelfde praktijk sluiten de beheerder niet buiten.
// - Tien foute wachtwoorden op het adres van de beheerder zelf zetten dat adres wél op slot (429).
// Zonder browser, past in CI. `npm run test:gegevensrem`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gegevensrem-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let uit = "";
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
// elk verzoek een ander adres: de aanvaller verdeelt zijn pogingen, de rem per verbinding helpt dan niet
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9." + (ip >> 8) + "." + (ip++ & 255) },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Remtest";
const download = (email, wachtwoord) => formulier("/v2/gegevens/download", { praktijk: P, email, wachtwoord });

try {
  await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: "sanne@remtest.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const u = await post("/api/praktijk/team/uitnodigen", { email: "karin@remtest.nl", naam: "Karin", rol: "therapeut" }, S);
  assert.equal(u.status, 200);
  const t = new URL((await u.json()).link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t, naam: "Karin", wachtwoord: "karin-wachtwoord", regels: "1" })).status, 200);

  // de therapeut probeert het twaalf keer met haar eigen, juiste wachtwoord
  for (let i = 0; i < 12; i++) {
    const r = await download("karin@remtest.nl", "karin-wachtwoord");
    assert.equal(r.status, 403, "therapeut poging " + (i + 1) + ": geen beheerder (was na tien keer 429)");
    assert.match(await r.text(), /Alleen een beheerder/);
  }
  assert.equal((await download("sanne@remtest.nl", "sanne-wachtwoord")).status, 200, "de beheerder downloadt nog (was 429: op slot door de therapeut)");

  // een buitenstaander die alleen de praktijknaam kent: tien foute wachtwoorden op een ander adres
  for (let i = 0; i < 11; i++) assert.equal((await download("iemand@buiten.nl", "fout-" + i)).status, i < 10 ? 403 : 429, "buitenstaander poging " + (i + 1));
  for (let i = 0; i < 11; i++) assert.equal((await formulier("/v2/gegevens/download", { praktijk: P, wachtwoord: "fout-" + i })).status, i < 10 ? 403 : 429, "zonder e-mail poging " + (i + 1));
  assert.equal((await download("sanne@remtest.nl", "sanne-wachtwoord")).status, 200, "de beheerder downloadt nog (was 429: op slot door de buitenstaander)");

  // de rem zelf werkt nog: tien foute wachtwoorden op het adres van de beheerder
  for (let i = 0; i < 10; i++) assert.equal((await download("sanne@remtest.nl", "fout-" + i)).status, 403);
  assert.equal((await download("sanne@remtest.nl", "sanne-wachtwoord")).status, 429, "na tien missers op dit adres: op slot, ook met het goede wachtwoord");
  assert.equal((await post("/api/praktijk/login", { email: "sanne@remtest.nl", wachtwoord: "sanne-wachtwoord" })).status, 429,
    "dezelfde rem als bij inloggen in de app (per adres)");

  console.log("test-gegevens-rem: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
