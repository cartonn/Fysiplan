// Het leeslog: wie heeft welke kaart gezien of gewijzigd, en wanneer.
//
// Het logboek van de praktijk (praktijk-audit.json) zegt wie inlogde en dat er een kaart is
// verwijderd, maar niet om welke kaart het ging en niet wie een kaart alleen las. Een praktijk
// die de vraag krijgt "wie heeft in mijn gegevens gekeken?" kon die niet beantwoorden.
//
// Per praktijk een lijst van regels, de nieuwste eerst:
//   { t, tot, n, k, s, wie, lid }
//   t / tot  eerste en laatste keer in deze regel (ms)
//   n        hoe vaak in die tijd
//   k        het id van de kaart, of "" voor iets dat alle kaarten raakt (overzicht, download)
//   s        de soort, zie SOORTEN
//   wie      de naam of het e-mailadres van de login, "gedeeld wachtwoord", of "Fysiplan-beheer"
//   lid      het id van de login (ontbreekt bij het gedeelde wachtwoord en bij beheer)
//
// Wie een kaart open heeft staan, vraagt haar telkens opnieuw op. Daarom schuift een herhaling
// door dezelfde persoon, op dezelfde kaart, van dezelfde soort binnen een kwartier de bestaande
// regel op (tot, n) in plaats van een nieuwe te maken.
//
// Het leeslog bevat geen naam van een patiënt: alleen het id van de kaart. Verdwijnt de kaart
// voorgoed, dan verdwijnen haar regels ook (snoei).
//
// Alleen rekenen; geen opslag en geen verzoeken.

export const SOORTEN = {
  geopend: "kaart geopend", // de volledige kaart opgehaald
  bewaard: "kaart bewaard", // gemaakt of gewijzigd
  overzicht: "overzicht van alle kaarten bekeken", // namen, scores en notities van alle kaarten
  berichten: "berichten van patiënten bekeken", // het postvak
  download: "alle gegevens gedownload",
};
export const SAMEN_MS = 15 * 60 * 1000; // herhalingen binnen een kwartier: één regel
export const BEWAAR_DAGEN = 730; // een regel blijft hooguit twee jaar
export const MAX_PER_KAART = 300;
export const MAX_PER_PRAKTIJK = 6000;

const tekst = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// Schrijft één gebeurtenis bij. Geeft "nieuw" (een nieuwe regel), "verschoven" (een bestaande regel
// schoof op) of false (niets gedaan).
export function merk(log, pk, { kaart = "", soort, wie = "", lid = "" }, nu = Date.now()) {
  if (!pk || pk === "__proto__" || !Object.hasOwn(SOORTEN, soort)) return false;
  const k = tekst(kaart, 80), w = tekst(wie, 120) || "onbekend", l = tekst(lid, 80);
  const lijst = Object.hasOwn(log, pk) && Array.isArray(log[pk]) ? log[pk] : (log[pk] = []);
  // dezelfde persoon, dezelfde kaart, dezelfde soort, kort geleden: de regel schuift op
  for (const r of lijst) {
    if (nu - r.tot > SAMEN_MS) break; // de lijst loopt van nieuw naar oud op `tot`
    if (r.k === k && r.s === soort && r.wie === w && (r.lid || "") === l) { r.tot = nu; r.n = (r.n || 1) + 1; naarVoren(lijst, r); return "verschoven"; }
  }
  lijst.unshift({ t: nu, tot: nu, n: 1, k, s: soort, wie: w, ...(l ? { lid: l } : {}) });
  // per kaart een plafond: de oudste regel van die kaart gaat eruit
  if (k) {
    let n = 0;
    for (let i = 0; i < lijst.length; i++) if (lijst[i].k === k && ++n > MAX_PER_KAART) { lijst.splice(i, 1); break; }
  }
  if (lijst.length > MAX_PER_PRAKTIJK) lijst.length = MAX_PER_PRAKTIJK;
  return "nieuw";
}
function naarVoren(lijst, r) {
  const i = lijst.indexOf(r);
  if (i > 0) { lijst.splice(i, 1); lijst.unshift(r); }
}

// de regels van één kaart, met de regels die alle kaarten raken erbij (overzicht, berichten, download)
export function vanKaart(log, pk, kaart) {
  const lijst = Object.hasOwn(log, pk) && Array.isArray(log[pk]) ? log[pk] : [];
  return lijst.filter((r) => r.k === kaart || r.k === "").map((r) => ({ ...r, wat: SOORTEN[r.s] || r.s, kaart: r.k === kaart }));
}
export const vanPraktijk = (log, pk) => (Object.hasOwn(log, pk) && Array.isArray(log[pk]) ? log[pk] : []).map((r) => ({ ...r, wat: SOORTEN[r.s] || r.s }));

// Opruimen: regels ouder dan de bewaartijd, en regels van kaarten die er niet meer zijn.
// `bestaat(pk)` geeft de verzameling kaart-id's van die praktijk, of null als de praktijk weg is.
// Geeft het aantal verwijderde regels.
export function snoei(log, bestaat, nu = Date.now()) {
  let weg = 0;
  const grens = nu - BEWAAR_DAGEN * 86400000;
  for (const pk of Object.keys(log)) {
    const ids = bestaat(pk);
    const voor = Array.isArray(log[pk]) ? log[pk] : [];
    const na = ids ? voor.filter((r) => r && r.tot >= grens && (r.k === "" || ids.has(r.k))) : [];
    weg += voor.length - na.length;
    if (na.length) log[pk] = na; else delete log[pk];
  }
  return weg;
}
export function wisKaart(log, pk, kaart) {
  if (!Object.hasOwn(log, pk) || !kaart) return 0;
  const voor = log[pk].length;
  log[pk] = log[pk].filter((r) => r.k !== kaart);
  if (!log[pk].length) delete log[pk];
  return voor - (log[pk] ? log[pk].length : 0);
}
export function wisPraktijk(log, pk) {
  if (!Object.hasOwn(log, pk)) return false;
  delete log[pk];
  return true;
}
