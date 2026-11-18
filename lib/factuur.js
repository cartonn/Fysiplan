// Factuur of betaalbewijs per online betaling (abonnement via Mollie).
// Pure hulpjes; de server kiest wie er mag kijken en vult de gegevens van Fysiplan
// uit de Railway-variabelen. Met FYSIPLAN_BTW_NUMMER (plus bedrijf, KvK en adres)
// is het een factuur met btw (art. 35a Wet OB); zonder is het een betaalbewijs dat
// zegt dat het geen factuur is. Er komt nooit een patiëntgegeven op.

import { BTW_TARIEF, euro } from "./prijs.js";
export { BTW_TARIEF, euro }; // de prijs en het tarief staan in lib/prijs.js; deze namen blijven voor wie ze al gebruikte

// volgend factuurnummer per jaar: FP-2026-0001, FP-2026-0002, ... (doorlopend, uniek)
export function volgendFactuurNr(proeven, jaar) {
  const voor = "FP-" + jaar + "-";
  let hoogste = 0;
  for (const p of proeven) {
    // eerste betaling plus elke maandincasso: één doorlopende reeks
    const nrs = [p?.abonnement?.factuurNr, ...(Array.isArray(p?.abonnement?.betalingen) ? p.abonnement.betalingen.map((b) => b?.factuurNr) : [])];
    for (const n of nrs) {
      const nr = String(n || "");
      if (nr.startsWith(voor)) hoogste = Math.max(hoogste, Number(nr.slice(voor.length)) || 0);
    }
  }
  return voor + String(hoogste + 1).padStart(4, "0");
}

// "11.98" -> 1198 cent; alles wat geen bedrag is wordt 0
export function naarCent(waarde) {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(waarde == null ? "" : waarde).trim());
  return m ? Number(m[1]) * 100 + Number((m[2] || "0").padEnd(2, "0")) : 0;
}

// het betaalde bedrag is het totaal; btw zit erin (afgerond op hele centen). Voor betalingen
// van vóór lib/prijs.js, waar de btw niet bij de betaling is bewaard.
export function bedragen(totaalCent, btw) {
  if (!btw) return { totaal: totaalCent, excl: totaalCent, btw: 0 };
  const b = Math.round(totaalCent * BTW_TARIEF / (100 + BTW_TARIEF));
  return { totaal: totaalCent, excl: totaalCent - b, btw: b };
}
// De bedragen op de factuur van één betaling. Staat de btw bij de betaling (a.btw, zie
// lib/prijs.js btwVan), dan geldt wat er toen is vastgelegd; een latere keuze verandert een
// factuur die al bestaat dus niet. Geeft ook `kor` (geen btw: kleineondernemersregeling) en het tarief.
export function factuurBedragen(a, echt) {
  const totaal = naarCent(a && a.bedrag), v = a && a.btw;
  if (v && Number.isInteger(v.exclCent) && Number.isInteger(v.btwCent) && v.exclCent + v.btwCent === totaal)
    return { totaal, excl: echt ? v.exclCent : totaal, btw: echt ? v.btwCent : 0, tarief: Number(v.tarief) || 0, kor: v.keuze === "kor" };
  return { ...bedragen(totaal, echt), tarief: BTW_TARIEF, kor: false };
}

// factuurgegevens van de praktijk (afnemer): naam zoals op de KvK en adres. Optioneel,
// maar een volledige factuur boven 100 euro moet ze hebben (art. 35a Wet OB; daaronder
// mag een vereenvoudigde factuur). Geen patiëntgegevens: alleen de praktijk.
export const AFNEMER_NAAM_MAX = 120, AFNEMER_ADRES_MAX = 300;
export const VEREENVOUDIGD_MAX_CENT = 10000;
export function afnemerGegevens(naam, adres) {
  const schoon = (v, max) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .split("\n").map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, max + 1);
  const n = schoon(naam, AFNEMER_NAAM_MAX).replace(/\n/g, " "), a = schoon(adres, AFNEMER_ADRES_MAX);
  if (n.length > AFNEMER_NAAM_MAX) return { fout: "De naam mag hooguit " + AFNEMER_NAAM_MAX + " tekens zijn." };
  if (a.length > AFNEMER_ADRES_MAX) return { fout: "Het adres mag hooguit " + AFNEMER_ADRES_MAX + " tekens zijn." };
  if (a.split("\n").length > 5) return { fout: "Gebruik hooguit 5 regels voor het adres." };
  if (a && !n) return { fout: "Vul ook de naam van de praktijk in." };
  return { naam: n, adres: a };
}

