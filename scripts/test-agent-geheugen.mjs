// Het gedeelde geheugen, de poort, de chief of staff en de groei-agent (opdracht van Ahmed
// 2026-11-12: "begin met het gedeelde geheugen, de toegangsregels, de chief of staff en één
// groei-agent. Bouw en test het eerst in de demo, zet nog niets live.").
//
// Wat hier vastligt:
// - Elke actie van de chief of staff en de groei-agent gaat door de poort: de rol moet de actie
//   mogen, er is een sleutel tegen dubbel uitvoeren, er is een grens per dag, en elk besluit (ook een
//   weigering) komt in het auditlog.
// - Contact met een prospect alleen met toestemming voor dat kanaal, niet na een afmelding, hooguit
//   één keer per 30 dagen, en altijd met akkoord van een mens. Een afmelding laat open voorstellen
//   vervallen, ook als de beheerder daarna nog op akkoord klikt.
// - Een concept van de groei-agent wordt getoetst aan de feiten: geen medische beloftes, geen
//   AI-kaartvoorstel, geen andere prijs, geen namen, geen adressen.
// - Beide agents kunnen alleen op proef: het geheugen bestaat alleen in de demo, komt niet in de
//   datamap, en er gaat geen mail weg. Ze zien codes, geen namen.
// `npm run test:agentgeheugen`
import assert from "node:assert/strict";
import { ALLE_RECHTEN, AGENT_ROLLEN, nieuweSleutel } from "../lib/beheer-toegang.js";
import { leegGeheugen, poort, voerUit, besluitTaak, besluitConcept, meldAf, keurConcept, keurTaakVoorstel, werkStaf, werkGroei, contactAfdruk, isAfgemeld, ACTIES, ALLEEN_PROEF } from "../lib/agent-geheugen.js";
import { demoGeheugen } from "../lib/beheer-demo.js";
import { maakBeheerOmgeving } from "../lib/beheer-omgeving-routes.js";

const DAG = 86400e3, NU = Date.parse("2026-11-12T10:00:00Z");
const GOED_CONCEPT = { soort: "bericht", titel: "Oefenkaart in één minuut", doel: "Therapeuten die nog op papier werken; doel: aanmeldingen voor de proef.",
  tekst: "Met Fysiplan maak je een oefenkaart in een minuut en deel je hem met een QR-code. Jij kiest de oefeningen. Probeer het 14 dagen gratis; daarna € 9,99 per therapeut per maand. Meer op https://fysiplan.nl." };
const doe = (G, rol, actie, b, nu = NU) => poort(G, { rol, actie, b, nu, uitvoer: (g) => voerUit(g, { rol, actie, b, nu }) });

