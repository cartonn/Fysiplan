// Maandincasso na de eerste maand (MOLLIE_API_KEY + MOLLIE_INCASSO=aan): eerst een
// aankondiging per mail, dan pas afschrijven op het mandaat; een gelukte incasso schuift
// de betaalde maand op en krijgt een eigen factuur, een mislukte gaat naar Ahmed, een
// opgezegd abonnement wordt nooit geïnd, en zonder MOLLIE_INCASSO gebeurt er niets.
// Zonder browser, met een nep-Mollie en een nep-mailserver. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { incassoStap, beoordeelIncasso, markeerIncassoGestart, markeerIncassoBetaald, markeerGemeld, INCASSO_VOORAF_DAGEN } from "../lib/mollie.js";
import { volgendFactuurNr } from "../lib/factuur.js";

const dag = 86400000;
const nu = Date.now();

// ---- pure regels ----
{
  const p = { id: "x", abonnement: { status: "actief", aantal: 2, betaaldTot: nu + 10 * dag, mollieKlant: "cst_abcd" } };
  assert.equal(incassoStap(p, nu), null, "te vroeg om te melden");
  assert.equal(incassoStap(p, nu + 6 * dag), "melden", "binnen " + INCASSO_VOORAF_DAGEN + " dagen: melden");
  markeerGemeld(p, nu + 9 * dag);
  assert.equal(incassoStap(p, nu + 10 * dag), null, "niet afschrijven binnen 5 dagen na de mail, ook niet als de maand om is");
  assert.equal(incassoStap(p, nu + 14 * dag), "incasseren");
  markeerIncassoGestart(p, { id: "tr_een1" }, nu + 14 * dag);
  assert.equal(incassoStap(p, nu + 14 * dag), null, "loopt al");
  assert.equal(incassoStap(p, nu + 15 * dag), "nakijken", "open incasso wordt zelf nagekeken");
  const goed = { id: "tr_een1", status: "paid", amount: { currency: "EUR", value: "19.98" }, metadata: { proef: "x", periode: String(nu + 10 * dag) } };
  assert.equal(beoordeelIncasso(goed, p), "betaald");
  assert.equal(beoordeelIncasso({ ...goed, amount: { currency: "EUR", value: "9.99" } }, p), "vreemd", "verkeerd bedrag telt niet");
  assert.equal(beoordeelIncasso({ ...goed, metadata: { proef: "y", periode: goed.metadata.periode } }, p), "vreemd", "andere praktijk telt niet");
  assert.equal(beoordeelIncasso({ ...goed, id: "tr_ander" }, p), "vreemd");
  assert.ok(markeerIncassoBetaald(p, nu));
  assert.equal(markeerIncassoBetaald(p, nu), false, "idempotent");
  assert.ok(p.abonnement.betaaldTot > nu + 37 * dag, "betaalde maand schuift op");
  assert.equal(incassoStap({ ...p, abonnement: { ...p.abonnement, status: "opgezegd" } }, nu + 60 * dag), null, "opgezegd: nooit incasso");
  p.abonnement.factuurNr = "FP-2026-0003"; p.abonnement.betalingen[0].factuurNr = "FP-2026-0007";
  assert.equal(volgendFactuurNr([p], "2026"), "FP-2026-0008", "maandfacturen tellen mee in de reeks");
}

// ---- server met nep-Mollie en nep-mail ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-incasso-"));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokens = { goed: "a".repeat(48), mis: "b".repeat(48), weg: "e".repeat(48) };
const klant = (id, aantal, status = "actief") => ({ id, email: id + "@praktijk.nl", naam: "Naam " + id, tel: "+31612345678", praktijk: id + " Fysio",
  gestart: nu - 60 * dag, verloopt: nu - 46 * dag, akkoord: nu - 60 * dag, tokens: [hash(tokens[id])], klant: true,
  betaling: { id: "tr_eerste" + id, klant: "cst_" + id + "1234", aantal, status: "paid", gemaakt: nu - 31 * dag },
  abonnement: { status, aantal, bedrag: (9.99 * aantal).toFixed(2), sinds: nu - 31 * dag, betaaldTot: nu + 3 * dag,
    eersteBetaling: "tr_eerste" + id, factuurNr: "FP-2026-000" + aantal, mollieKlant: "cst_" + id + "1234", mandaat: "mdt_" + id + "1234",
    ...(status === "opgezegd" ? { opgezegd: nu - dag } : {}) } });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({ goed: klant("goed", 2), mis: klant("mis", 1), weg: klant("weg", 3, "opgezegd") }));

const mails = [], aangemaakt = [], betalingen = new Map();
let teller = 0;
const leesBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => r(d)); });
const nep = createServer(async (req, res) => {
  const body = await leesBody(req);
  const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.url === "/emails") { mails.push(JSON.parse(body)); return json(200, { id: "m" }); }
  if (req.url === "/v2/payments" && req.method === "POST") {
    const b = JSON.parse(body);
    aangemaakt.push(b);
    const betaling = { id: "tr_inc" + (++teller), status: "open", amount: b.amount, metadata: b.metadata, customerId: b.customerId, sequenceType: b.sequenceType };
    betalingen.set(betaling.id, betaling);
    return json(201, betaling);
  }
  const m = /^\/v2\/payments\/(tr_\w+)$/.exec(req.url);
  if (m && betalingen.has(m[1])) return json(200, betalingen.get(m[1]));
  json(404, {});
});
await new Promise((r) => nep.listen(0, "127.0.0.1", r));
const nepUrl = "http://127.0.0.1:" + nep.address().port;

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
async function start(incasso) {
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MOLLIE_API_KEY: "test_nep", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: incasso ? "aan" : "",
      MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
const lees = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
const wacht = async (klaar) => { for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 150)); if (await klaar()) return true; } return false; };
const onderwerpen = (aan) => mails.filter((m) => m.to[0] === aan).map((m) => m.subject);