// een factuur mag alleen als alle verplichte gegevens van de leverancier er zijn
// Met de kleineondernemersregeling (`kor`) staat er geen btw op de factuur en is het btw-id niet nodig.
export const isFactuur = (lev, kor = false) => !!(lev && (kor || lev.btwNummer) && lev.bedrijf && lev.kvk && lev.adres);
// een betaling die onder de kleineondernemersregeling is gedaan (zie lib/prijs.js btwVan)
export const isKor = (a) => !!(a && a.btw && a.btw.keuze === "kor");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const datum = (ms) => new Date(ms).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

// printbare pagina (scriptloos; de server zet een strikte CSP)
export function factuurHtml({ leverancier: lev = {}, afnemer = {}, abonnement: a }) {
  const echt = isFactuur(lev, isKor(a));
  const soort = echt ? "Factuur" : "Betaalbewijs";
  const b = factuurBedragen(a, echt);
  const aantal = Number(a.aantal) || 1;
  const tot = a.betaaldTot ? " t/m " + datum(a.betaaldTot - 86400000) : "";
  const regel = "Fysiplan-abonnement, " + aantal + (aantal === 1 ? " therapeut" : " therapeuten") + ", periode " + datum(a.sinds) + tot;
  const rij = (k, v) => "<tr><th>" + esc(k) + "</th><td>" + esc(v).replace(/\n/g, "<br/>") + "</td></tr>";
  // boven 100 euro hoort het adres van de praktijk op een volledige factuur
  const adresNodig = echt && b.totaal > VEREENVOUDIGD_MAX_CENT && !afnemer.adres;
  return '<!doctype html><html lang="nl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<meta name="robots" content="noindex"/><title>' + soort + " " + esc(a.factuurNr) + " · Fysiplan</title><style>" +
    "body{font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#232019;background:#f6f2e9;margin:0;padding:24px 16px}" +
    ".blad{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e3dbc6;border-radius:10px;padding:32px}" +
    "h1{font-size:26px;margin:0 0 4px}.kop{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:24px}" +
    "table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 0;vertical-align:top}th{color:#6b6557;font-weight:500;width:42%}" +
    ".regels td,.regels th{border-top:1px solid #efe9d8;padding:10px 0}.regels .r{text-align:right}.totaal td{font-weight:700}" +
    ".noot{color:#6b6557;font-size:13.5px;margin-top:20px}.terug{display:block;max-width:720px;margin:0 auto 12px;color:#2456a6}" +
    "@media print{body{background:#fff;padding:0}.blad{border:0;padding:0}.terug,.alleen-scherm{display:none}}" +
    "</style></head><body>" +
    '<a class="terug" href="/v2/proef?mijn=1">&larr; Terug naar mijn abonnement</a><div class="blad">' +
    '<div class="kop"><div><h1>' + soort + "</h1><div>" + esc(a.factuurNr) + "</div></div><div>" +
    "<b>" + esc(lev.bedrijf || "Fysiplan") + "</b>" + (lev.adres ? "<br/>" + esc(lev.adres) : "") +
    (lev.kvk ? "<br/>KvK " + esc(lev.kvk) : "") + (lev.btwNummer ? "<br/>Btw-id " + esc(lev.btwNummer) : "") + "</div></div>" +
    "<table>" + rij(echt ? "Factuurdatum" : "Datum", datum(a.sinds)) + rij("Aan", afnemer.naam || "") + (afnemer.adres ? rij("Adres", afnemer.adres) : "") + rij("E-mail", afnemer.email || "") +
    rij("Betaald via", "Mollie (" + (a.betaalId || a.eersteBetaling || "") + ")") + "</table>" +
    '<table class="regels" style="margin-top:22px"><tr><th>Omschrijving</th><th class="r">Bedrag</th></tr>' +
    "<tr><td>" + esc(regel) + '</td><td class="r">' + esc(euro(b.excl)) + "</td></tr>" +
    (echt && !b.kor ? "<tr><td>Btw " + esc(b.tarief) + '%</td><td class="r">' + esc(euro(b.btw)) + "</td></tr>" : "") +
    '<tr class="totaal"><td>Totaal betaald</td><td class="r">' + esc(euro(b.totaal)) + "</td></tr></table>" +
    (echt && b.kor ? '<p class="noot">Factuur vrijgesteld van omzetbelasting op grond van artikel 25 van de Wet op de omzetbelasting (kleineondernemersregeling).</p>' : "") +
    '<p class="noot">' + (echt ? "Dit bedrag is al voldaan; je hoeft niets meer over te maken."
      : "Dit is een betaalbewijs, geen factuur voor de btw. De factuur krijg je apart van Fysiplan.") + "</p>" +
    (adresNodig ? '<p class="noot alleen-scherm" style="color:#9a3412">Bij dit bedrag hoort het adres van je praktijk op de factuur. ' +
      'Vul het in bij Factuurgegevens op <a href="/v2/proef?mijn=1#factuurgegevens">Mijn abonnement</a>.</p>' : "") +
    '<p class="noot alleen-scherm">Printen of opslaan als PDF: Ctrl+P (Windows) of Cmd+P (Mac).</p></div></body></html>';
}

