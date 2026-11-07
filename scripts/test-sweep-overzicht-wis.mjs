// Gebruikers-sweep 2026-11-07 18u:
// 1. Na "praktijkwachtwoord uit" (eigen logins) kon de praktijkhouder na een verlopen proef
//    de seintjes van patiënten niet meer zien: /v2/proef/overzicht kende alleen naam +
//    praktijkwachtwoord. Nu ook e-mail + eigen wachtwoord van een actief lid (Mark, desktop).
// 2. "Wis Fysiplan van dit apparaat" liet de proefcookie staan: de volgende gebruiker zag
//    naam en e-mail van de proef en kon hem stoppen. Logout met ?apparaat=1 wist hem (Sanne).
// Zonder browser, past in CI. `npm run test:sweepoverzicht`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /function wisApparaat\(\)[\s\S]*?api\/praktijk\/logout\?apparaat=1/, "Wis van dit apparaat wist ook de proefcookie");
const proefHtml = await readFile(join(root, "public/proef.html"), "utf8");
assert.match(proefHtml, /action="\/v2\/proef\/overzicht"[\s\S]*?name="email"[\s\S]*?<\/form>/, "overzicht-formulier heeft een e-mailveld");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sweepov-"));
const dag = 86400000;
const token = randomBytes(24).toString("hex");
const sha = (t) => createHash("sha256").update(t).digest("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000009: { id: "oud0000000000009", email: "mark@sweep.nl", naam: "Mark Test", tel: "+31612340000",
    praktijk: "Fysio Sweep", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(token)] }
}));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio sweep": { "jan k.": { id: "0ad0ad0ad0b1", praktijk: "Fysio Sweep", naam: "Jan K.", ts: Date.now() - 2 * dag,
    chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {}, seintje: { t: Date.now() - 3600000, soort: "vraag" } } }
}));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = "fpproef=" + token;
const overzicht = (velden) => fetch(origin + "/v2/proef/overzicht", { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.1." + (ip++), cookie },
  body: new URLSearchParams(velden).toString() });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Sweep", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Mark", email: "mark@sweep.nl", wachtwoord: "mark-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const M = { "x-praktijk-sessie": (await eigen.json()).sessie };

  // gedeeld wachtwoord nog aan: het oude pad werkt
  const oud = await overzicht({ praktijk: "Fysio Sweep", wachtwoord: "praktijk-wachtwoord" });
  assert.equal(oud.status, 200);
  assert.match(await oud.text(), /Jan K\./);

  assert.equal((await post("/api/praktijk/team/gedeeld-uit", {}, M)).status, 200);
  const dicht = await overzicht({ praktijk: "Fysio Sweep", wachtwoord: "praktijk-wachtwoord" });
  assert.equal(dicht.status, 403, "gedeeld wachtwoord uit: praktijkwachtwoord werkt niet meer");
  assert.match(await dicht.text(), /eigen login/, "de fout wijst naar het e-mailveld");

  const fout = await overzicht({ praktijk: "Fysio Sweep", email: "mark@sweep.nl", wachtwoord: "fout-wachtwoord" });
  assert.equal(fout.status, 403);
  assert.doesNotMatch(await fout.text(), /Jan K\./, "fout eigen wachtwoord: geen kaarten");
  const ander = await overzicht({ praktijk: "Fysio Andere", email: "mark@sweep.nl", wachtwoord: "mark-wachtwoord" });
  assert.equal(ander.status, 403, "eigen login hoort bij een andere praktijknaam");

  const goed = await overzicht({ praktijk: "Fysio Sweep", email: "Mark@Sweep.nl", wachtwoord: "mark-wachtwoord" });
  assert.equal(goed.status, 200, "eigen login opent het overzicht");
  const html = await goed.text();
  assert.match(html, /Jan K\./);
  assert.match(html, /heeft een vraag/);

  // ---- logout: alleen met ?apparaat=1 gaat de proefcookie weg ----
  const gewoon = await fetch(origin + "/api/praktijk/logout", { method: "POST", headers: kop({ ...M, cookie }) });
  assert.equal(gewoon.status, 200);
  assert.equal(gewoon.headers.get("set-cookie"), null, "gewoon uitloggen laat de proef staan");
  const wis = await fetch(origin + "/api/praktijk/logout?apparaat=1", { method: "POST", headers: kop({ cookie }) });
  assert.equal(wis.status, 200);
  assert.match(wis.headers.get("set-cookie") || "", /^fpproef=;[^]*Max-Age=0/, "Wis van dit apparaat wist de proefcookie");

  console.log("test-sweep-overzicht-wis: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
