// De beheer- en finance-omgeving (/dashboard88/omgeving): wat beheer per praktijk ziet, wat de
// agents signaleren en voorstellen, en de cijfers voor finance, btw en de jaarafsluiting.
//
// Alles hier is puur: de functies krijgen een "bron" (zie hieronder) en geven terug wat het
// scherm toont. Er staat geen webserver, geen bestand en geen mail in. De server bouwt de bron
// uit de echte gegevens (server.js, bronUitServer) of uit de nepgegevens van lib/beheer-demo.js;
// beide hebben dezelfde vorm, zodat het scherm en de agents met nepgegevens te testen zijn.
//
// Er komt nooit een patiëntgegeven in de bron: alleen praktijken, hun logins (naam, e-mail,
// rol, laatste keer ingelogd), tellingen van kaarten en de abonnementen en facturen.
//
// Vorm van de bron:
// {
//   soort: "echt" | "demo", nu: ms,
//   praktijken: [{ pk, naam, sinds, status: "proef"|"klant"|"opgezegd"|"gestopt"|"zonder-abonnement",
//     plaatsen, proefTot, betaaldTot, incassoMislukt, kaartenTotaal, kaarten30, loginMis,
//     leden: [{ id, naam, email, rol, actief, laatst, tweedeStap, stapSlot, loginMis, uitnodigingVerloopt }] }],
//   systeem: { versie, uptimeUren, mail, backup: { ok, laatst }, volume, checks: [{ naam, ok, tekst }],
//     beschikbaarheid: [{ datum, pct }] },
//   facturen: [{ nr, datum, pk, praktijk, aantal, totaalCent, status: "betaald"|"open"|"mislukt", betaaldOp }],
//   kosten: [{ id, datum, omschrijving, categorie, bedragCent (incl. btw), btwCent }]
// }

const DAG = 86400e3;

// ---------- praktijken en health ----------

// Wat er met een praktijk aan de hand is, van ernstig naar licht. Elk signaal heeft een soort
// (waar de support-agent op reageert), een ernst ("probleem" of "aandacht") en een korte tekst.
export function signalenVan(p, nu) {
  const s = [];
  const leden = Array.isArray(p.leden) ? p.leden : [];
  const actief = leden.filter((l) => l.actief);
  for (const l of leden) {
    if (l.stapSlot) s.push({ soort: "tweede-stap-slot", ernst: "probleem", lid: l.id, tekst: (l.naam || "Een login") + ": tweede stap staat op slot na te veel foute codes" });
    else if ((l.loginMis || 0) >= 5) s.push({ soort: "inloggen-mislukt", ernst: "probleem", lid: l.id, tekst: (l.naam || "Een login") + ": " + l.loginMis + " keer een fout wachtwoord in 24 uur" });
    if (!l.actief && l.uitnodigingVerloopt && l.uitnodigingVerloopt < nu) s.push({ soort: "uitnodiging-verlopen", ernst: "aandacht", lid: l.id, tekst: (l.naam || l.email || "Een collega") + ": uitnodiging verlopen zonder in te loggen" });
  }
  if (p.incassoMislukt) s.push({ soort: "betaling-mislukt", ernst: "probleem", tekst: "De maandincasso is mislukt" });
  if ((p.loginMis || 0) >= 10) s.push({ soort: "praktijk-op-rem", ernst: "probleem", tekst: "Veel foute inlogpogingen op de praktijknaam (" + p.loginMis + ")" });
  const beheerders = actief.filter((l) => l.rol === "beheerder");
  if (actief.length && beheerders.length === 1 && actief.length >= 3) s.push({ soort: "een-beheerder", ernst: "aandacht", tekst: "Maar één beheerder voor " + actief.length + " therapeuten" });
  if ((p.status === "klant" || p.status === "opgezegd") && p.plaatsen && actief.length > p.plaatsen) s.push({ soort: "meer-dan-betaald", ernst: "aandacht", tekst: actief.length + " actieve logins, " + p.plaatsen + " betaald" });
  if (p.status === "proef" && p.proefTot && p.proefTot > nu && p.proefTot - nu <= 3 * DAG) s.push({ soort: "proef-loopt-af", ernst: "aandacht", tekst: "Proef loopt over " + Math.max(1, Math.ceil((p.proefTot - nu) / DAG)) + " dag(en) af" });
  const laatst = Math.max(0, ...actief.map((l) => l.laatst || 0));
  if ((p.status === "klant" || p.status === "proef") && actief.length && !p.kaarten30 && laatst && nu - laatst > 14 * DAG) s.push({ soort: "stil", ernst: "aandacht", tekst: "Geen kaart in 30 dagen en niemand ingelogd in " + Math.floor((nu - laatst) / DAG) + " dagen" });
  return s;
}

// score van 0 tot 100: elk probleem kost 30, elk aandachtspunt 10
export function healthVan(signalen) {
  const score = Math.max(0, 100 - signalen.reduce((t, x) => t + (x.ernst === "probleem" ? 30 : 10), 0));
  const stand = signalen.some((x) => x.ernst === "probleem") ? "probleem" : signalen.length ? "aandacht" : "goed";
  return { score, stand };
}

