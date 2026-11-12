// Nepgegevens voor de beheer- en finance-omgeving (?bron=demo).
//
// Ahmed vroeg om eerst met nepgegevens te testen hoe de omgeving eruitziet en wat de agents doen.
// Deze gegevens bestaan alleen in het geheugen: ze worden bij elk verzoek opnieuw berekend uit een
// vaste startwaarde, komen nooit in de datamap en nooit in een reservekopie. Elk e-mailadres eindigt
// op .invalid (RFC 2606): zo'n adres kan niet bestaan, dus zelfs een fout in de code kan er geen
// mail heen sturen. De server verstuurt in demo bovendien nooit iets.
//
// Dezelfde vorm als de echte bron (zie lib/beheer-omgeving.js), zodat het scherm en de agents
// precies zo werken als straks met echte praktijken.

import { supportRonde, mailTekst } from "./beheer-omgeving.js";
import { createHash } from "node:crypto";
import { alias, zaakId } from "./beheer-toegang.js";
import { leegGeheugen, contactAfdruk, audit } from "./agent-geheugen.js";

const DAG = 86400e3;

// kleine vaste toevalsgenerator (mulberry32): elke keer dezelfde praktijken
function toeval(start) {
  let a = start >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRAKTIJKEN = [
  // naam, maanden geleden gestart, plaatsen, status
  ["Fysio De Linde", 12, 6, "klant"],
  ["Beweegpunt Zuid", 11, 4, "klant"],
  ["Fysiotherapie Aan de Vecht", 10, 9, "klant"],
  ["Praktijk Hoogland", 9, 3, "klant"],
  ["Fysio Centrum Oost", 8, 7, "klant"],
  ["Sportfysio Het Veld", 7, 5, "klant"],
  ["Fysio Kerkstraat", 6, 2, "opgezegd"],
  ["Manueel Therapie Noord", 5, 4, "klant"],
  ["Fysio & Zo", 4, 3, "klant"],
  ["Rugcentrum West", 3, 8, "klant"],
  ["Fysio Duinzicht", 2, 2, "klant"],
  ["Bekkenfysio Lotus", 1, 1, "klant"],
  ["Fysio Molenweg", 0, 3, "proef"],
  ["Beweegcollectief", 0, 5, "proef"],
  ["Fysio Oude Haven", 7, 2, "gestopt"]
];
const VOORNAMEN = ["Sanne", "Daan", "Fleur", "Bram", "Noor", "Jesse", "Lotte", "Milan", "Eva", "Thijs", "Iris", "Ruben", "Femke", "Joris", "Anouk", "Sem", "Maud", "Lars", "Yara", "Ömer", "Fatima", "Mehmet", "Lieke", "Koen"];
const ACHTERNAMEN = ["de Vries", "Jansen", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "de Boer", "Bos", "Peters", "Hendriks", "Dekker", "Yilmaz", "El Amrani", "van Dijk", "Kok"];

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// de eerste van de maand, `terug` maanden voor nu (UTC, 10:00 zodat het in NL dezelfde dag is)
function maandStart(nu, terug, dag = 1) {
  const d = new Date(nu);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - terug, dag, 10);
}

// kaarten per week over twaalf weken (oud naar nieuw), passend bij het verhaal van de praktijk
function demoWeken(rw, i, status, plaatsen, sinds, nu) {
  const perWeek = plaatsen * (0.9 + rw() * 0.9);
  return Array.from({ length: 12 }, (_, w) => {
    const eindeWeek = nu - (11 - w) * 7 * DAG;
    if (eindeWeek < sinds) return 0;                                   // de praktijk bestond nog niet
    if (status === "gestopt") return w < 6 ? Math.round(perWeek * (1 - w / 6)) : 0;
    if (i === 7) return w < 8 ? Math.max(0, Math.round(perWeek * (1 - w / 8))) : 0; // Manueel Therapie Noord viel stil
    if (i === 6) return Math.round(perWeek * (w < 8 ? 1.6 : 0.5) * (0.8 + rw() * 0.4)); // Fysio Kerkstraat: zakte in en zegde op
    return Math.max(1, Math.round(perWeek * (0.7 + rw() * 0.6)));
  });
}

