// Abonnement per praktijk: eerste maand afrekenen via Mollie (iDEAL, kaart, Bancontact).
// Alleen fetch tegen de REST-API, geen SDK. Zonder MOLLIE_API_KEY is alles uit en
// blijft de bestaande "Ja, ik wil doorgaan"-flow (Ahmed belt) precies zoals hij was.
// Pure hulpjes hier; de server doet opslag, routes en meldingen.

export const PRIJS_PER_THERAPEUT_CENT = 999; // € 9,99 per therapeut per maand (landing /v2)
export const MAX_THERAPEUTEN = 50;

// het aantal therapeuten uit een formulierveld: heel getal 1..50, anders null
export function aantalTherapeuten(invoer) {
  const s = String(invoer == null ? "" : invoer).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_THERAPEUTEN ? n : null;
}

// bedrag in Mollie-vorm: { currency: "EUR", value: "11.98" } (altijd twee decimalen, punt)
export function maandBedrag(aantal) {
  const cent = PRIJS_PER_THERAPEUT_CENT * aantal;
  return { currency: "EUR", value: (Math.floor(cent / 100)) + "." + String(cent % 100).padStart(2, "0") };
}

// een Mollie-betaal-id; alles anders wordt niet eens opgezocht
export const geldigBetaalId = (id) => /^tr_[A-Za-z0-9]{4,40}$/.test(String(id || ""));

