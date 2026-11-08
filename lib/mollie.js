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
export async function mollie(pad, { sleutel, basis = "https://api.mollie.com", methode = "GET", body } = {}) {
  const r = await fetch(basis + "/v2" + pad, {
    method: methode,
    headers: { authorization: "Bearer " + sleutel, ...(body ? { "content-type": "application/json" } : {}) },
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
