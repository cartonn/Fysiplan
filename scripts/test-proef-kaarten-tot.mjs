// Legal 2026-11-21 (code tegen tekst, MDR/AVG-ronde): na een proef zonder abonnement gaan de gedeelde
// kaarten van een beveiligde praktijk dicht op de wisdatum van de praktijk (praktijkWisOp: 30 dagen na
// de proef, #428/#430). De verlopen-pagina en de landing zeiden "blijven werken tot hun bewaartermijn
// afloopt" (tot 90 dagen). Nu noemt de verlopen-pagina de datum en de landing de 30 dagen.
// Zonder browser. `npm run test:proefkaartentot`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-kaartentot-"));
const nu = Date.now();
const dag = 86400000;
const token = "d".repeat(48), token2 = "e".repeat(48);
const hash = (t) => createHash("sha256").update(t).digest("hex");
const P = "Fysio Wisdatumtest", WW = "wisdatum-wachtwoord-1";
const proef = (id, tok, verloopt, praktijk) => ({ id, email: id + "@praktijk.nl", naam: "Therapeut " + id, tel: "+31612345678",
  praktijk, gestart: nu - 20 * dag, verloopt, akkoord: nu - 20 * dag, tokens: [hash(tok)] });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p1: proef("p1", token, nu + 5 * dag, P), p2: proef("p2", token2, nu - 2 * dag, "") }));

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
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));
const datum = (ms) => new Date(ms).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });

let app = await start();
try {
  // beveiligen tijdens de proef: het account hangt daarna aan proef p1
  const claim = await fetch(origin + "/api/praktijk/claim", { method: "POST",
    headers: { "content-type": "application/json", cookie: "fpproef=" + token, "x-forwarded-for": "10.9.0.1" },
    body: JSON.stringify({ praktijk: P, wachtwoord: WW, akkoord: true }) });
  assert.equal(claim.status, 200, "beveiligen");
  await stop(app);
  const accounts = await lees("praktijk-accounts.json");
  const pk = Object.keys(accounts).find((k) => accounts[k].proef?.id === "p1");
  assert.ok(pk, "account gekoppeld aan de proef");

  // proef twee dagen voorbij
  const verloopt = nu - 2 * dag;
  accounts[pk].proef.verloopt = verloopt;
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accounts));
  const pr = await lees("proef-aanmeldingen.json");
  pr.p1.verloopt = verloopt;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(pr));
  app = await start();

  // 1. verlopen-pagina van een beveiligde praktijk: de wisdatum, niet "tot de bewaartermijn"
  const html = await (await fetch(origin + "/v2/proef", { headers: { cookie: "fpproef=" + token } })).text();
  assert.match(html, /gratis dagen zitten erop/, "verlopen-pagina");
  const lead = (html.match(/<p class="lead">Bedankt voor het proberen[\s\S]*?<\/p>/) || [""])[0];
  assert.ok(lead.includes("blijven werken tot " + datum(verloopt + 30 * dag)), "noemt de wisdatum: " + lead);
  assert.doesNotMatch(lead, /bewaartermijn/, "geen belofte tot de bewaartermijn: " + lead);
  assert.match(lead, /dossier/, "zegt dat de praktijk naar het dossier kopieert");
  assert.doesNotMatch(html, /__[A-Z_]+__/, "geen open invulplek");

  // 2. proef zonder beveiligde praktijk: geen datum (er hangen geen gedeelde kaarten aan)
  const html2 = await (await fetch(origin + "/v2/proef", { headers: { cookie: "fpproef=" + token2 } })).text();
  assert.match(html2, /gratis dagen zitten erop/);
  assert.match(html2, /blijven werken tot de bewaartermijn afloopt/);
  assert.doesNotMatch(html2, /__[A-Z_]+__/);

  // 3. landing: dezelfde grens als voorwaarden art. 3
  const landing = await (await fetch(origin + "/v2")).text();
  assert.doesNotMatch(landing, /__PROEF_BEWAAR__/, "invulplek op de landing ingevuld");
  assert.match(landing, /bewaartermijn afloopt, en uiterlijk tot 30 dagen na de proef/);
  assert.match(landing, /wissen we 30 dagen na de proef alles van je praktijk/);
  console.log("ok: verlopen-pagina en landing noemen de wisdatum na de proef");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
