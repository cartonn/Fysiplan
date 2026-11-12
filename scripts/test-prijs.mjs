// De prijs en de btw op één plek (lib/prijs.js).
//
// Wat een praktijk betaalt, wat de factuur zegt en wat de teksten beloven, komt uit dezelfde
// regels, gevoed door de btw-keuze in de beheeromgeving (finance-instellingen.json):
//   1. de regels: kleineondernemersregeling, exclusief, inclusief, en "nog niet gekozen";
//   2. het bedrag per regime, en dat de factuur altijd optelt tot wat er is afgeschreven;
//   3. de teksten per regime;
//   4. een betaling onthoudt haar eigen bedrag en btw: een latere keuze verandert haar niet,
//      ook niet tussen de aankondiging van een incasso en de afschrijving;
//   5. de echte server per regime, tegen een nagemaakte Mollie: het betaalblok, het bedrag dat
//      Mollie krijgt, de factuur en de landing zeggen hetzelfde;
//   6. zolang de keuze open is, start online afrekenen niet;
//   7. de prijs staat nergens anders nog als los getal.
// Zonder browser en zonder internet. `npm run test:prijs`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIJS_CENT, BTW_TARIEF, prijsRegels, bedragVoor, btwVan, btwBijschrift, prijsZin, metBtwBijschrift, euro } from "../lib/prijs.js";
import { PRIJS_PER_THERAPEUT_CENT, maandBedrag, betaalBedrag, beoordeelBetaling, markeerBetaald, markeerGemeld, incassoBedrag, incassoVerzoek,
  markeerIncassoGestart, beoordeelIncasso, markeerIncassoBetaald } from "../lib/mollie.js";
import { factuurBedragen, factuurHtml, isFactuur, bedragen, naarCent, BTW_TARIEF as FACTUUR_TARIEF } from "../lib/factuur.js";
import { FINANCE_STANDAARD, financeInstellingen, splits } from "../lib/beheer-omgeving.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KOR = { kor: "ja" }, EXCL = { kor: "nee", prijsBtw: "exclusief" }, INCL = { kor: "nee", prijsBtw: "inclusief" };

// ---- 1. de regels ----
assert.equal(PRIJS_CENT, 999);
assert.equal(PRIJS_PER_THERAPEUT_CENT, PRIJS_CENT, "de oude naam wijst naar dezelfde prijs");
assert.equal(FACTUUR_TARIEF, BTW_TARIEF);
assert.equal(FINANCE_STANDAARD.prijsCent, PRIJS_CENT, "de beheeromgeving begint met dezelfde prijs");
assert.equal(FINANCE_STANDAARD.btwTarief, BTW_TARIEF);
assert.deepEqual(prijsRegels(), { keuze: "open", prijsCent: 999, tarief: 21, betalenKan: false });
assert.equal(prijsRegels(financeInstellingen({})).keuze, "open", "zoals de beheeromgeving begint: nog niet gekozen");
assert.equal(prijsRegels({ kor: "nee" }).keuze, "open", "geen kleine ondernemer, maar inclusief of exclusief is nog niet gekozen");
assert.equal(prijsRegels({ prijsBtw: "exclusief" }).keuze, "open", "exclusief gekozen, maar de kleineondernemersregeling staat nog open");
assert.equal(prijsRegels({ kor: "onbekend", prijsBtw: "inclusief" }).betalenKan, false);
assert.deepEqual(prijsRegels(KOR), { keuze: "kor", prijsCent: 999, tarief: 0, betalenKan: true });
assert.equal(prijsRegels({ kor: "ja", prijsBtw: "exclusief" }).keuze, "kor", "met de regeling is er geen btw, wat er verder ook staat");
assert.deepEqual(prijsRegels(EXCL), { keuze: "exclusief", prijsCent: 999, tarief: 21, betalenKan: true });
assert.deepEqual(prijsRegels(INCL), { keuze: "inclusief", prijsCent: 999, tarief: 21, betalenKan: true });
assert.equal(prijsRegels({ ...EXCL, btwTarief: 9, prijsCent: 1250 }).tarief, 9);
assert.equal(prijsRegels({ ...EXCL, btwTarief: 9, prijsCent: 1250 }).prijsCent, 1250);
assert.equal(prijsRegels({ ...EXCL, btwTarief: 99, prijsCent: -5 }).tarief, 21, "onzin valt terug op de standaard");
assert.equal(prijsRegels({ ...EXCL, btwTarief: 99, prijsCent: -5 }).prijsCent, 999);

