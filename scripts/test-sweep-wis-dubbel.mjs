// Regressietest gebruikers-sweep 2026-11-18 06u (MIDDEL, Karin, iPad): een dubbeltik op "Alles wissen" op
// /v2/gegevens stuurde het formulier twee keer. Het eerste verzoek wiste alles, het tweede kreeg 403 ("Die code
// klopt niet" of "horen niet bij een beheerder") en dat antwoord bleef in de browser staan: de beheerder dacht
// dat er niets gewist was. Nu zegt het tweede verzoek van dezelfde verbinding dat alles al gewist is.
// Een ander adres of een andere verbinding krijgt gewoon de normale weigering.
// Zonder browser, past in CI. `npm run test:wisdubbel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wisdubbel-"));
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
const post = (pad, body, extra = {}, ip = "10.8.1.1") => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": ip, ...extra }, body: JSON.stringify(body) });
const formulier = (pad, velden, ip) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: new URLSearchParams(velden).toString() });
const P = "Fysio Dubbeltik";

try {
  await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin", email: "karin@dubbeltik.nl", wachtwoord: "karin-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const S = { "x-praktijk-sessie": (await eigen.json()).sessie };
  assert.equal((await post("/api/kaarten", { praktijk: P, naam: "Kees", client: { c_naam: "Kees" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).status, 200);

  const velden = { praktijk: P, email: "karin@dubbeltik.nl", wachtwoord: "karin-wachtwoord", zeker: "WISSEN" };
  // dubbeltik: twee keer tegelijk vanaf dezelfde iPad
  const [a, b] = await Promise.all([formulier("/v2/gegevens/wissen", velden, "10.8.2.2"), formulier("/v2/gegevens/wissen", velden, "10.8.2.2")]);
  const ta = await a.text(), tb = await b.text();
  assert.equal(a.status, 200, "eerste verzoek wist");
  assert.match(ta, /is gewist/);
  assert.equal(b.status, 200, "tweede verzoek: geen 403 meer (was 'horen niet bij een beheerder' of 'code klopt niet')");
  assert.match(tb, /al gewist/);
  assert.doesNotMatch(tb, /role="alert"/);
  // een tik later op dezelfde iPad zegt hetzelfde
  const c = await formulier("/v2/gegevens/wissen", velden, "10.8.2.2");
  assert.equal(c.status, 200);
  assert.match(await c.text(), /al gewist/);
  // echt gewist: inloggen werkt niet meer
  assert.notEqual((await post("/api/praktijk/login", { praktijk: P, email: "karin@dubbeltik.nl", wachtwoord: "karin-wachtwoord" })).status, 200);
  // een andere verbinding hoort niets over het wissen: de gewone weigering
  const d = await formulier("/v2/gegevens/wissen", velden, "10.8.3.3");
  assert.equal(d.status, 403);
  assert.match(await d.text(), /horen niet bij een beheerder/);
  // downloaden na het wissen is nooit "al gewist", maar gewoon geweigerd
  const e = await formulier("/v2/gegevens/download", velden, "10.8.2.2");
  assert.equal(e.status, 403);
  // dezelfde naam meteen opnieuw in gebruik en weer wissen vanaf dezelfde iPad: dat wist echt (geen "al gewist")
  const claim2 = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord-2", akkoord: true }, {}, "10.8.4.4");
  assert.equal(claim2.status, 200);
  const G2 = { "x-praktijk-sessie": (await claim2.json()).sessie };
  assert.equal((await post("/api/praktijk/team/eigen-login", { naam: "Karin", email: "karin@dubbeltik.nl", wachtwoord: "karin-wachtwoord", regels: true }, G2, "10.8.4.4")).status, 200);
  const f = await formulier("/v2/gegevens/wissen", velden, "10.8.2.2");
  assert.equal(f.status, 200);
  const tf = await f.text();
  assert.match(tf, /is gewist/);
  assert.doesNotMatch(tf, /al gewist/);
  assert.notEqual((await post("/api/praktijk/login", { praktijk: P, email: "karin@dubbeltik.nl", wachtwoord: "karin-wachtwoord" }, {}, "10.8.5.5")).status, 200);
  console.log("test-sweep-wis-dubbel: OK");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
