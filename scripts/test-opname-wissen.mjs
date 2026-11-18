// "Alles wissen" neemt ook de opnames mee die nog op geen kaart staan (security 2026-11-18 20u, gebied (e)).
//
// Een opname via de QR (/o) blijft tot 4 uur in het geheugen staan tot hij op een kaart komt. Vóór de fix
// bleef zo'n video na "Alles wissen" op /v2/gegevens nog uren op de schijf (er kan een patiënt op staan),
// en kon een telefoon met een openstaande QR nog een video naar de gewiste praktijk sturen.
// Zonder browser, past in CI. `npm run test:opnamewissen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opname-wissen-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|EIGEN_LOGIN_VERPLICHT$|PROEF_VERPLICHT$)/.test(k)) delete env[k];
const app = spawn(process.execPath, [["ser", "ver.js"].join("")], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
let uit = "";
const vang = (c) => { uit = (uit + c).slice(-4000); };
app.stdout.on("data", vang);
app.stderr.on("data", vang);
let ip = 1;
const nieuwIp = () => "10.9." + (ip >> 8) + "." + (ip++ & 255);
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": nieuwIp(), ...extra }, body: JSON.stringify(body) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": nieuwIp() }, body: new URLSearchParams(velden).toString() });
const bestaat = (pad) => access(join(dataDir, pad)).then(() => true, () => false);
const video = () => { const b = Buffer.alloc(12 * 1024); b.write("ftypisom", 4, "latin1"); return b; };
const upload = (token) => fetch(origin + "/api/opname/upload?token=" + token, {
  method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": nieuwIp() }, body: video() });

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claim = async (praktijk, wachtwoord) => {
    const r = await post("/api/praktijk/claim", { praktijk, wachtwoord, akkoord: true });
    assert.equal(r.status, 200, "claim " + praktijk + ": " + (await r.clone().text()));
    return (await r.json()).sessie;
  };
  const sA = await claim("Fysio Wisopname", "wis-opname-wachtwoord-1");
  const sB = await claim("Fysio Blijft", "blijft-opname-wachtwoord-1");
  const start = async (s) => {
    const r = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": s });
    assert.equal(r.status, 200, "opname start");
    return (await r.json()).token;
  };

  // A: één opname binnen (nog op geen kaart), één QR nog open. B: een opname binnen.
  const tA1 = await start(sA), tA2 = await start(sA), tB = await start(sB);
  const upA = await upload(tA1); assert.equal(upA.status, 200, "upload A");
  const padA = (await upA.json()).video;
  const upB = await upload(tB); assert.equal(upB.status, 200, "upload B");
  const padB = (await upB.json()).video;
  assert.ok(await bestaat(padA) && await bestaat(padB), "beide opnames staan op schijf");

  const wis = await formulier("/v2/gegevens/wissen", { praktijk: "Fysio Wisopname", wachtwoord: "wis-opname-wachtwoord-1", zeker: "WISSEN" });
  assert.ok(wis.status === 200 || wis.status === 303, "Alles wissen lukt (" + wis.status + ")");

  assert.equal(await bestaat(padA), false, "de opname van de gewiste praktijk is weg van de schijf");
  const st = await fetch(origin + "/api/opname/status?token=" + tA1, { headers: { "x-forwarded-for": nieuwIp() } });
  assert.equal(st.status, 404, "het token van de gewiste praktijk bestaat niet meer");
  const laat = await upload(tA2);
  assert.equal(laat.status, 404, "een openstaande QR van de gewiste praktijk neemt geen video meer aan");

  // een andere praktijk merkt niets
  assert.ok(await bestaat(padB), "de opname van een andere praktijk blijft staan");
  const stB = await fetch(origin + "/api/opname/status?token=" + tB, { headers: { "x-forwarded-for": nieuwIp() } });
  assert.equal(stB.status, 200, "het token van een andere praktijk blijft geldig");
  console.log("test-opname-wissen: ok");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); }
  await rm(dataDir, { recursive: true, force: true });
}