// ---- 2. het bedrag ----
const R = { open: prijsRegels(), kor: prijsRegels(KOR), excl: prijsRegels(EXCL), incl: prijsRegels(INCL) };
assert.deepEqual(bedragVoor(1, R.excl), { keuze: "exclusief", tarief: 21, exclCent: 999, btwCent: 210, totaalCent: 1209 });
assert.deepEqual(bedragVoor(1, R.incl), { keuze: "inclusief", tarief: 21, exclCent: 826, btwCent: 173, totaalCent: 999 });
assert.deepEqual(bedragVoor(1, R.kor), { keuze: "kor", tarief: 0, exclCent: 999, btwCent: 0, totaalCent: 999 });
assert.deepEqual(bedragVoor(1, R.open), { keuze: "open", tarief: 21, exclCent: 826, btwCent: 173, totaalCent: 999 }, "open rekent zoals het altijd was");
assert.deepEqual(bedragVoor(1), bedragVoor(1, R.open));
// de btw gaat over het hele bedrag: drie therapeuten is niet drie keer het bedrag van één
assert.equal(bedragVoor(3, R.excl).totaalCent, 3626);
assert.notEqual(bedragVoor(3, R.excl).totaalCent, 3 * bedragVoor(1, R.excl).totaalCent);
for (const r of Object.values(R)) for (let n = 1; n <= 50; n++) {
  const b = bedragVoor(n, r);
  assert.equal(b.exclCent + b.btwCent, b.totaalCent, r.keuze + " " + n + ": de factuur telt op tot wat er is afgeschreven");
  assert.equal(r.keuze === "exclusief" ? b.exclCent : b.totaalCent, n * 999, r.keuze + " " + n + ": de prijs is het bedrag zonder btw (exclusief) of het hele bedrag");
  // de beheeromgeving haalt de btw uit het betaalde totaal: dat geeft in elk regime dezelfde btw
  const inst = financeInstellingen(r.keuze === "kor" ? KOR : r.keuze === "exclusief" ? EXCL : INCL);
  assert.ok(Math.abs(splits(b.totaalCent, inst).btw - b.btwCent) <= 1, r.keuze + " " + n + ": Finance splitst het betaalde bedrag hetzelfde (op een cent na)");
}
assert.deepEqual(maandBedrag(1), { currency: "EUR", value: "9.99" });
assert.equal(maandBedrag(50).value, "499.50");
assert.equal(maandBedrag(2, R.excl).value, "24.18");
assert.equal(maandBedrag(2, R.incl).value, "19.98");
assert.equal(maandBedrag(2, R.kor).value, "19.98");
assert.deepEqual(betaalBedrag(2, R.excl), { bedrag: "24.18", btw: { keuze: "exclusief", tarief: 21, exclCent: 1998, btwCent: 420 } });
assert.deepEqual(btwVan(bedragVoor(1, R.kor)), { keuze: "kor", tarief: 0, exclCent: 999, btwCent: 0 });

// ---- 3. de teksten ----
assert.equal(euro(1209), "€ 12,09");
assert.deepEqual([btwBijschrift(R.open), btwBijschrift(R.excl), btwBijschrift(R.incl), btwBijschrift(R.kor)], ["exclusief btw", "exclusief btw", "inclusief btw", "Fysiplan rekent geen btw"]);
assert.deepEqual([btwBijschrift(R.open, true), btwBijschrift(R.excl, true), btwBijschrift(R.incl, true), btwBijschrift(R.kor, true)], ["excl. btw", "excl. btw", "incl. btw", "geen btw"]);
assert.equal(prijsZin(R.excl), "9,99 euro per therapeut per maand, exclusief btw (12,09 euro inclusief btw)");
assert.equal(prijsZin(R.incl), "9,99 euro per therapeut per maand, inclusief btw");
assert.equal(prijsZin(R.kor), "9,99 euro per therapeut per maand; Fysiplan rekent geen btw");
assert.equal(prijsZin(R.open), "9,99 euro per therapeut per maand, exclusief btw", "open: wat de teksten altijd zeiden");
assert.equal(prijsZin(R.excl, { html: true }), "&euro; 9,99 per therapeut per maand, exclusief btw (&euro; 12,09 inclusief btw)");
const zin = "9,99 euro, exclusief btw. Per maand, excl. btw.";
assert.equal(metBtwBijschrift(zin, R.open), zin);
assert.equal(metBtwBijschrift(zin, R.excl), zin);
assert.equal(metBtwBijschrift(zin, R.incl), "9,99 euro, inclusief btw. Per maand, incl. btw.");
assert.equal(metBtwBijschrift(zin, R.kor), "9,99 euro, Fysiplan rekent geen btw. Per maand, geen btw.");

