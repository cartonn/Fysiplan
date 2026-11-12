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

export function demoBron(nu = Date.now()) {
  const r = toeval(20261112);
  const kies = (lijst) => lijst[Math.floor(r() * lijst.length)];
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
    const p = {
      pk, naam, sinds, status, plaatsen: status === "proef" || status === "gestopt" ? 0 : plaatsen, leden,
      proefTot: status === "proef" ? (i === 12 ? nu + 2 * DAG : nu + 9 * DAG) : null,
      betaaldTot: status === "klant" || status === "opgezegd" ? maandStart(nu, -1, 3 + (i % 20)) : null,
      incassoMislukt: i === 5,
      kaartenTotaal: status === "proef" ? 4 + i : Math.round((terug + 1) * plaatsen * (6 + r() * 6)),
      kaarten30: status === "gestopt" || i === 7 ? 0 : Math.round(plaatsen * (3 + r() * 5)),
      loginMis: 0, adres: i === 2 ? "" : "Voorbeeldstraat " + (i + 3) + "\n1234 AB Demostad"
    };
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
  for (let k = kwNu - 5; k < kwNu; k++) aangiftes[Math.floor(k / 4) + "-K" + (k % 4 + 1)] = { door: "demo", op: new Date(nu - (kwNu - k) * 80 * DAG).toISOString() };
  return { prijsBtw: "onbekend", kor: "onbekend", btwTarief: 21, prijsCent: 999, aangiftes, afgesloten: {} };
}

// verzonnen bedrijfsgegevens voor de demo, zodat de jaarafsluiting in demo helemaal te testen is
export const DEMO_LEVERANCIER = { bedrijf: "Fysiplan (demo)", kvk: "00000000", adres: "Demostraat 1\n0000 AA Nergens", btwNummer: "NL000000000B00" };
