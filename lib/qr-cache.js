// Begrensde cache voor de QR-code naar de voorbeeldkaart (security 2026-11-15 20u).
//
// De QR op /v2/proef (en eventueel de landing) wordt gemaakt van "https://" + host + "/k/demo".
// De host komt uit de Host-kop van het verzoek; eigenHost laat elk subdomein van het eigen domein
// en elke poort door. De oude cache was een Map zonder grens: elk verzoek met een andere Host-kop
// (bv. een andere poort van 15.000 cijfers) bleef voor altijd in het geheugen staan, met de hele
// URL als sleutel. Zonder inloggen kon zo iedereen het geheugen van de server laten vollopen.
//
// Nu: hooguit `max` QR-codes; de langst niet gebruikte gaat eruit. In de praktijk zijn er maar een
// paar echte hosts (fysiplan.nl, www., de testomgeving, localhost), dus de cache doet hetzelfde werk.
export function maakQrCache(maak, max = 16) {
  const cache = new Map();
  const fn = async (url, px) => {
    const sleutel = px + "|" + url;
    if (cache.has(sleutel)) {
      const svg = cache.get(sleutel);
      cache.delete(sleutel);
      cache.set(sleutel, svg);
      return svg;
    }
    let svg = "";
    try { svg = (await maak(url, px)) || ""; } catch {}
    cache.set(sleutel, svg);
    while (cache.size > max) cache.delete(cache.keys().next().value);
    return svg;
  };
  fn.grootte = () => cache.size;
  return fn;
}