export function praktijkOverzicht(bron) {
  const nu = bron.nu;
  const rijen = (bron.praktijken || []).map((p) => {
    const leden = Array.isArray(p.leden) ? p.leden : [];
    const actief = leden.filter((l) => l.actief);
    const signalen = signalenVan(p, nu);
    const h = healthVan(signalen);
    const laatst = Math.max(0, ...actief.map((l) => l.laatst || 0)) || null;
    return {
      pk: p.pk, naam: p.naam, status: p.status, sinds: p.sinds || null, plaatsen: p.plaatsen || 0,
      therapeuten: actief.length, uitgenodigd: leden.length - actief.length,
      actief7: actief.filter((l) => l.laatst && nu - l.laatst <= 7 * DAG).length,
      laatst, kaartenTotaal: p.kaartenTotaal || 0, kaarten30: p.kaarten30 || 0,
      tweedeStap: actief.filter((l) => l.tweedeStap).length,
      proefTot: p.proefTot || null, betaaldTot: p.betaaldTot || null,
      score: h.score, stand: h.stand, signalen,
      leden: leden.map((l) => ({ id: l.id, naam: l.naam || "", email: l.email || "", rol: l.rol || "therapeut", actief: !!l.actief, laatst: l.laatst || null, tweedeStap: !!l.tweedeStap }))
    };
  });
  const orde = { probleem: 0, aandacht: 1, goed: 2 };
  rijen.sort((a, b) => orde[a.stand] - orde[b.stand] || a.score - b.score || String(a.naam).localeCompare(String(b.naam), "nl"));
  const tel = (f) => rijen.filter(f).length;
  return {
    rijen,
    totalen: {
      praktijken: rijen.length, klanten: tel((r) => r.status === "klant" || r.status === "opgezegd"), proeven: tel((r) => r.status === "proef"),
      therapeuten: rijen.reduce((t, r) => t + r.therapeuten, 0), actief7: rijen.reduce((t, r) => t + r.actief7, 0),
      goed: tel((r) => r.stand === "goed"), aandacht: tel((r) => r.stand === "aandacht"), probleem: tel((r) => r.stand === "probleem"),
      kaarten30: rijen.reduce((t, r) => t + r.kaarten30, 0)
    }
  };
}

// ---------- support-agent ----------

// De soorten berichten die de support-agent kan sturen. Per soort zet beheer de stand: "uit"
// (de agent stelt alleen voor), "handmatig" (een beheerder verstuurt per zaak met één klik) of
// "automatisch" (de agent verstuurt zelf, één keer per zaak per week). Naar echte adressen gaat
// niets zonder dat een beheerder de soort eerst aanzet; standaard staat alles uit.
export const MAIL_SOORTEN = {
  "inloggen-mislukt": { titel: "Inloggen lukt niet", aan: "lid", uitleg: "Na vijf foute wachtwoorden: een mail met de weg naar ‘Wachtwoord vergeten?’." },
  "tweede-stap-slot": { titel: "Tweede stap op slot", aan: "lid", uitleg: "De code-app staat 24 uur op slot: uitleg over reservecodes en een collega-beheerder." },
  "uitnodiging-verlopen": { titel: "Uitnodiging verlopen", aan: "beheerders", uitleg: "Een collega logde nooit in: de beheerder van de praktijk krijgt een seintje om opnieuw uit te nodigen." },
  "een-beheerder": { titel: "Maar één beheerder", aan: "beheerders", uitleg: "Advies om een tweede beheerder te maken, zodat de praktijk er altijd in kan." },
  "stil": { titel: "Praktijk is stil", aan: "beheerders", uitleg: "Een vriendelijke vraag of alles lukt, na twee weken zonder login en zonder kaart." },
  "storing": { titel: "Storing of onderhoud", aan: "iedereen", uitleg: "Bericht van beheer over een storing, onderhoud of een opgeloste storing. Altijd door een beheerder verstuurd." }
};
// signalen die geen mail krijgen maar een taak voor beheer zijn (bellen, factureren, nakijken)
const TAKEN = {
  "betaling-mislukt": "Bel de praktijk en spreek af hoe zij betaalt. Fysiplan probeert de incasso niet opnieuw; de praktijk heeft zelf al een mail gehad.",
  "meer-dan-betaald": "Spreek met de praktijk af of het abonnement omhoog gaat; de volgende incasso telt nog het oude aantal.",
  "proef-loopt-af": "De praktijk krijgt zelf een herinnering. Bel als je wilt helpen bij het doorgaan.",
  "praktijk-op-rem": "Iemand probeert veel wachtwoorden op deze praktijknaam. De rem werkt al; kijk in het logboek van de praktijk of het een aanval lijkt."
};

const voornaam = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const hallo = (n) => "Hallo" + (voornaam(n) ? " " + voornaam(n) : "") + ",\n\n";
const SLOT = "\n\nGroet,\nFysiplan-support";

