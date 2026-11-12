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
import { aantalTherapeuten, maandBedrag, beoordeelBetaling, markeerOpgezegd, trekOpzeggingIn, abonnementEindeStap, NA_EINDE_WISSEN_DAGEN } from "../lib/mollie.js";
import { volgendFactuurNr, bedragen, naarCent, euro, factuurHtml, isFactuur } from "../lib/factuur.js";

// 1b. factuur: nummering, btw en escapen
assert.equal(volgendFactuurNr([], 2026), "FP-2026-0001");
assert.equal(volgendFactuurNr([{ abonnement: { factuurNr: "FP-2026-0007" } }, { abonnement: { factuurNr: "FP-2025-0042" } }, {}], 2026), "FP-2026-0008");
assert.equal(naarCent("11.98"), 1198); assert.equal(naarCent("10"), 1000); assert.equal(naarCent("x"), 0);
assert.deepEqual(bedragen(1198, true), { totaal: 1198, excl: 990, btw: 208 });
assert.deepEqual(bedragen(1198, false), { totaal: 1198, excl: 1198, btw: 0 });
assert.equal(euro(1198), "€ 11,98");
const lev = { bedrijf: "Fysiplan B.V.", kvk: "12345678", adres: "Straat 1, Utrecht", btwNummer: "NL000000000B01" };
assert.ok(isFactuur(lev)); assert.ok(!isFactuur({ ...lev, kvk: "" }), "zonder KvK geen factuur");
const proefAb = { aantal: 1, bedrag: "9.99", sinds: Date.UTC(2026, 10, 8), betaaldTot: Date.UTC(2026, 11, 8), eersteBetaling: "tr_x1", factuurNr: "FP-2026-0001" };
const xss = factuurHtml({ leverancier: lev, afnemer: { naam: "<img src=x onerror=alert(1)>", email: "a@b.nl" }, abonnement: proefAb });
assert.doesNotMatch(xss, /<img/, "praktijknaam wordt ge-escaped");
assert.doesNotMatch(xss, /<script/i, "factuur is scriptloos");