// ---- 1. de poort, puur ----
{
  assert.deepEqual([...ALLEEN_PROEF].sort(), ["groei", "staf"]);
  assert.ok(AGENT_ROLLEN.staf.alleenProef && AGENT_ROLLEN.groei.alleenProef);
  assert.equal(AGENT_ROLLEN.staf.acties.includes("eigen-mail"), false, "de chief of staff mailt niet");
  assert.equal(AGENT_ROLLEN.groei.acties.includes("eigen-mail"), false, "de groei-agent mailt niet");
  // niets van de chief of staff of de groei-agent wordt zonder mens uitgevoerd, behalve advies bij een taak
  assert.deepEqual(Object.entries(ACTIES).filter(([, r]) => r.gevolg === "direct").map(([k]) => k), ["advies"]);

  const G = leegGeheugen();
  // rol en sleutel
  let r = doe(G, "staf", "concept", { sleutel: "concept-1", ...GOED_CONCEPT });
  assert.deepEqual([r.status, r.body.reden], [403, "rol-mag-dit-niet"]);
  r = doe(G, "staf", "taak-voorstel", { titel: "Proefpraktijken bellen", uitleg: "Twee praktijken met een proef die bijna afloopt." });
  assert.deepEqual([r.status, r.body.reden], [400, "sleutel-ontbreekt"]);
  r = doe(G, "staf", "taak-voorstel", { sleutel: "voorstel-bellen-1", titel: "Proefpraktijken bellen", uitleg: "Twee praktijken met een proef die bijna afloopt.", soort: "support", prioriteit: 1 });
  assert.equal(r.status, 200);
  const id = r.body.taak;
  assert.match(id, /^T-[a-f0-9]{8}$/);
  assert.equal(G.taken[0].status, "voorgesteld", "een voorstel van de chief of staff wacht op een mens");
  // dezelfde sleutel voert niets opnieuw uit
  r = doe(G, "staf", "taak-voorstel", { sleutel: "voorstel-bellen-1", titel: "Iets heel anders nu", uitleg: "Dit mag er niet nog eens bij komen." });
  assert.deepEqual([r.status, r.body.taak, r.body.herhaald, G.taken.length], [200, id, true, 1]);
  // dezelfde sleutel bij een andere rol is een andere actie
  assert.equal(doe(G, "groei", "taak-voorstel", { sleutel: "voorstel-bellen-1", titel: "Nieuwsbrief opzetten", uitleg: "Een maandelijkse nieuwsbrief voor proefpraktijken." }).status, 200);
  // een afgekeurde taak telt niet mee voor de grens, maar komt wel in het auditlog
  r = doe(G, "staf", "taak-voorstel", { sleutel: "voorstel-kort", titel: "kort", uitleg: "x" });
  assert.deepEqual([r.status, r.body.reden, G.audit[0].besluit], [400, "afgekeurd", "geweigerd"]);
  // grens per dag
  for (let i = 0; i < 9; i++) assert.equal(doe(G, "staf", "taak-voorstel", { sleutel: "voorstel-" + i + "-x", titel: "Taak nummer " + i, uitleg: "Een taak om de grens per dag te testen." }).status, 200);
  r = doe(G, "staf", "taak-voorstel", { sleutel: "voorstel-elf", titel: "Taak nummer elf", uitleg: "Een taak om de grens per dag te testen." });
  assert.deepEqual([r.status, r.body.reden], [429, "daglimiet-bereikt"]);
  assert.equal(doe(G, "staf", "taak-voorstel", { sleutel: "voorstel-morgen", titel: "Taak van morgen", uitleg: "Morgen mag het weer, de grens is per dag." }, NU + DAG).status, 200);
  // advies verandert de taak niet, alleen de adviezen
  r = doe(G, "staf", "advies", { sleutel: "advies-1-xx", taak: id, tekst: "Eerst deze, de proef loopt overmorgen af.", prioriteit: 1 });
  assert.deepEqual([r.status, G.taken.find((t) => t.id === id).status, G.taken.find((t) => t.id === id).adviezen[0].prioriteit], [200, "voorgesteld", 1]);
  assert.equal(doe(G, "staf", "advies", { sleutel: "advies-2-xx", taak: "T-00000000", tekst: "Een taak die er niet is." }).status, 404);
  // een beheerder beslist
  assert.equal(besluitTaak(G, { id, besluit: "klaar", wie: "a@x", nu: NU }).status, 409, "een voorstel kan niet meteen klaar");
  assert.equal(besluitTaak(G, { id, besluit: "akkoord", wie: "a@x", nu: NU }).status, 200);
  assert.equal(G.taken.find((t) => t.id === id).status, "open");
  assert.equal(besluitTaak(G, { id, besluit: "klaar", wie: "a@x", nu: NU }).status, 200);
  assert.ok(G.audit.some((a) => a.wie === "a@x" && a.besluit === "klaar" && a.doel === id));
  assert.equal(doe(G, "staf", "advies", { sleutel: "advies-3-xx", taak: id, tekst: "Advies bij een taak die al klaar is." }).status, 404);
}