// ---- 4. een betaling onthoudt haar eigen bedrag en btw ----
{
  // de eerste betaling: aangemaakt onder "exclusief"; daarna verandert de keuze niets meer
  const vraag = betaalBedrag(2, R.excl);
  const p = { id: "p1", betaling: { id: "tr_abcd", aantal: 2, ...vraag } };
  const mollie = { id: "tr_abcd", status: "paid", amount: { currency: "EUR", value: "24.18" }, metadata: { proef: "p1" } };
  assert.equal(beoordeelBetaling(mollie, p), "betaald");
  assert.equal(beoordeelBetaling({ ...mollie, amount: { currency: "EUR", value: "19.98" } }, p), "vreemd", "het oude bedrag is niet het gevraagde bedrag");
  assert.equal(markeerBetaald(p, mollie, 1000), true);
  assert.equal(p.abonnement.bedrag, "24.18");
  assert.deepEqual(p.abonnement.btw, { keuze: "exclusief", tarief: 21, exclCent: 1998, btwCent: 420 });
  assert.deepEqual(factuurBedragen(p.abonnement, true), { totaal: 2418, excl: 1998, btw: 420, tarief: 21, kor: false });
  assert.deepEqual(factuurBedragen(p.abonnement, false), { totaal: 2418, excl: 2418, btw: 0, tarief: 21, kor: false }, "een betaalbewijs noemt alleen het totaal");
  // een betaling van vóór deze regel (zonder bewaard bedrag): de prijs maal het aantal, btw uit het bedrag
  const oud = { id: "p0", betaling: { id: "tr_oud1", aantal: 2 } };
  assert.equal(beoordeelBetaling({ id: "tr_oud1", status: "paid", amount: { currency: "EUR", value: "19.98" }, metadata: { proef: "p0" } }, oud), "betaald");
  assert.deepEqual(factuurBedragen({ bedrag: "19.98" }, true), { ...bedragen(1998, true), tarief: 21, kor: false });
  // bewaarde btw die niet optelt tot het bedrag, telt niet: dan liever de oude rekenwijze dan een factuur die niet klopt
  assert.deepEqual(factuurBedragen({ bedrag: "19.98", btw: { keuze: "exclusief", tarief: 21, exclCent: 1998, btwCent: 420 } }, true), { ...bedragen(1998, true), tarief: 21, kor: false });
  assert.equal(naarCent("24.18"), 2418);

  // de maandincasso: de aankondiging legt het bedrag vast, en dat wordt afgeschreven
  const DAG = 86400000, tot = 40 * DAG;
  const k = { id: "p2", abonnement: { status: "actief", aantal: 3, betaaldTot: tot, mollieKlant: "cst_1", mandaat: "mdt_abcd" } };
  markeerGemeld(k, tot - 5 * DAG, R.incl);
  assert.deepEqual(k.abonnement.gemeldBedrag, { aantal: 3, bedrag: "29.97", btw: { keuze: "inclusief", tarief: 21, exclCent: 2477, btwCent: 520 } });
  // intussen kiest de eigenaar "exclusief": deze periode blijft het aangekondigde bedrag
  assert.equal(incassoVerzoek(k, "https://x.test/hook", R.excl).amount.value, "29.97", "afgeschreven wordt wat er is aangekondigd");
  markeerIncassoGestart(k, { id: "tr_inc1" }, tot, R.excl);
  assert.equal(k.abonnement.incasso.bedrag, "29.97");
  const inc = { id: "tr_inc1", status: "paid", amount: { currency: "EUR", value: "29.97" }, metadata: { proef: "p2", periode: String(tot) } };
  assert.equal(beoordeelIncasso(inc, k), "betaald");
  assert.equal(beoordeelIncasso({ ...inc, amount: { currency: "EUR", value: "36.26" } }, k), "vreemd");
  assert.equal(markeerIncassoBetaald(k, tot + 1000), true);
  assert.equal(k.abonnement.betalingen[0].bedrag, "29.97");
  assert.equal(k.abonnement.betalingen[0].btw.keuze, "inclusief");
  // de volgende periode: een nieuwe aankondiging, nu met de nieuwe keuze
  assert.equal(incassoBedrag(k, R.excl).bedrag, "36.26", "de oude aankondiging hoort bij de vorige periode");
  markeerGemeld(k, k.abonnement.betaaldTot - 5 * DAG, R.excl);
  assert.equal(incassoVerzoek(k, "", R.incl).amount.value, "36.26");
  markeerIncassoGestart(k, { id: "tr_inc2" }, k.abonnement.betaaldTot, R.incl);
  const inc2 = { id: "tr_inc2", status: "paid", amount: { currency: "EUR", value: "36.26" }, metadata: { proef: "p2", periode: String(k.abonnement.betaaldTot) } };
  assert.equal(beoordeelIncasso(inc2, k), "betaald", "verwacht wordt het bedrag van de incasso zelf");
  assert.equal(beoordeelIncasso({ ...inc2, amount: { currency: "EUR", value: "29.97" } }, k), "vreemd", "niet de prijs maal het aantal");
  assert.equal(markeerIncassoBetaald(k, k.abonnement.betaaldTot + 1000), true);
  assert.deepEqual([k.abonnement.betalingen[1].bedrag, k.abonnement.betalingen[1].btw.keuze], ["36.26", "exclusief"], "de betaling in de lijst draagt het afgeschreven bedrag");
  // verandert het aantal therapeuten na de aankondiging, dan geldt de aankondiging niet meer
  k.abonnement.aantal = 4;
  assert.equal(incassoBedrag(k, R.excl).bedrag, "48.35");
  // zonder regels (aanroepen van vóór deze regel): de prijs maal het aantal
  const z = { id: "p3", abonnement: { status: "actief", aantal: 2, betaaldTot: tot, mollieKlant: "cst_2" } };
  markeerGemeld(z, tot - 5 * DAG);
  assert.equal("gemeldBedrag" in z.abonnement, false);
  assert.equal(incassoVerzoek(z, "").amount.value, "19.98");
}