// 1. pure hulpjes
assert.deepEqual(maandBedrag(1), { currency: "EUR", value: "9.99" });
assert.equal(maandBedrag(3).value, "29.97");
assert.equal(maandBedrag(50).value, "499.50");
for (const fout of ["0", "51", "2.5", "", "abc", "-1", "1e1"]) assert.equal(aantalTherapeuten(fout), null, "aantal " + fout);
assert.equal(aantalTherapeuten(" 3 "), 3);
const pr = { id: "p1", betaling: { id: "tr_abcd", aantal: 2 } };
const ok = { id: "tr_abcd", status: "paid", amount: { currency: "EUR", value: "19.98" }, metadata: { proef: "p1" } };
assert.equal(beoordeelBetaling(ok, pr), "betaald");
assert.equal(beoordeelBetaling({ ...ok, metadata: { proef: "p2" } }, pr), "vreemd");
assert.equal(beoordeelBetaling({ ...ok, amount: { currency: "EUR", value: "0.01" } }, pr), "vreemd");
assert.equal(beoordeelBetaling({ ...ok, status: "canceled" }, pr), "mislukt");
// 1c. opzeggen: alleen een actief abonnement, intrekken alleen binnen de betaalde maand
const ab = { abonnement: { status: "actief", betaaldTot: 2000 } };
assert.equal(markeerOpgezegd(ab, 1000), true); assert.equal(ab.abonnement.status, "opgezegd");
assert.equal(markeerOpgezegd(ab, 1500), false, "tweede keer verandert niets"); assert.equal(ab.abonnement.opgezegd, 1000);
assert.equal(trekOpzeggingIn(ab, 2500), false, "na de betaalde maand niet meer intrekken");
assert.equal(trekOpzeggingIn(ab, 1500), true); assert.equal(ab.abonnement.status, "actief"); assert.ok(!("opgezegd" in ab.abonnement));
assert.equal(markeerOpgezegd({}, 1), false); assert.equal(markeerOpgezegd({ abonnement: { status: "gestopt" } }, 1), false);
// 1d. einde na opzeggen: na de betaalde maand gestopt, 30 dagen later wissen (voorwaarden art. 5)
const D = 86400000;
const eind = { klant: true, verloopt: 5, abonnement: { status: "opgezegd", betaaldTot: 100 * D } };
assert.equal(abonnementEindeStap(eind, 99 * D), null, "binnen de betaalde maand verandert niets");
assert.equal(eind.klant, true);
assert.equal(abonnementEindeStap(eind, 100 * D), "gestopt");
assert.equal(eind.klant, false, "geen klant meer"); assert.equal(eind.verloopt, 100 * D, "proefpoort dicht vanaf betaaldTot");
assert.equal(eind.abonnement.status, "beeindigd");
assert.equal(trekOpzeggingIn(eind, 100 * D), false, "intrekken kan niet meer");
assert.equal(abonnementEindeStap(eind, (100 + NA_EINDE_WISSEN_DAGEN) * D - 1), null);
assert.equal(abonnementEindeStap(eind, (100 + NA_EINDE_WISSEN_DAGEN) * D), "wissen");
const laat = { klant: true, abonnement: { status: "opgezegd", betaaldTot: D } };
assert.equal(abonnementEindeStap(laat, 40 * D), "wissen", "lang voorbij: meteen wissen");
assert.equal(abonnementEindeStap({ klant: true, abonnement: { status: "actief", betaaldTot: D } }, 99 * D), null, "actief abonnement stopt niet vanzelf");
assert.equal(abonnementEindeStap({ gewist: 1, abonnement: { status: "beeindigd", betaaldTot: D } }, 99 * D), null);

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
// de btw-keuze is gemaakt (zie lib/prijs.js en scripts/test-prijs.mjs): 9,99 inclusief btw. Zonder keuze start afrekenen niet.
await writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify({ kor: "nee", prijsBtw: "inclusief" }));
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
  assert.deepEqual(betaalVerzoek.amount, { currency: "EUR", value: "19.98" }, "2 x 9,99");
  assert.equal(betaalVerzoek.sequenceType, "first");
  assert.equal(betaalVerzoek.customerId, "cst_test1");
  assert.equal(betaalVerzoek.metadata.proef, "oud0000000000001");
  assert.equal((await leesProef()).betaling.id, "tr_test12345");
  assert.match(String((await leesProef()).betaling.av?.versie), /^\d{4}-\d{2}-\d{2}(-\d+)?$/, "voorwaardenversie bij de betaling bewaard");

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
  nep.betaling.amount = { currency: "EUR", value: "19.98" };
  await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  const na = await leesProef();
  assert.equal(na.klant, true, "betaald is klant");
  assert.equal(na.abonnement.aantal, 2);
  assert.equal(na.abonnement.mandaat, "mdt_test1");
  await form(srv.origin, "/api/mollie/webhook", { id: "tr_test12345" });
  assert.equal((await leesProef()).abonnement.sinds, na.abonnement.sinds, "webhook is idempotent");

  html = await (await fetch(srv.origin + "/v2/proef/betaald", { headers: { cookie } })).text();
  assert.match(html, /abonnement is actief/, "bedankpagina");
  assert.match(html, /href="\/v2\/proef\/factuur">Betaalbewijs bekijken/, "bedankpagina linkt het betaalbewijs");
  html = await (await fetch(srv.origin + "/v2/proef?mijn=1", { headers: { cookie } })).text();
  assert.match(html, /href="\/v2\/proef\/factuur"/, "Mijn abonnement linkt het betaalbewijs");
  // factuur/betaalbewijs: alleen voor de eigen praktijk, met nummer en het betaalde bedrag
  r = await fetch(srv.origin + "/v2/proef/factuur");
  assert.equal(r.status, 404, "zonder proefcookie geen factuur");
  r = await fetch(srv.origin + "/v2/proef/factuur", { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy") || "", /default-src 'none'/, "strikte CSP");
  html = await r.text();
  const jaar = new Date().toLocaleDateString("nl-NL", { year: "numeric", timeZone: "Europe/Amsterdam" });
  const totaal = euro(naarCent(maandBedrag(2).value));
  assert.match(html, /<h1>Betaalbewijs<\/h1>/, "zonder btw-id een betaalbewijs");
  assert.match(html, /geen factuur voor de btw/);
  assert.match(html, new RegExp("FP-" + jaar + "-0001"), "eerste factuurnummer van het jaar");
  assert.ok(html.includes(totaal), "betaald bedrag " + totaal);
  assert.doesNotMatch(html, /Btw 21%/, "betaalbewijs rekent geen btw");
  assert.equal((await leesProef()).abonnement.factuurNr, "FP-" + jaar + "-0001", "nummer bewaard");
  html = await (await fetch(srv.origin + "/v2/app", { headers: { cookie } })).text();
  assert.doesNotMatch(html, /gratis dagen zitten erop/, "na betalen geen verlopen-pagina meer");

  // opzeggen in de app (Mijn proef), en weer intrekken
  html = await (await fetch(srv.origin + "/v2/proef?mijn=1", { headers: { cookie } })).text();
  assert.match(html, /action="\/v2\/proef\/opzeggen"/, "Mijn abonnement heeft een opzegknop");
  assert.doesNotMatch(html, /je proef loopt nog/, "een klant ziet geen proefteller");
  r = await form(srv.origin, "/v2/proef/opzeggen", { actie: "opzeggen" }, { cookie });
  assert.equal(r.status, 422, "zonder vinkje niet opgezegd");
  r = await form(srv.origin, "/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1" }, { cookie, "sec-fetch-site": "cross-site" });
  assert.equal(r.status, 403, "opzeggen vanaf een andere site geweigerd");
  r = await form(srv.origin, "/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1" });
  assert.equal(r.headers.get("location"), "/v2/proef", "zonder cookie niets opgezegd");
  assert.equal((await leesProef()).abonnement.status, "actief", "nog steeds actief");
  r = await form(srv.origin, "/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1" }, { cookie });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Je abonnement is opgezegd/);
  const opg = (await leesProef()).abonnement;
  assert.equal(opg.status, "opgezegd"); assert.ok(opg.opgezegd > 0);
  await form(srv.origin, "/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1" }, { cookie });
  assert.equal((await leesProef()).abonnement.opgezegd, opg.opgezegd, "opzeggen is idempotent");
  html = await (await fetch(srv.origin + "/v2/proef?mijn=1", { headers: { cookie } })).text();
  assert.match(html, /abonnement is opgezegd/); assert.match(html, /Toch doorgaan/); assert.match(html, /href="\/v2\/proef\/factuur"/);
  html = await (await fetch(srv.origin + "/v2/app", { headers: { cookie } })).text();
  assert.doesNotMatch(html, /gratis dagen zitten erop/, "opgezegd: de betaalde maand loopt gewoon door");
  r = await form(srv.origin, "/v2/proef/opzeggen", { actie: "intrekken" }, { cookie });
  assert.match(await r.text(), /abonnement loopt door/);
  assert.equal((await leesProef()).abonnement.status, "actief", "opzegging ingetrokken");
  assert.ok(nep.verzoeken.every((v) => v.methode !== "DELETE"), "opzeggen raakt Mollie niet");
  srv.app.kill(); await new Promise((r) => srv.app.once("exit", r));

  // 5. met btw-id en bedrijfsgegevens: een echte factuur, zelfde nummer
  srv = await start({ MOLLIE_API_KEY: "test_sleutel", MOLLIE_API_BASIS: mollieBasis, FYSIPLAN_BTW_NUMMER: "NL000000000B01",
    FYSIPLAN_BEDRIJF: "Fysiplan B.V.", FYSIPLAN_KVK: "12345678", FYSIPLAN_ADRES: "Straat 1, Utrecht" });
  html = await (await fetch(srv.origin + "/v2/proef/factuur", { headers: { cookie } })).text();
  const b = bedragen(naarCent(maandBedrag(2).value), true);
  assert.match(html, /<h1>Factuur<\/h1>/, "met btw-id een factuur");
  assert.match(html, /Btw-id NL000000000B01/); assert.match(html, /KvK 12345678/);
  assert.match(html, /Btw 21%/); assert.ok(html.includes(euro(b.btw)) && html.includes(euro(b.excl)), "btw uitgesplitst");
  assert.match(html, /FP-\d{4}-0001/, "nummer verandert niet bij opnieuw bekijken");
  // gegevens wissen via Mijn proef na een betaling: de fiscale gegevens blijven 7 jaar
  r = await form(srv.origin, "/v2/proef/wissen", { zeker: "1" }, { cookie });
  assert.equal(r.status, 200);
  const gewist = await leesProef();
  assert.ok(gewist, "betaalde aanmelding niet helemaal weg (fiscale bewaarplicht)");
  assert.equal(gewist.abonnement.status, "gestopt"); assert.match(gewist.abonnement.factuurNr, /^FP-/);
  assert.ok(!gewist.tel && !(gewist.tokens || []).length, "telefoon en apparaten wel gewist");
  console.log("abonnement via Mollie: alle controles groen");
} catch (err) {
  if (srv) console.error(srv.app.uit.slice(-2000));
  throw err;
} finally {
  if (srv) srv.app.kill();
  mollieSrv.close();
  await rm(dataDir, { recursive: true, force: true });
}
