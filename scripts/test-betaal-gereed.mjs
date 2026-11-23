// Klaar voor de eerste betaling: het Platform-blok in de beheeromgeving noemt per stap wat er
// ontbreekt (Mollie, prijs en btw, factuur, maandincasso), met de exacte variabele, en nooit een
// sleutel zelf. Zonder browser, zonder server: draait in CI.
import assert from "node:assert/strict";
import { betaalChecks } from "../lib/betaal-gereed.js";
import { prijsRegels } from "../lib/prijs.js";

const naam = (r, n) => r.find((c) => c.naam === n);
const LEV = { bedrijf: "Voorbeeld bv", kvk: "12345678", adres: "Straat 1, Plaats", btwNummer: "NL000000000B01" };

// 1. alles uit, zoals productie nu: vier rijen, alle vier niet in orde, met wat er ontbreekt
{
  const r = betaalChecks({ sleutel: "", prijs: prijsRegels({}), incasso: false, mail: true, lev: {} });
  assert.deepEqual(r.map((c) => c.naam), ["Betalingen", "Prijs en btw", "Factuur", "Maandincasso"]);
  assert.ok(r.every((c) => c.ok === false), "zonder iets is niets in orde");
  assert.match(naam(r, "Betalingen").tekst, /MOLLIE_API_KEY/);
  assert.match(naam(r, "Prijs en btw").tekst, /Cijfers/);
  assert.match(naam(r, "Factuur").tekst, /betaalbewijs.*FYSIPLAN_BEDRIJF, FYSIPLAN_KVK, FYSIPLAN_ADRES, FYSIPLAN_BTW_NUMMER/);
  assert.match(naam(r, "Maandincasso").tekst, /MOLLIE_INCASSO=aan, MOLLIE_API_KEY$/, "mail werkt al, dus die staat er niet bij");
}

// 2. testsleutel: twijfel, geen groen vinkje; de sleutel zelf komt nergens in de tekst
{
  const sleutel = "test_abcdefghijklmnopqrstuvwxyz12";
  const r = betaalChecks({ sleutel, prijs: prijsRegels({ kor: "nee", prijsBtw: "exclusief" }), incasso: true, mail: false, lev: LEV });
  assert.equal(naam(r, "Betalingen").ok, null);
  assert.match(naam(r, "Betalingen").tekst, /geen echt geld/);
  assert.deepEqual([naam(r, "Prijs en btw").ok, naam(r, "Prijs en btw").tekst], [true, "Gekozen: prijs exclusief btw"]);
  assert.equal(naam(r, "Factuur").ok, true);
  assert.match(naam(r, "Maandincasso").tekst, /ontbreekt: mail \(MAIL_API_SLEUTEL en MAIL_AFZENDER\)$/);
  assert.doesNotMatch(JSON.stringify(r), /abcdefghij/, "geen sleutel in wat beheer ziet");
}

// 3. alles klaar met een livesleutel
{
  const r = betaalChecks({ sleutel: "live_xyz", prijs: prijsRegels({ kor: "nee", prijsBtw: "inclusief" }), incasso: true, mail: true, lev: LEV });
  assert.ok(r.every((c) => c.ok === true), JSON.stringify(r));
  assert.doesNotMatch(JSON.stringify(r), /live_xyz/);
}

// 4. KOR: een factuur zonder btw-nummer is dan volledig; ontbreekt alleen het adres, dan noemt hij alleen dat
{
  const kor = prijsRegels({ kor: "ja" });
  const zonderBtw = { ...LEV, btwNummer: "" };
  assert.deepEqual(naam(betaalChecks({ sleutel: "live_x", prijs: kor, lev: zonderBtw }), "Factuur"), { naam: "Factuur", ok: true, tekst: "Factuur zonder btw (kleineondernemersregeling)" });
  const r = betaalChecks({ sleutel: "live_x", prijs: kor, lev: { ...zonderBtw, adres: "" } });
  assert.match(naam(r, "Factuur").tekst, /ontbreekt: FYSIPLAN_ADRES$/);
}

console.log("test-betaal-gereed: ok");