let app = await start(false);
try {
  // zonder MOLLIE_INCASSO: de proefronde (5 s na de start) doet niets met incasso
  await new Promise((r) => setTimeout(r, 6500));
  assert.equal(mails.filter((m) => /aankondiging/.test(m.subject)).length, 0, "zonder MOLLIE_INCASSO geen aankondiging");
  assert.equal(aangemaakt.length, 0, "zonder MOLLIE_INCASSO geen betaling");
  const blokUit = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie: "fpproef=" + tokens.goed } })).text();
  assert.doesNotMatch(blokUit, /automatisch af/, "zonder MOLLIE_INCASSO belooft Mijn proef geen incasso");
  await stop(app);

  // met MOLLIE_INCASSO: eerst alleen de aankondiging, nog niets afgeschreven
  app = await start(true);
  assert.ok(await wacht(async () => (await lees()).mis?.abonnement?.gemeld), "aankondiging gedaan");
  assert.match(onderwerpen("goed@praktijk.nl").join("|"), /aankondiging/);
  assert.match(onderwerpen("mis@praktijk.nl").join("|"), /aankondiging/);
  assert.equal(onderwerpen("weg@praktijk.nl").length, 0, "opgezegd: geen aankondiging");
  assert.equal(aangemaakt.length, 0, "nog niet afgeschreven");
  const blok = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie: "fpproef=" + tokens.goed } })).text();
  assert.match(blok, /automatisch af via Mollie/);
  await stop(app);

  // de tijd verspringt: maand voorbij en de aankondiging is 6 dagen oud
  const pr = await lees();
  for (const id of ["goed", "mis", "weg"]) {
    pr[id].abonnement.betaaldTot = nu - 3600e3;
    if (pr[id].abonnement.gemeld) { pr[id].abonnement.gemeld = nu - 3600e3; pr[id].abonnement.gemeldOp = nu - 6 * dag; }
  }
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(pr));
  app = await start(true);
  assert.ok(await wacht(async () => aangemaakt.length >= 2), "twee incasso's aangemaakt");
  assert.equal(aangemaakt.length, 2, "opgezegd abonnement niet geïnd");
  for (const b of aangemaakt) {
    assert.equal(b.sequenceType, "recurring");
    assert.match(b.customerId, /^cst_(goed|mis)1234$/);
    assert.match(b.mandateId, /^mdt_(goed|mis)1234$/);
    assert.equal(b.webhookUrl, "https://fysiplan.nl/api/mollie/webhook");
  }
  const vanGoed = aangemaakt.find((b) => b.customerId === "cst_goed1234");
  assert.deepEqual(vanGoed.amount, { currency: "EUR", value: "19.98" });
  assert.ok(await wacht(async () => (await lees()).mis?.abonnement?.incasso?.id), "incasso opgeslagen");

  // webhook: goed betaalt, mis mislukt
  const idGoed = [...betalingen.values()].find((b) => b.customerId === "cst_goed1234").id;
  const idMis = [...betalingen.values()].find((b) => b.customerId === "cst_mis1234").id;
  betalingen.get(idGoed).status = "paid";
  betalingen.get(idMis).status = "failed";
  for (const id of [idGoed, idMis, idGoed]) {
    const r = await fetch(origin + "/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + id });
    assert.equal(r.status, 200);
  }
  const na = await lees();
  const ag = na.goed.abonnement;
  assert.equal(ag.incasso.status, "paid");
  assert.equal(ag.betalingen.length, 1, "tweede webhook boekt niet dubbel");
  assert.ok(ag.betaaldTot > nu + 27 * dag, "betaalde maand opgeschoven");
  assert.match(ag.betalingen[0].factuurNr, /^FP-\d{4}-\d{4}$/);
  assert.notEqual(ag.betalingen[0].factuurNr, ag.factuurNr, "eigen factuurnummer");
  assert.equal(na.goed.klant, true);
  assert.equal(na.mis.abonnement.incasso.status, "mislukt");
  assert.equal(na.mis.abonnement.betalingen, undefined);
  assert.equal(na.mis.klant, true, "mislukte incasso zet de praktijk niet op slot");
  await wacht(async () => onderwerpen("beheer@voorbeeld.nl").some((o) => /mislukt/.test(o)));
  assert.ok(onderwerpen("beheer@voorbeeld.nl").some((o) => /Maandincasso mislukt: mis Fysio/.test(o)), "Ahmed hoort het");
  assert.ok(onderwerpen("goed@praktijk.nl").some((o) => /gelukt/.test(o)));

  // de factuur van de nieuwe maand, alleen voor de eigen praktijk
  const nr = ag.betalingen[0].factuurNr;
  const f = await fetch(origin + "/v2/proef/factuur?nr=" + nr, { headers: { cookie: "fpproef=" + tokens.goed } });
  assert.equal(f.status, 200);
  const fh = await f.text();
  assert.ok(fh.includes(nr) && fh.includes(idGoed) && fh.includes("€ 19,98"), "factuur van de incasso");
  assert.equal((await fetch(origin + "/v2/proef/factuur?nr=" + nr, { headers: { cookie: "fpproef=" + tokens.mis } })).status, 404, "andere praktijk ziet hem niet");
  const mijn = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie: "fpproef=" + tokens.goed } })).text();
  assert.ok(mijn.includes("/v2/proef/factuur?nr=" + nr), "Mijn proef linkt naar de nieuwe factuur");
  console.log("test-abonnement-incasso: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