// de tekst van een mail per soort; alleen namen van de praktijk en de ontvanger, nooit iets van patiënten
export function mailTekst(soort, { praktijk, naam, collega, basis = "https://fysiplan.nl" } = {}) {
  const app = basis + "/v2/app";
  switch (soort) {
    case "inloggen-mislukt": return { onderwerp: "Lukt inloggen bij Fysiplan niet?", tekst: hallo(naam) +
      "We zagen dat inloggen voor " + praktijk + " een paar keer misging. Weet je je wachtwoord niet meer? Open " + app +
      ", ga naar Kaarten en kies ‘Wachtwoord vergeten?’. Je krijgt dan een link om een nieuw wachtwoord te kiezen; je tweede stap blijft gewoon staan." +
      "\n\nWas jij dit niet? Dan hoef je niets te doen: na een paar foute pogingen zet Fysiplan inloggen even op de rem." + SLOT };
    case "tweede-stap-slot": return { onderwerp: "Je tweede stap bij Fysiplan staat even op slot", tekst: hallo(naam) +
      "Na te veel foute codes staat de tweede stap van je login bij " + praktijk + " 24 uur op slot. Daarna werkt je code-app weer." +
      "\n\nNu al verder? Log in met een van je reservecodes in plaats van de code uit de app. Geen reservecodes meer? Vraag een beheerder van je praktijk om je tweede stap te wissen onder Kaarten, Team; je stelt hem dan opnieuw in." + SLOT };
    case "uitnodiging-verlopen": return { onderwerp: "Uitnodiging voor " + (collega || "een collega") + " is verlopen", tekst: hallo(naam) +
      "De uitnodiging voor " + (collega || "een collega") + " om bij " + praktijk + " in Fysiplan te komen, is verlopen zonder dat er is ingelogd." +
      "\n\nNodig je collega opnieuw uit via " + app + ", Kaarten, Team. De nieuwe link is 7 dagen geldig." + SLOT };
    case "een-beheerder": return { onderwerp: "Tip: maak een tweede beheerder voor " + praktijk, tekst: hallo(naam) +
      "Bij " + praktijk + " ben jij de enige beheerder. Raak je je telefoon of wachtwoord kwijt, dan kan niemand in je praktijk je helpen." +
      "\n\nMaak daarom een collega ook beheerder: " + app + ", Kaarten, Team, en kies bij die collega de rol ‘beheerder’." + SLOT };
    case "stil": return { onderwerp: "Lukt het met Fysiplan?", tekst: hallo(naam) +
      "We zagen een tijdje niemand van " + praktijk + " in Fysiplan. Loop je ergens tegenaan, of kunnen we je ergens mee helpen? Antwoord gerust op deze mail." + SLOT };
    default: return null;
  }
}

// voorgeschreven teksten voor een storingsbericht; beheer past ze aan voor het versturen
export const STORING_SJABLONEN = {
  storing: { onderwerp: "Storing bij Fysiplan", tekst: "Hallo,\n\nFysiplan werkt op dit moment niet goed: [wat er mis is]. We werken aan een oplossing en laten het weten zodra het weer werkt.\n\nKaarten die je patiënten al hebben, blijven werken." + SLOT },
  onderhoud: { onderwerp: "Gepland onderhoud aan Fysiplan", tekst: "Hallo,\n\nOp [datum] tussen [tijd] en [tijd] doen we onderhoud aan Fysiplan. Inloggen en kaarten maken kan dan even niet; kaarten die je patiënten al hebben, blijven werken." + SLOT },
  opgelost: { onderwerp: "Fysiplan werkt weer", tekst: "Hallo,\n\nDe storing van [wanneer] is opgelost; Fysiplan werkt weer zoals je gewend bent. Excuses voor het ongemak." + SLOT }
};

// Eén ronde van de support-agent: van elk signaal een zaak, met wat de agent voorstelt.
// `stand` per soort komt van beheer; `verstuurd` is { zaakSleutel: ms } van eerdere rondes.
// Een zaak met een mail die automatisch mag en de afgelopen week nog niet is gestuurd, krijgt
// `nu: true`: die verstuurt de server in deze ronde.
export function supportRonde(bron, { stand = {}, verstuurd = {} } = {}) {
  const nu = bron.nu, zaken = [];
  for (const p of bron.praktijken || []) {
    const leden = Array.isArray(p.leden) ? p.leden : [];
    const beheerders = leden.filter((l) => l.actief && l.rol === "beheerder" && l.email);
    for (const sig of signalenVan(p, nu)) {
      const sleutel = [sig.soort, p.pk, sig.lid || ""].join("|");
      const zaak = { sleutel, soort: sig.soort, ernst: sig.ernst, pk: p.pk, praktijk: p.naam, tekst: sig.tekst, taak: TAKEN[sig.soort] || null, mails: [] };
      const ms = MAIL_SOORTEN[sig.soort];
      if (ms) {
        const lid = sig.lid ? leden.find((l) => l.id === sig.lid) : null;
        const aan = ms.aan === "lid" ? (lid && lid.email ? [lid] : []) : beheerders;
        for (const a of aan) {
          const m = mailTekst(sig.soort, { praktijk: p.naam, naam: a.naam, collega: lid ? (lid.naam || lid.email) : "" });
          if (m) zaak.mails.push({ aan: a.email, naam: a.naam || "", ...m });
        }
        const s = stand[sig.soort] || "uit";
        const laatst = verstuurd[sleutel] || 0;
        zaak.mailStand = s;
        zaak.verstuurd = laatst || null;
        zaak.opnieuwVanaf = laatst ? laatst + 7 * DAG : null;
        zaak.nu = s === "automatisch" && zaak.mails.length > 0 && nu - laatst >= 7 * DAG;
        if (!zaak.mails.length) zaak.taak = zaak.taak || "Van deze praktijk is geen adres bekend om te mailen; neem zelf contact op.";
      }
      zaken.push(zaak);
    }
  }
  const orde = { probleem: 0, aandacht: 1 };
  zaken.sort((a, b) => orde[a.ernst] - orde[b.ernst] || String(a.praktijk).localeCompare(String(b.praktijk), "nl"));
  return zaken;
}

