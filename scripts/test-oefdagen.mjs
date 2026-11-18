// Gebruikers-sweep 2026-11-12 14u (Truus, iPhone SE + desktop): de patiënt vinkte vandaag twee oefeningen af,
// maar de therapeut zag "0 deze week actief" en "Download mijn gegevens" zei bij "Dagen waarop ik heb geoefend"
// "niets". Alleen de dagvink "Ik heb vandaag geoefend" (gedaan) telde. Keuze Ahmed (2026-11-12): een afgevinkte
// oefening telt ook als oefendag. oefDagen() in de app voegt beide samen (één per dag), de download idem.
// Draait zonder browser (CI). `npm run test:oefdagen`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const app = await readFile(join(root, "public/index.html"), "utf8");
const m = app.match(/  function oefDagen\(c\)\{[\s\S]*?\n  \}\n/);
assert.ok(m, "oefDagen staat in de app");
const ctx = {};
vm.runInNewContext(m[0] + ";this.oefDagen=oefDagen;", ctx);
const nu = Date.now(), dag = 864e5;
const nlDag = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
// alleen afgevinkte oefeningen (vandaag), geen dagvink: telt als oefendag
const alleenVinkjes = ctx.oefDagen({ gedaan: [], oefTrouw: { Squat: { n: 1, d: nlDag(nu) }, Brug: { n: 3, d: nlDag(nu) } } });
assert.equal(alleenVinkjes.length, 1, "twee vinkjes op dezelfde dag zijn één oefendag");
// (oefDagen kapt af op zijn eigen Date.now(), dat een paar ms na `nu` kan liggen: vergelijk met de klok van nu)
assert.ok(nu - alleenVinkjes[0].t < 7 * dag && alleenVinkjes[0].t <= Date.now(), "vandaag valt in deze week en niet in de toekomst");
// dagvink en vinkje op dezelfde dag tellen één keer; een oudere dag komt ervoor
const gemengd = ctx.oefDagen({ gedaan: [{ t: nu - 2 * dag }, { t: nu }], oefTrouw: { Squat: { n: 2, d: nlDag(nu) }, Oud: { n: 1, d: nlDag(nu - 20 * dag) } } });
assert.equal(gemengd.length, 3, "drie verschillende dagen");
assert.ok(gemengd[0].t < gemengd[1].t && gemengd[1].t < gemengd[2].t, "oplopend");
// rare data van de server breekt niets
assert.equal(ctx.oefDagen({ oefTrouw: { a: { d: "" }, b: null, c: { d: "gisteren" }, d: { d: 5 } } }).length, 0, "lege of rare dagen tellen niet");
assert.equal(ctx.oefDagen({}).length, 0);
assert.equal(ctx.oefDagen(null).length, 0);
// de plekken die "actief" en "geoefend" tellen gebruiken oefDagen
assert.match(app, /var actiefDezeWeek=function\(c\)\{return oefDagen\(c\)\.some\(/, "chip 'deze week actief'");
assert.match(app, /var weekActief=lijst\.filter\(function\(c\)\{return oefDagen\(c\)\.some\(/, "praktijkrapport");
assert.match(app, /var gd=oefDagen\(kaart\);/, "EPD-regel oefentrouw");
assert.match(app, /var odg=oefDagen\(c\);/, "regel per kaart in het overzicht");

// download "Mijn gegevens" op /k
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
const blok = kaartHtml.match(/\/\/ <mgTekst>([\s\S]*?)\/\/ <\/mgTekst>/);
assert.ok(blok, "mgTekst staat tussen de markeringen");
const k2 = {};
vm.runInNewContext(blok[1] + ";this.mgTekst=mgTekst;", k2);
const h = (loc) => ({
  datum: (t) => new Date(t).toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }),
  dagTijd: (t) => new Date(t).toLocaleString(loc, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }),
  naam: (x) => x.n, sleutel: (x) => "n" + String(x.n).toLowerCase() + "." + (x.i || 0)
});
const T = Date.UTC(2026, 10, 3, 9, 30);
const basis = { id: "abc123def456", praktijk: "Fysio Test", verloopt: T + 90 * dag, client: { c_naam: "Truus" },
  chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 0 }], cells: {} };
const tekst = k2.mgTekst({ ...basis, gedaan: [], oefTrouw: { Squat: { n: 1, d: "2026-11-12" }, Brug: { n: 1, d: "2026-11-12" } } }, "Fysio Test", {}, "nl", h("nl-NL"));
assert.match(tekst, /Dagen waarop ik heb geoefend[^\n]*\n- 12 november 2026\n/, "afgevinkte oefening telt als oefendag in de download");
const beide = k2.mgTekst({ ...basis, gedaan: [{ t: T }], oefTrouw: { Squat: { n: 2, d: "2026-11-03" }, Brug: { n: 1, d: "2026-11-05" } } }, "Fysio Test", {}, "nl", h("nl-NL"));
assert.match(beide, /Dagen waarop ik heb geoefend[^\n]*\n- 3 november 2026, 5 november 2026\n/, "dagvink en vinkje op dezelfde dag één keer, oplopend");
const leeg = k2.mgTekst({ ...basis, gedaan: [], oefTrouw: {} }, "Fysio Test", {}, "nl", h("nl-NL"));
assert.match(leeg, /Dagen waarop ik heb geoefend[^\n]*\n- niets\n/, "zonder oefendagen 'niets'");
console.log("test-oefdagen: ok (afgevinkte oefening telt als oefendag in overzicht, rapport en download)");
