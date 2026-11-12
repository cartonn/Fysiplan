// Wie mag wat in de beheer- en finance-omgeving, en wat een agent met taalmodel te zien krijgt.
//
// Twee soorten gebruikers:
// - beheerders: mensen met een eigen beheeraccount. Een account zonder lijst `rechten` mag alles,
//   zoals het altijd was. Met een lijst mag het alleen wat erin staat, en alleen in deze omgeving.
// - agents: taken met een taalmodel die op een schema draaien. Zij komen binnen via het loket
//   (/api/agent/..., lib/beheer-loket-routes.js) en zien alleen wat hier wordt opgebouwd.
//
// Een agent ziet nooit een naam, een e-mailadres of een tekst die iemand van buiten heeft getypt.
// Praktijken en logins hebben een code (P-1a2b3c, L-4d5e6f) en feiten zijn getallen. Zo leest een
// agent niets waarin een opdracht verstopt kan zitten, en kan hij geen persoonsgegevens
// doorvertellen. Wie een bericht krijgt en hoe die heet, vult de server in.
//
// Alles hier is puur: geen webserver, geen bestand, geen mail.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MAIL_SOORTEN, praktijkOverzicht, mailAanhef, MAIL_SLOT } from "./beheer-omgeving.js";

const DAG = 86400e3;

// ---------- rechten van beheerders ----------

export const RECHTEN = {
  praktijken: { titel: "Praktijken", uitleg: "Het overzicht, de praktijken, hun therapeuten, gebruik en health bekijken." },
  support: { titel: "Support", uitleg: "Open zaken zien, per zaak een mail versturen en een ronde van de support-agent starten." },
  berichten: { titel: "Berichten", uitleg: "Een storings- of onderhoudsbericht aan alle praktijken sturen." },
  finance: { titel: "Finance", uitleg: "Cijfers, facturen en kosten bekijken, kosten boeken en exports downloaden." },
  boekhouding: { titel: "Boekhouding", uitleg: "De btw-instellingen kiezen, een aangifte als ingediend markeren en een boekjaar afsluiten." },
  agents: { titel: "Agents", uitleg: "Instellen wat de agents mogen, hun concepten goedkeuren en de agents stilzetten." },
  vertalen: { titel: "Vertalingen", uitleg: "De vertalingen van de bibliotheek nalezen en verbeteren op /dashboard88/vertalingen, en de bibliotheek vooraf laten vertalen. Geef een lezer per taal alleen dit recht." },
  beheer: { titel: "Volledig beheer", uitleg: "Alles, ook buiten deze omgeving: beheeraccounts en hun rechten, de sleutel van de agents en de overige beheerpagina's." }
};
export const ALLE_RECHTEN = Object.keys(RECHTEN);
// welk recht een pagina van de omgeving vraagt (lezen); wat je er mag doen staat bij de routes
export const PAGINA_RECHT = { overzicht: "praktijken", praktijken: "praktijken", support: "support", berichten: "berichten", finance: "finance", facturen: "finance", btw: "finance", jaar: "finance", agents: "agents", beheerders: "beheer" };

// Van wat er binnenkomt naar wat er wordt bewaard: null betekent "alles" (geen beperking).
// Wie volledig beheer heeft, heeft per definitie alles; dat staat dan ook zo opgeslagen.
export function schoonRechten(lijst) {
  if (!Array.isArray(lijst)) return null;
  const set = new Set(lijst.filter((r) => typeof r === "string" && Object.hasOwn(RECHTEN, r)));
  if (set.has("beheer")) return null;
  return ALLE_RECHTEN.filter((r) => set.has(r));
}
export function rechtenVan(account) {
  const lijst = account && Array.isArray(account.rechten) ? schoonRechten(account.rechten) : null;
  return new Set(lijst || ALLE_RECHTEN);
}
export const heeftAlles = (account) => rechtenVan(account).has("beheer");
// Mag dit account bij een beheerroute buiten de omgeving? Een account met een beperkte lijst
// niet: het komt alleen bij /api/beheer/omgeving, waar elke route zelf het recht controleert.
export function magBuiten(account, url) {
  if (heeftAlles(account)) return true;
  const pad = String(url || "").split("?")[0];
  // een lezer (recht "vertalen") komt ook bij de vertalingen (lib/vertaal-routes.js)
  if (rechtenVan(account).has("vertalen") && (pad === "/api/beheer/vertalingen" || pad.startsWith("/api/beheer/vertalingen/"))) return true;
  return pad === "/api/beheer/omgeving" || pad.startsWith("/api/beheer/omgeving/");
}