// de ontvangers van een storingsbericht: per praktijk de beheerders, of iedereen met een login
export function storingOntvangers(bron, { wie = "beheerders", praktijken = null } = {}) {
  const set = new Map();
  for (const p of bron.praktijken || []) {
    if (praktijken && !praktijken.includes(p.pk)) continue;
    if (p.status === "gestopt") continue;
    for (const l of p.leden || []) {
      if (!l.actief || !l.email) continue;
      if (wie === "beheerders" && l.rol !== "beheerder") continue;
      const e = String(l.email).toLowerCase();
      if (!set.has(e)) set.set(e, { email: e, naam: l.naam || "", praktijk: p.naam });
    }
  }
  return [...set.values()];
}

// ---------- finance ----------

// De btw-instellingen zijn nog niet gekozen (Ahmed, open punt): de standaard is "onbekend" en
// het scherm zegt dat. Wat er feitelijk is betaald, staat vast; de keuze verandert alleen hoe
// de omzet wordt gesplitst en wat de prijs in de prognose is.
// - prijsBtw: "onbekend" | "inclusief" (9,99 is inclusief btw) | "exclusief" (9,99 plus btw)
// - kor: "onbekend" | "ja" (kleineondernemersregeling: geen btw, max 20.000 euro omzet per jaar) | "nee"
export const FINANCE_STANDAARD = { prijsBtw: "onbekend", kor: "onbekend", btwTarief: 21, prijsCent: 999, aangiftes: {}, afgesloten: {} };
export const KOR_GRENS_CENT = 2000000;

export function financeInstellingen(opgeslagen) {
  const o = opgeslagen && typeof opgeslagen === "object" ? opgeslagen : {};
  return {
    prijsBtw: ["inclusief", "exclusief"].includes(o.prijsBtw) ? o.prijsBtw : "onbekend",
    kor: ["ja", "nee"].includes(o.kor) ? o.kor : "onbekend",
    btwTarief: Number.isFinite(o.btwTarief) && o.btwTarief >= 0 && o.btwTarief <= 30 ? o.btwTarief : 21,
    prijsCent: Number.isInteger(o.prijsCent) && o.prijsCent > 0 ? o.prijsCent : 999,
    aangiftes: o.aangiftes && typeof o.aangiftes === "object" ? o.aangiftes : {},
    afgesloten: o.afgesloten && typeof o.afgesloten === "object" ? o.afgesloten : {}
  };
}

// btw uit een betaald totaal: met de KOR geen btw; anders zit het tarief in het bedrag
// (zo rekent lib/factuur.js ook: wat Mollie afschreef is het totaal)
export function splits(totaalCent, inst) {
  if (inst.kor === "ja" || !inst.btwTarief) return { excl: totaalCent, btw: 0 };
  const btw = Math.round(totaalCent * inst.btwTarief / (100 + inst.btwTarief));
  return { excl: totaalCent - btw, btw };
}

const tz = "Europe/Amsterdam";
export function maandVan(ms) {
  const d = new Date(ms).toLocaleDateString("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" });
  return d.slice(0, 7); // "2026-11"
}
export const kwartaalVan = (ms) => { const m = maandVan(ms); return m.slice(0, 4) + "-K" + Math.ceil(Number(m.slice(5)) / 3); };
export const jaarVan = (ms) => maandVan(ms).slice(0, 4);
function maandenTerug(nu, n) {
  const [j, m] = maandVan(nu).split("-").map(Number), uit = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(j, m - 1 - i, 1)); uit.push(d.toISOString().slice(0, 7)); }
  return uit;
}
function maandenVooruit(nu, n) {
  const [j, m] = maandVan(nu).split("-").map(Number), uit = [];
  for (let i = 1; i <= n; i++) { const d = new Date(Date.UTC(j, m - 1 + i, 1)); uit.push(d.toISOString().slice(0, 7)); }
  return uit;
}
// de uiterste datum voor de btw-aangifte: de laatste dag van de maand na het kwartaal
export function aangifteDeadline(kw) {
  const j = Number(kw.slice(0, 4)), k = Number(kw.slice(-1));
  return new Date(Date.UTC(j, k * 3 + 1, 0)).toISOString().slice(0, 10);
}

