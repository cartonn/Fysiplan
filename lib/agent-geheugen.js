// Het gedeelde geheugen van de agents en de poort waar elke actie doorheen moet.
//
// Opdracht van Ahmed (2026-11-12, na het architectuuradvies in de projectmap
// agent-architectuur/advies-agents-telefonie.md): "begin met het gedeelde geheugen, de
// toegangsregels, de chief of staff en één groei-agent. Bouw en test het eerst in de demo, zet nog
// niets live."
//
// Wat hier staat:
// - het geheugen: een takenlijst, de contacten (prospects, nooit patiënten) met hun toestemming, een
//   centrale afmeldlijst, de concepten van de groei-agent, een auditlog en de idempotentiesleutels.
// - de poort: gewone code, geen taalmodel. Elke actie van de chief of staff of de groei-agent gaat
//   hier doorheen. De poort kijkt naar de rol, de afmeldlijst, de toestemming, het aantal per dag,
//   de sleutel tegen dubbel uitvoeren en of er een mens akkoord moet geven. Elk besluit, ook een
//   weigering, komt in het auditlog.
// - wat de chief of staff en de groei-agent te zien krijgen: codes en getallen, geen namen.
//
// De chief of staff adviseert alleen: hij stelt taken voor, geeft advies bij een taak en schrijft een
// brief (zijn verslag). Hij verstuurt niets en voert niets uit. De groei-agent schrijft concepten en
// stelt contact met een prospect voor; publiceren en contact opnemen doet een mens. In deze versie
// voert Fysiplan zelf nog geen enkel contact uit, ook niet na akkoord.
//
// Beide werken alleen op proef (de demo). Het geheugen bestaat alleen in de demo en verdwijnt bij
// een herstart. Voor echte gegevens is eerst een database nodig (zie het advies); die is er nog niet.
//
// Alles hier is puur: geen webserver, geen bestand, geen mail.
import { createHash } from "node:crypto";

const DAG = 86400e3;

// ---------- de rollen en hun acties ----------

// Rollen die alleen op proef mogen. `aan` weigert de server voor deze rollen.
export const ALLEEN_PROEF = new Set(["staf", "groei"]);

// Per actie: wie het mag, hoeveel per dag (per rol), en wat er gebeurt.
//   direct  : de poort voert het uit (alleen dingen die niemand buiten Fysiplan raken)
//   akkoord : het komt in het geheugen te staan en wacht op een beheerder
export const ACTIES = {
  "taak-voorstel": { rollen: ["staf", "groei"], perDag: 10, gevolg: "akkoord", uitleg: "Een nieuwe taak voorstellen. Een beheerder zet hem open of wijst hem af." },
  advies: { rollen: ["staf"], perDag: 20, gevolg: "direct", uitleg: "Advies bij een bestaande taak: prioriteit en een korte toelichting. De taak zelf verandert niet." },
  concept: { rollen: ["groei"], perDag: 5, gevolg: "akkoord", uitleg: "Een concepttekst (bericht, nieuwsbrief, stuk landingstekst). Publiceren doet een mens." },
  "contact-voorstel": { rollen: ["groei"], perDag: 5, gevolg: "akkoord", uitleg: "Voorstellen om contact op te nemen met een prospect. Alleen met toestemming voor dat kanaal en niet na een afmelding. Uitvoeren doet een mens." }
};
export const TAAK_STATUS = ["voorgesteld", "open", "wacht-op-akkoord", "goedgekeurd", "klaar", "afgewezen", "vervallen"];
export const TAAK_SOORTEN = ["support", "tech", "finance", "groei", "contact", "overig"];
export const CONCEPT_SOORTEN = { bericht: "Bericht (LinkedIn of iets dergelijks)", nieuwsbrief: "Stuk voor een nieuwsbrief", landing: "Tekst voor de landingspagina", "mail-sjabloon": "Sjabloon voor een mail aan een prospect" };
export const KANALEN = ["mail", "bellen"];
export const CONTACT_PAUZE_DAGEN = 30; // hooguit één contact(voorstel) per prospect per 30 dagen