// ---------- agents ----------

// uit: de agent krijgt niets en kan niets. proef: hij werkt op de demo-gegevens, er gaat niets
// naar echte adressen. aan: hij werkt op de gegevens van fysiplan.nl.
export const AGENT_STANDEN = ["uit", "proef", "aan"];
export const AGENT_ROLLEN = {
  support: { titel: "Support-agent", wie: "support-agent",
    ziet: "Open zaken en het gebruik per praktijk, met codes in plaats van namen.",
    doet: "Schrijft bij een zaak zelf een bericht aan de praktijk en doet verslag van wat hij zag.",
    acties: ["eigen-mail", "verslag"] },
  tech: { titel: "Tech-agent", wie: "tech-agent",
    ziet: "Fouten van de server per route, beschikbaarheid, de versie en hoeveel zaken er per soort open staan. Geen praktijken.",
    doet: "Zoekt de oorzaak in de code, maakt een oplossing met een test en zet die klaar op GitHub. Staat ‘zelf mergen’ aan, dan zet hij een oplossing met groene controles ook live.",
    acties: ["verslag"] },
  finance: { titel: "Finance-agent", wie: "finance-agent",
    ziet: "Omzet, kosten, open posten, btw per kwartaal en de controles van het boekjaar, met codes in plaats van namen.",
    doet: "Zet een aangifte of jaarafsluiting klaar met notities, schrijft een herinnering bij een open post en doet verslag.",
    acties: ["eigen-mail", "notitie", "verslag"] },
  // De chief of staff en de groei-agent werken met het gedeelde geheugen (lib/agent-geheugen.js) en
  // mogen voorlopig alleen op proef: het geheugen bestaat alleen in de demo.
  staf: { titel: "Chief of staff", wie: "staf-agent", alleenProef: true,
    ziet: "De gedeelde takenlijst, wat er op een mens wacht, tellingen van open zaken en de verslagen van de andere agents. Geen namen, geen contacten.",
    doet: "Adviseert alleen: stelt taken voor, geeft advies en prioriteit bij een taak en schrijft een dagelijkse brief. Voert niets uit en verstuurt niets.",
    acties: ["taak-voorstel", "advies", "verslag"] },
  groei: { titel: "Groei-agent", wie: "groei-agent", alleenProef: true,
    ziet: "De vaste feiten over Fysiplan, prospects als codes met hun toestemming per kanaal, en wat beheer van zijn vorige concepten vond.",
    doet: "Schrijft concepten en stelt contact met een prospect voor, alleen met toestemming en nooit na een afmelding. Publiceren en contact opnemen doet een mens.",
    acties: ["concept", "contact-voorstel", "taak-voorstel", "verslag"] }
};
export const EIGEN_MAX_DAG = 10; // eigen berichten van alle agents samen, per dag
export const VERSLAG_MAX_DAG = 12; // per agent
export const NOTITIE_MAX_DAG = 20;

export const nieuweSleutel = () => "fpa_" + randomBytes(24).toString("hex");
export const sleutelHash = (sleutel) => createHash("sha256").update("fysiplan-agent|" + String(sleutel)).digest("hex");
export function sleutelKlopt(gegeven, hash) {
  if (typeof gegeven !== "string" || !/^fpa_[a-f0-9]{48}$/.test(gegeven) || !/^[a-f0-9]{64}$/.test(String(hash || ""))) return false;
  return timingSafeEqual(Buffer.from(sleutelHash(gegeven), "hex"), Buffer.from(hash, "hex"));
}
// Bij welke rol hoort deze sleutel? `sleutels` is { rol: { hash } }. Alle afdrukken worden
// vergeleken (geen vroege stop), zodat de tijd niet verraadt hoeveel rollen er een sleutel hebben.
export function rolVanSleutel(gegeven, sleutels) {
  let rol = null;
  for (const [r, k] of Object.entries(sleutels || {})) if (k && sleutelKlopt(gegeven, k.hash) && !rol) rol = r;
  return rol;
}
// De oude gedeelde sleutel (één voor alle agents) werkt tijdens de overstap alleen nog voor de
// rollen die hem al gebruikten. Een nieuwe gedeelde sleutel maken kan niet meer.
export const OUDE_ROLLEN = ["support", "tech", "finance"];

