// Welke naam de app voor een oefening toont (platformreview 2026-11-11: Nederlandse namen op de
// standaardkaarten).
//
// De namen in public/oefeningen-v2.json blijven zoals ze zijn: de videostroom werkt in dat
// bestand, en de keuring van beeld en uitleg, de voorleesclips en de standaardkaarten verwijzen
// naar die namen. Hier komt er een laag overheen. In volgorde van voorrang:
//   1. wat beheer zelf heeft hernoemd (naam-wijzigingen.json in de datamap);
//   2. de Nederlandse naam uit content/oefennamen-nl.json;
//   3. de naam uit het bestand.
// Bij elke oefening die anders heet dan in het bestand gaat de naam uit het bestand mee als
// `eerder`: kaarten, sjablonen en video's die op die naam zijn bewaard, vinden de oefening zo
// terug. De routes en de schermen staan in server.js, public/index.html en public/kaart.html;
// hier staat alleen wat zonder webserver te testen is.

// dezelfde vergelijking als de app en de kaart: hoofdletters, accenten en leestekens tellen niet
export const normNaam = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const NAAM_MAX = 80; // de grens die ook voor hernoemen in beheer geldt
const VERBODEN = /^(__proto__|constructor|prototype)$/i;

// Leest de laag uit het ingelezen bestand: { namen: { "naam in het bestand": "Nederlandse naam" } }.
// Wat geen bruikbare naam is, valt weg; een kapot of ontbrekend bestand geeft een lege laag, en de
// app toont dan de namen uit het bestand.
export function leesNamenLaag(inhoud) {
  const laag = new Map();
  const namen = inhoud && typeof inhoud === "object" && inhoud.namen && typeof inhoud.namen === "object" ? inhoud.namen : null;
  if (!namen || Array.isArray(namen)) return laag;
  for (const [basis, nieuw] of Object.entries(namen)) {
    if (typeof nieuw !== "string") continue;
    const schoon = nieuw.trim().replace(/\s+/g, " ");
    if (!basis || !schoon || schoon.length > NAAM_MAX || VERBODEN.test(schoon) || schoon === basis) continue;
    laag.set(basis, schoon);
  }
  return laag;
}

// Kiest voor elke naam uit het bestand de naam die de app toont.
//   basisNamen   de namen uit het bestand, in de volgorde van het bestand
//   renames      wat beheer heeft hernoemd: { naam in het bestand: naam nu }
//   laag         de Nederlandse namen (leesNamenLaag)
//   andereNamen  namen die al in gebruik zijn buiten het bestand (wat beheer zelf toevoegde)
// Geeft een Map: naam in het bestand -> { naam, eerder? }.
// Twee oefeningen krijgen nooit dezelfde naam: is een Nederlandse naam al in gebruik (door een
// andere oefening, of door iets wat beheer toevoegde of hernoemde), dan houdt de oefening de naam
// uit het bestand. `eerder` ontbreekt als de naam uit het bestand intussen van een andere
// oefening is: die naam wijst dan naar die andere oefening.
export function kiesNamen(basisNamen, renames = {}, laag = new Map(), andereNamen = []) {
  const vanBeheer = (b) => (Object.hasOwn(renames, b) && typeof renames[b] === "string" && renames[b] ? renames[b] : "");
  const bezet = new Set(andereNamen.map(normNaam));
  const uit = new Map();
  // eerst wat vaststaat: de keuze van beheer, en elke naam zonder Nederlandse naam
  for (const b of basisNamen) {
    const naam = vanBeheer(b) || (laag.has(b) ? "" : b);
    if (!naam) continue;
    uit.set(b, { naam });
    bezet.add(normNaam(naam));
  }
  // de naam uit het bestand van een oefening die op haar Nederlandse naam wacht, is ook bezet:
  // gaat de Nederlandse naam niet door, dan heet ze nog zo
  const wacht = basisNamen.filter((b) => !uit.has(b));
  const wachtNorm = new Map();
  for (const b of wacht) wachtNorm.set(normNaam(b), (wachtNorm.get(normNaam(b)) || 0) + 1);
  for (const b of wacht) {
    const nieuw = laag.get(b), n = normNaam(nieuw);
    // vrij: niet bezet, en niet de naam uit het bestand van een andere oefening die nog wacht
    const vrij = !bezet.has(n) && !(wachtNorm.has(n) && n !== normNaam(b));
    const naam = vrij ? nieuw : b;
    uit.set(b, { naam });
    bezet.add(normNaam(naam));
  }
  // de eerdere naam gaat mee zolang geen andere oefening nu zo heet
  const nu = new Map();
  for (const [b, v] of uit) nu.set(normNaam(v.naam), b);
  const vanAnder = new Set(andereNamen.map(normNaam));
  for (const [b, v] of uit) {
    if (v.naam === b || vanAnder.has(normNaam(b))) continue;
    const houder = nu.get(normNaam(b));
    if (houder === undefined || houder === b) v.eerder = [b];
  }
  return uit;
}