export function financeOverzicht(bron, instOpgeslagen) {
  const inst = financeInstellingen(instOpgeslagen);
  const nu = bron.nu;
  const facturen = (bron.facturen || []).map((f) => ({ ...f, ...splits(f.totaalCent, inst) }));
  const kosten = (bron.kosten || []).map((k) => ({ ...k, btwCent: inst.kor === "ja" ? 0 : (k.btwCent || 0), exclCent: k.bedragCent - (inst.kor === "ja" ? 0 : (k.btwCent || 0)) }));
  const telt = (f) => f.status === "betaald" || f.status === "open" || f.status === "mislukt"; // gefactureerd = omzet (factuurstelsel)
  const som = (lijst, k) => lijst.reduce((t, x) => t + (x[k] || 0), 0);

  // klanten en terugkerende omzet: praktijken met een lopend abonnement
  const klanten = (bron.praktijken || []).filter((p) => p.status === "klant" || p.status === "opgezegd");
  const plaatsen = klanten.reduce((t, p) => t + (p.plaatsen || 0), 0);
  const mrr = klanten.filter((p) => p.status === "klant").reduce((t, p) => t + (p.plaatsen || 0), 0) * inst.prijsCent;

  // per maand, de laatste 12
  const maanden = maandenTerug(nu, 12).map((m) => {
    const fm = facturen.filter((f) => maandVan(f.datum) === m && telt(f));
    const km = kosten.filter((k) => maandVan(k.datum) === m);
    return { maand: m, omzet: som(fm, "excl"), btw: som(fm, "btw"), kosten: som(km, "exclCent"), facturen: fm.length };
  });

  // per kwartaal en per jaar, over alles wat er is
  const groepeer = (sleutel) => {
    const g = new Map();
    for (const f of facturen) if (telt(f)) { const k = sleutel(f.datum); const r = g.get(k) || { omzet: 0, btw: 0, kosten: 0, voorbelasting: 0, facturen: 0 }; r.omzet += f.excl; r.btw += f.btw; r.facturen++; g.set(k, r); }
    for (const x of kosten) { const k = sleutel(x.datum); const r = g.get(k) || { omzet: 0, btw: 0, kosten: 0, voorbelasting: 0, facturen: 0 }; r.kosten += x.exclCent; r.voorbelasting += x.btwCent; g.set(k, r); }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, r]) => ({ periode: k, ...r, resultaat: r.omzet - r.kosten }));
  };
  const kwartalen = groepeer(kwartaalVan);
  const jaren = groepeer(jaarVan);

  // btw-aangifte per kwartaal (rubrieken van de aangifte omzetbelasting)
  const huidigKw = kwartaalVan(nu);
  const btw = kwartalen.map((k) => {
    const opgave = inst.aangiftes[k.periode] || null;
    const klaar = k.periode < huidigKw;
    return {
      kwartaal: k.periode, deadline: aangifteDeadline(k.periode),
      r1a: { omzet: k.omzet, btw: k.btw }, r5b: k.voorbelasting, teBetalen: k.btw - k.voorbelasting,
      stand: opgave ? "ingediend" : inst.kor === "ja" ? "kor" : klaar ? (aangifteDeadline(k.periode) < new Date(nu).toISOString().slice(0, 10) ? "te-laat" : "te-doen") : "loopt",
      ingediend: opgave
    };
  }).reverse();

  // facturen: betaald, open (nog niet binnen) en mislukt
  const betaald = facturen.filter((f) => f.status === "betaald");
  const open = facturen.filter((f) => f.status === "open" || f.status === "mislukt");

  // prognose: de terugkerende omzet groeit met de gemiddelde groei van de laatste zes maanden
  // (begrensd op 0 tot 25 procent per maand); laag en hoog zijn de helft en anderhalf keer die groei
  const laatste6 = maanden.slice(-7).map((m) => m.omzet);
  const groeien = [];
  for (let i = 1; i < laatste6.length; i++) if (laatste6[i - 1] > 0) groeien.push(laatste6[i] / laatste6[i - 1] - 1);
  const groei = Math.max(0, Math.min(0.25, groeien.length ? groeien.reduce((a, b) => a + b, 0) / groeien.length : 0));
  const maandPrijs = inst.prijsBtw === "exclusief" && inst.kor !== "ja" ? inst.prijsCent : splits(inst.prijsCent, inst).excl; // excl. btw per therapeut
  const basis = klanten.filter((p) => p.status === "klant").reduce((t, p) => t + (p.plaatsen || 0), 0) * maandPrijs;
  const prognose = maandenVooruit(nu, 12).map((m, i) => ({
    maand: m, verwacht: Math.round(basis * Math.pow(1 + groei, i + 1)),
    laag: Math.round(basis * Math.pow(1 + groei * 0.5, i + 1)), hoog: Math.round(basis * Math.pow(1 + groei * 1.5, i + 1))
  }));
  const ditJaar = jaarVan(nu);
  const restJaar = prognose.filter((p) => p.maand.startsWith(ditJaar)).reduce((t, p) => t + p.verwacht, 0);
  const jaarTotNu = (jaren.find((j) => j.periode === ditJaar) || { omzet: 0 }).omzet;

  const signalen = [];
  if (inst.prijsBtw === "onbekend") signalen.push("De keuze of 9,99 inclusief of exclusief btw is, is nog niet gemaakt. De cijfers rekenen voorlopig met btw in het betaalde bedrag, zoals de facturen nu doen.");
  if (inst.kor === "onbekend") signalen.push("Of Fysiplan de kleineondernemersregeling (KOR) gebruikt, is nog niet gekozen. De btw-aangifte rekent voorlopig zonder KOR.");
  const jaarOmzetIncl = facturen.filter((f) => jaarVan(f.datum) === ditJaar && telt(f)).reduce((t, f) => t + f.totaalCent, 0);
  if (inst.kor === "ja" && jaarOmzetIncl + restJaar > KOR_GRENS_CENT * 0.8) signalen.push("Met de KOR mag de omzet dit jaar niet boven 20.000 euro komen; de prognose komt in de buurt.");

  return {
    instellingen: inst, signalen,
    kpi: {
      klanten: klanten.length, plaatsen, mrr, arr: mrr * 12,
      omzetMaand: (maanden[maanden.length - 1] || {}).omzet || 0,
      omzetVorigeMaand: (maanden[maanden.length - 2] || {}).omzet || 0,
      omzetKwartaal: (kwartalen.find((k) => k.periode === huidigKw) || { omzet: 0 }).omzet,
      omzetJaar: jaarTotNu, prognoseJaar: jaarTotNu + restJaar,
      facturen: facturen.length, betaald: betaald.length, betaaldCent: som(betaald, "totaalCent"),
      open: open.length, openCent: som(open, "totaalCent"),
      groeiPct: Math.round(groei * 1000) / 10
    },
    maanden, kwartalen, jaren, btw, prognose,
    facturen: facturen.slice().sort((a, b) => b.datum - a.datum),
    open: open.slice().sort((a, b) => a.datum - b.datum).map((f) => ({ ...f, dagen: Math.floor((nu - f.datum) / DAG) })),
    kosten: kosten.slice().sort((a, b) => b.datum - a.datum)
  };
}

