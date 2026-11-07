// Abonnement: eerste maand online afrekenen via Mollie (lib/mollie.js + routes in server.js).
// Zonder MOLLIE_API_KEY verandert er niets; met sleutel praat de server met een nep-Mollie
// op localhost. De webhook is niet ondertekend, dus de server moet altijd zelf ophalen en
// alleen een betaling van déze proef met het juiste bedrag laten tellen. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aantalTherapeuten, maandBedrag, beoordeelBetaling } from "../lib/mollie.js";

// 1. pure hulpjes
assert.deepEqual(maandBedrag(1), { currency: "EUR", value: "5.99" });
assert.equal(maandBedrag(3).value, "17.97");
assert.equal(maandBedrag(50).value, "299.50");
for (const fout of ["0", "51", "2.5", "", "abc", "-1", "1e1"]) assert.equal(aantalTherapeuten(fout), null, "aantal " + fout);
assert.equal(aantalTherapeuten(" 3 "), 3);
const pr = { id: "p1", betaling: { id: "tr_abcd", aantal: 2 } };
const ok = { id: "tr_abcd", status: "paid", amount: { currency: "EUR", value: "11.98" }, metadata: { proef: "p1" } };
assert.equal(beoordeelBetaling(ok, pr), "betaald");
assert.equal(beoordeelBetaling({ ...ok, metadata: { proef: "p2" } }, pr), "vreemd");
assert.equal(beoordeelBetaling({ ...ok, amount: { currency: "EUR", value: "0.01" } }, pr), "vreemd");
assert.equal(beoordeelBetaling({ ...ok, status: "canceled" }, pr), "mislukt");

// 2. nep-Mollie
const nep = { verzoeken: [], betaling: null };
const mollieSrv = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    nep.verzoeken.push({ methode: req.method, pad: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
    const json = (s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== "Bearer test_sleutel") return json(401, {});
    if (req.method === "POST" && req.url === "/v2/customers") return json(201, { id: "cst_test1" });
    if (req.method === "POST" && req.url === "/v2/payments") {
      const b = JSON.parse(body);
      nep.betaling = { id: "tr_test12345", status: "open", amount: b.amount, metadata: b.metadata, mandateId: "mdt_test1" };
      return json(201, { ...nep.betaling, _links: { checkout: { href: "https://www.mollie.com/checkout/test" } } });
    }
    if (req.method === "GET" && nep.betaling && req.url === "/v2/payments/" + nep.betaling.id) return json(200, nep.betaling);
    json(404, {});
  });
});
await new Promise((r) => mollieSrv.listen(0, "127.0.0.1", r));
const mollieBasis = "http://127.0.0.1:" + mollieSrv.address().port;

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-abonnement-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const token = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000001: { id: "oud0000000000001", email: "oud@praktijk.nl", naam: "Piet Oud", tel: "+31612340000",
    praktijk: "Fysio Oud", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(token)] }
}));
const cookie = "fpproef=" + token;
const leesProef = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8")).oud0000000000001;

async function start(extraEnv) {
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const app = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "",
      MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "", ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  app.uit = "";
  app.stdout.on("data", (c) => { app.uit += c; });
  app.stderr.on("data", (c) => { app.uit += c; });
  const origin = "http://127.0.0.1:" + port;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return { app, origin };
}
let ip = 0;
const form = (origin, pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.7.0." + (++ip % 250), ...extra },
  body: new URLSearchParams(velden).toString() });