// de factuur per regime
{
  const lev = { btwNummer: "NL000000000B01", bedrijf: "Fysiplan B.V.", kvk: "12345678", adres: "Straat 1, Utrecht" };
  const ab = (r) => ({ factuurNr: "FP-2026-0001", aantal: 2, sinds: Date.UTC(2026, 10, 1), eersteBetaling: "tr_x1", ...betaalBedrag(2, r) });
  let h = factuurHtml({ leverancier: lev, afnemer: { naam: "P" }, abonnement: ab(R.excl) });
  assert.ok(h.includes("€ 19,98") && h.includes("Btw 21%") && h.includes("€ 4,20") && h.includes("€ 24,18"), "exclusief: 19,98 plus 4,20 is 24,18");
  h = factuurHtml({ leverancier: lev, afnemer: { naam: "P" }, abonnement: ab(R.incl) });
  assert.ok(h.includes("€ 16,51") && h.includes("Btw 21%") && h.includes("€ 3,47") && h.includes("€ 19,98"), "inclusief: 16,51 plus 3,47 is 19,98");
  h = factuurHtml({ leverancier: lev, afnemer: { naam: "P" }, abonnement: ab(R.kor) });
  assert.ok(h.includes("€ 19,98") && !/Btw \d+%/.test(h), "kleineondernemersregeling: geen regel met btw");
  assert.match(h, /vrijgesteld van omzetbelasting op grond van artikel 25/);
  // met de regeling is er geen btw-id nodig voor een factuur; de andere bedrijfsgegevens wel
  const zonderId = { ...lev, btwNummer: "" };
  assert.deepEqual([isFactuur(lev), isFactuur(zonderId), isFactuur(zonderId, true), isFactuur({ ...zonderId, kvk: "" }, true)], [true, false, true, false]);
  h = factuurHtml({ leverancier: zonderId, afnemer: { naam: "P" }, abonnement: ab(R.kor) });
  assert.match(h, /<h1>Factuur<\/h1>/, "kleineondernemersregeling zonder btw-id: een factuur");
  assert.match(h, /vrijgesteld van omzetbelasting/);
  assert.doesNotMatch(h, /Btw-id/);
  assert.match(factuurHtml({ leverancier: zonderId, afnemer: { naam: "P" }, abonnement: ab(R.incl) }), /<h1>Betaalbewijs<\/h1>/, "met btw en zonder btw-id blijft het een betaalbewijs");
  h = factuurHtml({ leverancier: {}, afnemer: { naam: "P" }, abonnement: ab(R.kor) });
  assert.match(h, /<h1>Betaalbewijs<\/h1>/);
  assert.doesNotMatch(h, /vrijgesteld van omzetbelasting/, "een betaalbewijs zegt niets over de btw");
  h = factuurHtml({ leverancier: lev, afnemer: { naam: "P" }, abonnement: ab(prijsRegels({ ...EXCL, btwTarief: 9 })) });
  assert.ok(h.includes("Btw 9%") && h.includes("€ 1,80") && h.includes("€ 21,78"), "het tarief op de factuur is het tarief van de betaling");
}