// Factuuroverzicht op Mijn abonnement: één regel per betaling (de eerste maand plus elke
// latere maand), nieuwste bovenaan, met nummer, datum, periode, aantal therapeuten en het
// betaalde bedrag. Zo vindt een praktijkhouder een factuur voor de boekhouding zonder te
// zoeken in een rij losse nummers. Alleen gegevens van de praktijk zelf; geen patiënten.
const kortDatum = (ms) => new Date(ms).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
const maandLater = (ms) => { const d = new Date(Number(ms)); d.setMonth(d.getMonth() + 1); return d.getTime(); };
export function factuurRegels(a) {
  if (!a || !a.eersteBetaling) return [];
  const regels = [{ nr: a.factuurNr || "", href: "/v2/proef/factuur", datum: Number(a.sinds), van: Number(a.sinds),
    tot: maandLater(a.sinds), aantal: Number(a.aantal) || 1, cent: naarCent(a.bedrag) }];
  for (const b of Array.isArray(a.betalingen) ? a.betalingen : []) {
    if (!b || !Number(b.sinds)) continue;
    regels.push({ nr: b.factuurNr || "", href: b.factuurNr ? "/v2/proef/factuur?nr=" + encodeURIComponent(b.factuurNr) : "",
      datum: Number(b.betaald || b.sinds), van: Number(b.sinds), tot: Number(b.betaaldTot) || maandLater(b.sinds),
      aantal: Number(b.aantal) || Number(a.aantal) || 1, cent: naarCent(b.bedrag) });
  }
  return regels.sort((x, y) => y.van - x.van || y.datum - x.datum);
}
export function factuurOverzichtHtml(a, soort = "Factuur") {
  const regels = factuurRegels(a);
  if (!regels.length) return "";
  const meer = soort === "Factuur" ? "Facturen" : "Betaalbewijzen";
  const rij = (r) => "<tr><td>" + (r.href ? '<a href="' + esc(r.href) + '">' + esc(r.nr || soort + " bekijken") + "</a>" : esc(r.nr || "volgt")) +
    "</td><td>" + esc(kortDatum(r.datum)) + "</td><td>" + esc(kortDatum(r.van)) + " t/m " + esc(kortDatum(r.tot - 86400000)) +
    '</td><td class="r">' + r.aantal + '</td><td class="r">' + esc(euro(r.cent)).replace("€ ", "&euro;&nbsp;") + "</td></tr>";
  return '<div id="facturen" style="margin-top:18px"><h3 style="font-size:16px;margin:0 0 4px">' + meer + "</h3>" +
    '<p class="klein" style="font-size:14px;margin:0 0 8px">Klik op een nummer om ' + (soort === "Factuur" ? "de factuur" : "het betaalbewijs") +
    " te bekijken en te printen of als PDF op te slaan.</p>" +
    '<div style="overflow-x:auto"><table class="facturen" style="border-collapse:collapse;width:100%;font-size:14px">' +
    '<thead><tr><th scope="col" style="text-align:left">Nummer</th><th scope="col" style="text-align:left">Betaald op</th>' +
    '<th scope="col" style="text-align:left">Periode</th><th scope="col" style="text-align:right">Therapeuten</th>' +
    '<th scope="col" style="text-align:right">Bedrag</th></tr></thead><tbody>' + regels.map(rij).join("") + "</tbody></table></div></div>";
}