// ---------- finance-agent ----------

// Wat de finance-agent vindt in de cijfers: wat geld kost, wat een termijn heeft en wat nog
// gekozen moet worden. Elk punt: { ernst: "probleem"|"aandacht"|"kans", titel, tekst, naar }
// waarbij `naar` de pagina is waar beheer het oplost. De agent verandert zelf niets.
export function financeAgent(bron, fin) {
  const nu = bron.nu, inst = fin.instellingen, punten = [];
  const datumNl = (ms) => new Date(ms).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: tz });
  for (const b of fin.btw) {
    const kw = b.kwartaal.replace("-K", " K"), bedrag = (b.teBetalen < 0 ? "Terug te krijgen: " : "Te betalen: ") + euroTekst(Math.abs(b.teBetalen)) + ".";
    if (b.stand === "te-laat") punten.push({ ernst: "probleem", titel: "Btw-aangifte " + kw + " is te laat", tekst: "De aangifte had uiterlijk " + datumNl(Date.parse(b.deadline + "T12:00:00Z")) + " binnen moeten zijn. " + bedrag, naar: "btw" });
    else if (b.stand === "te-doen") punten.push({ ernst: "aandacht", titel: "Btw-aangifte " + kw + " doen", tekst: "Uiterlijk " + datumNl(Date.parse(b.deadline + "T12:00:00Z")) + ". " + bedrag, naar: "btw" });
  }
  for (const f of fin.open) {
    if (f.status === "mislukt") punten.push({ ernst: "probleem", titel: "Incasso mislukt bij " + f.praktijk, tekst: euroTekst(f.totaalCent) + " is niet binnengekomen. Fysiplan probeert het niet opnieuw: neem contact op met de praktijk.", naar: "facturen" });
    else if (f.dagen >= 14) punten.push({ ernst: "aandacht", titel: f.praktijk + ": " + euroTekst(f.totaalCent) + " staat " + f.dagen + " dagen open", tekst: "Factuur " + (f.nr || "zonder nummer") + " van " + datumNl(f.datum) + ".", naar: "facturen" });
  }
  for (const p of bron.praktijken || []) {
    const actief = (p.leden || []).filter((l) => l.actief).length;
    if ((p.status === "klant" || p.status === "opgezegd") && p.plaatsen && actief > p.plaatsen) punten.push({ ernst: "aandacht", titel: p.naam + " gebruikt " + actief + " logins en betaalt voor " + p.plaatsen, tekst: "Dat scheelt " + euroTekst((actief - p.plaatsen) * inst.prijsCent) + " per maand.", naar: "praktijken" });
    if (p.status === "opgezegd" && p.betaaldTot) punten.push({ ernst: "aandacht", titel: p.naam + " heeft opgezegd", tekst: "Loopt tot " + datumNl(p.betaaldTot) + "; daarna " + euroTekst(p.plaatsen * inst.prijsCent) + " per maand minder.", naar: "praktijken" });
    if (p.status === "proef" && p.proefTot && p.proefTot > nu && p.proefTot - nu <= 3 * DAG) punten.push({ ernst: "kans", titel: "Proef van " + p.naam + " loopt bijna af", tekst: "Nog " + Math.max(1, Math.ceil((p.proefTot - nu) / DAG)) + " dag(en), " + actief + " login(s). Een belletje kan helpen bij het doorgaan.", naar: "praktijken" });
  }
  const zonderNr = fin.facturen.filter((f) => f.status === "betaald" && !f.nr).length;
  if (zonderNr) punten.push({ ernst: "aandacht", titel: zonderNr + " betaling" + (zonderNr === 1 ? "" : "en") + " zonder factuurnummer", tekst: "Het nummer komt zodra de factuur voor het eerst wordt geopend.", naar: "facturen" });
  for (const s of fin.signalen) punten.push({ ernst: "aandacht", titel: s.startsWith("Met de KOR") ? "KOR-grens in zicht" : s.startsWith("Of Fysiplan") ? "KOR nog niet gekozen" : "Btw-keuze nog open", tekst: s, naar: "finance" });
  const vorig = String(Number(jaarVan(nu)) - 1);
  if (!inst.afgesloten[vorig] && fin.jaren.some((j) => j.periode === vorig)) punten.push({ ernst: "aandacht", titel: "Boekjaar " + vorig + " is nog niet afgesloten", tekst: "De accountant-agent heeft de controles klaarstaan.", naar: "jaar" });
  const orde = { probleem: 0, aandacht: 1, kans: 2 };
  return punten.sort((a, b) => orde[a.ernst] - orde[b.ernst]);
}

