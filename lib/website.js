// Het webadres van een praktijk staat bij de praktijknaam op elke patiëntkaart (/k) en in de app.
// Alleen een gewoon webadres mag erin: https://…, http://… of een kale domeinnaam (www.praktijk.nl,
// praktijk.nl/contact). Geen javascript:, data:, //host of andere schema's: nu staat het adres overal
// als tekst, maar wordt het ooit een link, dan mag er niets in staan dat dan code uitvoert of naar
// een ander schema springt (security 2026-11-13, doorgezet door de gebruikers-sweep).
//
// Geeft het adres terug zoals het getypt is (alleen bijgesneden), "" voor leeg, of null als het
// geen gewoon webadres is.
const HOST = "(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,24}";
const RUST = "(?::\\d{1,5})?(?:[/?#][^\\s<>\"'`\\\\]*)?";
const MET_SCHEMA = new RegExp("^https?://" + HOST + RUST + "$", "i");
const KAAL = new RegExp("^" + HOST + RUST + "$", "i");

export function veiligeWebsite(invoer) {
  const s = String(invoer ?? "").trim();
  if (!s) return "";
  if (s.length > 200) return null;
  return MET_SCHEMA.test(s) || KAAL.test(s) ? s : null;
}
