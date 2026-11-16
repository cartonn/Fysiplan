// Welke regels in het praktijklogboek "ruis" zijn, en welke regels Activiteit toont.
//
// Security 2026-11-16 (backlog MIDDEL, gebruikers-sweep 2026-11-15 22u en 2026-11-16 02u, Karin):
// Activiteit toonde de nieuwste 15 regels. Een gewone therapeut die een paar keer iets probeerde
// wat alleen een beheerder mag (team, profiel, werk van een collega), vulde met 22 geweigerde
// pogingen alle 15 plekken; "collega verwijderd", "kaart naar de prullenbak" en "profiel gewijzigd"
// verdwenen uit beeld. In de opslag telden die pogingen bovendien mee voor de 300 echte
// gebeurtenissen per praktijk, dus een lus van geweigerde pogingen wiste op den duur het echte
// spoor. Nu:
// - een geweigerde poging (actie eindigt op "-geweigerd") is ruis, net als foute logins: die
//   delen het kleine plafond en duwen geen echte gebeurtenis uit de opslag;
// - Activiteit toont de nieuwste 15 echte gebeurtenissen plus hooguit 5 ruisregels.

export function isAuditRuis(actie, basis) {
  const a = String(actie || "");
  return (basis && basis.has(a)) || /-geweigerd$/.test(a);
}

// lijst: nieuwste eerst. Geeft een deelrij in dezelfde volgorde.
export function kiesActiviteit(lijst, isRuis, { echt = 15, ruis = 5 } = {}) {
  const uit = [];
  let nEcht = 0, nRuis = 0;
  for (const e of lijst || []) {
    if (nEcht >= echt && nRuis >= ruis) break;
    if (isRuis(e && e.actie)) { if (nRuis < ruis) { nRuis++; uit.push(e); } }
    else if (nEcht < echt) { nEcht++; uit.push(e); }
  }
  return uit;
}
