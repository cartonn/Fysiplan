// WGBO: Fysiplan is geen dossier, dus de praktijk moet op tijd zien wanneer een kaart
// verdwijnt, om eerst naar het EPD te kopiëren. Na een proef zonder abonnement wist
// Fysiplan 30 dagen later de hele praktijk, ook kaarten die de patiënt nog gebruikt.
// Vóór deze fix toonden het kaartenoverzicht, de dossiertekst en de patiëntkaart alleen
// de (veel latere) bewaartermijn van de kaart zelf. Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-verdwijndatum-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tok = { proef: "c".repeat(48), klant: "d".repeat(48) };
const proef = (id, token, extra = {}) => ({ id, email: id + "@praktijk.nl", naam: "Therapeut " + id, tel: "+31612345678",
  praktijk: "Praktijk " + id, gestart: nu - 5 * dag, verloopt: nu + 9 * dag, akkoord: nu - 5 * dag, tokens: [hash(token)], ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({ proef: proef("proef", tok.proef), klant: proef("klant", tok.klant, { klant: true }) }));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.0." + (ip++), ...extra });
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));
const dagVan = (t) => Math.round((t - nu) / dag);

let app = await start();
try {
  const sessie = {};
  for (const [id, token] of Object.entries(tok)) {
    const r = await fetch(origin + "/api/praktijk/claim", { method: "POST", headers: kop({ cookie: "fpproef=" + token }),
      body: JSON.stringify({ praktijk: "Praktijk " + id, wachtwoord: "wachtwoord-" + id + "-123", akkoord: true }) });
    assert.equal(r.status, 200, id + " beveiligen");
  }
  const accounts = await lees("praktijk-accounts.json");
  const pk = Object.fromEntries(Object.keys(tok).map((id) => [id, Object.keys(accounts).find((k) => accounts[k].proef?.id === id)]));
  await stop(app);

  // de proef van "proef" is 10 dagen voorbij: over 20 dagen gaat de hele praktijk weg.
  // Beide praktijken hebben een kaart die de patiënt gisteren opende (kaartdatum: over ~89 dagen).
  const pr = await lees("proef-aanmeldingen.json");
  const acc = await lees("praktijk-accounts.json");
  pr.proef.verloopt = nu - 10 * dag; acc[pk.proef].proef.verloopt = nu - 10 * dag;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(pr));
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(acc));
  const kaart = (id, praktijk) => ({ id, naam: "Roepnaam", praktijk, chosen: [], ts: nu - 2 * dag, bekeken: { t: nu - dag } });
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
    [pk.proef]: { a1: kaart("a1b2c3d4e5f60708", "Praktijk proef") }, [pk.klant]: { b1: kaart("b1b2c3d4e5f60708", "Praktijk klant") } }));
  app = await start();
  for (const id of Object.keys(tok)) {
    const r = await fetch(origin + "/api/praktijk/login", { method: "POST", headers: kop(),
      body: JSON.stringify({ praktijk: "Praktijk " + id, wachtwoord: "wachtwoord-" + id + "-123" }) });
    assert.equal(r.status, 200, id + " inloggen");
    sessie[id] = (await r.json()).sessie;
  }

  const overzicht = async (id) => {
    const r = await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent("Praktijk " + id), { headers: kop({ "x-praktijk-sessie": sessie[id] }) });
    assert.equal(r.status, 200, id + ": overzicht");
    const j = await r.json(); return Array.isArray(j) ? j : [];
  };
  const [kp] = await overzicht("proef");
  assert.ok(kp, "kaart in het overzicht");
  assert.equal(dagVan(kp.verloopt), 20, "overzicht: kaart van een proef zonder abonnement verdwijnt met de praktijk (20 dagen), niet pas na de bewaartermijn");
  const [kk] = await overzicht("klant");
  assert.ok(dagVan(kk.verloopt) > 80, "overzicht: bij een klant blijft de bewaartermijn van de kaart gelden");

  const dossier = await (await fetch(origin + "/api/praktijk/kaart?praktijk=" + encodeURIComponent("Praktijk proef") + "&id=a1b2c3d4e5f60708",
    { headers: kop({ "x-praktijk-sessie": sessie.proef }) })).json();
  assert.equal(dagVan(dossier.kaart.verloopt), 20, "dossiertekst: zelfde datum als het overzicht");

  const patient = await (await fetch(origin + "/api/kaart?id=a1b2c3d4e5f60708", { headers: kop() })).json();
  assert.equal(dagVan(patient.kaart.verloopt), 20, "patiënt: belooft niet langer dan de praktijk bestaat");
  const patientKlant = await (await fetch(origin + "/api/kaart?id=b1b2c3d4e5f60708", { headers: kop() })).json();
  assert.ok(dagVan(patientKlant.kaart.verloopt) > 80, "patiënt bij een klant: bewaartermijn van de kaart");
  console.log("test-verdwijndatum-praktijk: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