// Wat de groei-agent mag zeggen. Een concept dat iets anders belooft, keurt de poort af.
export const FEITEN = [
  "Fysiplan is een app voor fysiotherapeuten om oefenkaarten te maken en via een QR-code met een patiënt te delen.",
  "De patiënt opent de kaart op de telefoon zonder account, vinkt oefeningen af en geeft een pijnscore door.",
  "De prijs is € 9,99 per therapeut per maand. Noem geen btw-bedrag: dat is nog niet vastgesteld.",
  "Er is een gratis proef van 14 dagen.",
  "De bibliotheek heeft honderden oefeningen met tekeningen; bij een deel staat een video die met AI is gemaakt.",
  "Fysiplan geeft geen diagnose, geen behandeladvies en stelt geen kaart voor: de therapeut kiest de oefeningen."
];
export const VERBODEN = [
  "beloftes over genezen, herstel of resultaat",
  "een kaart of behandeling die de AI of Fysiplan voorstelt of samenstelt",
  "een andere prijs dan € 9,99 per therapeut per maand, kortingen of btw-bedragen",
  "namen van praktijken, therapeuten of patiënten",
  "e-mailadressen, telefoonnummers en links buiten https://fysiplan.nl"
];

// ---------- het geheugen ----------

export function leegGeheugen() {
  return { taken: [], contacten: [], afmeldingen: [], groei: [], audit: [], idem: {}, dag: { datum: "", n: {} } };
}
const dagVan = (nu) => new Date(nu).toISOString().slice(0, 10);
function telDag(G, sleutel, nu) {
  if (G.dag.datum !== dagVan(nu)) G.dag = { datum: dagVan(nu), n: {} };
  return Number(G.dag.n[sleutel]) || 0;
}
const plusDag = (G, sleutel, nu) => { G.dag.n[sleutel] = telDag(G, sleutel, nu) + 1; };
const iso = (ms) => new Date(ms).toISOString();
const nieuwId = (G, letter, nu) => letter + "-" + createHash("sha256").update(letter + "|" + nu + "|" + G.audit.length + "|" + Math.random()).digest("hex").slice(0, 8);

// Het auditlog: alleen toevoegen. De nieuwste 500 blijven.
// Wat een agent doet, komt in het auditlog alleen als vaste codes: rol, actie, besluit, een redencode
// en een id of contactcode. Nooit tekst van de agent, ook niet als de poort die tekst weigerde
// (bijvoorbeeld omdat er een e-mailadres of telefoonnummer in stond): wat niet op een code lijkt,
// wordt vervangen. Een besluit van een beheerder (wie is dan zijn account) mag een eigen reden hebben.
const CODE = /^[a-z0-9][a-z0-9 ()-]{0,79}$/, ID = /^[A-Za-z0-9][A-Za-z0-9-]{1,40}$/;
const veilig = (v, patroon, anders) => (typeof v === "string" && patroon.test(v) ? v : anders);
export function audit(G, regel) {
  const agent = /-agent$/.test(String(regel.wie || ""));
  const reden = !regel.reden ? "" : agent ? veilig(String(regel.reden), CODE, "afgekeurd") : String(regel.reden).slice(0, 200);
  const doel = regel.doel ? veilig(String(regel.doel), ID, "") : "";
  G.audit.unshift({ t: iso(regel.nu), wie: agent ? veilig(regel.wie, CODE, "onbekend") : String(regel.wie || "").slice(0, 120), actie: veilig(regel.actie, CODE, "onbekend"), besluit: veilig(regel.besluit, CODE, "onbekend"), ...(reden ? { reden } : {}), ...(doel ? { doel } : {}) });
  if (G.audit.length > 500) G.audit.length = 500;
}