// de sleutel uit een verzoek: "authorization: Bearer fpa_..." of de kop x-agent-sleutel
export function sleutelUit(headers) {
  const a = String((headers && headers.authorization) || "");
  if (/^bearer\s+/i.test(a)) return a.replace(/^bearer\s+/i, "").trim();
  return String((headers && headers["x-agent-sleutel"]) || "").trim();
}

// Een code voor een praktijk of login: voor dezelfde server altijd dezelfde, zodat een agent
// van ronde tot ronde over dezelfde praktijk kan praten, maar zonder het zout niet te herleiden.
const kort = (zout, ...delen) => createHash("sha256").update(String(zout) + "|" + delen.join("|")).digest("hex");
export const alias = (zout, letter, ...delen) => letter + "-" + kort(zout, letter, ...delen).slice(0, 6);
export const zaakId = (zout, sleutel) => "z" + kort(zout, "zaak", sleutel).slice(0, 10);

// wie een bericht bij deze zaak krijgt: de ontvangers van de standaardmail, anders de beheerders
// van de praktijk
export function zaakOntvangers(bron, z) {
  if (z.mails && z.mails.length) return z.mails.map((m) => ({ email: m.aan, naam: m.naam || "" }));
  const p = (bron.praktijken || []).find((x) => x.pk === z.pk);
  return p ? (p.leden || []).filter((l) => l.actief && l.rol === "beheerder" && l.email).map((l) => ({ email: l.email, naam: l.naam || "" })) : [];
}

// ---------- een eigen bericht van een agent ----------