export function demoBron(nu = Date.now()) {
  const r = toeval(20261112);
  const rw = toeval(424242); // eigen reeks voor het gebruik, zodat de bedragen hierboven dezelfde blijven
  const praktijken = [], facturen = [];
  let wie = 0; // elke verzonnen persoon een eigen naam

  PRAKTIJKEN.forEach(([naam, terug, plaatsen, status], i) => {
    const pk = "p-demo" + String(i + 1).padStart(2, "0");
    const domein = slug(naam) + ".invalid";
    const sinds = status === "proef" ? nu - (i === 12 ? 12 : 5) * DAG : maandStart(nu, terug, 3 + (i % 20));
    const leden = [];
    const aantal = status === "proef" ? Math.max(2, plaatsen - 1) : plaatsen + (i === 4 ? 2 : 0); // Centrum Oost: meer logins dan betaald
    for (let j = 0; j < aantal; j++) {
      const vn = VOORNAMEN[wie % VOORNAMEN.length], an = ACHTERNAMEN[(wie * 7 + Math.floor(wie / VOORNAMEN.length) * 5 + 3) % ACHTERNAMEN.length];
      wie++;
      const laatstDagen = status === "gestopt" ? 15 + j : i === 7 ? 20 + j * 2 : Math.floor(r() * (j === 0 ? 2 : 9));
      leden.push({
        id: pk + "-l" + j, naam: vn + " " + an, email: slug(vn) + "@" + domein,
        rol: j === 0 || (j === 1 && aantal >= 4 && i !== 2) ? "beheerder" : "therapeut",
        actief: true, laatst: nu - laatstDagen * DAG - Math.floor(r() * 8) * 3600e3,
        tweedeStap: true, stapSlot: false, loginMis: 0, uitnodigingVerloopt: null
      });
    }
    // de problemen die de agents moeten vinden
    if (i === 0) leden[3].loginMis = 6;                                                     // inloggen lukt niet
    if (i === 2) leden[5].stapSlot = true;                                                  // tweede stap op slot (en maar één beheerder bij 9)
    if (i === 3) leden.push({ id: pk + "-l9", naam: "Kim Verhoeven", email: "kim@" + domein, rol: "therapeut", actief: false, laatst: null, tweedeStap: false, uitnodigingVerloopt: nu - 2 * DAG });
    if (i === 9) leden[6].loginMis = 5;
    const weken = demoWeken(rw, i, status, plaatsen, sinds, nu);
    const laatsteVier = weken.slice(-4).reduce((t, x) => t + x, 0);
    // de kaarten van de laatste 30 dagen verdeeld over de logins: niet iedereen maakt er evenveel
    let rest = laatsteVier;
    leden.forEach((l, j) => { const deel = !l.actief ? 0 : j === leden.length - 1 ? rest : Math.min(rest, Math.round(laatsteVier / leden.length * (0.3 + rw() * 1.5))); l.kaarten30 = deel; rest -= deel; });
    if (rest > 0) { const laatste = leden.filter((l) => l.actief).pop(); if (laatste) laatste.kaarten30 += rest; } // de laatste in de lijst is soms nog maar uitgenodigd
    // therapeuten die de app per dag open hadden: doordeweeks de meesten, in het weekend bijna niemand
    const actiefDagen = [];
    for (let d = 29; d >= 0; d--) {
      const t = nu - d * DAG, wd = new Date(t).getUTCDay(), max = leden.filter((l) => l.actief && l.laatst && nu - l.laatst < 8 * DAG).length;
      const n = status === "gestopt" || i === 7 ? 0 : wd === 0 || wd === 6 ? (rw() < 0.15 ? 1 : 0) : Math.max(laatsteVier ? 1 : 0, Math.round(max * (0.55 + rw() * 0.4)));
      actiefDagen.push({ datum: new Date(t).toISOString().slice(0, 10), n: Math.min(n, max) });
    }
    const p = {
      pk, naam, sinds, status, plaatsen: status === "proef" || status === "gestopt" ? 0 : plaatsen, leden, weken, actiefDagen,
      proefTot: status === "proef" ? (i === 12 ? nu + 2 * DAG : nu + 9 * DAG) : null,
      betaaldTot: status === "klant" || status === "opgezegd" ? maandStart(nu, -1, 3 + (i % 20)) : null,
      incassoMislukt: i === 5,
      kaartenTotaal: status === "proef" ? 4 + i : Math.round((terug + 1) * plaatsen * (6 + r() * 6)),
      kaarten30: laatsteVier,
      loginMis: 0, adres: i === 2 ? "" : "Voorbeeldstraat " + (i + 3) + "\n1234 AB Demostad"
    };
    if (status !== "gestopt" && i !== 7) r(); // houdt de vaste reeks gelijk aan die van de eerste versie
    praktijken.push(p);

    // facturen: elke maand één per klant, vanaf de start tot nu (opgezegd en gestopt: tot hun einde)
    if (status === "proef") return;
    const eind = status === "gestopt" ? 1 : 0;
    for (let m = terug; m >= eind; m--) {
      const datum = maandStart(nu, m, 3 + (i % 20));
      if (datum > nu) continue;
      const aantalNu = Math.max(1, plaatsen - (m > 6 && plaatsen > 3 ? 1 : 0)); // praktijken groeien
      const laatste = m === eind;
      const st = i === 5 && laatste ? "mislukt" : i === 9 && laatste ? "open" : "betaald";
      facturen.push({ datum, pk, praktijk: naam, aantal: aantalNu, totaalCent: aantalNu * 999, status: st, betaaldOp: st === "betaald" ? datum + DAG : null, adres: p.adres });
    }
  });

  // nummers: doorlopend per jaar, op volgorde van datum; één nummer bewust overgeslagen,
  // zodat de accountant-agent laat zien dat hij een gat in de reeks vindt
  facturen.sort((a, b) => a.datum - b.datum);
  const teller = {};
  let overgeslagen = false;
  for (const f of facturen) {
    const j = new Date(f.datum).getUTCFullYear();
    teller[j] = (teller[j] || 0) + 1;
    if (!overgeslagen && j === new Date(nu).getUTCFullYear() && teller[j] === 23) { teller[j]++; overgeslagen = true; }
    f.nr = "FP-" + j + "-" + String(teller[j]).padStart(4, "0");
  }
  // de nieuwste factuur heeft nog geen nummer (dat komt pas bij het openen, net als echt)
  const nieuwste = facturen.filter((f) => f.status === "betaald").pop();
  if (nieuwste) nieuwste.nr = "";

  // kosten van Fysiplan zelf, per maand (bedragen inclusief btw)
  const kosten = [];
  const vast = [["Hosting (Railway)", "Hosting", 2420], ["Mail (Resend)", "Software", 2178], ["AI-hulp (Anthropic)", "Software", 3630], ["Video's (HeyGen)", "Content", 3509], ["Beelden (Runway)", "Content", 4235]];
  for (let m = 12; m >= 0; m--) {
    for (const [oms, cat, cent] of vast) {
      const d = maandStart(nu, m, 5);
      if (d > nu) continue;
      const bedrag = Math.round(cent * (0.9 + r() * 0.3));
      kosten.push({ id: "k" + m + slug(oms), datum: d, omschrijving: oms, categorie: cat, bedragCent: bedrag, btwCent: Math.round(bedrag * 21 / 121) });
    }
    if (m % 3 === 0) { const d = maandStart(nu, m, 20); if (d <= nu) kosten.push({ id: "kb" + m, datum: d, omschrijving: "Boekhouder, kwartaal", categorie: "Advies", bedragCent: 18150, btwCent: 3150 }); }
  }
  kosten.push({ id: "kvk", datum: maandStart(nu, 12, 8), omschrijving: "Inschrijving KvK", categorie: "Overig", bedragCent: 8215, btwCent: 0 });
  kosten.push({ id: "domein", datum: maandStart(nu, 11, 2), omschrijving: "Domeinnaam fysiplan.nl", categorie: "Hosting", bedragCent: 1694, btwCent: 294 });

  // beschikbaarheid van de laatste 30 dagen, met één storing
  const beschikbaarheid = [];
  for (let d = 29; d >= 0; d--) {
    const datum = new Date(nu - d * DAG).toISOString().slice(0, 10);
    beschikbaarheid.push({ datum, pct: d === 9 ? 97.9 : d === 18 ? 99.6 : 100 });
  }
  return {
    soort: "demo", nu, praktijken, facturen, kosten,
    systeem: {
      versie: "demo000", uptimeUren: 31, mail: true, volume: true,
      backup: { ok: true, laatst: nu - 5 * 3600e3 },
      checks: [
        { naam: "Server", ok: true, tekst: "Draait 31 uur sinds de laatste uitrol" },
        { naam: "Opslag", ok: true, tekst: "Volume actief; reservekopie van vannacht staat elders" },
        { naam: "Mail", ok: true, tekst: "Mail via Resend ingesteld" },
        { naam: "Betalingen", ok: false, tekst: "Mollie staat uit (geen MOLLIE_API_KEY)" },
        { naam: "Inloggen", ok: true, tekst: "Eigen login met tweede stap verplicht" }
      ],
      beschikbaarheid
    }
  };
}

