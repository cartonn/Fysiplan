// De praktijknaam op de patiëntkaart komt van de beveiligde praktijk zelf, niet uit het verzoek.
// Was: POST /api/kaarten bewaarde de naam die de app als kop meestuurde. Elke collega met een
// sessie (ook rol therapeut, die het profiel niet mag wijzigen) zette zo een willekeurige
// praktijknaam bovenaan de patiëntkaart en in de agenda-uitnodiging, en na het hernoemen van de
// A4-kop toonden kaarten van één praktijk verschillende namen (security-backlog MIDDEL, sweep
// 2026-11-12 06u). Nu: bij een beveiligde praktijk altijd de eigen weergavenaam (profiel, anders
// de naam bij het beveiligen), ook voor kaarten die al met een andere kop op de server staan.
// Zonder browser, past in CI. `npm run test:kaartpraktijknaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartnaam-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let origin = "", uit = "";
async function start() {
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit" };
  delete env.NODE_ENV;
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  return app;
}
const stop = async (app) => { if (app.exitCode !== null || app.signalCode !== null) return; app.kill(); await new Promise((r) => app.once("exit", r)); };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.73.0." + (ip++ % 250 + 1), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const patient = async (id) => {
  const r = await fetch(origin + "/api/kaart?id=" + id, { headers: kop() });
  assert.equal(r.status, 200);
  return r.json();
};
const kaart = (praktijk, naam) => ({ praktijk, naam, kaartId: "", chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} });

let app = await start();
try {
  // ---- 1. beveiligen, daarna een kaart delen met een andere kop ----
  let r = await post("/api/praktijk/claim", { praktijk: "Fysio Zonnig", wachtwoord: "zonnig-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const ses = { "x-praktijk-sessie": (await r.json()).sessie };
  r = await post("/api/kaarten", kaart("Bel 0900-OPLICHTER", "Jan K."), ses);
  assert.equal(r.status, 200, await r.clone().text());
  const { id, ts } = await r.json();
  let k = await patient(id);
  assert.equal(k.kaart.praktijk, "Fysio Zonnig", "de patiënt ziet de naam van de praktijk, niet de meegestuurde kop");
  assert.equal(k.praktijk.praktijk, "Fysio Zonnig", "ook zonder opgeslagen profiel");
  assert.doesNotMatch(JSON.stringify(k), /OPLICHTER/);

  // ---- 2. dezelfde kaart opnieuw openen met de afwijkende kop: geen nieuwe versie ----
  r = await post("/api/kaarten", { ...kaart("Bel 0900-OPLICHTER", "Jan K."), kaartId: id, basisTs: ts }, ses);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ongewijzigd, true, "openen zonder wijziging hoogt de versie niet op");

  // ---- 3. het profiel van de praktijk geeft de naam ----
  r = await post("/api/praktijken", { praktijk: "Fysio Zonnig Zeist", adres: "Laan 1", plaats: "Zeist" }, ses);
  assert.equal(r.status, 200, await r.clone().text());
  k = await patient(id);
  assert.equal(k.kaart.praktijk, "Fysio Zonnig Zeist");
  assert.equal(k.praktijk.praktijk, "Fysio Zonnig Zeist");

  // ---- 4. een kaart die al met een vreemde kop op de server staat ----
  await stop(app);
  const alle = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  const pk = Object.keys(alle).find((s) => alle[s]["jan k."]);
  assert.ok(pk);
  alle[pk]["oud"] = { id: "aabbccddeeff", praktijk: "Andere Kliniek", naam: "Oud", ts: Date.now(), maker: null,
    chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {}, afspraak: { t: Date.now() + 86400000 } };
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(alle));
  app = await start();
  k = await patient("aabbccddeeff");
  assert.equal(k.kaart.praktijk, "Fysio Zonnig Zeist", "een oude kop wordt bij het lezen vervangen");
  const ics = await (await fetch(origin + "/api/kaart/afspraak.ics?id=aabbccddeeff", { headers: kop() })).text();
  assert.match(ics, /SUMMARY:.*Fysio Zonnig Zeist/, "ook in de agenda-uitnodiging");
  assert.doesNotMatch(ics, /Andere Kliniek/);

  // ---- 5. zonder account (v1, beheer) blijft de opgeslagen naam ----
  alle["fysio los"] = { "piet": { id: "112233445566", praktijk: "Fysio Los", naam: "Piet", ts: Date.now(),
    chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} } };
  await stop(app);
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(alle));
  app = await start();
  k = await patient("112233445566");
  assert.equal(k.kaart.praktijk, "Fysio Los");
  assert.equal(k.praktijk.praktijk, "Fysio Los");
  console.log("test-kaart-praktijknaam: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