// één aanroep naar de Mollie-API; gooit bij een netwerkfout of niet-2xx
// `sleutelVoorEenmaal`: Mollie's Idempotency-Key. Met dezelfde sleutel geeft Mollie bij een
// herhaald verzoek dezelfde betaling terug in plaats van een tweede aan te maken.
export async function mollie(pad, { sleutel, basis = "https://api.mollie.com", methode = "GET", body, sleutelVoorEenmaal } = {}) {
  const r = await fetch(basis + "/v2" + pad, {
    method: methode,
    headers: { authorization: "Bearer " + sleutel, ...(body ? { "content-type": "application/json" } : {}),
      ...(sleutelVoorEenmaal ? { "idempotency-key": String(sleutelVoorEenmaal) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15 * 1000)
  });
  if (!r.ok) throw new Error("mollie " + r.status);
  return r.json();
}

// Beslist wat een betaling (zoals Mollie hem teruggeeft) betekent voor een proef.
// De webhook is niet ondertekend: de waarheid is altijd wat we zelf bij Mollie
// ophalen, en alleen een betaling die bij déze proef hoort, met het bedrag dat we
// vroegen, telt. Geeft "betaald", "mislukt", "open" of "vreemd".
export function beoordeelBetaling(betaling, proef) {
  const b = proef && proef.betaling;
  if (!betaling || !b || betaling.id !== b.id) return "vreemd";
  if (String(betaling.metadata?.proef || "") !== proef.id) return "vreemd";
  const verwacht = maandBedrag(b.aantal);
  if (betaling.amount?.currency !== verwacht.currency || betaling.amount?.value !== verwacht.value) return "vreemd";
  if (betaling.status === "paid") return "betaald";
  if (["failed", "canceled", "expired"].includes(betaling.status)) return "mislukt";
  return "open";
}

// zet een proef om naar klant; idempotent (een tweede webhook verandert niets)
export function markeerBetaald(proef, betaling, nu = Date.now()) {
  if (proef.abonnement && proef.abonnement.eersteBetaling === betaling.id) return false;
  const tot = new Date(nu);
  tot.setMonth(tot.getMonth() + 1);
  proef.klant = true;
  proef.abonnement = {
    status: "actief", aantal: proef.betaling.aantal, bedrag: maandBedrag(proef.betaling.aantal).value,
    sinds: nu, betaaldTot: tot.getTime(), eersteBetaling: betaling.id,
    mollieKlant: proef.betaling.klant || null, mandaat: betaling.mandateId || null
  };
  proef.betaling.status = "paid";
  return true;
}

// Opzeggen in de app (Mijn proef). Het abonnement loopt door tot het einde van de al
// betaalde maand (betaaldTot); er wordt daarna niets meer afgeschreven. Een latere
// maandincasso moet deze status respecteren. Beide idempotent: false = niets veranderd.
export function markeerOpgezegd(proef, nu = Date.now()) {
  const a = proef && proef.abonnement;
  if (!a || a.status !== "actief") return false;
  a.status = "opgezegd";
  a.opgezegd = nu;
  return true;
}
// intrekken kan zolang de betaalde maand nog loopt
export function trekOpzeggingIn(proef, nu = Date.now()) {
  const a = proef && proef.abonnement;
  if (!a || a.status !== "opgezegd" || nu >= Number(a.betaaldTot)) return false;
  a.status = "actief";
  delete a.opgezegd;
  return true;
}

// Einde van een opgezegd abonnement, één stap per ronde (idempotent):
// - na de betaalde maand: "gestopt". De praktijk is geen klant meer en de proefpoort
//   sluit de schrijfroutes (verloopt = betaaldTot); delen kaarten werken nog.
// - NA_EINDE_WISSEN_DAGEN later: "wissen". De server wist dan alles van de praktijk.
// Geeft "gestopt", "wissen" of null (niets te doen).
export const NA_EINDE_WISSEN_DAGEN = 30;
export function abonnementEindeStap(proef, nu = Date.now()) {
  const a = proef && proef.abonnement;
  if (!a || proef.gewist) return null;
  const tot = Number(a.betaaldTot);
  if (!Number.isFinite(tot)) return null;
  if (a.status === "opgezegd" && nu >= tot) {
    a.status = "beeindigd";
    a.beeindigd = nu;
    proef.klant = false;
    proef.verloopt = tot;
    return nu >= tot + NA_EINDE_WISSEN_DAGEN * 86400000 ? "wissen" : "gestopt";
  }
  if (a.status === "beeindigd" && nu >= tot + NA_EINDE_WISSEN_DAGEN * 86400000) return "wissen";
  return null;
}

// ---- maandincasso (alleen met MOLLIE_API_KEY én MOLLIE_INCASSO=aan) ----
// Na de eerste maand schrijft Fysiplan elke maand zelf af op het mandaat van de eerste
// betaling (sequenceType "recurring"). Geen Mollie-subscription: zo bepaalt de server
// per maand of er wordt afgeschreven, en een opgezegd abonnement wordt nooit geïnd.
// De voorwaarden beloven dat de praktijk het vooraf hoort: eerst een mail, en pas
// INCASSO_VOORAF_DAGEN later (en niet vóór het einde van de betaalde maand) de incasso.
export const INCASSO_VOORAF_DAGEN = 5;
const DAG = 86400000;
export const geldigKlantId = (id) => /^cst_[A-Za-z0-9]{4,40}$/.test(String(id || ""));
export function maandErbij(ms) {
  const d = new Date(Number(ms));
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

// Wat er deze ronde voor de maandincasso moet gebeuren (idempotent, één stap per ronde):
// "melden" (vooraf mailen), "incasseren" (betaling aanmaken), "nakijken" (status ophalen) of null.
export function incassoStap(proef, nu = Date.now()) {
  const a = proef && proef.abonnement;
  if (!a || proef.gewist || a.status !== "actief" || !geldigKlantId(a.mollieKlant)) return null;
  const periode = Number(a.betaaldTot);
  if (!Number.isFinite(periode)) return null;
  // een incasso voor deze periode loopt al of is mislukt: wachten op Mollie of op Ahmed.
  // Loopt hij, dan af en toe zelf nakijken (een gemiste webhook laat hem anders open staan).
  if (a.incasso && a.incasso.periode === periode) {
    const laatst = Number(a.incasso.gekeken || a.incasso.gemaakt) || 0;
    return a.incasso.status === "open" && nu - laatst >= 6 * 3600000 ? "nakijken" : null;
  }
  if (a.gemeld !== periode) return nu >= periode - INCASSO_VOORAF_DAGEN * DAG ? "melden" : null;
  return nu >= periode && nu >= Number(a.gemeldOp) + INCASSO_VOORAF_DAGEN * DAG ? "incasseren" : null;
}
export function markeerGemeld(proef, nu = Date.now()) {
  const a = proef.abonnement;
  a.gemeld = Number(a.betaaldTot);
  a.gemeldOp = nu;
}
// de datum waarop afgeschreven wordt, zoals de vooraf-mail hem noemt
export function incassoDatum(proef, nu = Date.now()) {
  const a = proef.abonnement;
  return Math.max(Number(a.betaaldTot), nu + INCASSO_VOORAF_DAGEN * DAG);
}
// de body voor POST /payments
export function incassoVerzoek(proef, webhookUrl) {
  const a = proef.abonnement;
  const body = {
    amount: maandBedrag(a.aantal), customerId: a.mollieKlant, sequenceType: "recurring",
    description: "Fysiplan, maand vanaf " + new Date(Number(a.betaaldTot)).toISOString().slice(0, 10) + ", " +
      a.aantal + (a.aantal === 1 ? " therapeut" : " therapeuten"),
    metadata: { proef: proef.id, periode: String(a.betaaldTot) }
  };
  if (a.mandaat && /^mdt_[A-Za-z0-9]{4,40}$/.test(String(a.mandaat))) body.mandateId = a.mandaat;
  if (webhookUrl) body.webhookUrl = webhookUrl;
  return body;
}
// Vaste sleutel per praktijk en periode: valt het antwoord van Mollie weg (time-out, 5xx)
// terwijl de betaling wel bestaat, dan maakt de volgende ronde geen tweede afschrijving.
export function incassoSleutel(proef) {
  return "fysiplan-incasso-" + String(proef.id) + "-" + String(Number(proef.abonnement.betaaldTot));
}
export function markeerIncassoGestart(proef, betaling, nu = Date.now()) {
  const a = proef.abonnement;
  a.incasso = { id: betaling.id, periode: Number(a.betaaldTot), aantal: a.aantal, status: "open", gemaakt: nu };
}
// Zelfde regel als bij de eerste betaling: alleen wat we zelf bij Mollie ophalen telt,
// en alleen de lopende incasso van déze praktijk, voor déze periode, met het juiste bedrag.
export function beoordeelIncasso(betaling, proef) {
  const inc = proef && proef.abonnement && proef.abonnement.incasso;
  if (!betaling || !inc || betaling.id !== inc.id) return "vreemd";
  if (String(betaling.metadata?.proef || "") !== proef.id || String(betaling.metadata?.periode || "") !== String(inc.periode)) return "vreemd";
  const verwacht = maandBedrag(inc.aantal);
  if (betaling.amount?.currency !== verwacht.currency || betaling.amount?.value !== verwacht.value) return "vreemd";
  if (betaling.status === "paid") return "betaald";
  if (["failed", "canceled", "expired"].includes(betaling.status)) return "mislukt";
  return "open";
}
// betaald: de betaalde maand schuift een maand op en de betaling komt in de lijst
// (voor de factuur). Idempotent: een tweede webhook verandert niets.
export function markeerIncassoBetaald(proef, nu = Date.now()) {
  const a = proef.abonnement, inc = a.incasso;
  if (!inc || inc.status === "paid") return false;
  inc.status = "paid";
  const tot = maandErbij(inc.periode);
  a.betalingen = Array.isArray(a.betalingen) ? a.betalingen : [];
  a.betalingen.push({ id: inc.id, aantal: inc.aantal, bedrag: maandBedrag(inc.aantal).value, sinds: inc.periode, betaaldTot: tot, betaald: nu });
  a.betaaldTot = Math.max(Number(a.betaaldTot), tot);
  return true;
}
export function markeerIncassoMislukt(proef, status) {
  const inc = proef.abonnement.incasso;
  if (!inc || inc.status === "mislukt" || inc.status === "paid") return false;
  inc.status = "mislukt";
  inc.mollieStatus = String(status || "");
  return true;
}
