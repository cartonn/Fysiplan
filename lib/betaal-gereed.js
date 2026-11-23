// Klaar voor de eerste betaling: wat er op de server nog ontbreekt voordat een praktijk online
// kan afrekenen, een echte factuur krijgt en na de eerste maand vanzelf doorloopt. Voor het
// Platform-blok in de beheeromgeving. Alleen of iets is ingesteld en welke variabele ontbreekt;
// nooit een sleutel of een waarde zelf.
//
//   sleutel  de Mollie-sleutel die de server gebruikt ("" = uit)
//   prijs    prijsRegels(...) uit lib/prijs.js
//   incasso  of MOLLIE_INCASSO aan staat
//   mail     of mail werkt (MAIL_API_SLEUTEL + MAIL_AFZENDER)
//   lev      de bedrijfsgegevens van Fysiplan (FYSIPLAN_ID in server.js)
import { isFactuur } from "./factuur.js";

const KEUZE = { kor: "kleineondernemersregeling, zonder btw", exclusief: "prijs exclusief btw", inclusief: "prijs inclusief btw" };

export function betaalChecks({ sleutel = "", prijs = {}, incasso = false, mail = false, lev = {} } = {}) {
  const s = String(sleutel || "");
  const test = /^test_/.test(s);
  const kor = prijs.keuze === "kor";
  const uit = [];
  const rijen = [];

  rijen.push(!s
    ? { naam: "Betalingen", ok: false, tekst: "Mollie staat uit (geen MOLLIE_API_KEY): praktijken kunnen niet online betalen; \"Ja, ik wil doorgaan\" blijft de weg" }
    : test
      ? { naam: "Betalingen", ok: null, tekst: "Mollie met een testsleutel: betalen werkt, maar er komt geen echt geld binnen" }
      : { naam: "Betalingen", ok: true, tekst: "Mollie ingesteld met een livesleutel" });

  rijen.push(prijs.betalenKan
    ? { naam: "Prijs en btw", ok: true, tekst: "Gekozen: " + (KEUZE[prijs.keuze] || prijs.keuze) }
    : { naam: "Prijs en btw", ok: false, tekst: "Nog niet gekozen bij Cijfers (btw-instellingen): online afrekenen start pas daarna" });

  if (!lev.bedrijf) uit.push("FYSIPLAN_BEDRIJF");
  if (!lev.kvk) uit.push("FYSIPLAN_KVK");
  if (!lev.adres) uit.push("FYSIPLAN_ADRES");
  if (!kor && !lev.btwNummer) uit.push("FYSIPLAN_BTW_NUMMER");
  rijen.push(isFactuur(lev, kor)
    ? { naam: "Factuur", ok: true, tekst: kor ? "Factuur zonder btw (kleineondernemersregeling)" : "Volledige factuur met btw" }
    : { naam: "Factuur", ok: false, tekst: "Praktijken krijgen alleen een betaalbewijs; ontbreekt: " + uit.join(", ") });

  const mist = [];
  if (!incasso) mist.push("MOLLIE_INCASSO=aan");
  if (!s) mist.push("MOLLIE_API_KEY");
  if (!mail) mist.push("mail (MAIL_API_SLEUTEL en MAIL_AFZENDER)");
  rijen.push(!mist.length
    ? { naam: "Maandincasso", ok: true, tekst: "Na de eerste maand int Fysiplan elke maand vanzelf, met een mail vooraf" }
    : { naam: "Maandincasso", ok: false, tekst: "Uit: na de eerste maand int Fysiplan niet vanzelf; ontbreekt: " + mist.join(", ") });

  return rijen;
}