// stuurtekens en de twee regelscheiders van Unicode (als tekst: letterlijk breken ze een regex af)
const STUUR = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f\\u2028\\u2029]", "g");
const regels = (s) => String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(STUUR, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

// Keurt wat de agent schreef. De agent levert alleen het onderwerp en de kern: de aanhef met de
// voornaam en de afsluiting zet de server erbij. {praktijk} mag in de tekst staan; de server vult
// de naam in. Verder geen invulplekken, geen opmaak, geen adressen en geen links naar buiten.
export function keurEigenBericht(b) {
  const onderwerp = regels(b && b.onderwerp).replace(/\s+/g, " "), tekst = regels(b && b.tekst);
  const fouten = [];
  if (onderwerp.length < 8 || onderwerp.length > 120) fouten.push("Het onderwerp moet tussen 8 en 120 tekens zijn.");
  if (tekst.length < 40 || tekst.length > 1500) fouten.push("De tekst moet tussen 40 en 1500 tekens zijn.");
  const alles = onderwerp + "\n" + tekst;
  if (/[<>]/.test(alles)) fouten.push("Geen opmaak of haakjes < > in het bericht.");
  if (/\[[^\]\n]{1,60}\]/.test(alles)) fouten.push("Er staan nog [invulplekken] in het bericht.");
  if (/\{(?!praktijk\})[^}\n]{0,40}\}?/.test(alles)) fouten.push("Alleen {praktijk} mag als invulplek; de naam van de ontvanger zet de server erbij.");
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(alles)) fouten.push("Geen e-mailadressen in het bericht; antwoorden komen vanzelf bij support.");
  const links = alles.match(/\b(?:https?:\/\/|www\.)\S+/gi) || [];
  if (links.some((l) => !/^https:\/\/fysiplan\.nl(?:[/?#]\S*)?$/i.test(l.replace(/[.,;:!?)]+$/, "")))) fouten.push("Alleen links naar https://fysiplan.nl zijn toegestaan.");
  if (/^(hallo|beste|geachte|hoi|dag|goede(morgen|middag|navond))\b/i.test(tekst)) fouten.push("Begin niet met een aanhef; die zet de server erbij.");
  if (/(^|\n)\s*((met )?(vriendelijke )?groet(en|jes)?|mvg|hartelijke groet)[^\n]{0,40}(\n[^\n]{0,60}){0,2}$/i.test(tekst)) fouten.push("Sluit niet af met een groet; die zet de server erbij.");
  if (/\b(pati[eë]nt(en)?|cli[eë]nt(en)?)\b[^.\n]{0,80}\b(heet|genaamd|geboren|bsn|dossier|diagnose)\b/i.test(alles)) fouten.push("Geen gegevens van patiënten in een bericht.");
  for (const f of gevoeligeGegevens(alles)) if (/burgerservice|IBAN|geboorte/.test(f)) fouten.push(f);
  return { ok: !fouten.length, fouten, onderwerp, tekst };
}
// het bericht zoals het bij één ontvanger aankomt
export function eigenMail(k, { naam, praktijk } = {}) {
  const vul = (s) => s.replaceAll("{praktijk}", String(praktijk || "je praktijk"));
  return { onderwerp: vul(k.onderwerp), tekst: mailAanhef(naam) + vul(k.tekst) + MAIL_SLOT };
}

// Persoonsgegevens die niet in wat een agent terugschrijft horen (verslag, notitie). Een filter is
// geen garantie, maar weigert het herkenbare. De foutmeldingen noemen alleen de soort, nooit de
// tekst zelf: wat geweigerd is, komt zo ook niet in een antwoord of log terecht.
const PATIENT_ZIN = /\b(pati[eë]nt(en)?|cli[eë]nt(en)?)\b[^.\n]{0,80}\b(heet|genaamd|geboren|bsn|dossier|diagnose)\b/i;
export function gevoeligeGegevens(tekst) {
  const t = String(tekst || ""), fouten = [];
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t)) fouten.push("Geen e-mailadressen; gebruik de codes (P-…, L-…).");
  if (PATIENT_ZIN.test(t)) fouten.push("Geen gegevens van patiënten.");
  if (/\bbsn\b|burgerservicenummer|\b\d{9}\b|\b\d{4}\.\d{2}\.\d{3}\b/i.test(t)) fouten.push("Geen burgerservicenummers of andere lange persoonsnummers.");
  if (/\b[A-Z]{2}\d{2}\s?[A-Z]{4}(\s?\d){10}\b/.test(t)) fouten.push("Geen rekeningnummers (IBAN).");
  if (/(?:\+31|\b0)[\s-]?(?:6|[1-9]\d)(?:[\s-]?\d){7,8}\b/.test(t)) fouten.push("Geen telefoonnummers.");
  if (/\b(geboren|geboortedatum|geb\.)\b/i.test(t)) fouten.push("Geen geboortedatums.");
  if (/[<>]/.test(t)) fouten.push("Geen opmaak of haakjes < >.");
  return fouten;
}

// ---------- verslag en notitie ----------

const PUNT_SOORTEN = new Set(["gedaan", "voorstel", "let-op"]);
export function keurVerslag(b) {
  const tekst = regels(b && b.tekst).slice(0, 1500);
  if (tekst.length < 20) return { ok: false, fouten: ["Een verslag heeft minstens 20 tekens tekst."] };
  const alles = [tekst];
  const punten = [];
  for (const p of Array.isArray(b.punten) ? b.punten.slice(0, 10) : []) {
    if (!p || typeof p !== "object") continue;
    const t = regels(p.tekst).replace(/\s+/g, " ").slice(0, 300);
    if (!t) continue;
    const punt = { soort: PUNT_SOORTEN.has(p.soort) ? p.soort : "let-op", tekst: t };
    if (typeof p.zaak === "string" && /^z[a-f0-9]{10}$/.test(p.zaak)) punt.zaak = p.zaak;
    if (typeof p.praktijk === "string" && /^P-[a-f0-9]{6}$/.test(p.praktijk)) punt.praktijk = p.praktijk;
    if (Number.isInteger(p.pr) && p.pr > 0 && p.pr < 100000) punt.pr = p.pr;
    punten.push(punt);
    alles.push(t);
  }
  const fouten = gevoeligeGegevens(alles.join("\n"));
  if (fouten.length) return { ok: false, fouten };
  return { ok: true, verslag: { tekst, punten } };
}
export function keurNotitie(b) {
  const periode = String((b && b.periode) || ""), tekst = regels(b && b.tekst).slice(0, 400);
  if (!/^\d{4}(-K[1-4])?$/.test(periode)) return { ok: false, fouten: ["Geef een periode: een jaar (2026) of een kwartaal (2026-K3)."] };
  if (tekst.length < 10) return { ok: false, fouten: ["Een notitie heeft minstens 10 tekens tekst."] };
  const fouten = gevoeligeGegevens(tekst);
  if (fouten.length) return { ok: false, fouten };
  return { ok: true, notitie: { periode, tekst } };
}

// ---------- wat een agent ziet ----------

// Support: de praktijken die bewaakt worden en de open zaken. `eigen(z)` zegt per zaak of een
// eigen bericht nu kan, en zo nee waarom niet.
export function werkSupport({ bron, zaken, open = {}, zout, eigen = () => ({ kan: false, reden: "uit" }) }) {
  const nu = bron.nu, o = praktijkOverzicht(bron);
  const P = (pk) => alias(zout, "P", pk), L = (pk, lid) => alias(zout, "L", pk, lid);
  const dagen = (ms) => (ms ? Math.max(0, Math.floor((nu - ms) / DAG)) : null);
  return {
    praktijken: o.rijen.filter((r) => r.stand !== "nvt").map((r) => ({
      praktijk: P(r.pk), status: r.status, health: r.stand, score: r.score,
      therapeuten: r.therapeuten, uitgenodigd: r.uitgenodigd, betaaldePlaatsen: r.plaatsen, actiefLaatste7Dagen: r.actief7, zonderTweedeStap: r.therapeuten - r.tweedeStap,
      kaartenLaatste30Dagen: r.kaarten30, kaartenPerWeek: r.weken, dagenSindsLaatsteGebruik: dagen(r.laatst), dagenBijFysiplan: dagen(r.sinds),
      dagenTotEindeProef: r.status === "proef" && r.proefTot ? Math.ceil((r.proefTot - nu) / DAG) : null,
      signalen: r.signalen.map((s) => s.soort)
    })),
    zaken: zaken.map((z) => agentZaak(z, { nu, open, zout, P, L, eigen }))
  };
}
function agentZaak(z, { nu, open, zout, P, L, eigen }) {
  const sinds = open[z.sleutel] && open[z.sleutel].sinds;
  const ms = MAIL_SOORTEN[z.soort];
  return {
    id: zaakId(zout, z.sleutel), soort: z.soort, ernst: z.ernst, praktijk: P(z.pk), login: z.lid ? L(z.pk, z.lid) : null,
    feit: z.feit || {}, dagenOpen: sinds ? Math.max(0, Math.floor((nu - sinds) / DAG)) : 0,
    // de vaste mail van de server bij deze soort zaak (die verstuurt de server zelf, niet de agent)
    standaardMail: ms ? { stand: z.mailStand || "uit", ontvangers: (z.mails || []).length, verstuurd: z.verstuurd ? new Date(z.verstuurd).toISOString() : null } : null,
    taakVoorBeheer: z.taak || null,
    eigenBericht: eigen(z)
  };
}

// Tech: alleen het platform. De fouten zijn tellingen per route (zonder id's en zonder de
// foutmelding zelf: daar kan invoer van een bezoeker in staan).
export function werkTech({ bron, zaken, fouten }) {
  const sys = bron.systeem || {}, perSoort = {};
  for (const z of zaken) perSoort[z.soort] = (perSoort[z.soort] || 0) + 1;
  const bewaakt = praktijkOverzicht(bron).totalen;
  return {
    versie: String(sys.versie || "").replace(/[^a-f0-9]/gi, "").slice(0, 40) || null, uptimeUren: Number(sys.uptimeUren) || 0,
    controles: (sys.checks || []).map((c) => ({ naam: c.naam, ok: !!c.ok, tekst: c.tekst })),
    beschikbaarheid: (sys.beschikbaarheid || []).slice(-14),
    fouten,
    // hoeveel zaken er per soort open staan: tien praktijken tegelijk met hetzelfde probleem wijst op het platform
    zaken: { perSoort, praktijkenBewaakt: bewaakt.goed + bewaakt.aandacht + bewaakt.probleem, praktijkenMetProbleem: bewaakt.probleem }
  };
}

// Finance: de cijfers zoals de pagina's ze tonen, met een code per praktijk.
export function factuurZaken(fin) {
  return (fin.open || []).filter((f) => f.status === "mislukt" || f.dagen >= 14).map((f) => ({
    sleutel: ["factuur", f.pk, f.nr || f.datum].join("|"), soort: f.status === "mislukt" ? "incasso-mislukt" : "factuur-open", ernst: f.status === "mislukt" ? "probleem" : "aandacht",
    pk: f.pk, praktijk: f.praktijk, tekst: "Factuur " + (f.nr || "zonder nummer") + (f.status === "mislukt" ? ": de incasso is mislukt" : " staat " + f.dagen + " dagen open"),
    feit: { totaalCent: f.totaalCent, dagenOpen: f.dagen, incassoMislukt: f.status === "mislukt" }, taak: null, mails: []
  }));
}
export function werkFinance({ bron, fin, jaren, zaken, open = {}, zout, eigen }) {
  const nu = bron.nu, inst = fin.instellingen;
  const P = (pk) => alias(zout, "P", pk), L = () => null;
  const nr = (n) => (/^[A-Z0-9-]{1,24}$/.test(String(n || "")) ? String(n) : null);
  const k = fin.kpi;
  return {
    instellingen: { prijsBtw: inst.prijsBtw, kor: inst.kor, btwTarief: inst.btwTarief, prijsCent: inst.prijsCent },
    bedragen: "alle bedragen zijn centen",
    kern: { klanten: k.klanten, plaatsen: k.plaatsen, plaatsenDoorlopend: k.plaatsenDoorlopend, terugkerendPerMaandExcl: k.mrr, omzetMaandExcl: k.omzetMaand, omzetVorigeMaandExcl: k.omzetVorigeMaand,
      omzetJaarExcl: k.omzetJaar, prognoseJaarExcl: k.prognoseJaar, groeiPlaatsenPerMaand: k.groeiPlaatsen, facturen: k.facturen, betaald: k.betaald, open: k.open, openCent: k.openCent, proeven: k.proeven },
    maanden: fin.maanden.slice(-6), kwartalen: fin.kwartalen.slice(-6),
    btw: fin.btw.slice(0, 6).map((b) => ({ kwartaal: b.kwartaal, uiterlijk: b.deadline, stand: b.stand, omzet: b.r1a.omzet, btw: b.r1a.btw, voorbelasting: b.r5b, teBetalen: b.teBetalen,
      verschilNaIndienen: b.verschil, ingediendOp: b.ingediend && b.ingediend.op ? b.ingediend.op : null })),
    openPosten: (fin.open || []).map((f) => ({ praktijk: P(f.pk), nummer: nr(f.nr), totaalCent: f.totaalCent, dagenOpen: f.dagen, status: f.status })),
    kostenPerCategorie: Object.entries((fin.kosten || []).filter((x) => nu - x.datum < 365 * DAG).reduce((t, x) => { const c = /^[A-Za-z ]{1,24}$/.test(String(x.categorie || "")) ? x.categorie : "Overig"; t[c] = (t[c] || 0) + x.exclCent; return t; }, {})).map(([categorie, exclCent]) => ({ categorie, exclCent })),
    jaren: jaren.map((j) => ({ jaar: j.jaar, controlesInOrde: j.klaar, controles: j.totaal, kanAfsluiten: j.kanAfsluiten, afgesloten: !!j.afgesloten, veranderdNaAfsluiten: !!j.gewijzigd,
      lijst: j.controles.map((c) => ({ id: c.id, ok: c.ok, titel: c.titel, tekst: c.tekst })) })),
    zaken: zaken.map((z) => agentZaak(z, { nu, open, zout, P, L, eigen }))
  };
}

// ---------- fouten van de server, voor de tech-agent ----------

const METHODES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
// De woorden waaruit de routes van de server zelf bestaan, uit de broncode gehaald: elk deel van
// een pad dat daar tussen aanhalingstekens staat ("/api/kaart/", "/v2/app") of in een patroon
// (\/api\/agent\/(support|tech|finance)\/).
export function routeWoorden(bronnen) {
  const w = new Set();
  for (const bron of bronnen || []) {
    const tekst = String(bron || "");
    for (const m of tekst.matchAll(/["'`](\/[a-z0-9][a-z0-9/._-]*)/g)) for (const d of m[1].split("/")) if (d) w.add(d);
    for (const m of tekst.matchAll(/\\\/([a-z0-9][a-z0-9_-]*)/g)) w.add(m[1]);
    for (const m of tekst.matchAll(/\\\/\((?:\?:)?([a-z0-9_-]+(?:\|[a-z0-9_-]+)+)\)/g)) for (const d of m[1].split("|")) w.add(d);
  }
  return w;
}
// Het patroon van een route: de methode en hooguit vier delen van het pad. Een deel dat geen
// gewoon woord is (een id, een code, iets met vreemde tekens) wordt "…": zo komt er geen sleutel
// van een kaart in wat de agent leest. Met `woorden` (zie routeWoorden) blijft alleen staan wat
// in de routes van de server zelf voorkomt: een bezoeker die een fout uitlokt op een pad dat hij
// zelf verzint, krijgt zo geen woord van zichzelf bij de agent.
export function routePatroon(methode, pad, woorden = null) {
  const delen = String(pad || "").split("?")[0].split("/").filter(Boolean);
  const schoon = delen.slice(0, 4).map((d) => (/^[a-z][a-z0-9.-]{0,23}$/.test(d) && !/^[a-f0-9]{8,}$/.test(d) && (!woorden || woorden.has(d)) ? d : "…"));
  return (METHODES.has(methode) ? methode : "?") + " /" + schoon.join("/") + (delen.length > 4 ? "/…" : "");
}
const uurVan = (ms) => new Date(ms).toISOString().slice(0, 13); // "2026-11-12T14" (UTC)
// Telt per uur de verzoeken en de antwoorden met een 5xx, en van die fouten de route. Zeven dagen.
export function maakFouten(woorden = null) {
  let uren = Object.create(null), vuil = false;
  const snoei = (nu) => { const grens = uurVan(nu - 7 * DAG); for (const u of Object.keys(uren)) if (u < grens) delete uren[u]; };
  return {
    merk(methode, pad, status, nu) {
      const u = uurVan(nu);
      if (!uren[u]) { uren[u] = { n: 0, f: 0, r: Object.create(null) }; snoei(nu); }
      const b = uren[u];
      b.n++;
      if (!(status >= 500 && status <= 599)) return;
      b.f++;
      const p = routePatroon(methode, pad, woorden) + " " + status;
      // hooguit dertig routes per uur: wie de server met rare paden bestookt, vult zo niets
      const k = Object.hasOwn(b.r, p) || Object.keys(b.r).length < 30 ? p : "overig";
      b.r[k] = (b.r[k] || 0) + 1;
      vuil = true;
    },
    overzicht(nu) {
      const grens24 = uurVan(nu - DAG), grens7 = uurVan(nu - 7 * DAG), routes = new Map();
      let v24 = 0, f24 = 0, f7 = 0;
      for (const [u, b] of Object.entries(uren)) {
        if (u < grens7) continue;
        if (u > grens24) { v24 += b.n; f24 += b.f; }
        f7 += b.f;
        for (const [r, n] of Object.entries(b.r)) {
          const x = routes.get(r) || { route: r, laatste24Uur: 0, laatste7Dagen: 0, laatstInUur: "" };
          x.laatste7Dagen += n;
          if (u > grens24) x.laatste24Uur += n;
          if (u > x.laatstInUur) x.laatstInUur = u;
          routes.set(r, x);
        }
      }
      const perUur = [];
      for (let i = 23; i >= 0; i--) { const u = uurVan(nu - i * 3600e3), b = uren[u]; perUur.push({ uur: u + ":00Z", verzoeken: b ? b.n : 0, fouten: b ? b.f : 0 }); }
      return { verzoeken24Uur: v24, fouten24Uur: f24, fouten7Dagen: f7, perUur,
        routes: [...routes.values()].sort((a, b) => b.laatste24Uur - a.laatste24Uur || b.laatste7Dagen - a.laatste7Dagen).slice(0, 15).map((x) => ({ ...x, laatstInUur: x.laatstInUur + ":00Z" })) };
    },
    vuil: () => vuil,
    uit() { vuil = false; return { uren }; },
    laad(o, nu = Date.now()) {
      uren = Object.create(null);
      const bron = o && typeof o === "object" && o.uren && typeof o.uren === "object" ? o.uren : {};
      for (const [u, b] of Object.entries(bron)) {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(u) || !b || typeof b !== "object") continue;
        const r = Object.create(null);
        for (const [p, n] of Object.entries(b.r && typeof b.r === "object" ? b.r : {}).slice(0, 31)) if (Number(n) > 0) r[String(p).slice(0, 140)] = Number(n);
        uren[u] = { n: Number(b.n) || 0, f: Number(b.f) || 0, r };
      }
      snoei(nu);
    }
  };
}