// ---- 5 en 6. de echte server, tegen een nagemaakte Mollie ----
const nep = { verzoeken: [], betaling: null };
const mollieSrv = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    nep.verzoeken.push({ methode: req.method, pad: req.url, body: body ? JSON.parse(body) : null });
    const json = (s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.method === "POST" && req.url === "/v2/customers") return json(201, { id: "cst_test1" });
    if (req.method === "POST" && req.url === "/v2/payments") {
      const b = JSON.parse(body);
      nep.betaling = { id: "tr_prijs" + nep.verzoeken.length, status: "open", amount: b.amount, metadata: b.metadata, mandateId: "mdt_test1" };
      return json(201, { ...nep.betaling, _links: { checkout: { href: "https://www.mollie.com/checkout/test" } } });
    }
    if (req.method === "GET" && nep.betaling && req.url === "/v2/payments/" + nep.betaling.id) return json(200, nep.betaling);
    json(404, {});
  });
});
await new Promise((r) => mollieSrv.listen(0, "127.0.0.1", r));
const mollieBasis = "http://127.0.0.1:" + mollieSrv.address().port;
const werkmap = await mkdtemp(join(tmpdir(), "fysiplan-prijs-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
let nr = 0;

// één praktijk waarvan de proef net voorbij is, op een eigen server met de gegeven keuze
async function metKeuze(inst, doe, { zonderBtwId = false } = {}) {
  const dataDir = await mkdtemp(join(werkmap, "d" + ++nr + "-"));
  const token = randomBytes(24).toString("hex"), dag = 86400000;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({ oud0000000000001: { id: "oud0000000000001", email: "oud@praktijk.invalid", naam: "Piet Oud",
    tel: "+31201230000", praktijk: "Fysio Oud", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(token)] } }));
  // drie logins: het aantal therapeuten telt de server zelf (lib/plaatsen.js)
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({ oudpk0001: { naam: "Fysio Oud", proef: { id: "oud0000000000001" },
    leden: [1, 2, 3].map((n) => ({ id: "l" + n, naam: "Login " + n, rol: n === 1 ? "beheerder" : "therapeut", hash: "x" })) } }));
  const zetKeuze = (i) => (i ? writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify(i)) : null);
  await zetKeuze(inst);
  const cookie = "fpproef=" + token;
  let app = null, origin = "";
  const start = async () => {
    const reserve = createServer();
    await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
    const port = reserve.address().port;
    await new Promise((r) => reserve.close(r));
    const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", PROEF_MELDING_AAN: "",
      MOLLIE_API_KEY: "test_sleutel", MOLLIE_API_BASIS: mollieBasis, FYSIPLAN_BTW_NUMMER: zonderBtwId ? "" : "NL000000000B01", FYSIPLAN_BEDRIJF: "Fysiplan B.V.", FYSIPLAN_KVK: "12345678", FYSIPLAN_ADRES: "Straat 1, Utrecht" };
    for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|MOLLIE_INCASSO$)/.test(k)) delete env[k];
    app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    app.uit = "";
    app.stdout.on("data", (c) => { app.uit += c; });
    app.stderr.on("data", (c) => { app.uit += c; });
    origin = "http://127.0.0.1:" + port;
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  };
  const stop = async () => { if (app && app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };
  await start();
  const pagina = async (pad, metCookie = true) => (await fetch(origin + pad, metCookie ? { headers: { cookie } } : {})).text();
  const betaal = (aantal) => fetch(origin + "/v2/proef/betalen", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: new URLSearchParams({ aantal: String(aantal) }).toString() });
  const proef = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8")).oud0000000000001;
  try { await doe({ pagina, betaal, proef, herstart: async (i) => { await stop(); await zetKeuze(i); await start(); } }); }
  catch (e) { e.message += "\n--- server ---\n" + (app ? app.uit.slice(-1500) : ""); throw e; }
  finally { await stop(); }
}

