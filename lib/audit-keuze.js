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

// Security 2026-11-19 (backlog LAAG, gebruikers-sweep 2026-11-19 02u, Karin): een therapeut deed
// 7 verschillende geweigerde pogingen (zichzelf beheerder maken, de beheerder verwijderen, ...);
// met hooguit 5 ruisregels vielen de oudste soorten weg, juist de pogingen tot rolverhoging. Nu:
// - een geweigerde poging van een collega (actie op "-geweigerd") krijgt één regel per soort en
//   per collega, met de teller `n` opgeteld en het tijdstip van de nieuwste; hooguit `soorten`
//   (15) van die regels. Herhaling kost zo geen plek, alleen een nieuwe soort;
// - overige ruis (foute logins zonder sessie) houdt het oude plafond `ruis` (5) en kan de
//   geweigerde pogingen van een collega niet wegdrukken.
// lijst: nieuwste eerst. Geeft een deelrij in dezelfde volgorde; samengevoegde regels zijn kopieën.
export function kiesActiviteit(lijst, isRuis, { echt = 15, ruis = 5, soorten = 15 } = {}) {
  const uit = [];
  const soort = new Map();
  let nEcht = 0, nRuis = 0;
  for (const e of lijst || []) {
    const actie = String((e && e.actie) || "");
    if (/-geweigerd$/.test(actie)) {
      const sleutel = actie + "\u0000" + String(e.wie || "");
      const al = soort.get(sleutel);
      if (al) { al.n = Math.min(9999, al.n + (Number(e.n) || 1)); continue; }
      if (soort.size >= soorten) continue;
      const kopie = { ...e, n: Number(e.n) || 1 };
      soort.set(sleutel, kopie);
      uit.push(kopie);
    } else if (isRuis(actie)) { if (nRuis < ruis) { nRuis++; uit.push(e); } }
    else if (nEcht < echt) { nEcht++; uit.push(e); }
  }
  return uit;
}

// Security 2026-11-22 (backlog MIDDEL, gebruikers-sweep 2026-11-22 02u, Karin): de ruispot van een
// praktijk (AUDIT_RUIS_PER_PRAKTIJK) is gedeeld door regels die iedereen zonder login kan maken
// (`anoniem`: toegang-geweigerd, login-mislukt, ...) en geweigerde pogingen van een collega met een
// sessie. Bij een volle pot ging de oudste ruisregel weg, dus 60 anonieme 401's op
// /api/kaarten?praktijk=<naam> wisten stil dat een therapeut zichzelf beheerder probeerde te maken.
// Nu gaat bij een volle pot eerst de oudste ANONIEME regel weg; een geweigerde poging van een
// collega verdwijnt alleen als er geen anonieme ruis meer is om te schrappen. De pot zelf blijft
// even groot. lijst: nieuwste eerst. Geeft de index om te schrappen, of -1.
export function ruisOmTeSchrappen(lijst, pk, isRuis, isAnoniem, max) {
  let n = 0, oudsteRuis = -1, oudsteAnoniem = -1;
  for (let i = 0; i < (lijst || []).length; i++) {
    const a = lijst[i];
    if (!a || a.praktijk !== pk || !isRuis(a.actie)) continue;
    n++;
    oudsteRuis = i;
    if (isAnoniem(a.actie)) oudsteAnoniem = i;
  }
  if (n <= max) return -1;
  return oudsteAnoniem >= 0 ? oudsteAnoniem : oudsteRuis;
}