// Een zoeker over een opgebouwde bibliotheek (de regels van /v2/oefeningen.json): eerst het vaste
// id, dan de naam van nu, dan een eerdere naam. Zo vindt een kaart die voor de naamswijziging is
// bewaard haar oefening terug, ook als ze geen vast id bij de oefening heeft staan.
export function maakZoeker(bibliotheek) {
  const opId = new Map(), opNaam = new Map(), opEerder = new Map();
  for (const o of bibliotheek) {
    if (!o || typeof o !== "object") continue;
    if (o.exerciseId && !opId.has(o.exerciseId)) opId.set(o.exerciseId, o);
    // bij gelijke naam wint de laatste, zoals op de kaart en in de app
    opNaam.set(normNaam(o.naam), o);
  }
  for (const o of bibliotheek) {
    if (!o || typeof o !== "object" || !Array.isArray(o.eerder)) continue;
    for (const e of o.eerder) { const n = normNaam(e); if (n && !opNaam.has(n) && !opEerder.has(n)) opEerder.set(n, o); }
  }
  return {
    // x: { id?, n } zoals een oefening op een kaart staat
    vind(x) {
      if (!x || typeof x !== "object") return null;
      const n = normNaam(x.n);
      return (x.id && opId.get(String(x.id))) || opNaam.get(n) || opEerder.get(n) || null;
    },
    // is deze tekst letterlijk een naam uit de bibliotheek, nu of eerder?
    isNaam(tekst) {
      const t = String(tekst || "");
      const o = opNaam.get(normNaam(t)) || opEerder.get(normNaam(t));
      return !!o && (o.naam === t || (Array.isArray(o.eerder) && o.eerder.includes(t)));
    }
  };
}

// Onder welke naam staat iets wat per oefennaam is bewaard (een video van beheer)? Eerst de naam
// van nu, anders een eerdere naam waaronder al iets staat, anders de naam van nu.
export function sleutelVoor(opslag, oefening) {
  if (!oefening) return "";
  if (Object.hasOwn(opslag, oefening.naam) && opslag[oefening.naam]) return oefening.naam;
  const eerder = (Array.isArray(oefening.eerder) ? oefening.eerder : []).find((n) => Object.hasOwn(opslag, n) && opslag[n]);
  return eerder || oefening.naam;
}

// Een kaart wordt opnieuw bewaard en een oefening heet intussen anders (zelfde vaste id). Wat aan
// de naam op de kaart hing, verhuist mee: de eigen video (sleutel: de genormaliseerde naam) en de
// tellingen van de patiënt (sleutel: de naam zelf). Zonder dit zag de server een video die "niet
// meer op de kaart staat" en ruimde hij de opname op.
//   oudChosen, nieuwChosen   [{ id, n }]
//   oudeVids                 de video's van de vorige versie
//   vids                     de video's van de nieuwe versie; wordt aangevuld
//   tellingen                lijst met objecten { naam: ... } die per naam tellen; worden bijgewerkt
// Geeft het aantal verhuisde namen terug.
export function verhuisNaamgebonden(oudChosen, nieuwChosen, oudeVids, vids, tellingen = []) {
  const oudOpId = new Map();
  for (const x of Array.isArray(oudChosen) ? oudChosen : []) if (x && x.id && x.n && !oudOpId.has(x.id)) oudOpId.set(x.id, String(x.n));
  const nuNamen = new Set((Array.isArray(nieuwChosen) ? nieuwChosen : []).map((x) => String(x && x.n || "")));
  let n = 0;
  const gedaan = new Set();
  for (const x of Array.isArray(nieuwChosen) ? nieuwChosen : []) {
    if (!x || !x.id || !x.n || gedaan.has(x.id)) continue;
    const oud = oudOpId.get(x.id);
    // alleen als de oude naam echt van de kaart is verdwenen: staat hij er nog (dezelfde naam bij
    // een andere oefening), dan hoort wat eraan hangt bij die oefening
    if (!oud || oud === x.n || nuNamen.has(oud)) continue;
    gedaan.add(x.id);
    n++;
    const ok = normNaam(oud), nk = normNaam(x.n);
    if (oudeVids && ok !== nk && oudeVids[ok] && !vids[nk] && !vids[ok]) vids[nk] = oudeVids[ok];
    for (const t of tellingen) {
      if (!t || typeof t !== "object" || !Object.hasOwn(t, oud)) continue;
      const nieuwSleutel = String(x.n).slice(0, 80);
      if (VERBODEN.test(nieuwSleutel)) continue;
      const was = t[oud];
      if (!Object.hasOwn(t, nieuwSleutel)) t[nieuwSleutel] = was;
      else t[nieuwSleutel] = voegTellingSamen(t[nieuwSleutel], was);
      delete t[oud];
    }
  }
  return n;
}

// twee tellingen van dezelfde oefening onder twee namen: afvinkdagen optellen, de laatste dag en
// het laatste tijdstip houden
function voegTellingSamen(a, b) {
  if (!a || typeof a !== "object") return b;
  if (!b || typeof b !== "object") return a;
  const uit = { ...b, ...a };
  if (Number.isFinite(a.n) || Number.isFinite(b.n)) uit.n = Math.min(9999, (Number(a.n) || 0) + (Number(b.n) || 0));
  if (typeof a.d === "string" || typeof b.d === "string") uit.d = String(a.d || "") > String(b.d || "") ? a.d : b.d;
  if (Number.isFinite(a.t) || Number.isFinite(b.t)) uit.t = Math.max(Number(a.t) || 0, Number(b.t) || 0);
  return uit;
}
