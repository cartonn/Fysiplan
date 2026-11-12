// Plaatsen: voor hoeveel therapeuten een praktijk betaalt, en hoeveel kaarten ze kan hebben.
//
// Het aantal therapeuten was een getal dat de praktijk zelf invulde; niets vergeleek het met wie
// er werkelijk inlogde. Nu telt de server zelf: elke actieve login is één therapeut (zo staat
// het ook in de voorwaarden). Een uitnodiging die nog niet is aangenomen, telt niet.
//
// De grens van 100 kaarten per praktijk telde ook het archief en de prullenbak mee. Nu tellen
// alleen lopende kaarten, en een klant heeft er ruimte voor per login. Er blijft een grens:
// alle kaarten staan tot de database er is in één bestand, en zonder grens zet één account dat vol.
//
// Alleen rekenen; geen opslag en geen verzoeken.

export const MAX_PLAATSEN = 50; // zoveel mensen kan een praktijk hebben
export const KAARTEN_PROEF = 100; // lopende kaarten tijdens de proef
export const KAARTEN_PER_LOGIN = 300; // lopende kaarten per login voor een klant
export const KAARTEN_BEWAARD_KEER = 3; // archief en prullenbak erbij: hooguit zoveel keer de grens

// actieve logins: wie een wachtwoord heeft gekozen
export const telLogins = (leden) => (Array.isArray(leden) ? leden.filter((l) => l && l.hash).length : 0);
// het aantal therapeuten waarvoor betaald wordt: minstens 1 (een praktijk zonder login is één persoon)
export const plaatsenVan = (leden) => Math.min(MAX_PLAATSEN, Math.max(1, telLogins(leden)));

// Het hoogste aantal logins sinds de vorige aankondiging. De server kijkt elk uur; wie een
// collega een maand laat meewerken en vlak voor de afschrijving verwijdert, betaalt toch voor
// die maand. Geeft true als de piek omhoog ging.
export function merkPiek(abonnement, loginsNu) {
  const n = Math.min(MAX_PLAATSEN, Math.max(1, Number(loginsNu) || 1));
  if (n <= (Number(abonnement.piek) || 0)) return false;
  abonnement.piek = n;
  return true;
}
// voor hoeveel therapeuten de volgende maand is: de logins van nu, of de piek als die hoger was
export const volgendAantal = (abonnement, loginsNu) =>
  Math.min(MAX_PLAATSEN, Math.max(1, Number(loginsNu) || 1, Number(abonnement && abonnement.piek) || 0));
// bij de aankondiging van een nieuwe maand: het aantal ligt vast en de piek begint opnieuw
export function nieuwePeriode(abonnement, loginsNu) {
  abonnement.aantal = volgendAantal(abonnement, loginsNu);
  abonnement.piek = Math.min(MAX_PLAATSEN, Math.max(1, Number(loginsNu) || 1));
  return abonnement.aantal;
}

// hoeveel lopende kaarten een praktijk kan hebben
export const kaartGrens = ({ klant, logins }) => (klant ? KAARTEN_PER_LOGIN * Math.min(MAX_PLAATSEN, Math.max(1, Number(logins) || 1)) : KAARTEN_PROEF);
// lopend: niet afgerond, niet in de prullenbak en niet verlopen. `verlooptOp(kaart)` komt van de server.
export function telKaarten(map, nu, verlooptOp) {
  let lopend = 0, totaal = 0;
  for (const k of Object.values(map || {})) {
    if (!k || k.demo) continue;
    totaal++;
    if (!k.verwijderdOp && !k.gearchiveerd && verlooptOp(k) > nu) lopend++;
  }
  return { lopend, totaal };
}
// Mag er een nieuwe kaart bij? Geeft null (ja) of de reden.
export function kaartVol(map, nu, verlooptOp, wie) {
  const grens = kaartGrens(wie), t = telKaarten(map, nu, verlooptOp);
  if (t.lopend >= grens) return { soort: "lopend", grens, ...t };
  if (t.totaal >= grens * KAARTEN_BEWAARD_KEER) return { soort: "bewaard", grens, ...t };
  return null;
}