// ---------- accountant-agent en jaarafsluiting ----------

// De controles die een accountant bij de jaarafsluiting doet, op wat Fysiplan zelf weet.
// Elke controle: { id, titel, ok: true|false|null (null = kan Fysiplan niet weten), tekst }.
export function jaarControle(bron, instOpgeslagen, jaar, leverancier = {}) {
  const inst = financeInstellingen(instOpgeslagen);
  const nu = bron.nu;
  const fj = (bron.facturen || []).filter((f) => jaarVan(f.datum) === jaar);
  const kj = (bron.kosten || []).filter((k) => jaarVan(k.datum) === jaar);
  const c = [];
  const zonderNr = fj.filter((f) => f.status === "betaald" && !f.nr);
  c.push({ id: "nummers", titel: "Elke betaling heeft een factuurnummer", ok: !zonderNr.length, tekst: zonderNr.length ? zonderNr.length + " betaling(en) zonder nummer; het nummer komt bij het openen van de factuur." : fj.length + " facturen, alle met een nummer." });
  const nrs = fj.map((f) => f.nr).filter(Boolean).filter((n) => n.startsWith("FP-" + jaar + "-")).map((n) => Number(n.slice(-4))).sort((a, b) => a - b);
  const gaten = [], dubbel = [];
  for (let i = 1; i < nrs.length; i++) { if (nrs[i] === nrs[i - 1]) dubbel.push(nrs[i]); else for (let n = nrs[i - 1] + 1; n < nrs[i]; n++) gaten.push(n); }
  if (nrs.length && nrs[0] !== 1) for (let n = 1; n < nrs[0]; n++) gaten.push(n);
  const fmt = (n) => "FP-" + jaar + "-" + String(n).padStart(4, "0");
  c.push({ id: "reeks", titel: "Nummerreeks doorlopend, zonder gaten of dubbele", ok: !gaten.length && !dubbel.length,
    tekst: gaten.length || dubbel.length ? [gaten.length ? "ontbreekt: " + gaten.slice(0, 5).map(fmt).join(", ") + (gaten.length > 5 ? " en " + (gaten.length - 5) + " meer" : "") : "", dubbel.length ? "dubbel: " + dubbel.map(fmt).join(", ") : ""].filter(Boolean).join("; ")
      : nrs.length ? fmt(nrs[0]) + " t/m " + fmt(nrs[nrs.length - 1]) + "." : "Nog geen facturen in " + jaar + "." });
  const open = fj.filter((f) => f.status !== "betaald");
  c.push({ id: "debiteuren", titel: "Openstaande posten per 31 december bekend", ok: open.length === 0 ? true : null, tekst: open.length ? open.length + " open post(en), samen " + euroTekst(open.reduce((t, f) => t + f.totaalCent, 0)) + ". Deze gaan als debiteuren mee naar de balans." : "Geen open posten." });
  // alleen kwartalen waarin er omzet of kosten waren: daarvóór bestond de onderneming voor de btw nog niet
  const metCijfers = new Set([...fj.map((f) => kwartaalVan(f.datum)), ...kj.map((k) => kwartaalVan(k.datum))]);
  const kws = [1, 2, 3, 4].map((k) => jaar + "-K" + k).filter((k) => k <= kwartaalVan(nu) && metCijfers.has(k));
  const nietIngediend = inst.kor === "ja" ? [] : kws.filter((k) => k < kwartaalVan(nu) && !inst.aangiftes[k]);
  c.push({ id: "btw", titel: "Btw-aangifte van elk kwartaal ingediend", ok: inst.kor === "ja" ? true : !nietIngediend.length, tekst: inst.kor === "ja" ? "KOR: geen aangifte nodig (wel een jaarlijkse omzetcontrole)." : nietIngediend.length ? "Nog niet als ingediend gemarkeerd: " + nietIngediend.join(", ") + "." : "Alle afgelopen kwartalen staan als ingediend." });
  c.push({ id: "btwkeuze", titel: "Btw-keuze gemaakt (prijs incl./excl., KOR)", ok: inst.prijsBtw !== "onbekend" && inst.kor !== "onbekend", tekst: inst.prijsBtw === "onbekend" || inst.kor === "onbekend" ? "Nog open; kies dit samen met de boekhouder bij Instellingen." : "Prijs " + inst.prijsBtw + " btw, KOR: " + inst.kor + "." });
  const mist = ["bedrijf", "kvk", "adres", "btwNummer"].filter((k) => !leverancier[k]);
  c.push({ id: "bedrijf", titel: "Bedrijfsgegevens volledig op de facturen", ok: !mist.length, tekst: mist.length ? "Ontbreekt in Railway: " + mist.map((k) => ({ bedrijf: "FYSIPLAN_BEDRIJF", kvk: "FYSIPLAN_KVK", adres: "FYSIPLAN_ADRES", btwNummer: "FYSIPLAN_BTW_NUMMER" }[k])).join(", ") + ". Zonder deze gegevens zijn het betaalbewijzen, geen facturen." : "Naam, KvK, adres en btw-id staan erop." });
  const groot = fj.filter((f) => f.totaalCent > 10000 && !f.adres);
  c.push({ id: "afnemer", titel: "Facturen boven 100 euro hebben het adres van de praktijk", ok: !groot.length, tekst: groot.length ? groot.length + " factuur/facturen zonder adres van de praktijk." : "In orde." });
  c.push({ id: "kosten", titel: "Kosten ingevoerd met bonnen", ok: kj.length ? null : false, tekst: kj.length ? kj.length + " kostenposten ingevoerd. Of elke bon bewaard is, kan Fysiplan niet zien." : "Geen kosten ingevoerd voor " + jaar + "; zonder kosten is het resultaat te hoog." });
  c.push({ id: "bewaren", titel: "Bewaarplicht van 7 jaar", ok: true, tekst: "Facturen en betaalgegevens blijven 7 jaar bewaard, ook als een praktijk wordt gewist." });
  const afgesloten = inst.afgesloten[jaar] || null;
  const klaar = c.filter((x) => x.ok === true).length;
  return { jaar, controles: c, klaar, totaal: c.length, kanAfsluiten: c.every((x) => x.ok !== false) && jaar < jaarVan(nu), afgesloten };
}

