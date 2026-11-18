// Factuuroverzicht op Mijn abonnement: één regel per betaling, nieuwste bovenaan, met
// nummer, betaaldatum, periode, therapeuten en bedrag. `npm run test:abonnement`
import assert from "node:assert/strict";
import { factuurRegels, factuurOverzichtHtml } from "../lib/factuur.js";

const dag = 86400000;
const eerste = Date.UTC(2026, 10, 8, 10), tweede = Date.UTC(2026, 11, 8, 10), derde = Date.UTC(2027, 0, 8, 10);

// zonder betaling (proef, of nog niet betaald): geen overzicht
assert.deepEqual(factuurRegels(null), []);
assert.deepEqual(factuurRegels({ status: "actief" }), []);
assert.equal(factuurOverzichtHtml({ status: "actief" }), "");

const a = {
  status: "actief", aantal: 2, bedrag: "19.98", sinds: eerste, betaaldTot: derde + 31 * dag, eersteBetaling: "tr_een", factuurNr: "FP-2026-0001",
  betalingen: [
    { id: "tr_twee", aantal: 2, bedrag: "19.98", sinds: tweede, betaaldTot: derde, betaald: tweede + 3600000, factuurNr: "FP-2026-0007" },
    { id: "tr_drie", aantal: 3, bedrag: "29.97", sinds: derde, betaaldTot: derde + 31 * dag, betaald: derde + dag },
    null, { kapot: true }
  ]
};
const r = factuurRegels(a);
assert.equal(r.length, 3, "eerste maand plus twee latere; kapotte regels vallen weg");
assert.deepEqual(r.map((x) => x.van), [derde, tweede, eerste], "nieuwste bovenaan");
assert.equal(r[2].tot, tweede, "de eerste maand loopt een maand vanaf de start, ook als betaaldTot later is opgeschoven");
assert.deepEqual(r.map((x) => x.cent), [2997, 1998, 1998]);
assert.equal(r[0].aantal, 3, "aantal van de betaling zelf");
assert.equal(r[0].href, "", "zonder nummer (nog niet uitgegeven) geen link");

const html = factuurOverzichtHtml(a, "Factuur");
assert.match(html, /id="facturen"/);
assert.match(html, /<h3[^>]*>Facturen<\/h3>/);
assert.ok(html.includes('href="/v2/proef/factuur"'), "de eerste maand linkt naar de eerste factuur");
assert.ok(html.includes('href="/v2/proef/factuur?nr=FP-2026-0007"'), "een latere maand linkt met zijn nummer");
assert.ok(html.includes(">volgt<"), "zonder nummer: 'volgt'");
assert.ok(html.includes("&euro;&nbsp;29,97") && html.includes("&euro;&nbsp;19,98"), "bedragen in euro's");
assert.ok(html.indexOf("29,97") < html.indexOf("FP-2026-0007") && html.indexOf("FP-2026-0007") < html.indexOf("FP-2026-0001"), "volgorde in de tabel");
assert.match(html, /8 nov\.? 2026 t\/m 7 dec\.? 2026/, "periode t/m de dag voor de volgende maand");
assert.match(factuurOverzichtHtml(a, "Betaalbewijs"), /<h3[^>]*>Betaalbewijzen<\/h3>/, "zonder btw-gegevens heten ze betaalbewijzen");

// nummers en bedragen komen ge-escaped in de pagina
const raar = factuurOverzichtHtml({ ...a, factuurNr: "FP-<b>", betalingen: [{ sinds: tweede, bedrag: "x", factuurNr: 'a"b' }] });
assert.ok(!raar.includes("<b>") && !raar.includes('nr=a"b'), "geen opmaak of kapotte attributen");
assert.ok(raar.includes("&euro;&nbsp;0,00"), "geen bedrag wordt 0,00");

console.log("factuuroverzicht: ok");