// genormaliseerd telefoonnummer of e-mailadres, als afdruk: zo staat een afmelding vast, ook als
// het contact zelf later uit de lijst gaat
export const contactAfdruk = (waarde) => {
  const v = String(waarde || "").trim().toLowerCase();
  const genorm = v.includes("@") ? v : v.replace(/[^\d+]/g, "").replace(/^0031/, "+31").replace(/^0(?=\d{9}$)/, "+31");
  return createHash("sha256").update("fysiplan-afmelding|" + genorm).digest("hex").slice(0, 32);
};
export const isAfgemeld = (G, c) => !!c && (c.afgemeld === true || (c.afdrukken || []).some((a) => G.afmeldingen.some((x) => x.afdruk === a)));

// ---------- keuren wat een agent stuurt ----------

const STUUR = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f\\u2028\\u2029]", "g");
const regels = (s) => String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(STUUR, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const kortRegel = (s, max) => regels(s).replace(/\s+/g, " ").slice(0, max);

// tekst van een agent: geen opmaak, geen adressen, geen links naar buiten, geen patiënten
function tekstFouten(alles) {
  const f = [];
  if (/[<>]/.test(alles)) f.push("Geen opmaak of haakjes < >.");
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(alles)) f.push("Geen e-mailadressen.");
  if (/(\+31|0031|\b0)[\s-]?\d(?:[\s-]?\d){8}\b/.test(alles)) f.push("Geen telefoonnummers.");
  const links = alles.match(/\b(?:https?:\/\/|www\.)\S+/gi) || [];
  if (links.some((l) => !/^https:\/\/fysiplan\.nl(?:[/?#]\S*)?$/i.test(l.replace(/[.,;:!?)]+$/, "")))) f.push("Alleen links naar https://fysiplan.nl.");
  if (/\bpati[eë]nt(en)?\b[^.\n]{0,80}\b(heet|genaamd|geboren|bsn|dossier|diagnose)\b/i.test(alles)) f.push("Geen gegevens van patiënten.");
  return f;
}

export function keurTaakVoorstel(b) {
  const titel = kortRegel(b && b.titel, 120), uitleg = regels(b && b.uitleg).slice(0, 800);
  const soort = TAAK_SOORTEN.includes(b && b.soort) ? b.soort : "overig";
  const prioriteit = [1, 2, 3].includes(b && b.prioriteit) ? b.prioriteit : 2;
  const fouten = [];
  if (titel.length < 8) fouten.push("Een taak heeft een titel van minstens 8 tekens.");
  if (uitleg.length < 20) fouten.push("Leg in minstens 20 tekens uit waarom deze taak nodig is.");
  fouten.push(...tekstFouten(titel + "\n" + uitleg));
  return { ok: !fouten.length, fouten, taak: { titel, uitleg, soort, prioriteit } };
}

export function keurAdvies(b) {
  const tekst = regels(b && b.tekst).slice(0, 400);
  const prioriteit = [1, 2, 3].includes(b && b.prioriteit) ? b.prioriteit : null;
  const fouten = [];
  if (typeof (b && b.taak) !== "string" || !/^T-[a-f0-9]{8}$/.test(b.taak)) fouten.push("Noem de taak met haar code (T-...).");
  if (tekst.length < 10) fouten.push("Een advies heeft minstens 10 tekens tekst.");
  fouten.push(...tekstFouten(tekst));
  return { ok: !fouten.length, fouten, advies: { taak: b && b.taak, tekst, prioriteit } };
}

// Een concept van de groei-agent wordt getoetst aan de feiten: geen medische beloftes, geen
// AI-kaartvoorstel, geen andere prijs, geen namen.
export function keurConcept(b) {
  const soort = Object.hasOwn(CONCEPT_SOORTEN, b && b.soort) ? b.soort : null;
  const titel = kortRegel(b && b.titel, 120), tekst = regels(b && b.tekst).slice(0, 2500);
  const doel = kortRegel(b && b.doel, 200);
  const fouten = [];
  if (!soort) fouten.push("Kies een soort: " + Object.keys(CONCEPT_SOORTEN).join(", ") + ".");
  if (titel.length < 5) fouten.push("Een concept heeft een titel van minstens 5 tekens.");
  if (tekst.length < 60) fouten.push("Een concept heeft minstens 60 tekens tekst.");
  if (doel.length < 10) fouten.push("Schrijf in een zin voor wie dit is en wat het moet opleveren (veld doel).");
  const alles = titel + "\n" + tekst;
  fouten.push(...tekstFouten(alles));
  if (/\b(geneest|genezen|genezing|herstelt gegarandeerd|gegarandeerd|garantie|sneller herstel|minder pijn)\b/i.test(alles)) fouten.push("Geen beloftes over genezen, herstel of resultaat.");
  if (/\b(diagnose|diagnosticeert|behandeladvies|stelt (de |een )?(kaart|behandeling|oefeningen) (voor|samen))\b/i.test(alles) || /\b(AI|kunstmatige intelligentie)\b[^.\n]{0,60}\b(kiest|stelt voor|maakt (de |een )?kaart|bepaalt)\b/i.test(alles)) fouten.push("Fysiplan geeft geen diagnose of behandeladvies en stelt geen kaart voor.");
  const prijzen = alles.match(/€\s?\d+(?:[.,]\d{1,2})?/g) || [];
  if (prijzen.some((p) => p.replace(/\s/g, "") !== "€9,99")) fouten.push("De enige prijs is € 9,99 per therapeut per maand.");
  if (/\b(korting|gratis maand|btw)\b/i.test(alles) && !/\bgeen btw\b/i.test(alles)) fouten.push("Geen kortingen of btw-bedragen.");
  if (/\b(praktijk|fysiotherapie|fysio)\s+[A-Z][a-z]{2,}/i.test(alles.replace(/\bFysiplan\b/g, "")) && /\b(Praktijk|Fysiotherapie|Fysio)\s+[A-Z][a-z]{2,}/.test(alles)) fouten.push("Geen namen van praktijken.");
  if (/\[[^\]\n]{1,60}\]|\{[^}\n]{1,40}\}/.test(alles)) fouten.push("Geen invulplekken; schrijf de tekst af.");
  return { ok: !fouten.length, fouten, concept: { soort, titel, tekst, doel } };
}

export function keurContactVoorstel(b) {
  const kanaal = KANALEN.includes(b && b.kanaal) ? b.kanaal : null;
  const reden = kortRegel(b && b.reden, 300);
  const fouten = [];
  if (typeof (b && b.contact) !== "string" || !/^C-[a-f0-9]{6}$/.test(b.contact)) fouten.push("Noem het contact met zijn code (C-...).");
  if (!kanaal) fouten.push("Kies een kanaal: " + KANALEN.join(" of ") + ".");
  if (reden.length < 15) fouten.push("Leg in minstens 15 tekens uit waarom nu.");
  fouten.push(...tekstFouten(reden));
  return { ok: !fouten.length, fouten, voorstel: { contact: b && b.contact, kanaal, reden } };
}

// ---------- de poort ----------

// De sleutel tegen dubbel uitvoeren: de agent kiest hem zelf, per actie die hij bedoelt (bijvoorbeeld
// "brief-2026-11-13" of "voorstel-C-1a2b3c-mail"). Dezelfde sleutel nog eens geeft het eerste
// antwoord terug, zonder iets opnieuw te doen.
export const sleutelGoed = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{5,79}$/.test(s);

// `uitvoer(G)` doet het eigenlijke werk als de poort ja zegt en geeft het antwoord voor de agent.
// Geeft { status, body }.
export function poort(G, { rol, actie, b, nu, uitvoer }) {
  const regel = Object.hasOwn(ACTIES, actie) ? ACTIES[actie] : null;
  const wie = rol + "-agent";
  const weiger = (status, reden, fout, extra = {}) => { audit(G, { nu, wie, actie, besluit: "geweigerd", reden }); return { status, body: { ok: false, reden, fout, ...extra } }; };
  if (!regel || !regel.rollen.includes(rol)) return weiger(403, "rol-mag-dit-niet", "Deze agent mag deze actie niet.");
  if (!sleutelGoed(b && b.sleutel)) return weiger(400, "sleutel-ontbreekt", "Geef elke actie een eigen ‘sleutel’ (6 tot 80 tekens: kleine letters, cijfers en -). Dezelfde sleutel nog eens voert niets opnieuw uit.");
  const ik = rol + "|" + b.sleutel;
  if (G.idem[ik]) {
    audit(G, { nu, wie, actie, besluit: "herhaald", reden: "zelfde-sleutel" });
    return { status: 200, body: { ...G.idem[ik].antwoord, herhaald: true } };
  }
  if (telDag(G, actie + "|" + rol, nu) >= regel.perDag) return weiger(429, "daglimiet-bereikt", "Vandaag kan deze agent hooguit " + regel.perDag + " keer ‘" + actie + "’.");
  const r = uitvoer(G);
  if (!r.ok) return weiger(r.status || 400, r.reden || "afgekeurd", r.fout || "Afgekeurd.", r.fouten ? { fouten: r.fouten } : {});
  plusDag(G, actie + "|" + rol, nu);
  const antwoord = { ok: true, ...r.antwoord };
  G.idem[ik] = { t: iso(nu), antwoord };
  // de oudste sleutels gaan weg na 30 dagen
  for (const [k, v] of Object.entries(G.idem)) if (nu - Date.parse(v.t) > 30 * DAG) delete G.idem[k];
  audit(G, { nu, wie, actie, besluit: regel.gevolg === "akkoord" ? "wacht-op-akkoord" : "uitgevoerd", doel: r.doel });
  return { status: 200, body: antwoord };
}

// Wat een actie doet als de poort ja zegt. Geeft { ok, antwoord, doel } of { ok: false, ... }.
export function voerUit(G, { rol, actie, b, nu }) {
  const wie = rol + "-agent";
  if (actie === "taak-voorstel") {
    const k = keurTaakVoorstel(b);
    if (!k.ok) return { ok: false, status: 400, reden: "afgekeurd", fout: "De taak is afgekeurd.", fouten: k.fouten };
    const t = { id: nieuwId(G, "T", nu), t: iso(nu), door: wie, status: "voorgesteld", ...k.taak, adviezen: [] };
    G.taken.unshift(t);
    return { ok: true, doel: t.id, antwoord: { resultaat: "taak-voorgesteld", taak: t.id, uitleg: "Een beheerder zet de taak open of wijst haar af." } };
  }
  if (actie === "advies") {
    const k = keurAdvies(b);
    if (!k.ok) return { ok: false, status: 400, reden: "afgekeurd", fout: "Het advies is afgekeurd.", fouten: k.fouten };
    const t = G.taken.find((x) => x.id === k.advies.taak);
    if (!t || ["klaar", "afgewezen", "vervallen"].includes(t.status)) return { ok: false, status: 404, reden: "taak-onbekend-of-afgerond", fout: "Deze taak is er niet, of ze is al afgerond." };
    t.adviezen = [{ t: iso(nu), door: wie, tekst: k.advies.tekst, ...(k.advies.prioriteit ? { prioriteit: k.advies.prioriteit } : {}) }, ...(t.adviezen || [])].slice(0, 5);
    return { ok: true, doel: t.id, antwoord: { resultaat: "advies-bewaard", taak: t.id } };
  }
  if (actie === "concept") {
    const k = keurConcept(b);
    if (!k.ok) return { ok: false, status: 400, reden: "afgekeurd", fout: "Het concept is afgekeurd.", fouten: k.fouten };
    const c = { id: nieuwId(G, "G", nu), t: iso(nu), door: wie, stand: "wacht", ...k.concept };
    G.groei.unshift(c);
    if (G.groei.length > 100) G.groei.length = 100;
    return { ok: true, doel: c.id, antwoord: { resultaat: "concept-voor-beheer", concept: c.id } };
  }
  if (actie === "contact-voorstel") {
    const k = keurContactVoorstel(b);
    if (!k.ok) return { ok: false, status: 400, reden: "afgekeurd", fout: "Het voorstel is afgekeurd.", fouten: k.fouten };
    const c = G.contacten.find((x) => x.code === k.voorstel.contact);
    if (!c) return { ok: false, status: 404, reden: "contact-onbekend", fout: "Dit contact is er niet." };
    if (isAfgemeld(G, c)) return { ok: false, status: 409, reden: "afgemeld", fout: "Dit contact heeft zich afgemeld. Stel nooit meer contact voor." };
    if (!(c.toestemming && c.toestemming[k.voorstel.kanaal])) return { ok: false, status: 409, reden: "geen-toestemming-voor-" + k.voorstel.kanaal, fout: "Er is geen toestemming voor " + k.voorstel.kanaal + " bij dit contact." };
    if (c.laatsteContact && nu - Date.parse(c.laatsteContact) < CONTACT_PAUZE_DAGEN * DAG) return { ok: false, status: 409, reden: "te-kort-geleden", fout: "Met dit contact is minder dan " + CONTACT_PAUZE_DAGEN + " dagen geleden contact geweest." };
    if (G.taken.some((t) => t.soort === "contact" && t.contact === c.code && ["wacht-op-akkoord", "goedgekeurd"].includes(t.status))) return { ok: false, status: 409, reden: "al-voorgesteld", fout: "Voor dit contact staat al een voorstel open." };
    const t = { id: nieuwId(G, "T", nu), t: iso(nu), door: wie, status: "wacht-op-akkoord", soort: "contact", prioriteit: 2, contact: c.code, kanaal: k.voorstel.kanaal,
      titel: (k.voorstel.kanaal === "bellen" ? "Terugbellen: " : "Mailen: ") + c.code, uitleg: k.voorstel.reden, adviezen: [] };
    G.taken.unshift(t);
    return { ok: true, doel: t.id, antwoord: { resultaat: "contact-voor-beheer", taak: t.id, uitleg: "Een beheerder beslist. Fysiplan neemt in deze versie zelf geen contact op." } };
  }
  return { ok: false, status: 400, reden: "onbekende-actie", fout: "Onbekende actie." };
}

// ---------- een besluit van een beheerder ----------

// Geeft { status, body }. `wie` is het e-mailadres van de beheerder.
export function besluitTaak(G, { id, besluit, reden, wie, nu }) {
  const t = G.taken.find((x) => x.id === id);
  if (!t) return { status: 404, body: { ok: false, fout: "Deze taak is er niet." } };
  const mag = { voorgesteld: ["open", "afgewezen"], open: ["klaar", "afgewezen"], "wacht-op-akkoord": ["goedgekeurd", "afgewezen"], goedgekeurd: ["klaar", "afgewezen"] }[t.status] || [];
  const naar = { akkoord: t.status === "voorgesteld" ? "open" : "goedgekeurd", afwijzen: "afgewezen", klaar: "klaar" }[besluit];
  if (!naar || !mag.includes(naar)) return { status: 409, body: { ok: false, fout: "Dat kan niet bij een taak die ‘" + t.status + "’ is." } };
  // bij akkoord op contact kijkt de poort nog één keer naar de afmeldlijst
  if (naar === "goedgekeurd" && t.soort === "contact") {
    const c = G.contacten.find((x) => x.code === t.contact);
    if (!c || isAfgemeld(G, c)) {
      Object.assign(t, { status: "vervallen", op: iso(nu), door2: wie });
      audit(G, { nu, wie, actie: "taak-besluit", besluit: "vervallen", reden: "contact-afgemeld", doel: t.id });
      return { status: 409, body: { ok: false, fout: "Dit contact heeft zich intussen afgemeld. De taak is vervallen." } };
    }
  }
  Object.assign(t, { status: naar, op: iso(nu), besluitDoor: wie, ...(reden ? { besluitReden: kortRegel(reden, 200) } : {}) });
  if (naar === "klaar" && t.soort === "contact") {
    const c = G.contacten.find((x) => x.code === t.contact);
    if (c) c.laatsteContact = iso(nu);
  }
  audit(G, { nu, wie, actie: "taak-besluit", besluit: naar, reden, doel: t.id });
  return { status: 200, body: { ok: true } };
}

export function besluitConcept(G, { id, besluit, reden, wie, nu }) {
  const c = G.groei.find((x) => x.id === id && x.stand === "wacht");
  if (!c) return { status: 404, body: { ok: false, fout: "Dit concept is er niet meer, of er is al over beslist." } };
  if (!["goedkeuren", "afwijzen"].includes(besluit)) return { status: 400, body: { ok: false, fout: "Kies goedkeuren of afwijzen." } };
  Object.assign(c, { stand: besluit === "goedkeuren" ? "goedgekeurd" : "afgewezen", op: iso(nu), besluitDoor: wie, ...(reden ? { besluitReden: kortRegel(reden, 200) } : {}) });
  audit(G, { nu, wie, actie: "concept-besluit", besluit: c.stand, reden, doel: c.id });
  return { status: 200, body: { ok: true } };
}

// Een afmelding geldt meteen en voor altijd: open voorstellen voor dit contact vervallen.
export function meldAf(G, { contact, wie, nu, bron = "beheer" }) {
  const c = G.contacten.find((x) => x.code === contact);
  if (!c) return { status: 404, body: { ok: false, fout: "Dit contact is er niet." } };
  if (isAfgemeld(G, c)) return { status: 200, body: { ok: true, al: true } };
  for (const a of c.afdrukken || []) G.afmeldingen.unshift({ afdruk: a, t: iso(nu), bron });
  c.afgemeld = true;
  let vervallen = 0;
  for (const t of G.taken) if (t.soort === "contact" && t.contact === c.code && ["wacht-op-akkoord", "goedgekeurd"].includes(t.status)) { Object.assign(t, { status: "vervallen", op: iso(nu) }); vervallen++; }
  audit(G, { nu, wie, actie: "afmelding", besluit: "vastgelegd", reden: vervallen ? vervallen + " voorstel(len) vervallen" : "", doel: c.code });
  return { status: 200, body: { ok: true, vervallen } };
}

// ---------- wat de agents te zien krijgen ----------

const dagenSinds = (nu, t) => (t ? Math.max(0, Math.floor((nu - Date.parse(t)) / DAG)) : null);
const taakVoorAgent = (t, nu) => ({
  taak: t.id, soort: t.soort, status: t.status, prioriteit: t.prioriteit, titel: t.titel, uitleg: t.uitleg, door: t.door, dagenOud: dagenSinds(nu, t.t),
  ...(t.contact ? { contact: t.contact, kanaal: t.kanaal } : {}),
  ...(t.besluitReden ? { redenVanBeheer: t.besluitReden } : {}),
  adviezen: (t.adviezen || []).map((a) => ({ door: a.door, tekst: a.tekst, ...(a.prioriteit ? { prioriteit: a.prioriteit } : {}) }))
});
const regelsVoor = (G, rol, nu) => Object.fromEntries(Object.entries(ACTIES).filter(([, r]) => r.rollen.includes(rol)).map(([k, r]) => [k, { uitleg: r.uitleg, vandaagOver: Math.max(0, r.perDag - telDag(G, k + "|" + rol, nu)), gevolg: r.gevolg }]));

// Chief of staff: de takenlijst, wat er bij de andere agents speelt (alleen tellingen en hun eigen
// verslagen) en wat er op een mens wacht. Hij krijgt geen contacten en geen concepten.
export function werkStaf(G, { nu, zaken = [], verslagen = [], conceptenWacht = 0 }) {
  const per = (lijst, veld) => lijst.reduce((o, x) => ((o[x[veld]] = (o[x[veld]] || 0) + 1), o), {});
  const actief = G.taken.filter((t) => !["klaar", "afgewezen", "vervallen"].includes(t.status));
  return {
    acties: regelsVoor(G, "staf", nu),
    takenPerStatus: per(G.taken, "status"),
    taken: actief.slice(0, 50).map((t) => taakVoorAgent(t, nu)),
    afgerondLaatste7Dagen: G.taken.filter((t) => ["klaar", "afgewezen", "vervallen"].includes(t.status) && nu - Date.parse(t.op || t.t) < 7 * DAG).map((t) => ({ taak: t.id, status: t.status, titel: t.titel, ...(t.besluitReden ? { redenVanBeheer: t.besluitReden } : {}) })),
    wachtOpEenMens: { taken: actief.filter((t) => ["voorgesteld", "wacht-op-akkoord"].includes(t.status)).length, groeiConcepten: G.groei.filter((c) => c.stand === "wacht").length, berichtenVanAgents: conceptenWacht },
    zakenPerSoort: per(zaken, "soort"),
    verslagenVanAgents: verslagen.slice(0, 6).map((v) => ({ rol: v.rol, dagenOud: dagenSinds(nu, v.t), tekst: v.tekst })),
    // het auditlog van het geheugen, kort: wat werd de laatste tijd geweigerd en waarom
    weigeringenLaatste7Dagen: G.audit.filter((a) => a.besluit === "geweigerd" && nu - Date.parse(a.t) < 7 * DAG).slice(0, 20).map((a) => ({ wie: a.wie, actie: a.actie, reden: a.reden }))
  };
}

// Groei-agent: de feiten, wat niet mag, de contacten als codes met hun toestemming, en wat beheer
// van zijn vorige concepten en voorstellen vond.
export function werkGroei(G, { nu }) {
  return {
    acties: regelsVoor(G, "groei", nu),
    feiten: FEITEN, verboden: VERBODEN, conceptSoorten: CONCEPT_SOORTEN,
    contactPauzeDagen: CONTACT_PAUZE_DAGEN,
    contacten: G.contacten.filter((c) => !isAfgemeld(G, c)).map((c) => ({
      contact: c.code, segment: c.segment, therapeuten: c.therapeuten, bron: c.bron,
      toestemming: { mail: !!(c.toestemming && c.toestemming.mail), bellen: !!(c.toestemming && c.toestemming.bellen) },
      dagenSindsContact: dagenSinds(nu, c.laatsteContact), proef: c.proef || null,
      openVoorstel: G.taken.some((t) => t.soort === "contact" && t.contact === c.code && ["wacht-op-akkoord", "goedgekeurd"].includes(t.status))
    })),
    afgemeld: G.contacten.filter((c) => isAfgemeld(G, c)).length,
    vorigeConcepten: G.groei.slice(0, 10).map((c) => ({ concept: c.id, soort: c.soort, titel: c.titel, stand: c.stand, ...(c.besluitReden ? { redenVanBeheer: c.besluitReden } : {}) })),
    vorigeVoorstellen: G.taken.filter((t) => t.door === "groei-agent").slice(0, 10).map((t) => ({ taak: t.id, soort: t.soort, status: t.status, titel: t.titel, ...(t.besluitReden ? { redenVanBeheer: t.besluitReden } : {}) }))
  };
}