try {
  // per regime: het betaalblok, het bedrag bij Mollie, wat er bewaard wordt, de factuur en de landing
  const gevallen = [
    { inst: EXCL, blok: /&euro; 9,99 per therapeut per maand, exclusief btw \(&euro; 12,09 inclusief btw\), maandelijks opzegbaar/, mollie: "36.26",
      btw: { keuze: "exclusief", tarief: 21, exclCent: 2997, btwCent: 629 }, factuur: ["€ 29,97", "Btw 21%", "€ 6,29", "€ 36,26"], landing: "exclusief btw", kort: "excl. btw" },
    { inst: INCL, blok: /&euro; 9,99 per therapeut per maand, inclusief btw, maandelijks opzegbaar/, mollie: "29.97",
      btw: { keuze: "inclusief", tarief: 21, exclCent: 2477, btwCent: 520 }, factuur: ["€ 24,77", "Btw 21%", "€ 5,20", "€ 29,97"], landing: "inclusief btw", kort: "incl. btw" },
    { inst: KOR, blok: /&euro; 9,99 per therapeut per maand; Fysiplan rekent geen btw, maandelijks opzegbaar/, mollie: "29.97",
      btw: { keuze: "kor", tarief: 0, exclCent: 2997, btwCent: 0 }, factuur: ["€ 29,97", "vrijgesteld van omzetbelasting"], landing: "Fysiplan rekent geen btw", kort: "geen btw" },
  ];
  for (const g of gevallen) {
    const naam = prijsRegels(g.inst).keuze;
    await metKeuze(g.inst, async ({ pagina, betaal, proef, herstart }) => {
      let html = await pagina("/v2/proef");
      assert.match(html, g.blok, naam + ": het betaalblok noemt de prijs zoals de regels hem geven");
      const voor = nep.verzoeken.length;
      const r = await betaal(3);
      assert.equal(r.status, 303, naam + ": afrekenen start");
      const gevraagd = nep.verzoeken.slice(voor).find((v) => v.pad === "/v2/payments");
      assert.deepEqual(gevraagd.body.amount, { currency: "EUR", value: g.mollie }, naam + ": het bedrag dat Mollie krijgt");
      assert.deepEqual([(await proef()).betaling.bedrag, (await proef()).betaling.btw], [g.mollie, g.btw], naam + ": bedrag en btw staan bij de betaling");
      nep.betaling.status = "paid";
      html = await pagina("/v2/proef/betaald");
      assert.match(html, /Factuur bekijken/, naam + ": de bedankpagina wijst naar de factuur");
      assert.match(await pagina("/v2/proef?mijn=1"), /Factuur bekijken en printen/, naam + ": Mijn abonnement ook");
      const a = (await proef()).abonnement;
      assert.deepEqual([a.status, a.aantal, a.bedrag, a.btw], ["actief", 3, g.mollie, g.btw], naam + ": het abonnement draagt het betaalde bedrag en de btw");
      html = await pagina("/v2/proef/factuur");
      assert.match(html, /<h1>Factuur<\/h1>/);
      for (const stuk of g.factuur) assert.ok(html.includes(stuk), naam + ": de factuur noemt " + stuk);
      assert.equal(/Btw \d+%/.test(html), naam !== "kor", naam + ": een regel met btw, behalve met de kleineondernemersregeling");
      // de landing zegt hetzelfde, ook in de rekenhulp
      html = await pagina("/v2", false);
      assert.ok(html.includes("9,99 euro per therapeut per maand, " + g.landing + "."), naam + ": de landing noemt " + g.landing);
      assert.ok(html.includes('data-prijs-cent="999" data-btw="' + g.kort + '"'), naam + ": de rekenhulp krijgt " + g.kort);
      assert.equal(html.includes("exclusief btw"), naam === "exclusief", naam + ": 'exclusief btw' staat er alleen als dat de keuze is");
      // de eigenaar kiest later iets anders: de factuur die er al is, verandert niet
      const factuurVoor = await pagina("/v2/proef/factuur");
      await herstart(naam === "inclusief" ? EXCL : INCL);
      assert.equal(await pagina("/v2/proef/factuur"), factuurVoor, naam + ": een bestaande factuur blijft zoals ze was");
      assert.equal((await proef()).abonnement.bedrag, g.mollie);
    }, { zonderBtwId: naam === "kor" }); // met de kleineondernemersregeling is er geen btw-id, en toch een factuur
  }

  // nog niet gekozen (zoals productie nu): afrekenen start niet, en de teksten blijven zoals ze waren
  for (const inst of [null, { kor: "nee" }, { prijsBtw: "exclusief" }]) {
    await metKeuze(inst, async ({ pagina, betaal, proef }) => {
      const wat = JSON.stringify(inst);
      let html = await pagina("/v2/proef");
      assert.doesNotMatch(html, /\/v2\/proef\/betalen/, wat + ": geen betaalknop");
      assert.match(html, /Online afrekenen is niet nodig/, wat + ": de tekst van zonder Mollie");
      const voor = nep.verzoeken.length;
      const r = await betaal(1);
      assert.notEqual(r.status, 303, wat + ": de betaalroute start niet");
      assert.equal(nep.verzoeken.length, voor, wat + ": er gaat niets naar Mollie");
      assert.equal((await proef()).betaling, undefined);
      html = await pagina("/v2", false);
      assert.ok(html.includes("9,99 euro per therapeut per maand, exclusief btw.") && html.includes('data-btw="excl. btw"'), wat + ": de landing blijft zoals ze was");
    });
  }

  // ---- 7. de prijs staat nergens anders als los getal ----
  const lees = (pad) => readFile(join(root, pad), "utf8");
  const server = await lees("server.js"), mollieBron = await lees("lib/mollie.js"), factuurBron = await lees("lib/factuur.js");
  assert.doesNotMatch(server, /9[,.]99/, "server.js noemt de prijs niet zelf");
  assert.doesNotMatch(server, /(ex|in)clusief btw|(ex|in)cl\. btw/, "server.js noemt de btw-keuze niet zelf");
  assert.doesNotMatch(mollieBron, /\b999\b|9[,.]99/, "lib/mollie.js heeft geen eigen prijs");
  assert.doesNotMatch(factuurBron, /\b21\b/, "lib/factuur.js heeft geen eigen tarief");
  assert.match(server, /const prijsNu = \(\) => prijsRegels\(beheerOmgeving\.instellingen\(\)\);/);
  assert.match(server, /"\/v2\/proef\/betalen" && request\.method === "POST" && betalenKan\(\)/);
  // de landing en haar rekenhulp: elke genoemde prijs is de prijs, en de rekenhulp leest hem van de pagina
  const landing = await lees("public/v2.html"), rekenhulp = await lees("public/prijs-calculator.js");
  const prijsTekst = (PRIJS_CENT / 100).toFixed(2).replace(".", ",");
  const genoemd = [...landing.matchAll(/(?:&euro;(?:&thinsp;)?|€)\s?(\d+,\d{2})(?!\d)|(\d+,\d{2}) euro/g)].map((m) => m[1] || m[2]);
  assert.ok(genoemd.length >= 5, "de landing noemt de prijs");
  assert.deepEqual([...new Set(genoemd)].sort(), [prijsTekst, (8 * PRIJS_CENT / 100).toFixed(2).replace(".", ",")].sort(), "alleen de prijs, en het voorbeeld voor acht therapeuten");
  assert.ok(landing.includes('data-prijs-cent="' + PRIJS_CENT + '"'));
  assert.equal(landing.split("exclusief btw").length - 1 + (landing.split("excl. btw").length - 1), 7, "komt er een zin over de btw bij op de landing, kijk dan of metBtwBijschrift hem meeneemt");
  assert.doesNotMatch(rekenhulp.replace(/\|\| 999;/, ""), /999|excl\. btw.*\+|9[,.]99/, "de rekenhulp rekent met de prijs van de pagina");
  assert.match(rekenhulp, /getAttribute\('data-prijs-cent'\)/);
  assert.match(rekenhulp, /getAttribute\('data-btw'\)/);

  console.log("test-prijs: ok (de regels, het bedrag per regime, de teksten, een betaling onthoudt haar btw, de server per regime tegen een nagemaakte Mollie, afrekenen start niet zonder keuze, de prijs staat op één plek)");
} finally {
  await new Promise((r) => mollieSrv.close(r));
  await rm(werkmap, { recursive: true, force: true });
}