export const euroTekst = (cent) => {
  const neg = cent < 0, c = Math.abs(Math.round(cent));
  return (neg ? "−" : "") + "€ " + Math.floor(c / 100).toLocaleString("nl-NL") + "," + String(c % 100).padStart(2, "0");
};

// ---------- exports voor de accountant (CSV, puntkomma en komma als decimaalteken, zoals Excel in NL) ----------

const csvVeld = (v) => { const s = String(v == null ? "" : v); if (/^-?\d[\d.]*(,\d+)?$/.test(s)) return s; return /[;"\n\r]/.test(s) || /^[=+\-@\t]/.test(s) ? '"' + (/^[=+\-@\t]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"' : s; };
const bedragCsv = (cent) => (cent < 0 ? "-" : "") + Math.floor(Math.abs(cent) / 100) + "," + String(Math.abs(cent) % 100).padStart(2, "0");
const datumCsv = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
const csv = (kop, rijen) => "\ufeff" + [kop, ...rijen].map((r) => r.map(csvVeld).join(";")).join("\r\n") + "\r\n";

export function exportCsv(soort, fin, jaar) {
  const inJaar = (ms) => !jaar || jaarVan(ms) === jaar;
  if (soort === "facturen") return csv(["Factuurnummer", "Datum", "Praktijk", "Therapeuten", "Excl. btw", "Btw", "Totaal", "Status", "Betaald op"],
    fin.facturen.filter((f) => inJaar(f.datum)).sort((a, b) => String(a.nr).localeCompare(String(b.nr))).map((f) => [f.nr || "(zonder nummer)", datumCsv(f.datum), f.praktijk, f.aantal, bedragCsv(f.excl), bedragCsv(f.btw), bedragCsv(f.totaalCent), f.status, f.betaaldOp ? datumCsv(f.betaaldOp) : ""]));
  if (soort === "debiteuren") return csv(["Factuurnummer", "Datum", "Praktijk", "Openstaand", "Dagen open", "Status"],
    fin.open.filter((f) => inJaar(f.datum)).map((f) => [f.nr || "", datumCsv(f.datum), f.praktijk, bedragCsv(f.totaalCent), f.dagen, f.status]));
  if (soort === "kosten") return csv(["Datum", "Omschrijving", "Categorie", "Excl. btw", "Btw", "Totaal"],
    fin.kosten.filter((k) => inJaar(k.datum)).map((k) => [datumCsv(k.datum), k.omschrijving, k.categorie, bedragCsv(k.exclCent), bedragCsv(k.btwCent), bedragCsv(k.bedragCent)]));
  if (soort === "btw") return csv(["Kwartaal", "1a omzet hoog tarief", "1a btw", "5b voorbelasting", "Te betalen", "Uiterlijk", "Stand"],
    fin.btw.filter((b) => !jaar || b.kwartaal.startsWith(jaar)).slice().reverse().map((b) => [b.kwartaal, bedragCsv(b.r1a.omzet), bedragCsv(b.r1a.btw), bedragCsv(b.r5b), bedragCsv(b.teBetalen), b.deadline, b.stand]));
  if (soort === "jaaroverzicht") return csv(["Periode", "Omzet excl. btw", "Kosten excl. btw", "Resultaat", "Btw ontvangen", "Voorbelasting", "Facturen"],
    [...fin.kwartalen.filter((k) => !jaar || k.periode.startsWith(jaar)), ...fin.jaren.filter((k) => !jaar || k.periode === jaar)].map((k) => [k.periode, bedragCsv(k.omzet), bedragCsv(k.kosten), bedragCsv(k.resultaat), bedragCsv(k.btw), bedragCsv(k.voorbelasting), k.facturen]));
  return null;
}
