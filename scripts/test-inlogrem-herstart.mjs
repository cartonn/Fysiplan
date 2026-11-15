// De inlogrem per praktijk overleeft een herstart (security 2026-11-15 12u).
// Tien foute pogingen op één praktijk binnen een kwartier zetten die praktijk op slot, ongeacht
// het IP. De teller stond alleen in het geheugen: elke uitrol (ruim twintig per dag) gaf een
// aanvaller die zijn pogingen over veel IP's verdeelt tien nieuwe pogingen, ook midden in een slot.
// - Na tien missers vanaf tien verschillende IP's: op slot, ook het goede wachtwoord.
// - Na een herstart (SIGTERM, zelfde datamap): nog steeds op slot.
// - Op schijf staat geen praktijknaam, alleen een hash; kapotte en verlopen rijen vallen weg.
// - Een geslaagde login maakt de teller schoon, ook na een herstart.
// Zonder browser, past in CI. `npm run test:inlogremherstart`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InlogRem, laadRem, remSleutel, REM_MS } from "../lib/inlogrem.js";

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const data = await mkdtemp(join(tmpdir(), "fysiplan-inlogremherstart-"));
const remPad = join(data, "inlogrem.json");

// ---- 1. de tabel zelf ----
{
  const bewaard = [];
  const rem = new InlogRem(async (inhoud) => { bewaard.push(JSON.parse(JSON.stringify(inhoud))); }).vul([]);
  for (let i = 0; i < 9; i++) rem.tel("fysio geheim");
  assert.equal(rem.opSlot("fysio geheim"), false, "negen missers: nog niet op slot");
  rem.tel("fysio geheim");
  assert.equal(rem.opSlot("fysio geheim"), true, "tien missers: op slot");
  await rem.opSchijf();
  const laatst = bewaard.at(-1);
  assert.doesNotMatch(JSON.stringify(laatst), /fysio geheim/, "geen praktijknaam op schijf");
  assert.deepEqual(Object.keys(laatst.rem), [remSleutel("fysio geheim")]);
  assert.equal(laatst.rem[remSleutel("fysio geheim")].n, 10, "de teller staat op schijf, ook na tellen");
  // een kwartier later begint het opnieuw
  assert.equal(rem.opSlot("fysio geheim", Date.now() + REM_MS + 1000), false);
  rem.delete("fysio geheim");
  await rem.opSchijf();
  assert.deepEqual(bewaard.at(-1).rem, {}, "schoon na een geslaagde login");

  // /privacy#inloggen: een hash blijft hooguit een half uur staan. Een verlopen teller van een
  // ander gaat weg bij de volgende misser, ook op schijf (legal 2026-11-15).
  {
    const nu0 = Date.now();
    rem.tel("oude praktijk", nu0);
    rem.tel("nieuwe praktijk", nu0 + REM_MS + 1000);
    await rem.opSchijf();
    assert.deepEqual(Object.keys(bewaard.at(-1).rem), [remSleutel("nieuwe praktijk")], "verlopen teller weg bij de volgende misser");
    rem.ruimOp(nu0 + 2 * REM_MS + 2000);
    await rem.opSchijf();
    assert.deepEqual(bewaard.at(-1).rem, {}, "ruimOp haalt verlopen tellers weg, ook op schijf");
  }

  // inlezen: alleen rijen die nog gelden
  const nu = Date.now();
  await writeFile(remPad, JSON.stringify({ v: 1, rem: {
    [remSleutel("a")]: { start: nu - 1000, n: 10 },
    [remSleutel("b")]: { start: nu - REM_MS - 1000, n: 10 },  // verlopen
    [remSleutel("c")]: { start: nu + 3600000, n: 10 },        // uit de toekomst
    [remSleutel("d")]: { start: nu - 1000, n: "10" },         // geen getal
    [remSleutel("e")]: { start: nu - 1000, n: 0 },
    "geen-hash": { start: nu - 1000, n: 10 }
  } }));
  assert.deepEqual(await laadRem(remPad, nu), [[remSleutel("a"), { start: nu - 1000, n: 10 }]]);
  await writeFile(remPad, "{ kapot");
  assert.deepEqual(await laadRem(remPad), [], "kapot bestand = lege rem");
  assert.deepEqual(await laadRem(join(data, "bestaat-niet.json")), []);
  await writeFile(remPad, JSON.stringify({ v: 1, rem: [1, 2] }));
  assert.deepEqual(await laadRem(remPad), []);
  await rm(remPad, { force: true });
}