// ---- 2. contact met een prospect ----
{
  const G = leegGeheugen();
  const contact = (code, extra) => ({ code, naam: "Naam " + code, segment: "zzp", therapeuten: 1, bron: "terugbelverzoek-site", toestemming: { mail: true, bellen: false }, laatsteContact: null, afdrukken: [contactAfdruk(code + "@x.invalid")], ...extra });
  G.contacten = [contact("C-aaaaaa"), contact("C-bbbbbb", { laatsteContact: new Date(NU - 10 * DAG).toISOString() }), contact("C-cccccc", { toestemming: { mail: true, bellen: true } })];
  const voorstel = (c, kanaal, sleutel) => doe(G, "groei", "contact-voorstel", { sleutel, contact: c, kanaal, reden: "Vroeg zelf om informatie via de site." });
  assert.deepEqual([voorstel("C-aaaaaa", "bellen", "contact-a-bel").status, G.audit[0].reden], [409, "geen-toestemming-voor-bellen"]);
  assert.equal(voorstel("C-bbbbbb", "mail", "contact-b-mail").body.reden, "te-kort-geleden");
  assert.equal(voorstel("C-zzzzzz", "mail", "contact-z-mail").status, 400, "een code die geen code is");
  assert.equal(voorstel("C-dddddd", "mail", "contact-d-mail").body.reden, "contact-onbekend");
  let r = voorstel("C-cccccc", "bellen", "contact-c-bel");
  assert.equal(r.status, 200);
  const taak = G.taken.find((t) => t.id === r.body.taak);
  assert.deepEqual([taak.status, taak.soort, taak.kanaal], ["wacht-op-akkoord", "contact", "bellen"]);
  assert.equal(voorstel("C-cccccc", "mail", "contact-c-mail").body.reden, "al-voorgesteld", "één open voorstel per contact");
  // de afmelding: meteen, voor altijd, en het open voorstel vervalt
  r = meldAf(G, { contact: "C-cccccc", wie: "a@x", nu: NU });
  assert.deepEqual([r.status, r.body.vervallen, taak.status, isAfgemeld(G, G.contacten[2])], [200, 1, "vervallen", true]);
  assert.equal(besluitTaak(G, { id: taak.id, besluit: "akkoord", wie: "a@x", nu: NU }).status, 409, "een vervallen voorstel kan geen akkoord meer krijgen");
  assert.equal(voorstel("C-cccccc", "mail", "contact-c-mail-2").body.reden, "afgemeld");
  // de afmelding staat op de afdruk van het adres: komt hetzelfde adres terug onder een nieuwe code, dan blijft het afgemeld
  G.contacten.push(contact("C-eeeeee", { afdrukken: [contactAfdruk("C-CCCCCC@X.invalid ")] }));
  assert.equal(voorstel("C-eeeeee", "mail", "contact-e-mail").body.reden, "afgemeld");
  assert.equal(contactAfdruk("06 12 34 56 78"), contactAfdruk("+31612345678"));
  assert.equal(contactAfdruk("0031 6 12345678"), contactAfdruk("+31612345678"));
  // akkoord vlak na een afmelding: de poort kijkt nog een keer
  r = voorstel("C-aaaaaa", "mail", "contact-a-mail");
  const t2 = r.body.taak;
  G.contacten[0].afgemeld = true;
  r = besluitTaak(G, { id: t2, besluit: "akkoord", wie: "a@x", nu: NU });
  assert.deepEqual([r.status, G.taken.find((t) => t.id === t2).status], [409, "vervallen"]);
  // klaar na een contact zet de pauze van 30 dagen
  G.contacten.push(contact("C-ffffff"));
  const t3 = voorstel("C-ffffff", "mail", "contact-f-mail").body.taak;
  assert.equal(besluitTaak(G, { id: t3, besluit: "akkoord", wie: "a@x", nu: NU }).status, 200);
  assert.equal(besluitTaak(G, { id: t3, besluit: "klaar", wie: "a@x", nu: NU }).status, 200);
  assert.equal(voorstel("C-ffffff", "mail", "contact-f-mail-2").body.reden, "te-kort-geleden");
}