let srv;
try {
  // 3. zonder sleutel: alles zoals het was
  srv = await start({});
  let html = await (await fetch(srv.origin + "/v2/proef", { headers: { cookie } })).text();
  assert.match(html, /Online afrekenen is niet nodig/, "zonder sleutel: oude tekst");
  assert.doesNotMatch(html, /\/v2\/proef\/betalen/, "zonder sleutel: geen betaalknop");
  let r = await form(srv.origin, "/v2/proef/betalen", { aantal: "1" }, { cookie });
  assert.notEqual(r.status, 303, "zonder sleutel: geen betaalroute");
  r = await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  assert.notEqual(await r.text(), "ok", "zonder sleutel: geen webhook");
  assert.equal(nep.verzoeken.length, 0, "zonder sleutel: niets naar Mollie");
  html = await (await fetch(srv.origin + "/privacy")).text();
  assert.doesNotMatch(html, /Mollie/, "zonder sleutel: Mollie niet in de privacyverklaring");
  assert.doesNotMatch(html, /__[A-Z_]+__/, "zonder sleutel: geen open plekken");
  srv.app.kill(); await new Promise((r) => srv.app.once("exit", r));

  // 4. met sleutel
  srv = await start({ MOLLIE_API_KEY: "test_sleutel", MOLLIE_API_BASIS: mollieBasis });
  html = await (await fetch(srv.origin + "/v2/proef", { headers: { cookie } })).text();
  assert.match(html, /action="\/v2\/proef\/betalen"/, "met sleutel: betaalknop op de verlopen-pagina");
  assert.match(html, /Ja, ik wil doorgaan/, "doorgaan blijft er");
  assert.match(html, /href="\/voorwaarden#abonnement"/, "betaalblok linkt de voorwaarden");
  assert.match(html, /machtiging/, "betaalblok noemt de machtiging");
  // legal: Mollie krijgt naam, e-mail en bedrag; dat moet in de privacyverklaring staan
  const privacy = await (await fetch(srv.origin + "/privacy")).text();
  assert.match(privacy, /id="betalen"/, "met sleutel: betaalregel in de tabel");
  assert.match(privacy, /Mollie B\.V\./, "met sleutel: Mollie als ontvanger genoemd");
  assert.doesNotMatch(privacy, /__[A-Z_]+__/, "met sleutel: geen open plekken");
  const voorwaarden = await (await fetch(srv.origin + "/voorwaarden")).text();
  assert.match(voorwaarden, /eerste maand vooraf, via Mollie/, "voorwaarden noemen de online betaling");
  r = await form(srv.origin, "/v2/proef/betalen", { aantal: "0" }, { cookie });
  assert.equal(r.status, 422, "aantal 0 geweigerd");
  r = await form(srv.origin, "/v2/proef/betalen", { aantal: "2" }, { cookie, "sec-fetch-site": "cross-site" });
  assert.equal(r.status, 403, "kruissite geweigerd");
  r = await form(srv.origin, "/v2/proef/betalen", { aantal: "2" });
  assert.equal(r.headers.get("location"), "/v2/proef", "zonder proef: terug naar aanmelden");
  assert.equal(nep.verzoeken.length, 0, "nog niets naar Mollie");

  r = await form(srv.origin, "/v2/proef/betalen", { aantal: "2" }, { cookie });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "https://www.mollie.com/checkout/test", "door naar Mollie");
  const betaalVerzoek = nep.verzoeken.find((v) => v.pad === "/v2/payments").body;
  assert.deepEqual(betaalVerzoek.amount, { currency: "EUR", value: "11.98" }, "2 x 5,99");
  assert.equal(betaalVerzoek.sequenceType, "first");
  assert.equal(betaalVerzoek.customerId, "cst_test1");
  assert.equal(betaalVerzoek.metadata.proef, "oud0000000000001");
  assert.equal((await leesProef()).betaling.id, "tr_test12345");
  assert.match(String((await leesProef()).betaling.av?.versie), /^\d{4}-\d{2}-\d{2}$/, "voorwaardenversie bij de betaling bewaard");

  // webhook: onbekend id → 200 maar geen verzoek aan Mollie
  const voor = nep.verzoeken.length;
  r = await form(srv.origin, "/api/mollie/webhook", { id: "tr_onbekend99" });
  assert.equal(r.status, 200);
  assert.equal(nep.verzoeken.length, voor, "onbekend id niet opgezocht");
  // nog open → geen klant
  r = await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  assert.equal(r.status, 200);
  assert.ok(!(await leesProef()).klant, "open betaling is nog geen klant");
  // betaald, maar een ander bedrag → telt niet
  nep.betaling.status = "paid"; nep.betaling.amount = { currency: "EUR", value: "0.01" };
  await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  assert.ok(!(await leesProef()).klant, "verkeerd bedrag telt niet");
  // betaald met het juiste bedrag → klant, en een tweede webhook verandert niets
  nep.betaling.amount = { currency: "EUR", value: "11.98" };
  await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  const na = await leesProef();
  assert.equal(na.klant, true, "betaald is klant");
  assert.equal(na.abonnement.aantal, 2);
  assert.equal(na.abonnement.mandaat, "mdt_test1");
  await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  assert.equal((await leesProef()).abonnement.sinds, na.abonnement.sinds, "webhook is idempotent");

  html = await (await fetch(srv.origin + "/v2/proef/betaald", { headers: { cookie } })).text();
  assert.match(html, /abonnement is actief/, "bedankpagina");
  html = await (await fetch(srv.origin + "/v2/app", { headers: { cookie } })).text();
  assert.doesNotMatch(html, /gratis dagen zitten erop/, "na betalen geen verlopen-pagina meer");
  console.log("abonnement via Mollie: alle controles groen");
} catch (err) {
  if (srv) console.error(srv.app.uit.slice(-2000));
  throw err;
} finally {
  if (srv) srv.app.kill();
  mollieSrv.close();
  await rm(dataDir, { recursive: true, force: true });
}
