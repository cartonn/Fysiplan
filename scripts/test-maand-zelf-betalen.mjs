// Na een mislukte maandincasso kan de praktijk de openstaande maand zelf betalen (iDEAL of
// kaart) op Mijn abonnement. Alleen die maand en dat bedrag; gelukt telt als de incasso
// (maand schuift op, eigen factuur, mail), een afgebroken poging kan opnieuw, een vreemde of
// verkeerde betaling telt niet, en zonder MOLLIE_API_KEY bestaat de knop niet.
// Zonder browser, met een nep-Mollie en een nep-mailserver. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMaand, zelfBetalenVerzoek, markeerZelfGestart, beoordeelZelf, markeerZelfBetaald } from "../lib/mollie.js";

const dag = 86400000;
const nu = Date.now();

// ---- pure regels ----
{
  const per = nu - dag;
  const p = { id: "x", abonnement: { status: "actief", aantal: 2, betaaldTot: per, mollieKlant: "cst_abcd",
    incasso: { id: "tr_inc1", periode: per, aantal: 2, status: "mislukt", bedrag: "24.18" } } };
  assert.ok(openMaand(p.abonnement), "mislukte incasso van de lopende periode staat open");
  assert.equal(openMaand({ ...p.abonnement, status: "opgezegd" }), null, "opgezegd: niets te betalen");
  assert.equal(openMaand({ ...p.abonnement, incasso: { ...p.abonnement.incasso, status: "open" } }), null, "lopende incasso: niet zelf betalen");
  assert.equal(openMaand({ ...p.abonnement, betaaldTot: per + 30 * dag }), null, "oude periode: niets open");
  const v = zelfBetalenVerzoek(p, "https://x/terug", "https://x/hook");
  assert.deepEqual(v.amount, { currency: "EUR", value: "24.18" }, "bedrag van de mislukte incasso");
  assert.equal(v.sequenceType, undefined, "eenmalige betaling, geen nieuwe machtiging");
  assert.deepEqual(v.metadata, { proef: "x", periode: String(per), soort: "zelf" });
  assert.ok(markeerZelfGestart(p, { id: "tr_zelf1" }, nu));
  const goed = { id: "tr_zelf1", status: "paid", amount: { currency: "EUR", value: "24.18" }, metadata: v.metadata };
  assert.equal(beoordeelZelf(goed, p), "betaald");
  assert.equal(beoordeelZelf({ ...goed, amount: { currency: "EUR", value: "0.01" } }, p), "vreemd", "verkeerd bedrag telt niet");
  assert.equal(beoordeelZelf({ ...goed, metadata: { ...v.metadata, proef: "y" } }, p), "vreemd", "andere praktijk telt niet");
  assert.equal(beoordeelZelf({ ...goed, metadata: { ...v.metadata, soort: undefined } }, p), "vreemd");
  assert.ok(markeerZelfBetaald(p, nu));
  assert.equal(markeerZelfBetaald(p, nu), false, "idempotent");
  assert.equal(p.abonnement.incasso.status, "paid");
  assert.equal(p.abonnement.betalingen.length, 1);
  assert.equal(p.abonnement.betalingen[0].id, "tr_zelf1", "de factuur noemt de betaling die echt betaalde");
  assert.ok(p.abonnement.betaaldTot > per + 27 * dag, "betaalde maand schuift op");
  assert.equal(openMaand(p.abonnement), null, "daarna staat er niets meer open");
}

// ---- server met nep-Mollie en nep-mail ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-zelfbetalen-"));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokens = { mis: "c".repeat(48), goed: "d".repeat(48) };
const per = nu - 2 * dag;
const adres = (id) => id + "@praktijk.voorbeeld";
const klant = (id, incassoStatus) => ({ id, email: adres(id), naam: "Naam " + id, tel: "+31612345678", praktijk: id + " Fysio",
  gestart: nu - 60 * dag, verloopt: nu - 46 * dag, akkoord: nu - 60 * dag, tokens: [hash(tokens[id])], klant: true,
  betaling: { id: "tr_eerste" + id, klant: "cst_" + id + "1234", aantal: 2, status: "paid", gemaakt: nu - 32 * dag },
  abonnement: { status: "actief", aantal: 2, bedrag: "19.98", sinds: nu - 32 * dag, betaaldTot: per,
    eersteBetaling: "tr_eerste" + id, factuurNr: "FP-2026-0001", mollieKlant: "cst_" + id + "1234", mandaat: "mdt_" + id + "1234",
    gemeld: per, gemeldOp: per - 6 * dag,
    incasso: { id: "tr_inc" + id, periode: per, aantal: 2, status: incassoStatus, gemaakt: per, bedrag: "24.18", mollieStatus: "failed" } } });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({ mis: klant("mis", "mislukt"), goed: klant("goed", "open") }));
await writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify({ kor: "nee", prijsBtw: "exclusief" }));

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
    const betaling = { id: "tr_zelf" + (++teller), status: "open", amount: b.amount, metadata: b.metadata, customerId: b.customerId,
      _links: { checkout: { href: "https://mollie.voorbeeld/checkout/" + teller } } };
    betalingen.set(betaling.id, betaling);
    return json(201, betaling);
  }
  const m = /^\/v2\/payments\/(tr_\w+)$/.exec(req.url);
  if (m && betalingen.has(m[1])) return json(200, betalingen.get(m[1]));
  if (m) return json(200, { id: m[1], status: "open", amount: { currency: "EUR", value: "24.18" }, metadata: {} });
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
async function start(metMollie) {
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MOLLIE_API_KEY: metMollie ? "test_nep" : "", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: "",
      MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
const lees = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
const wacht = async (klaar) => { for (let i = 0; i < 60; i++) { if (await klaar()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const metCookie = (id, extra = {}) => ({ ...extra, headers: { cookie: "fpproef=" + tokens[id], origin, ...(extra.headers || {}) }, redirect: "manual" });
const betaal = (id) => fetch(origin + "/v2/proef/maand-betalen", metCookie(id, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "" }));
const webhook = (id) => fetch(origin + "/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + id });

let app = await start(false);
try {
  // zonder MOLLIE_API_KEY: geen knop en geen route
  const zonder = await (await fetch(origin + "/v2/proef?mijn=1", metCookie("mis"))).text();
  assert.doesNotMatch(zonder, /maand-betalen/, "zonder sleutel geen knop");
  assert.notEqual((await betaal("mis")).status, 303, "zonder sleutel geen route naar Mollie");
  assert.equal(aangemaakt.length, 0);
  await stop(app);

  app = await start(true);
  // Mijn abonnement: de knop alleen bij de mislukte incasso
  const mijnMis = await (await fetch(origin + "/v2/proef?mijn=1", metCookie("mis"))).text();
  assert.match(mijnMis, /action="\/v2\/proef\/maand-betalen"/, "knop bij een mislukte incasso");
  assert.match(mijnMis, /EUR 24\.18/, "noemt het bedrag van de mislukte incasso");
  const mijnGoed = await (await fetch(origin + "/v2/proef?mijn=1", metCookie("goed"))).text();
  assert.doesNotMatch(mijnGoed, /maand-betalen/, "lopende incasso: geen knop");

  // een praktijk zonder openstaande maand kan niets aanmaken
  const r0 = await betaal("goed");
  assert.equal(r0.status, 303);
  assert.match(r0.headers.get("location"), /mijn=1/);
  assert.equal(aangemaakt.length, 0, "geen betaling zonder openstaande maand");

  // van een andere site: geweigerd
  const kruis = await fetch(origin + "/v2/proef/maand-betalen", { method: "POST", redirect: "manual",
    headers: { cookie: "fpproef=" + tokens.mis, origin: "https://kwaad.voorbeeld", "content-type": "application/x-www-form-urlencoded" }, body: "" });
  assert.notEqual(kruis.status, 303, "kruis-site geweigerd");
  assert.equal(aangemaakt.length, 0);

  // eerste poging: naar Mollie, daarna afgebroken
  const r1 = await betaal("mis");
  assert.equal(r1.status, 303);
  assert.equal(r1.headers.get("location"), "https://mollie.voorbeeld/checkout/1");
  assert.deepEqual(aangemaakt[0].amount, { currency: "EUR", value: "24.18" });
  assert.equal(aangemaakt[0].customerId, "cst_mis1234");
  assert.equal(aangemaakt[0].redirectUrl, origin + "/v2/proef/maand-betaald");
  betalingen.get("tr_zelf1").status = "canceled";
  const terug1 = await (await fetch(origin + "/v2/proef/maand-betaald", metCookie("mis"))).text();
  assert.match(terug1, /niet gelukt/, "afgebroken: dat zegt de pagina");
  assert.equal((await lees()).mis.abonnement.incasso.status, "mislukt", "maand staat nog open");

  // tweede poging: nieuwe betaling, gelukt via de webhook
  const r2 = await betaal("mis");
  assert.equal(r2.headers.get("location"), "https://mollie.voorbeeld/checkout/2", "nieuwe poging, nieuwe betaling");
  // nog een keer op de knop (tweede tabblad, terugknop) terwijl poging 2 bij Mollie nog open
  // staat: dezelfde betaling, geen derde (anders kon poging 2 alsnog betaald worden zonder te tellen)
  const telVoor = aangemaakt.length;
  const r2b = await betaal("mis");
  assert.equal(r2b.headers.get("location"), "https://mollie.voorbeeld/checkout/2", "lopende poging wordt hergebruikt");
  const dubbel = await Promise.all([betaal("mis"), betaal("mis"), betaal("mis")]);
  assert.ok(dubbel.every((r) => r.status === 303), "gelijktijdige klikken: alleen doorverwijzen");
  assert.equal(aangemaakt.length, telVoor, "geen nieuwe betaling zolang de vorige open staat");
  assert.equal((await lees()).mis.abonnement.incasso.zelf.id, "tr_zelf2");
  // een late webhook van de afgebroken poging telt niet meer
  betalingen.get("tr_zelf1").status = "paid";
  assert.equal((await webhook("tr_zelf1")).status, 200);
  assert.equal((await lees()).mis.abonnement.incasso.status, "mislukt", "oude poging telt niet");
  // een betaling met een verkeerd bedrag telt niet
  betalingen.get("tr_zelf2").status = "paid";
  betalingen.get("tr_zelf2").amount = { currency: "EUR", value: "0.01" };
  await webhook("tr_zelf2");
  assert.equal((await lees()).mis.abonnement.incasso.status, "mislukt", "verkeerd bedrag telt niet");
  betalingen.get("tr_zelf2").amount = { currency: "EUR", value: "24.18" };
  for (let i = 0; i < 2; i++) assert.equal((await webhook("tr_zelf2")).status, 200);
  const na = await lees();
  const a = na.mis.abonnement;
  assert.equal(a.incasso.status, "paid");
  assert.equal(a.betalingen.length, 1, "tweede webhook boekt niet dubbel");
  assert.equal(a.betalingen[0].id, "tr_zelf2");
  assert.ok(a.betaaldTot > per + 27 * dag, "betaalde maand schuift op");
  assert.match(a.betalingen[0].factuurNr, /^FP-\d{4}-\d{4}$/, "eigen factuurnummer");

  const terug2 = await (await fetch(origin + "/v2/proef/maand-betaald", metCookie("mis"))).text();
  assert.match(terug2, /de maand is betaald/);
  const f = await fetch(origin + "/v2/proef/factuur?nr=" + a.betalingen[0].factuurNr, metCookie("mis"));
  assert.equal(f.status, 200);
  const fh = await f.text();
  assert.ok(fh.includes("tr_zelf2") && fh.includes("€ 24,18"), "factuur noemt de eigen betaling en het bedrag");
  const mijnNa = await (await fetch(origin + "/v2/proef?mijn=1", metCookie("mis"))).text();
  assert.doesNotMatch(mijnNa, /maand-betalen/, "na betalen geen knop meer");
  assert.ok(await wacht(() => mails.some((m) => /zelf betaald: mis Fysio/.test(m.subject))), "beheer hoort het");
  assert.ok(mails.some((m) => [].concat(m.to).includes(adres("mis")) && /betaling is gelukt/.test(m.subject)), "praktijk krijgt bevestiging");
  // na de betaling kan er niets meer aangemaakt worden
  const voor = aangemaakt.length;
  assert.equal((await betaal("mis")).status, 303);
  assert.equal(aangemaakt.length, voor, "betaalde maand: geen nieuwe betaling");
  console.log("test-maand-zelf-betalen: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
