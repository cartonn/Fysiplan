// Telt hoe vaak iets het afgelopen uur gebeurde, per minuut in een vakje. Er wordt niets
// bewaard behalve de aantallen: geen adressen, geen paden, geen tijdstippen.
//
// server.js telt hiermee de serverfouten en laat het aantal zien op /health, zodat de bewaker
// van buitenaf (scripts/bewaker.mjs) het leest. Na een herstart begint de teller op nul.
export class UurTeller {
  constructor(minuten = 60) {
    this.minuten = minuten;
    this.vakjes = new Array(minuten).fill(0);
    this.minuut = 0; // de minuut (sinds 1970) van het vakje waar nu in geteld wordt
  }
  // vakjes van minuten die voorbij zijn, leegmaken
  schuif(nu) {
    const m = Math.floor(nu / 60000);
    if (m <= this.minuut) return; // dezelfde minuut, of een klok die terugloopt
    const stappen = Math.min(this.minuten, m - this.minuut);
    for (let i = 1; i <= stappen; i++) this.vakjes[(this.minuut + i) % this.minuten] = 0;
    this.minuut = m;
  }
  tel(nu = Date.now()) {
    this.schuif(nu);
    this.vakjes[this.minuut % this.minuten]++;
  }
  // het aantal in het afgelopen uur (de lopende minuut en de 59 ervoor)
  som(nu = Date.now()) {
    this.schuif(nu);
    let n = 0;
    for (const v of this.vakjes) n += v;
    return n;
  }
}

// Telt een antwoord van de server mee zodra het de deur uit is: 500 bij `server`, 502 bij
// `buiten`. "close" komt één keer, ook als de verbinding wegvalt. Viel ze weg voordat de server
// iets stuurde, dan staat de status nog op 200 en telt er niets: dat was de bezoeker.
export function telAntwoord(response, tellers) {
  response.once("close", () => {
    if (response.statusCode === 500) tellers.server.tel();
    else if (response.statusCode === 502) tellers.buiten.tel();
  });
}