// demo-instellingen: de afgelopen kwartalen staan als ingediend
export function demoInstellingen(nu = Date.now()) {
  const aangiftes = {};
  const d = new Date(nu);
  const kwNu = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  // elke aangifte twintig dagen na het einde van het kwartaal (of vandaag, als dat eerder is)
  for (let k = kwNu - 5; k < kwNu; k++) aangiftes[Math.floor(k / 4) + "-K" + (k % 4 + 1)] = { door: "demo", op: new Date(Math.min(nu, Date.UTC(Math.floor(k / 4), (k % 4 + 1) * 3, 21, 10))).toISOString() };
  return { prijsBtw: "onbekend", kor: "onbekend", btwTarief: 21, prijsCent: 999, aangiftes, afgesloten: {} };
}

// De support-agent van de demo heeft al een week gewerkt. Twee soorten mail staan op automatisch,
// één op handmatig, de rest uit: zo zijn alle drie de standen te zien. Wat hij in die week zag,
// mailde en zag verdwijnen staat in zijn logboek en in het demo-postvak. De zaken van nu komen
// uit dezelfde nepgegevens als het scherm; de drie afgehandelde zaken zijn erbij verzonnen.
export function demoAgent(bron) {
  const nu = bron.nu, UUR = 3600e3, WEEK = 7 * DAG;
  const stand = { "inloggen-mislukt": "automatisch", "tweede-stap-slot": "automatisch", "uitnodiging-verlopen": "handmatig" };
  const iso = (ms) => new Date(ms).toISOString();
  const open = {}, verstuurd = {}, mails = [], stappen = [];
  const stap = (ms, z, wat, extra = {}) => stappen.push({ ms, z, wat, extra, n: stappen.length });
  const mail = (ms, z, wie) => { for (const m of z.mails) mails.push({ t: iso(ms), aan: m.aan, onderwerp: m.onderwerp, tekst: m.tekst, praktijk: z.praktijk, wie }); };

  // de zaken die nu open staan: wanneer de agent ze voor het eerst zag, en of hij toen mailde
  const nr = {};
  for (const z of supportRonde(bron, { stand })) {
    nr[z.soort] = (nr[z.soort] || 0) + 1;
    const geleden = { "inloggen-mislukt": nr[z.soort] === 1 ? 2 * UUR : 9 * UUR, "tweede-stap-slot": 5 * UUR, "uitnodiging-verlopen": 2 * DAG - 600e3, "proef-loopt-af": DAG }[z.soort] || WEEK;
    open[z.sleutel] = { praktijk: z.praktijk, tekst: z.tekst, sinds: nu - geleden };
    stap(nu - geleden, z, "nieuw");
    if (z.nu) { verstuurd[z.sleutel] = nu - geleden; stap(nu - geleden, z, "gemaild", { wie: "agent" }); mail(nu - geleden, z, "agent"); }
  }
  // drie zaken uit de afgelopen week die na een mail verdwenen
  const oud = (i, soort, ernst, tekst, aan, collega, van, tot, wie = "agent") => {
    const p = bron.praktijken[i];
    if (!p || !aan) return;
    const z = { praktijk: p.naam, tekst, ernst, mails: [{ aan: aan.email, naam: aan.naam, ...mailTekst(soort, { praktijk: p.naam, naam: aan.naam, collega }) }] };
    stap(nu - van, z, "nieuw");
    const gemaild = wie === "agent" ? nu - van : nu - van + 5 * UUR; // een beheerder verstuurt later dan de agent
    stap(gemaild, z, "gemaild", { wie });
    mail(gemaild, z, wie);
    stap(nu - tot, z, "opgelost", { gemaild: true, dagen: Math.round((van - tot) / DAG) });
  };
  const lid = (i, j) => bron.praktijken[i]?.leden[j];
  if (lid(8, 1)) oud(8, "tweede-stap-slot", "probleem", lid(8, 1).naam + ": tweede stap staat op slot na te veel foute codes", lid(8, 1), "", 6 * DAG + 2 * UUR, 5 * DAG + 1 * UUR);
  if (lid(10, 0)) oud(10, "uitnodiging-verlopen", "aandacht", "Tom Scholten: uitnodiging verlopen zonder in te loggen", lid(10, 0), "Tom Scholten", 6 * DAG, 3 * DAG + 4 * UUR, "demo");
  if (lid(1, 2)) oud(1, "inloggen-mislukt", "probleem", lid(1, 2).naam + ": 5 keer een fout wachtwoord in 24 uur", lid(1, 2), "", 4 * DAG + 3 * UUR, 4 * DAG + 1 * UUR);

  // van de stappen naar het logboek (nieuwste boven) en de rondes waarin iets gebeurde
  stappen.sort((a, b) => a.ms - b.ms || a.n - b.n);
  const logboek = [], rondes = [];
  let openNu = 0, problemen = 0, r = null;
  const sluit = () => { if (r) { r.zaken = openNu; r.problemen = problemen; rondes.unshift(r); r = null; } };
  for (const s of stappen) {
    const eerste = s.ms === nu - WEEK, t = iso(s.ms), zwaar = s.z.ernst === "probleem" ? 1 : 0;
    const vanAgent = s.wat !== "gemaild" || s.extra.wie === "agent";
    if (vanAgent && (!r || r.t !== t)) { sluit(); r = { t, wie: "agent", zaken: 0, problemen: 0, verstuurd: 0, nieuw: 0, opgelost: 0 }; }
    if (s.wat === "nieuw") { openNu++; problemen += zwaar; if (!eerste) { r.nieuw++; logboek.unshift({ t, wat: "nieuw", praktijk: s.z.praktijk, tekst: s.z.tekst }); } }
    if (s.wat === "opgelost") { openNu--; problemen -= zwaar; r.opgelost++; logboek.unshift({ t, wat: "opgelost", praktijk: s.z.praktijk, tekst: s.z.tekst, ...s.extra }); }
    if (s.wat === "gemaild") { if (vanAgent) r.verstuurd += s.z.mails.length; logboek.unshift({ t, wat: "gemaild", praktijk: s.z.praktijk, tekst: s.z.tekst, onderwerp: s.z.mails[0].onderwerp, aan: s.z.mails.length, wie: s.extra.wie }); }
    if (eerste && !logboek.some((x) => x.wat === "start")) logboek.unshift({ t, wat: "start", tekst: "" });
  }
  sluit();
  const begin = logboek.find((x) => x.wat === "start");
  if (begin) { const n = stappen.filter((s) => s.wat === "nieuw" && s.ms === nu - WEEK).length; begin.tekst = n + (n === 1 ? " open zaak" : " open zaken") + " bij de eerste ronde"; }
  mails.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
  return { stand, verstuurd, open, logboek, rondes, mails };
}

