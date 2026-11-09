// Security (2026-11-09): twee manieren waarop een proef zonder abonnement de bewaarregels omzeilde
// of waarop een klant onterecht kon verdwijnen. Zonder browser. `npm run test:proefarchief`
// 1. Na een verlopen proef zette archiveren/terugzetten de bewaartermijn van een kaart steeds
//    opnieuw (aan/uit/aan = steeds 30 dagen vanaf nu): kaarten bleven onbeperkt leven.
//    Nu mag archiveren dan alleen als de kaart daardoor niet later verloopt.
// 2. Was proef-aanmeldingen.json onleesbaar, dan zag de server geen enkele aanmelding en wiste
//    het uurlijkse rondje elk praktijkaccount met een oude proef en zonder kaarten, ook klanten.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-archief-"));
const nu = Date.now();
const dag = 86400000;
const token = "c".repeat(48);
const hash = (t) => createHash("sha256").update(t).digest("hex");
const P = "Fysio Archieftest", WW = "archief-wachtwoord-1";
const proefJson = (verloopt, extra = {}) => JSON.stringify({ p1: { id: "p1", email: "p1@praktijk.nl", naam: "Therapeut Een",
  tel: "+31612345678", praktijk: P, gestart: nu - 20 * dag, verloopt, akkoord: nu - 20 * dag, tokens: [hash(token)], ...extra } });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), proefJson(nu + 5 * dag));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
async function start() {
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));

let app = await start();
try {
  // beveiligen tijdens de proef: het account krijgt het proefslot
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: WW, akkoord: true }, { cookie: "fpproef=" + token });
  assert.equal(claim.status, 200, "beveiligen");
  await stop(app);
  const accounts = await lees("praktijk-accounts.json");
  const pk = Object.keys(accounts).find((k) => accounts[k].proef?.id === "p1");
  assert.ok(pk, "account gekoppeld aan de proef");

  // ---- 1. proef twee dagen voorbij; k1 zou over 10 dagen verlopen, k2 over 89 ----
  accounts[pk].proef.verloopt = nu - 2 * dag;
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accounts));
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), proefJson(nu - 2 * dag));
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ [pk]: {
    truus: { id: "k1aaaaaaaaaa", naam: "Truus", oefeningen: [], ts: nu - 80 * dag },
    jan: { id: "k2bbbbbbbbbb", naam: "Jan", oefeningen: [], ts: nu - dag } } }));
  app = await start();
  const login = await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW });
  assert.equal(login.status, 200, "inloggen blijft werken na de proef");
  const sessie = (await login.json()).sessie;
  const archief = (id, aan) => post("/api/kaart/archief", { praktijk: P, id, archief: aan }, { "x-praktijk-sessie": sessie });

  const r1 = await archief("k1aaaaaaaaaa", true);
  assert.equal(r1.status, 403, "archiveren dat de bewaartermijn verlengt, is dicht na de proef");
  assert.equal((await r1.json()).proefVerlopen, true);
  assert.ok(!(await lees("kaarten.json"))[pk].truus.gearchiveerd, "k1 bleef ongewijzigd");

  const r2 = await archief("k2bbbbbbbbbb", true);
  assert.equal(r2.status, 200, "archiveren dat de termijn inkort, mag gewoon");
  const r3 = await archief("k2bbbbbbbbbb", false);
  assert.equal(r3.status, 403, "terugzetten dat de termijn weer verlengt, is dicht na de proef");
  assert.ok((await lees("kaarten.json"))[pk].jan.gearchiveerd, "k2 blijft gearchiveerd");
  await stop(app);

  // ---- 2. onleesbaar aanmeldingenbestand: oude proef, geen kaarten, maar klant ----
  accounts[pk].proef.verloopt = nu - 120 * dag;
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accounts));
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({}));
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), proefJson(nu - 120 * dag, { klant: true }).slice(0, 40));
  app = await start();
  await new Promise((r) => setTimeout(r, 7000)); // het eerste proefrondje draait na 5 s
  assert.ok(pk in (await lees("praktijk-accounts.json")), "account blijft staan als de aanmeldingen onleesbaar zijn");
  assert.ok((await readdir(dataDir)).some((f) => f.startsWith("proef-aanmeldingen.json.onleesbaar-")), "kapot bestand apart bewaard");
  console.log("test-proef-archief-bewaar: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