// ---- 3. concepten van de groei-agent ----
{
  assert.equal(keurConcept(GOED_CONCEPT).ok, true, keurConcept(GOED_CONCEPT).fouten.join(" "));
  const fout = (extra) => keurConcept({ ...GOED_CONCEPT, tekst: GOED_CONCEPT.tekst + " " + extra });
  for (const [tekst, deel] of [
    ["Je patiënt geneest sneller.", "genezen"], ["Minder pijn gegarandeerd.", "genezen"],
    ["De AI stelt de kaart voor je samen.", "diagnose"], ["Fysiplan stelt een behandeling voor.", "diagnose"],
    ["Nu voor € 19,99.", "prijs"], ["Eerste maand korting!", "korting"], ["Mail ons op info@fysiplan.nl.", "e-mailadres"],
    ["Bel 06 12345678.", "telefoon"], ["Zie https://example.com.", "fysiplan.nl"], ["Vraag het Praktijk Hoogland.", "namen"], ["Hallo [naam],", "invulplekken"]
  ]) {
    const k = fout(tekst);
    assert.equal(k.ok, false, tekst);
    assert.match(k.fouten.join(" ").toLowerCase(), new RegExp(deel.toLowerCase()), tekst + ": " + k.fouten.join(" "));
  }
  assert.equal(keurConcept({ ...GOED_CONCEPT, soort: "advertentie" }).ok, false);
  assert.equal(keurConcept({ ...GOED_CONCEPT, doel: "" }).ok, false, "een concept zegt voor wie het is");
  assert.equal(keurTaakVoorstel({ titel: "Bel de patiënt die Jan heet", uitleg: "De patiënt heet Jan en heeft een dossier bij ons." }).ok, false);

  const G = leegGeheugen();
  let r = doe(G, "groei", "concept", { sleutel: "concept-een", ...GOED_CONCEPT });
  assert.equal(r.status, 200);
  assert.equal(G.groei[0].stand, "wacht");
  assert.equal(besluitConcept(G, { id: r.body.concept, besluit: "publiceren", wie: "a@x", nu: NU }).status, 400);
  assert.equal(besluitConcept(G, { id: r.body.concept, besluit: "afwijzen", reden: "Te lang", wie: "a@x", nu: NU }).status, 200);
  assert.equal(besluitConcept(G, { id: r.body.concept, besluit: "goedkeuren", wie: "a@x", nu: NU }).status, 404, "over een concept is maar één keer te beslissen");
  assert.equal(werkGroei(G, { nu: NU }).vorigeConcepten[0].redenVanBeheer, "Te lang", "de groei-agent leest wat beheer ervan vond");
  for (let i = 1; i < 5; i++) assert.equal(doe(G, "groei", "concept", { sleutel: "concept-" + i + "-x", ...GOED_CONCEPT }).status, 200);
  assert.equal(doe(G, "groei", "concept", { sleutel: "concept-zes", ...GOED_CONCEPT }).status, 429, "hooguit vijf concepten per dag");
}

// ---- 4. wat de agents zien: codes, geen namen ----
{
  const G = demoGeheugen(NU, "zout-test");
  const staf = werkStaf(G, { nu: NU, zaken: [{ soort: "stil" }, { soort: "stil" }], verslagen: [{ rol: "support", t: new Date(NU).toISOString(), tekst: "Rustig." }] });
  const groei = werkGroei(G, { nu: NU });
  for (const w of [staf, groei]) assert.doesNotMatch(JSON.stringify(w), /\(demo\)|\.invalid|@|sanne/i, "geen namen en geen adressen naar een agent");
  assert.equal("contacten" in staf, false, "de chief of staff ziet geen prospects");
  assert.deepEqual([staf.zakenPerSoort.stil, staf.wachtOpEenMens.taken, staf.wachtOpEenMens.groeiConcepten], [2, 2, 1]);
  assert.deepEqual(Object.keys(staf.acties).sort(), ["advies", "taak-voorstel"]);
  assert.equal(groei.contacten.length, 5, "een afgemelde prospect staat niet in het werk van de groei-agent");
  assert.equal(groei.afgemeld, 1);
  assert.ok(groei.contacten.every((c) => /^C-[a-f0-9]{6}$/.test(c.contact) && !("naam" in c)));
  assert.ok(groei.feiten.some((f) => f.includes("€ 9,99")));
}