// ---- 2. de server, met een herstart ertussen ----
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const env = { ...process.env };
for (const k of ["ADMIN_KEY", "RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "NODE_ENV", "EIGEN_LOGIN_VERPLICHT", "PROEF_VERPLICHT"]) delete env[k];
let kind = null, log = "", basis = "";
async function start() {
  const port = await vrijePoort();
  basis = `http://127.0.0.1:${port}`;
  kind = spawn(process.execPath, ["server.js"], { env: { ...env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: data }, stdio: ["ignore", "pipe", "pipe"] });
  kind.stdout.on("data", (b) => (log += b));
  kind.stderr.on("data", (b) => (log += b));
  for (let i = 0; i < 150; i++) {
    try { await fetch(basis + "/health"); return; } catch { await wacht(100); }
  }
  assert.fail("server start niet\n" + log);
}
async function stop() {
  if (!kind || kind.exitCode !== null) return;
  const weg = new Promise((r) => kind.once("exit", r));
  kind.kill("SIGTERM");
  await weg;
}
const post = (pad, body, ip) => fetch(basis + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
const login = (ww, ip) => post("/api/praktijk/login", { praktijk: "Fysio Slot", wachtwoord: ww }, ip);

try {
  await start();
  const c = await post("/api/praktijk/claim", { praktijk: "Fysio Slot", wachtwoord: "goed-wachtwoord", akkoord: true }, "10.8.0.1");
  assert.equal(c.status, 200, "claimen lukt");

  // tien missers, elk vanaf een ander IP (de rem per IP grijpt dus niet)
  for (let i = 0; i < 10; i++) {
    const r = await login("fout-" + i, "10.8.1." + (i + 1));
    assert.ok([401, 403].includes(r.status), "foute poging geweigerd: " + r.status);
  }
  assert.equal((await login("goed-wachtwoord", "10.8.2.1")).status, 429, "op slot: ook het goede wachtwoord niet");

  const opSchijf = await readFile(remPad, "utf8");
  assert.doesNotMatch(opSchijf.toLowerCase(), /fysio slot/, "geen praktijknaam in inlogrem.json");

  await stop();
  await start();
  assert.equal((await login("goed-wachtwoord", "10.8.3.1")).status, 429, "na een herstart nog steeds op slot");

  // een kwartier later (hier: het bestand terug in de tijd gezet) logt het goede wachtwoord in,
  // en dat maakt de teller schoon, ook op schijf
  await stop();
  const inhoud = JSON.parse(await readFile(remPad, "utf8"));
  for (const r of Object.values(inhoud.rem)) r.start -= REM_MS + 1000;
  await writeFile(remPad, JSON.stringify(inhoud));
  await start();
  assert.equal((await login("goed-wachtwoord", "10.8.4.1")).status, 200, "na het kwartier weer binnen");
  for (let i = 0; i < 3; i++) await login("fout-" + i, "10.8.5." + (i + 1));
  assert.equal((await login("goed-wachtwoord", "10.8.6.1")).status, 200, "geslaagd: teller schoon");
  await stop();
  const naLogin = JSON.parse(await readFile(remPad, "utf8"));
  assert.equal(Object.values(naLogin.rem).length, 0, "na de geslaagde login staat er niets meer op schijf");

  console.log("inlogrem overleeft een herstart: ok");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  await stop();
  await rm(data, { recursive: true, force: true });
}
