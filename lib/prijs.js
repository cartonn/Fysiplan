// De prijs en de btw, op één plek.
//
// Wat een praktijk betaalt, wat er op de factuur staat en wat de teksten beloven, kwam uit
// drie losse plekken en klopte niet met elkaar: de teksten zeiden "9,99 exclusief btw", Mollie
// schreef 9,99 af en de factuur haalde de btw uit dat bedrag. Nu komt alles hieruit.
//
// De keuze zelf maakt de eigenaar, in de beheeromgeving onder Finance (lib/beheer-omgeving.js,
// financeInstellingen): valt Fysiplan onder de kleineondernemersregeling, en zo nee, is de prijs
// inclusief of exclusief btw. Zolang die keuze open is, start online afrekenen niet: er is dan
// geen bedrag dat met de teksten én met de factuur klopt.
//
// Alleen rekenen en tekst; geen opslag en geen verzoeken. Bedragen zijn centen.

export const PRIJS_CENT = 999; // € 9,99 per therapeut per maand
export const BTW_TARIEF = 21; // software als dienst: algemeen tarief

export const euro = (cent) => "€ " + Math.floor(cent / 100) + "," + String(cent % 100).padStart(2, "0");

// Van de instellingen naar de regels.
//   keuze "kor":       kleineondernemersregeling: geen btw, de prijs is het bedrag
//   keuze "exclusief": de prijs is zonder btw; de btw komt erbij
//   keuze "inclusief": de prijs is met btw; de btw zit erin
//   keuze "open":      nog niet gekozen. Rekent zoals het altijd was (btw in het bedrag), zodat
//                      bestaande cijfers niet verspringen; `betalenKan` is dan false.
export function prijsRegels(inst) {
  const i = inst && typeof inst === "object" ? inst : {};
  const prijsCent = Number.isInteger(i.prijsCent) && i.prijsCent > 0 ? i.prijsCent : PRIJS_CENT;
  const tarief = Number.isFinite(i.btwTarief) && i.btwTarief >= 0 && i.btwTarief <= 30 ? i.btwTarief : BTW_TARIEF;
  let keuze = "open";
  if (i.kor === "ja") keuze = "kor";
  else if (i.kor === "nee" && (i.prijsBtw === "inclusief" || i.prijsBtw === "exclusief")) keuze = i.prijsBtw;
  return { keuze, prijsCent, tarief: keuze === "kor" ? 0 : tarief, betalenKan: keuze !== "open" };
}

// Wat er voor `aantal` therapeuten wordt afgeschreven, en hoe dat op de factuur uiteenvalt.
// De btw wordt over het hele bedrag berekend en dan afgerond, niet per therapeut: zo telt de
// factuur altijd op tot wat er is afgeschreven.
export function bedragVoor(aantal, regels) {
  const r = regels || prijsRegels();
  const basis = r.prijsCent * aantal;
  if (r.keuze === "kor" || !r.tarief) return { keuze: r.keuze, tarief: 0, exclCent: basis, btwCent: 0, totaalCent: basis };
  if (r.keuze === "exclusief") {
    const btw = Math.round(basis * r.tarief / 100);
    return { keuze: r.keuze, tarief: r.tarief, exclCent: basis, btwCent: btw, totaalCent: basis + btw };
  }
  const btw = Math.round(basis * r.tarief / (100 + r.tarief));
  return { keuze: r.keuze, tarief: r.tarief, exclCent: basis - btw, btwCent: btw, totaalCent: basis };
}

// wat er bij een betaling bewaard wordt, zodat de factuur later hetzelfde zegt als toen,
// ook als de keuze intussen is veranderd
export const btwVan = (b) => ({ keuze: b.keuze, tarief: b.tarief, exclCent: b.exclCent, btwCent: b.btwCent });

// Het bijschrift achter de prijs. `kort` voor achter een bedrag ("excl. btw").
// Open: wat de teksten altijd zeiden. Dat blijft staan tot de keuze gemaakt is.
export function btwBijschrift(regels, kort = false) {
  const k = (regels || prijsRegels()).keuze;
  if (k === "kor") return kort ? "geen btw" : "Fysiplan rekent geen btw";
  if (k === "inclusief") return kort ? "incl. btw" : "inclusief btw";
  return kort ? "excl. btw" : "exclusief btw";
}

// De prijs in één zin, zoals hij in het betaalblok en in mails staat. Bij exclusief staat het
// bedrag met btw erbij: een fysiotherapiepraktijk kan btw meestal niet terugvragen en betaalt
// dus dat bedrag.
export function prijsZin(regels, { html = false } = {}) {
  const r = regels || prijsRegels();
  const e = (cent) => (html ? euro(cent).replace("€ ", "&euro; ") : (cent / 100).toFixed(2).replace(".", ",") + " euro");
  const per = " per therapeut per maand";
  if (r.keuze === "kor") return e(r.prijsCent) + per + "; Fysiplan rekent geen btw";
  if (r.keuze === "exclusief") return e(r.prijsCent) + per + ", exclusief btw (" + e(bedragVoor(1, r).totaalCent) + " inclusief btw)";
  return e(r.prijsCent) + per + ", " + btwBijschrift(r);
}

// De openbare teksten die niet door de server worden opgebouwd (de landing en haar rekenhulp)
// noemen de btw in vaste woorden. De server zet daar het bijschrift van de keuze in.
export function metBtwBijschrift(tekst, regels) {
  const r = regels || prijsRegels();
  if (r.keuze === "open" || r.keuze === "exclusief") return tekst;
  return String(tekst).replaceAll("exclusief btw", btwBijschrift(r)).replaceAll("excl. btw", btwBijschrift(r, true));
}