// ---- 5. via het loket en de beheerpagina ----
{
  const opgeslagen = {}, gemaild = [], gelogd = [];
  const om = maakBeheerOmgeving({
    dataDir: "/nergens", publicDir: "/nergens", leverancier: () => ({}),
    bronEcht: () => ({ soort: "echt", nu: Date.now(), facturen: [], kosten: [], systeem: { checks: [], versie: "abc1234" }, praktijken: [] }),
    beheerEigen: (req) => { req.beheerWie = req.wie || "een@x.example"; return true; }, beheerRechten: (req) => new Set(req.R || ALLE_RECHTEN),
    sendJson: async (res, status, body) => { res.status = status; res.body = JSON.parse(JSON.stringify(body)); }, readBody: async (req) => JSON.stringify(req.body || {}),
    kruisSite: () => false, beheerIp: (req) => req.ip || "1.2.3.x", denied: async (req, res) => { res.status = 403; },
    saveJson: async (pad, v) => { opgeslagen[pad.split("/").pop()] = JSON.parse(JSON.stringify(v)); },
    beheerLog: { schrijf: async (r) => { gelogd.push(r); } }, mailIngesteld: () => true, mailOpSlot: () => false, maskeerEmail: (e) => e,
    stuurMail: async (aan, onderwerp, tekst) => { gemaild.push({ aan, onderwerp, tekst }); },
    accounts: () => ({ "een@x.example": { email: "een@x.example", naam: "Een", hash: "h", totp: { geheim: "G" } } }), bewaarAccounts: async () => {}, sleutelAan: () => false,
    ideeenWacht: () => 0
  });
  await om.laad();
  const roep = async (method, pad, extra = {}) => { const res = { setHeader() {} }; await om.afhandelen({ method, url: pad, headers: extra.headers || {}, body: extra.body, R: extra.R, wie: extra.wie, ip: extra.ip }, res, pad.split("?")[0]); return res; };
  const beheer = (pad, body, extra) => roep("POST", "/api/beheer/omgeving/" + pad, { body: { bron: "echt", ...body }, ...extra });
  const sleutel = (await beheer("loket/sleutel", {})).body.nieuweSleutel;
  const agent = (method, pad, body) => roep(method, "/api/agent/" + pad, { headers: { authorization: "Bearer " + sleutel }, body });

  // standaard uit, en "aan" kan niet
  assert.equal((await agent("GET", "staf/werk")).body.uit, true);
  let r = await beheer("loket/agent", { rol: "staf", stand: "aan" });
  assert.equal(r.status, 409);
  assert.equal((await beheer("loket/agent", { rol: "groei", stand: "aan" })).status, 409);
  assert.equal((await beheer("loket/agent", { rol: "staf", stand: "proef" }, { R: ["support"] })).status, 403, "aanzetten vraagt het recht Agents");
  assert.equal((await beheer("loket/agent", { rol: "staf", stand: "proef" })).status, 200);
  assert.equal((await beheer("loket/agent", { rol: "groei", stand: "proef" })).status, 200);
  assert.ok(gelogd.some((g) => g.actie === "agents: staf-agent op ‘proef’"));

  r = await agent("GET", "staf/werk");
  assert.deepEqual([r.status, r.body.modus, r.body.acties], [200, "proef", ["taak-voorstel", "advies", "verslag"]]);
  assert.ok(r.body.werk.taken.length >= 3);
  assert.equal("eigenBericht" in r.body.regels, false);
  assert.doesNotMatch(JSON.stringify(r.body), /\(demo\)|\.invalid|@/, "geen namen naar de chief of staff");
  const groeiWerk = (await agent("GET", "groei/werk")).body;
  assert.doesNotMatch(JSON.stringify(groeiWerk), /\(demo\)|\.invalid|@/, "geen namen naar de groei-agent");
  const metToestemming = groeiWerk.werk.contacten.find((c) => c.toestemming.mail && !c.openVoorstel && (c.dagenSindsContact == null || c.dagenSindsContact >= 30));

  // acties door de poort, alleen in de demo
  assert.equal((await agent("POST", "staf/actie", { actie: "eigen-mail", sleutel: "mail-aaaaaa" })).status, 403);
  assert.equal((await agent("POST", "staf/actie", { actie: "concept", sleutel: "concept-aa", ...GOED_CONCEPT })).status, 403);
  r = await agent("POST", "groei/actie", { actie: "concept", sleutel: "concept-loket", ...GOED_CONCEPT });
  assert.deepEqual([r.status, r.body.resultaat], [200, "concept-voor-beheer"]);
  const conceptId = r.body.concept;
  r = await agent("POST", "groei/actie", { actie: "contact-voorstel", sleutel: "contact-loket", contact: metToestemming.contact, kanaal: "mail", reden: "Vroeg zelf om informatie; nog niet gemaild." });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const contactTaak = r.body.taak;
  r = await agent("POST", "staf/actie", { actie: "verslag", tekst: "Brief: drie dingen wachten op een mens.", punten: [{ soort: "voorstel", tekst: "Eerst het terugbelverzoek." }] });
  assert.equal(r.status, 200);

  // de pagina: echt heeft geen geheugen, demo wel, met namen voor beheer
  assert.equal((await roep("GET", "/api/beheer/omgeving")).body.loket.geheugen, null);
  const demo = (await roep("GET", "/api/beheer/omgeving?bron=demo")).body.loket;
  assert.ok(demo.geheugen.groei.some((c) => c.id === conceptId));
  assert.ok(demo.geheugen.taken.some((t) => t.id === contactTaak && t.contactNaam.endsWith("(demo)")));
  assert.ok(demo.verslagen.some((v) => v.rol === "staf"));
  assert.equal(demo.agents.staf.stand, "proef");

  // beheer beslist, alleen in de demo
  assert.equal((await beheer("loket/taak", { id: contactTaak, besluit: "akkoord" })).status, 409, "in echt is er geen geheugen");
  assert.equal((await beheer("loket/taak", { bron: "demo", id: contactTaak, besluit: "akkoord" }, { R: ["support"] })).status, 403);
  r = await beheer("loket/taak", { bron: "demo", id: contactTaak, besluit: "akkoord" });
  assert.equal(r.status, 200);
  assert.equal(r.body.loket.geheugen.taken.find((t) => t.id === contactTaak).status, "goedgekeurd");
  r = await beheer("loket/groei", { bron: "demo", id: conceptId, besluit: "goedkeuren" });
  assert.equal(r.body.loket.geheugen.groei.find((c) => c.id === conceptId).stand, "goedgekeurd");
  r = await beheer("loket/afmelding", { bron: "demo", contact: metToestemming.contact });
  assert.equal(r.body.loket.geheugen.taken.find((t) => t.id === contactTaak).status, "vervallen", "afmelden na akkoord laat het contact alsnog vervallen");

  // niets in de datamap, geen mail
  assert.doesNotMatch(JSON.stringify(opgeslagen), /taak-voorstel|contact-voorstel|Oefenkaart in één minuut|"geheugen"|C-[a-f0-9]{6}/, "het geheugen komt niet in de datamap");
  assert.equal(gemaild.length, 0, "er gaat geen mail weg");

  // een opgeslagen stand "aan" voor deze agents telt niet
  assert.equal((await agent("GET", "staf/werk")).status, 200);
  assert.equal((await roep("GET", "/api/agent/staf/werk", { headers: { authorization: "Bearer " + nieuweSleutel() } })).status, 401);
  await beheer("loket/agent", { rol: "staf", stand: "uit" });
  assert.equal((await agent("POST", "staf/actie", { actie: "taak-voorstel", sleutel: "na-uit-1", titel: "Na het uitzetten", uitleg: "Dit mag niet meer gebeuren nu hij uit staat." })).status, 423);
}

console.log("test-agent-geheugen: ok");