// verzonnen bedrijfsgegevens voor de demo, zodat de jaarafsluiting in demo helemaal te testen is
export const DEMO_LEVERANCIER = { bedrijf: "Fysiplan (demo)", kvk: "00000000", adres: "Demostraat 1\n0000 AA Nergens", btwNummer: "NL000000000B00" };

// De agents met taalmodel in de demo: de support- en de tech-agent werken al een week, de
// finance-agent draait op proef. Twee eigen berichten wachten op akkoord, één is gisteren
// goedgekeurd en één afgewezen, zodat elke stand te zien is. De concepten horen bij zaken die er
// in de demo echt zijn: goedkeuren zet het bericht in het postvak van de demo. `zaken` zijn de
// zaken van de support-agent, `posten` de open posten van finance, `zout` maakt de codes en
// `verschilKwartaal` is het kwartaal waarin na het indienen nog een bon bij kwam.
export function demoLoket(bron, zaken, posten, zout, verschilKwartaal) {
  const nu = bron.nu, uur = 3600e3;
  const t = (terug) => new Date(nu - terug).toISOString();
  const P = (z) => (z ? alias(zout, "P", z.pk) : "een praktijk");
  const zoek = (soort) => zaken.find((z) => z.soort === soort) || null;
  const daalt = zoek("gebruik-daalt"), proef = zoek("proef-loopt-af"), stil = zoek("stil"), slot = zoek("tweede-stap-slot"), post = posten[0] || null;
  const concept = (z, rol, extra) => (z ? [{ id: "c-demo-" + extra.id, rol, sleutel: z.sleutel, zaakId: zaakId(zout, z.sleutel), soort: z.soort, pk: z.pk, praktijk: z.praktijk, wat: z.tekst, aan: Math.max(1, z.mails.length), ...extra }] : []);
  const per = [];
  for (let i = 23; i >= 0; i--) per.push({ uur: new Date(nu - i * uur).toISOString().slice(0, 13) + ":00Z", verzoeken: 380 + ((i * 97) % 410), fouten: i === 19 ? 4 : i === 18 ? 3 : 0 });
  return {
    sleutel: { gemaakt: t(6 * DAG), door: "demo" },
    agents: {
      support: { stand: "aan", door: "demo", op: t(6 * DAG) },
      tech: { stand: "aan", mergen: false, door: "demo", op: t(6 * DAG) },
      finance: { stand: "proef", door: "demo", op: t(2 * DAG) },
      staf: { stand: "proef", door: "demo", op: t(1 * DAG) },
      groei: { stand: "proef", door: "demo", op: t(1 * DAG) }
    },
    gezien: { support: t(0.7 * uur), tech: t(0.4 * uur), finance: t(7 * uur), staf: t(1 * uur), groei: t(2 * uur) },
    verslagen: [
      { id: "v-demo-0", t: t(1 * uur), rol: "staf", tekst: "Brief van vandaag. Drie dingen wachten op jou: een taakvoorstel (twee proefpraktijken bellen), een terugbelverzoek van een prospect en een concept van de groei-agent. De printfout is opgelost maar nog niet live.",
        punten: [{ soort: "voorstel", tekst: "Eerst de oplossing van de printfout mergen: klaar en getest, en het raakt elke praktijk die print." },
          { soort: "voorstel", tekst: "Dan het terugbelverzoek: de prospect vroeg er zelf om en wacht nu twee uur." },
          { soort: "let-op", tekst: "De groei-agent probeerde een afgemelde prospect voor te stellen; de poort weigerde dat terecht." }] },
      { id: "v-demo-1", t: t(0.4 * uur), rol: "tech", tekst: "Geen nieuwe fouten in het laatste uur. De zeven fouten van vannacht kwamen allemaal van het printen van een kaart en zijn na de oplossing van vanochtend niet meer voorgekomen.",
        punten: [{ soort: "gedaan", tekst: "Oorzaak gevonden: een kaart zonder oefeningen gaf bij het printen een fout. Oplossing met een test staat klaar; de controles zijn groen." },
          { soort: "let-op", tekst: "Zelf mergen staat uit: de oplossing wacht op een klik van beheer." }] },
      { id: "v-demo-2", t: t(0.7 * uur), rol: "support", tekst: zaken.length + " zaken open, waarvan " + zaken.filter((z) => z.ernst === "probleem").length + " problemen. Bij " + P(daalt) + " zakt het gebruik al vier weken en is nu ook opgezegd: daar heb ik een bericht voor klaargezet. Bij " + P(proef) + " loopt de proef over twee dagen af terwijl er nog elke dag wordt gewerkt.",
        punten: [...(daalt ? [{ soort: "gedaan", tekst: "Bericht klaargezet met de vraag wat er misging; wacht op akkoord.", zaak: zaakId(zout, daalt.sleutel), praktijk: P(daalt) }] : []),
          ...(proef ? [{ soort: "voorstel", tekst: "Bel deze praktijk vóór het einde van de proef: een belletje werkt hier beter dan een mail.", zaak: zaakId(zout, proef.sleutel), praktijk: P(proef) }] : []),
          ...(slot ? [{ soort: "let-op", tekst: "De standaardmail over de tweede stap is verstuurd; de zaak staat nog open.", zaak: zaakId(zout, slot.sleutel), praktijk: P(slot) }] : [])] },
      { id: "v-demo-3", t: t(7 * uur), rol: "finance", tekst: "Proefronde op de demo-gegevens. Eén kwartaal is na het indienen veranderd doordat er een bon bij kwam. Eén incasso is mislukt; daar staat een herinnering voor klaar.",
        punten: [{ soort: "voorstel", tekst: "Bespreek met de boekhouder of voor het kwartaal met het verschil een suppletie nodig is." },
          ...(post ? [{ soort: "gedaan", tekst: "Herinnering klaargezet voor de open post; wacht op akkoord.", zaak: zaakId(zout, post.sleutel), praktijk: P(post) }] : [])] },
      { id: "v-demo-4", t: t(25 * uur), rol: "support", tekst: "Rustige dag: twee zaken opgelost zonder dat er iets hoefde te gebeuren. Bij " + P(stil) + " is al twintig dagen niemand actief; de standaardmail is vorige week gestuurd en er kwam geen reactie.",
        punten: [...(stil ? [{ soort: "voorstel", tekst: "Geen tweede mail sturen; liever bellen.", zaak: zaakId(zout, stil.sleutel), praktijk: P(stil) }] : [])] }
    ],
    concepten: [
      ...concept(daalt, "support", { id: "1", t: t(0.7 * uur), stand: "wacht", onderwerp: "Kunnen we iets voor {praktijk} doen?",
        tekst: "We zagen dat er bij {praktijk} de laatste weken een stuk minder kaarten zijn gemaakt dan daarvoor, en dat jullie hebben opgezegd. Dat vinden we jammer.\n\nLiep je ergens tegenaan, of miste je iets in Fysiplan? Als je op deze mail antwoordt, kijken we graag met je mee. En wil je toch blijven, dan regelen we dat zo." }),
      ...concept(post, "finance", { id: "2", t: t(7 * uur), stand: "wacht", onderwerp: "De betaling voor {praktijk} is niet gelukt",
        tekst: "De maandincasso voor {praktijk} is deze maand niet gelukt. Dat gebeurt vaker, bijvoorbeeld als er net te weinig saldo stond.\n\nFysiplan probeert het niet vanzelf opnieuw. Antwoord op deze mail als je wilt afspreken hoe je betaalt, of als er iets niet klopt aan de factuur." }),
      ...concept(stil, "support", { id: "3", t: t(26 * uur), stand: "afgewezen", door: "demo", op: t(24 * uur), reden: "Liever bellen: deze praktijk kreeg vorige week al een mail.", onderwerp: "Nog even over {praktijk}",
        tekst: "Vorige week vroegen we of alles lukt met Fysiplan. We hebben nog niets gehoord en zien dat er nog steeds niemand inlogt. Kunnen we ergens mee helpen?" }),
      ...concept(proef, "support", { id: "4", t: t(30 * uur), stand: "verstuurd", door: "demo", op: t(28 * uur), onderwerp: "Je proef bij Fysiplan loopt bijna af",
        tekst: "De proef van {praktijk} loopt binnenkort af. We zien dat jullie er elke dag mee werken; mooi om te zien.\n\nWil je doorgaan, dan kan dat in de app onder Kaarten, Abonnement. Heb je nog een vraag voordat je kiest? Antwoord gerust op deze mail." })
    ],
    notities: [{ id: "n-demo-1", t: t(7 * uur), rol: "finance", periode: verschilKwartaal || new Date(nu).getUTCFullYear() + "-K2", tekst: "Na het indienen kwam er één bon bij met € 21,00 voorbelasting. Het verschil is klein; vraag de boekhouder of het mee kan in de volgende aangifte." }],
    fouten: { verzoeken24Uur: per.reduce((n, x) => n + x.verzoeken, 0), fouten24Uur: 7, fouten7Dagen: 9, perUur: per,
      routes: [{ route: "POST /api/kaart/…/print 500", laatste24Uur: 7, laatste7Dagen: 7, laatstInUur: per[5].uur }, { route: "GET /api/praktijk/status 502", laatste24Uur: 0, laatste7Dagen: 2, laatstInUur: new Date(nu - 4 * DAG).toISOString().slice(0, 13) + ":00Z" }] },
    accounts: [
      { email: "sanne@fysiplan.invalid", naam: "Sanne de Wit", status: "actief", gemaakt: t(200 * DAG), laatst: t(0.2 * uur), rechten: null, ik: true },
      { email: "mila@fysiplan.invalid", naam: "Mila Jansen", status: "actief", gemaakt: t(40 * DAG), laatst: t(3 * uur), rechten: ["praktijken", "support", "berichten"] },
      { email: "boekhouder@kantoor.invalid", naam: "Kantoor De Cijfers", status: "actief", gemaakt: t(90 * DAG), laatst: t(6 * DAG), rechten: ["finance", "boekhouding"] },
      { email: "stagiair@fysiplan.invalid", naam: "Tim (stage)", status: "nog niet ingelogd", gemaakt: t(2 * DAG), laatst: null, rechten: ["praktijken"] }
    ]
  };
}

// Het gedeelde geheugen van de chief of staff en de groei-agent (lib/agent-geheugen.js), in de
// demo: een paar taken, prospects met en zonder toestemming, één afmelding en wat auditregels.
// Prospects zijn praktijken die (nog) geen klant zijn; nooit patiënten. De agents zien alleen de
// code (C-...); de naam en de nepadressen zijn er voor de pagina.
export function demoGeheugen(nu, zout) {
  const G = leegGeheugen(), t = (terug) => new Date(nu - terug).toISOString(), uur = 3600e3;
  const C = (i) => alias(zout, "C", "demo", i);
  const prospects = [
    // naam, segment, therapeuten, bron, toestemming, dagen sinds contact, proef
    ["Fysio Duinzicht", "maatschap", 4, "terugbelverzoek-site", { mail: true, bellen: true }, null, null],
    ["Beweegkracht Noord", "zzp", 1, "proef-gestart", { mail: true, bellen: false }, 3, { dagenOver: 9, kaarten: 6 }],
    ["Fysiotherapie Molenwijk", "bv", 11, "beurs-formulier", { mail: true, bellen: false }, null, null],
    ["Praktijk Op de Been", "zzp", 1, "nieuwsbrief", { mail: true, bellen: false }, 12, null],
    ["Sportfysio Kustlijn", "maatschap", 6, "terugbelverzoek-site", { mail: false, bellen: true }, null, null],
    ["Fysio Het Anker", "vof", 2, "proef-gestart", { mail: true, bellen: true }, 40, { dagenOver: -5, kaarten: 1 }]
  ];
  G.contacten = prospects.map(([naam, segment, therapeuten, bron, toestemming, dagen, proef], i) => ({
    code: C(i), naam: naam + " (demo)", segment, therapeuten, bron, toestemming, proef,
    toestemmingSinds: t((20 + i * 3) * DAG), laatsteContact: dagen == null ? null : t(dagen * DAG),
    afdrukken: [contactAfdruk("info" + i + "@prospect" + i + ".invalid"), contactAfdruk("+3120000000" + i)]
  }));
  // één prospect meldde zich af: geen contact meer, ook niet als iemand het voorstelt
  const af = G.contacten[3];
  for (const a of af.afdrukken) G.afmeldingen.push({ afdruk: a, t: t(5 * DAG), bron: "antwoord-op-mail" });
  af.afgemeld = true;
  const taak = (id, extra) => ({ id: "T-" + createHash("sha256").update("demo|" + zout + "|" + id).digest("hex").slice(0, 8), adviezen: [], ...extra });
  G.taken = [
    taak(1, { t: t(1 * uur), door: "staf-agent", status: "voorgesteld", soort: "support", prioriteit: 1, titel: "Twee proefpraktijken bellen vóór het einde van hun proef",
      uitleg: "De support-agent ziet twee praktijken waarvan de proef binnen drie dagen afloopt terwijl ze elke dag kaarten maken. Een kort gesprek werkt daar beter dan een mail." }),
    taak(2, { t: t(2 * uur), door: "groei-agent", status: "wacht-op-akkoord", soort: "contact", prioriteit: 2, contact: G.contacten[0].code, kanaal: "bellen", titel: "Terugbellen: " + G.contacten[0].code,
      uitleg: "Vroeg via de site om teruggebeld te worden en gaf toestemming om te bellen. Maatschap met vier therapeuten; nog niet gebeld." }),
    taak(3, { t: t(26 * uur), door: "staf-agent", status: "open", soort: "tech", prioriteit: 2, titel: "Fout bij het printen van een lege kaart nalopen",
      uitleg: "De tech-agent meldde zeven fouten bij het printen van een kaart zonder oefeningen. De oplossing wacht op een klik; daarna deze taak sluiten.",
      adviezen: [{ t: t(3 * uur), door: "staf-agent", tekst: "Eerst mergen: de oplossing is klaar en de controles zijn groen.", prioriteit: 1 }] }),
    taak(4, { t: t(4 * DAG), door: "groei-agent", status: "klaar", soort: "groei", prioriteit: 3, op: t(2 * DAG), besluitDoor: "sanne@fysiplan.invalid", titel: "Feitenlijst voor de groei-agent vastleggen",
      uitleg: "Zonder vaste feiten kan de groei-agent geen concepten schrijven die kloppen." })
  ];
  G.groei = [
    { id: "G-demo0001", t: t(5 * uur), door: "groei-agent", stand: "wacht", soort: "bericht", titel: "Oefenkaart in één minuut",
      doel: "Fysiotherapeuten die nog met papieren oefenlijsten werken; doel: aanmeldingen voor de gratis proef.",
      tekst: "Nog steeds oefeningen uitprinten of op een briefje schrijven? Met Fysiplan maak je een oefenkaart in een minuut en deel je hem met een QR-code. Je patiënt opent hem op de telefoon, zonder account, en vinkt af wat gedaan is. Jij kiest de oefeningen; Fysiplan helpt alleen met het opschrijven en delen.\n\nProbeer het 14 dagen gratis op https://fysiplan.nl." },
    { id: "G-demo0002", t: t(30 * uur), door: "groei-agent", stand: "afgewezen", op: t(28 * uur), besluitDoor: "sanne@fysiplan.invalid", besluitReden: "Te veel nadruk op video; die zijn nog niet bij elke oefening.", soort: "landing", titel: "Elke oefening met video",
      doel: "Bezoekers van de landingspagina; doel: laten zien hoe de patiënt de oefening ziet.",
      tekst: "Bij elke oefening een duidelijke video, zodat je patiënt thuis precies weet wat hij moet doen. Zo hoeft niemand meer te twijfelen over de uitvoering." }
  ];
  audit(G, { nu: nu - 30 * uur, wie: "groei-agent", actie: "concept", besluit: "wacht-op-akkoord", doel: "G-demo0002" });
  audit(G, { nu: nu - 28 * uur, wie: "sanne@fysiplan.invalid", actie: "concept-besluit", besluit: "afgewezen", doel: "G-demo0002" });
  audit(G, { nu: nu - 5 * DAG, wie: "beheer", actie: "afmelding", besluit: "vastgelegd", doel: af.code });
  audit(G, { nu: nu - 26 * uur, wie: "staf-agent", actie: "taak-voorstel", besluit: "wacht-op-akkoord", doel: G.taken[2].id });
  audit(G, { nu: nu - 6 * uur, wie: "groei-agent", actie: "contact-voorstel", besluit: "geweigerd", reden: "afgemeld" });
  audit(G, { nu: nu - 5 * uur, wie: "groei-agent", actie: "concept", besluit: "wacht-op-akkoord", doel: "G-demo0001" });
  audit(G, { nu: nu - 2 * uur, wie: "groei-agent", actie: "contact-voorstel", besluit: "wacht-op-akkoord", doel: G.taken[1].id });
  audit(G, { nu: nu - 1 * uur, wie: "staf-agent", actie: "taak-voorstel", besluit: "wacht-op-akkoord", doel: G.taken[0].id });
  return G;
}
