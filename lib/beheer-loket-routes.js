import { GROEI_AANPAK } from "./groei-aanpak.js";
// Het loket: de enige deur waardoor een agent met taalmodel bij Fysiplan komt (/api/agent/...),
// en wat beheer daarover instelt (/api/beheer/omgeving/loket/... en .../rechten).
//
// Een agent is een taak met een taalmodel die op een schema draait (support, tech, finance). Hij
// heeft geen beheeraccount en geen wachtwoord, maar de sleutel van de agents, die een beheerder
// met volledig beheer maakt en die de server alleen als afdruk bewaart. Daarmee kan hij twee dingen:
//
//   GET  /api/agent/<rol>/werk    wat er speelt, met codes in plaats van namen (lib/beheer-toegang.js)
//   POST /api/agent/<rol>/actie   één actie uit een vaste lijst: eigen-mail, notitie of verslag
//
// De server beslist, niet de agent:
// - per agent de stand: uit (standaard), proef (hij werkt op de demo-gegevens, er gaat niets naar
//   echte adressen) of aan. Eén schakelaar zet alle agents stil.
// - een eigen bericht volgt de mailregel van de support-agent: de soort "Eigen bericht van een
//   agent" staat standaard uit. Op handmatig wacht het bericht als concept op het akkoord van een
//   beheerder; op automatisch gaat het weg, hooguit tien per dag en één per zaak per week.
// - wie het bericht krijgt, de aanhef en de afsluiting komen van de server. De agent kent geen
//   namen en geen adressen.
// - wat niet terug te draaien is (een aangifte als ingediend markeren, een boekjaar afsluiten, een
//   bericht aan alle praktijken) staat niet in de lijst: dat blijft een klik van een beheerder.
//
// Alles wat een agent doet, komt in zijn verslagen en in het logboek van de support-agent; een
// mail naar een echt adres en elke wijziging van een instelling ook in het beheerlogboek.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Rem, beheerKlaar, beheerUit } from "./beheer.js";
import { supportRonde, financeOverzicht, jaarControle, jaarStand, jaarVan, dagVan } from "./beheer-omgeving.js";
import { RECHTEN, schoonRechten, heeftAlles, AGENT_ROLLEN, AGENT_STANDEN, EIGEN_MAX_DAG, VERSLAG_MAX_DAG, NOTITIE_MAX_DAG,
  nieuweSleutel, sleutelHash, sleutelKlopt, sleutelUit, rolVanSleutel, aanleidingVan, OUDE_ROLLEN, zaakId, alias, zaakOntvangers, keurEigenBericht, eigenMail, keurVerslag, keurNotitie,
  werkSupport, werkTech, werkFinance, factuurZaken, maakFouten, routeWoorden } from "./beheer-toegang.js";
import { demoLoket, demoGeheugen } from "./beheer-demo.js";
import { poort, voerUit, besluitTaak, besluitConcept, meldAf, werkStaf, werkGroei, isAfgemeld, ACTIES, FEITEN } from "./agent-geheugen.js";

import { DEMO_MODEL, DEMO_RONDES_PER_DAG, DEMO_SCHEMA, demoModelInvoer, leesDemoPlan } from "./agent-demo-model.js";

const DAG = 86400e3;
// standen van een eigen bericht die een praktijk bezet houden
const BLOKKEERT = new Set(["wacht", "bezig", "onbekend"]);
// Een bericht dat bij een herstart nog "bezig" was: of de mail wegging, weet niemand. Niet opnieuw
// versturen (dan krijgt de praktijk hem misschien twee keer): de praktijk blijft bezet tot een
// beheerder bij de mailprovider heeft nagekeken wat er gebeurde (loket/concept, besluit "nagekeken").
function onbekendNaHerstart(concepten) {
  for (const c of concepten) if (c && c.stand === "bezig") Object.assign(c, { stand: "onbekend", onbekendSinds: new Date().toISOString() });
  return concepten;
}
// Wat de server over zijn eigen fouten telt (zie maakFouten). Eén telling per proces: server.js
// roept merkAntwoord aan als een antwoord de deur uit is. In het patroon van een route blijven
// alleen woorden staan uit de routes van de server zelf (`eigenWoorden`, gevuld bij het laden uit
// de broncode); tot die er zijn, en als het lezen mislukt, wordt elk deel van een pad "…".
const eigenWoorden = new Set();
const fouten = maakFouten(eigenWoorden);
async function leesEigenWoorden() {
  try {
    const wortel = fileURLToPath(new URL("..", import.meta.url));
    const libs = (await readdir(join(wortel, "lib"))).filter((n) => n.endsWith(".js"));
    const bronnen = await Promise.all([join(wortel, "server.js"), ...libs.map((n) => join(wortel, "lib", n))].map((p) => readFile(p, "utf8").catch(() => "")));
    for (const w of routeWoorden(bronnen)) eigenWoorden.add(w);
  } catch {}
}
export function merkAntwoord(methode, pad, status) { fouten.merk(String(methode || ""), pad, Number(status) || 0, Date.now()); }

const schoon = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const nieuwId = (letter) => letter + Date.now().toString(36) + randomBytes(3).toString("hex");

// `om` is wat de omgeving (lib/beheer-omgeving-routes.js) aan het loket geeft: de bron en de staat
// per soort, het versturen van een zaak en de leverancier voor de jaarcontroles.
export function maakLoket(d, om) {
  const pad = join(d.dataDir, "beheer-loket.json"), foutenPad = join(d.dataDir, "beheer-fouten.json");
  // de beheeraccounts zijn van de server; zonder die opgave (een test) is de lijst leeg
  const alleAccounts = () => (d.accounts ? d.accounts() : {});
  // `sleutel` is de oude gedeelde sleutel (alleen nog intrekken); `sleutels` heeft er één per rol.
  // Van elke sleutel bewaart de server alleen de afdruk. `pogingen`: een geldige sleutel op het
  // adres van een andere rol.
  const leeg = () => ({ sleutel: null, sleutels: {}, pogingen: [], pauze: null, agents: {}, gezien: {}, concepten: [], verslagen: [], notities: [], dag: { datum: "", n: {} } });
  const echt = { zout: "", ...leeg() };
  let demo = null;
  let modelBezig = false;
  // tien verkeerde sleutels per kwartier per verbinding; daarna 429
  const rem = new Rem(10, 15 * 60e3);
  let foutenBewaard = 0;

  const bewaar = () => d.saveJson(pad, echt);
  // de demo begint met agents die al een week werken (lib/beheer-demo.js)
  function nieuweDemo(bron, zaken, fin, verschilKwartaal) {
    const zout = "demo-" + randomBytes(6).toString("hex");
    demo = { zout, ...leeg(), ...demoLoket(bron, zaken, factuurZaken(fin), zout, verschilKwartaal), geheugen: demoGeheugen(bron.nu, zout) };
  }

  async function laad() {
    const lees = async (p) => { try { const v = JSON.parse(await readFile(p, "utf8")); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
    const o = await lees(pad);
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const lijst = (v, max) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, max) : []);
    echt.zout = typeof o.zout === "string" && /^[a-f0-9]{32}$/.test(o.zout) ? o.zout : "";
    const afdruk = (k) => (k && /^[a-f0-9]{64}$/.test(String(k.hash || "")) ? { hash: k.hash, gemaakt: k.gemaakt || null, door: k.door || "" } : null);
    echt.sleutel = afdruk(o.sleutel);
    echt.sleutels = {};
    for (const rol of Object.keys(AGENT_ROLLEN)) { const k = afdruk(obj(o.sleutels)[rol]); if (k) echt.sleutels[rol] = k; }
    echt.pogingen = lijst(o.pogingen, 50);
    echt.pauze = o.pauze && typeof o.pauze === "object" ? { door: o.pauze.door || "", op: o.pauze.op || null } : null;
    echt.agents = {};
    for (const rol of Object.keys(AGENT_ROLLEN)) {
      const a = obj(o.agents)[rol];
      // de chief of staff en de groei-agent mogen (nog) niet aan: dan blijven ze uit
      if (a && AGENT_STANDEN.includes(a.stand) && !(AGENT_ROLLEN[rol].alleenProef && a.stand === "aan")) echt.agents[rol] = { stand: a.stand, door: a.door || "", op: a.op || null, ...(rol === "tech" ? { mergen: a.mergen === true } : {}) };
    }
    echt.gezien = Object.fromEntries(Object.entries(obj(o.gezien)).filter(([k, v]) => Object.hasOwn(AGENT_ROLLEN, k) && typeof v === "string"));
    echt.concepten = onbekendNaHerstart(lijst(o.concepten, 100));
    echt.verslagen = lijst(o.verslagen, 60);
    echt.notities = lijst(o.notities, 100);
    echt.dag = o.dag && typeof o.dag === "object" && typeof o.dag.datum === "string" ? { datum: o.dag.datum, n: obj(o.dag.n) } : { datum: "", n: {} };
    // het zout van de codes blijft hetzelfde zolang het bestand bestaat: anders heet een praktijk
    // voor de agent na elke herstart anders
    if (!echt.zout) { echt.zout = randomBytes(16).toString("hex"); await bewaar().catch(() => {}); }
    fouten.laad(await lees(foutenPad));
    if (!eigenWoorden.size) await leesEigenWoorden();
  }
  function tik(nu = Date.now()) {
    if (fouten.vuil() && nu - foutenBewaard > 5 * 60e3) { foutenBewaard = nu; d.saveJson(foutenPad, fouten.uit()).catch(() => {}); }
  }

  const staatVan = (soort) => (soort === "demo" ? demo : echt);
  function telDag(L, sleutel, nu) {
    const dag = dagVan(nu);
    if (L.dag.datum !== dag) L.dag = { datum: dag, n: {} };
    return Number(L.dag.n[sleutel]) || 0;
  }
  const plusDag = (L, sleutel, nu) => { L.dag.n[sleutel] = telDag(L, sleutel, nu) + 1; };

  function zakenVoor(rol, bron, s) {
    if (rol === "finance") return factuurZaken(financeOverzicht(bron, s.inst));
    return supportRonde(bron, { stand: s.agent.stand, verstuurd: s.agent.verstuurd });
  }
  // kan een agent bij deze zaak nu een eigen bericht kwijt, en wat gebeurt er dan mee?
  function eigenKan(soort, s, L, bron, z) {
    const stand = s.agent.stand["eigen-bericht"] || "uit";
    if (stand === "uit") return { kan: false, reden: "eigen-berichten-staan-uit" };
    if (!zaakOntvangers(bron, z).length) return { kan: false, reden: "geen-adres-bekend" };
    const laatst = s.agent.verstuurd[z.sleutel] || 0;
    if (laatst && bron.nu - laatst < 7 * DAG) return { kan: false, reden: "deze-week-al-gemaild" };
    if (L.concepten.some((c) => c.sleutel === z.sleutel && BLOKKEERT.has(c.stand))) return { kan: false, reden: "concept-wacht-op-akkoord" };
    // Eén wachtend eigen bericht per praktijk, over alle zaken en rollen heen; en per praktijk en
    // aanleiding (AANLEIDING in lib/beheer-toegang.js) hooguit één per week. Een mislukte betaling is
    // bij support "betaling-mislukt" en bij finance "incasso-mislukt": voor de praktijk één aanleiding.
    // "bezig" is een plek die vastligt terwijl een mail onderweg is: zo komen twee gelijktijdige
    // verzoeken er niet allebei door. "onbekend" is een "bezig" van voor een herstart: of die mail
    // wegging weet niemand, dus blokkeert hij tot een beheerder het heeft nagekeken.
    if (z.pk && L.concepten.some((c) => c.pk === z.pk && BLOKKEERT.has(c.stand))) return { kan: false, reden: "praktijk-heeft-al-een-bericht-dat-wacht" };
    if (z.pk && L.concepten.some((c) => c.pk === z.pk && c.stand === "verstuurd" && aanleidingVan(c.soort) === aanleidingVan(z.soort) && bron.nu - Date.parse(c.op || c.t) < 7 * DAG)) return { kan: false, reden: "praktijk-kreeg-deze-week-al-een-bericht-hierover" };
    // een beheerder wees het twee keer af: dan is het deze week genoeg
    if (L.concepten.filter((c) => c.sleutel === z.sleutel && c.stand === "afgewezen" && bron.nu - Date.parse(c.op || c.t) < 7 * DAG).length >= 2) return { kan: false, reden: "twee-keer-afgewezen-deze-week" };
    if (telDag(L, "eigen", bron.nu) >= EIGEN_MAX_DAG) return { kan: false, reden: "daglimiet-bereikt" };
    if (soort === "echt" && stand === "automatisch" && !d.mailIngesteld()) return { kan: false, reden: "mail-staat-uit-op-de-server" };
    return { kan: true, wordt: stand === "automatisch" ? "direct-verstuurd" : "concept-voor-beheer" };
  }
  // het eigen bericht naar de ontvangers van de zaak; geeft het aantal verstuurde mails
  async function stuurEigen(soort, s, bron, z, k, rol, akkoord) {
    const aan = zaakOntvangers(bron, z);
    const zz = { ...z, mails: aan.map((a) => ({ aan: a.email, naam: a.naam, ...eigenMail(k, { naam: a.naam, praktijk: z.praktijk }) })) };
    if (!zz.mails.length) return 0;
    return om.verstuurZaak(soort, s, zz, AGENT_ROLLEN[rol].wie, { akkoord, actie: akkoord ? "eigen bericht van de " + AGENT_ROLLEN[rol].wie + " verstuurd na akkoord" : AGENT_ROLLEN[rol].wie + " mailde een praktijk (eigen bericht)", reden: k.onderwerp });
  }

  // ---------- wat de agent krijgt ----------

  function werkVoor(rol, soort, cfg) {
    const { bron, s } = om.staat(soort), L = staatVan(soort), zout = L.zout;
    const eigen = (z) => eigenKan(soort, s, L, bron, z);
    const regels = { verslagenVandaagOver: Math.max(0, VERSLAG_MAX_DAG - telDag(L, "verslag|" + rol, bron.nu)) };
    let werk;
    if (rol === "support") {
      const zaken = zakenVoor(rol, bron, s);
      werk = werkSupport({ bron, zaken, open: s.agent.open || {}, zout, eigen });
    } else if (rol === "tech") {
      // op proef werkt de agent op verzonnen gegevens: daar hoort nooit een merge bij, ook niet als
      // de schakelaar in de demo aan staat
      regels.zelfMergen = soort === "echt" && cfg.mergen === true;
      werk = werkTech({ bron, zaken: zakenVoor("support", bron, s), fouten: soort === "demo" ? demo.fouten : fouten.overzicht(Date.now()) });
    } else if (rol === "staf") {
      werk = werkStaf(demo.geheugen, { nu: bron.nu, zaken: zakenVoor("support", bron, s), verslagen: L.verslagen.filter((v) => v.rol !== "staf"), conceptenWacht: L.concepten.filter((c) => c.stand === "wacht").length });
    } else if (rol === "groei") {
      werk = werkGroei(demo.geheugen, { nu: bron.nu });
    } else {
      const fin = financeOverzicht(bron, s.inst), nuJaar = jaarVan(bron.nu);
      const jaren = [nuJaar, String(Number(nuJaar) - 1)].map((j) => ({ ...jaarControle(bron, s.inst, j, om.leverancier(soort)), ...jaarStand(fin, j) }));
      werk = werkFinance({ bron, fin, jaren, zaken: factuurZaken(fin), zout, eigen });
      regels.notitiesVandaagOver = Math.max(0, NOTITIE_MAX_DAG - telDag(L, "notitie", bron.nu));
    }
    if (rol === "support" || rol === "finance") {
      regels.eigenBericht = s.agent.stand["eigen-bericht"] || "uit";
      regels.eigenBerichtenVandaagOver = Math.max(0, EIGEN_MAX_DAG - telDag(L, "eigen", bron.nu));
    }
    return {
      ok: true, rol, modus: soort === "demo" ? "proef" : "echt", nu: new Date(bron.nu).toISOString(), gepauzeerd: false, acties: AGENT_ROLLEN[rol].acties, regels, werk,
      // wat deze agent eerder schreef en wat beheer ervan vond: zijn geheugen van ronde tot ronde
      vorige: {
        verslagen: L.verslagen.filter((v) => v.rol === rol).slice(0, 3).map((v) => ({ t: v.t, tekst: v.tekst, punten: v.punten })),
        concepten: L.concepten.filter((c) => c.rol === rol).slice(0, 10).map((c) => ({ id: c.id, zaak: c.zaakId, t: c.t, onderwerp: c.onderwerp, stand: c.stand, ...(c.reden ? { redenVanBeheer: c.reden } : {}) })),
        ...(rol === "finance" ? { notities: L.notities.slice(0, 20).map((n) => ({ t: n.t, periode: n.periode, tekst: n.tekst })) } : {})
      }
    };
  }

  // geeft true als het verzoek hier is afgehandeld
  async function afhandelenAgent(req, res, urlPath) {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-robots-tag", "noindex, noarchive");
    // zonder sleutel bestaat het loket niet
    if (!echt.sleutel && !Object.keys(echt.sleutels).length) { await d.sendJson(res, 404, { ok: false, fout: "Het loket voor agents is dicht." }); return true; }
    const ip = d.beheerIp(req);
    if (rem.opSlot(ip)) { await d.sendJson(res, 429, { ok: false, fout: "Te veel pogingen met een verkeerde sleutel; probeer het over een kwartier opnieuw." }); return true; }
    // de rol volgt uit de sleutel, niet uit het adres
    const gegeven = sleutelUit(req.headers);
    const sleutelRol = rolVanSleutel(gegeven, echt.sleutels);
    const oud = !sleutelRol && !!echt.sleutel && sleutelKlopt(gegeven, echt.sleutel.hash);
    if (!sleutelRol && !oud) {
      rem.tel(ip);
      await d.sendJson(res, 401, { ok: false, fout: "Geen geldige sleutel van de agents." });
      return true;
    }
    const m = /^\/api\/agent\/(support|tech|finance|staf|groei)\/(werk|actie)$/.exec(urlPath);
    if (!m || (m[2] === "werk" ? req.method !== "GET" : req.method !== "POST")) { await d.sendJson(res, 404, { ok: false, fout: "Onbekend adres. Gebruik GET /api/agent/<rol>/werk of POST /api/agent/<rol>/actie." }); return true; }
    const rol = m[1];
    // een geldige sleutel op het adres van een andere rol: weigeren en vastleggen
    if (sleutelRol ? sleutelRol !== rol : !OUDE_ROLLEN.includes(rol)) {
      const van = sleutelRol || "gedeeld";
      echt.pogingen.unshift({ t: new Date().toISOString(), sleutel: van, adres: rol, methode: req.method });
      echt.pogingen = echt.pogingen.slice(0, 50);
      await bewaar().catch(() => {});
      await d.beheerLog.schrijf({ wie: (sleutelRol ? AGENT_ROLLEN[sleutelRol].wie : "gedeelde sleutel"), actie: "agents: poging tot rechtenoverschrijding", reden: "sleutel van " + (sleutelRol ? AGENT_ROLLEN[sleutelRol].wie : "de oude gedeelde sleutel") + " op het adres van de " + AGENT_ROLLEN[rol].wie, ip }).catch(() => {});
      await d.sendJson(res, 403, { ok: false, fout: "Deze sleutel hoort niet bij deze agent. Dit is vastgelegd." });
      return true;
    }
    const cfg = echt.agents[rol] || { stand: "uit" };
    echt.gezien[rol] = new Date().toISOString();
    if (echt.pauze || cfg.stand === "uit") {
      await bewaar().catch(() => {});
      const waarom = echt.pauze ? { gepauzeerd: true, uitleg: "Beheer heeft alle agents stilgezet. Doe niets en stop." } : { uit: true, uitleg: "Deze agent staat uit. Doe niets en stop." };
      await d.sendJson(res, m[2] === "werk" ? 200 : 423, { ok: m[2] === "werk", rol, ...waarom });
      return true;
    }
    const soort = cfg.stand === "proef" ? "demo" : "echt", L = staatVan(soort);
    // De oude gedeelde sleutel is er alleen nog voor de overstap, en werkt daarom alleen op proef:
    // een agent op "aan" komt alleen met zijn eigen sleutel bij echte gegevens (fail closed).
    if (oud && soort !== "demo") {
      await d.beheerLog.schrijf({ wie: "gedeelde sleutel", actie: "agents: oude gedeelde sleutel geweigerd", reden: "de " + AGENT_ROLLEN[rol].wie + " staat op aan; daar werkt alleen een eigen sleutel", ip }).catch(() => {});
      await d.sendJson(res, 403, { ok: false, fout: "De oude gedeelde sleutel werkt alleen nog op proef. Deze agent staat op aan en heeft een eigen sleutel nodig." });
      return true;
    }
    // op proef tellen ook de stopknop en de sleutels van de demo: wie in de demo alles stilzet of een
    // sleutel intrekt, ziet een agent op proef ook echt stoppen
    if (soort === "demo") {
      if (demo.pauze) { await d.sendJson(res, m[2] === "werk" ? 200 : 423, { ok: m[2] === "werk", rol, gepauzeerd: true, uitleg: "Beheer heeft in de demo alle agents stilgezet. Doe niets en stop." }); return true; }
      if (!demo.sleutels[rol]) { await d.sendJson(res, 401, { ok: false, fout: "De sleutel van deze agent is in de demo ingetrokken." }); return true; }
      // de stand op de pagina Agents van de demo bepaalt wat de agent in de demo doet: "uit" in de
      // demo is ook echt uit. "proef" en "aan" werken in de demo hetzelfde; ze veranderen niets aan
      // de stand van de echte agent, en een agent op proef komt nooit bij echte gegevens.
      if ((demo.agents[rol] || { stand: "uit" }).stand === "uit") { await d.sendJson(res, m[2] === "werk" ? 200 : 423, { ok: m[2] === "werk", rol, uit: true, uitleg: "Deze agent staat in de demo uit. Doe niets en stop." }); return true; }
    }
    const instelling = soort === "demo" ? { ...cfg, ...(demo.agents[rol] || {}), mergen: false } : cfg;
    // het gedeelde geheugen bestaat alleen in de demo: zonder proef geen chief of staff of groei-agent
    if (AGENT_ROLLEN[rol].alleenProef && soort !== "demo") { await d.sendJson(res, 423, { ok: false, rol, uit: true, uitleg: "Deze agent werkt voorlopig alleen op proef. Doe niets en stop." }); return true; }
    if (m[2] === "werk") {
      await bewaar().catch(() => {});
      await d.sendJson(res, 200, werkVoor(rol, soort, instelling));
      return true;
    }

    let b;
    try { b = JSON.parse(await d.readBody(req)); } catch { b = null; }
    if (!b || typeof b !== "object" || Array.isArray(b)) { await d.sendJson(res, 400, { ok: false, fout: "Stuur JSON met een veld ‘actie’." }); return true; }
    const actie = String(b.actie || "");
    // een actie op proef verandert de demo: die moet op schijf staan vóór het antwoord (beheer-omgeving-routes.js)
    if (soort === "demo") res.demoWijzigt = true;
    if (!AGENT_ROLLEN[rol].acties.includes(actie)) { await d.sendJson(res, 403, { ok: false, fout: "Deze agent mag deze actie niet. Toegestaan: " + AGENT_ROLLEN[rol].acties.join(", ") + "." }); return true; }
    const { bron, s } = om.staat(soort), t = new Date().toISOString();
    // alles behalve een verslag van de chief of staff en de groei-agent gaat door de poort
    if (AGENT_ROLLEN[rol].alleenProef && actie !== "verslag") {
      const r = poort(demo.geheugen, { rol, actie, b, nu: bron.nu, uitvoer: (G) => voerUit(G, { rol, actie, b, nu: bron.nu }) });
      om.demoGewijzigd?.();
      await d.sendJson(res, r.status, r.body);
      return true;
    }
    const klaar = async (uit) => { if (soort === "echt") await bewaar(); else om.demoGewijzigd?.(); await d.sendJson(res, 200, { ok: true, ...uit }); return true; };

    if (actie === "verslag") {
      if (telDag(L, "verslag|" + rol, bron.nu) >= VERSLAG_MAX_DAG) { await d.sendJson(res, 429, { ok: false, fout: "Vandaag zijn er al " + VERSLAG_MAX_DAG + " verslagen van deze agent." }); return true; }
      const k = keurVerslag(b);
      if (!k.ok) { await d.sendJson(res, 400, { ok: false, fouten: k.fouten }); return true; }
      L.verslagen.unshift({ id: nieuwId("v"), t, rol, ...k.verslag });
      L.verslagen = L.verslagen.slice(0, 60);
      plusDag(L, "verslag|" + rol, bron.nu);
      return klaar({ resultaat: "verslag-bewaard" });
    }
    if (actie === "notitie") {
      if (telDag(L, "notitie", bron.nu) >= NOTITIE_MAX_DAG) { await d.sendJson(res, 429, { ok: false, fout: "Vandaag zijn er al " + NOTITIE_MAX_DAG + " notities gezet." }); return true; }
      const k = keurNotitie(b);
      if (!k.ok) { await d.sendJson(res, 400, { ok: false, fouten: k.fouten }); return true; }
      L.notities.unshift({ id: nieuwId("n"), t, rol, ...k.notitie });
      L.notities = L.notities.slice(0, 100);
      plusDag(L, "notitie", bron.nu);
      return klaar({ resultaat: "notitie-bewaard" });
    }
    // eigen-mail
    const z = zakenVoor(rol, bron, s).find((x) => zaakId(L.zout, x.sleutel) === b.zaak);
    if (!z) { await d.sendJson(res, 404, { ok: false, fout: "Deze zaak is er niet (meer). Haal het werk opnieuw op." }); return true; }
    const kan = eigenKan(soort, s, L, bron, z);
    if (!kan.kan) { await d.sendJson(res, 409, { ok: false, reden: kan.reden, fout: "Bij deze zaak kan nu geen eigen bericht: " + kan.reden + "." }); return true; }
    const k = keurEigenBericht(b);
    if (!k.ok) { await d.sendJson(res, 400, { ok: false, fouten: k.fouten }); return true; }
    plusDag(L, "eigen", bron.nu);
    if (kan.wordt === "concept-voor-beheer") {
      const c = { id: nieuwId("c"), t, rol, sleutel: z.sleutel, zaakId: zaakId(L.zout, z.sleutel), soort: z.soort, pk: z.pk, praktijk: z.praktijk, wat: z.tekst, onderwerp: k.onderwerp, tekst: k.tekst, aan: zaakOntvangers(bron, z).length, stand: "wacht" };
      L.concepten.unshift(c);
      L.concepten = L.concepten.slice(0, 100);
      return klaar({ resultaat: "concept-voor-beheer", id: c.id });
    }
    // de plek ligt vast vóór het wachten op de mail: een tweede verzoek voor deze praktijk ziet "bezig"
    const c = { id: nieuwId("c"), t, rol, sleutel: z.sleutel, zaakId: zaakId(L.zout, z.sleutel), soort: z.soort, pk: z.pk, praktijk: z.praktijk, wat: z.tekst, onderwerp: k.onderwerp, tekst: k.tekst, aan: 0, stand: "bezig" };
    L.concepten.unshift(c);
    L.concepten = L.concepten.slice(0, 100);
    let n = 0;
    try { n = await stuurEigen(soort, s, bron, z, k, rol, null); } catch { n = 0; }
    if (!n) {
      L.concepten = L.concepten.filter((x) => x !== c);
      if (soort === "echt") await bewaar().catch(() => {});
      await d.sendJson(res, 502, { ok: false, fout: "De mail kon niet weg. Er is niets verstuurd." });
      return true;
    }
    Object.assign(c, { aan: n, stand: "verstuurd", op: t, door: AGENT_ROLLEN[rol].wie });
    return klaar({ resultaat: "direct-verstuurd", ontvangers: n });
  }

  // ---------- wat beheer ziet en instelt ----------

  // de onderdelen "loket" en "toegang" van het antwoord aan de pagina, naar de rechten van wie kijkt
  function voorPagina(soort, R, wie, bron) {
    const L = staatVan(soort), uit = {};
    if (R.has("agents")) {
      // een agent schrijft codes; beheer leest de namen die erbij horen
      const namen = new Map((bron.praktijken || []).map((p) => [alias(L.zout, "P", p.pk), p.naam]));
      const metNamen = (tekst) => String(tekst || "").replace(/\bP-[a-f0-9]{6}\b/g, (c) => namen.get(c) || c);
      uit.loket = {
        rollen: AGENT_ROLLEN, standen: AGENT_STANDEN,
        sleutel: L.sleutel ? { gemaakt: L.sleutel.gemaakt, door: L.sleutel.door } : null, magSleutel: R.has("beheer"),
        sleutels: Object.fromEntries(Object.keys(AGENT_ROLLEN).map((r) => [r, L.sleutels[r] ? { gemaakt: L.sleutels[r].gemaakt, door: L.sleutels[r].door } : null])),
        pogingen: (L.pogingen || []).slice(0, 20),
        pauze: L.pauze,
        agents: Object.fromEntries(Object.keys(AGENT_ROLLEN).map((r) => [r, { stand: "uit", ...(L.agents[r] || {}), gezien: L.gezien[r] || null }])),
        concepten: L.concepten.slice(0, 30).map(({ sleutel, pk, ...c }) => c),
        verslagen: L.verslagen.slice(0, 30).map((v) => ({ ...v, tekst: metNamen(v.tekst), punten: (v.punten || []).map((p) => ({ ...p, tekst: metNamen(p.tekst), ...(p.praktijk ? { praktijk: namen.get(p.praktijk) || p.praktijk } : {}) })) })),
        notities: L.notities.slice(0, 30).map((n) => ({ ...n, tekst: metNamen(n.tekst) })),
        demoModel: { model: DEMO_MODEL, beschikbaar: !!d.demoModelAan?.(), bezig: modelBezig, perDag: DEMO_RONDES_PER_DAG, over: Object.fromEntries(["staf", "groei"].map((rol) => [rol, Math.max(0, DEMO_RONDES_PER_DAG - telDag(echt, "demomodel|" + rol, Date.now()))])) },
        limieten: { eigenPerDag: EIGEN_MAX_DAG, eigenVandaag: telDag(L, "eigen", bron.nu) },
        geheugen: soort === "demo" ? geheugenVoorPagina(demo.geheugen) : null
      };
    }
    if (R.has("beheer")) {
      const accounts = soort === "demo" ? demo.accounts
        : Object.values(alleAccounts()).map((a) => ({ ...beheerUit(a), rechten: Array.isArray(a.rechten) ? schoonRechten(a.rechten) : null, ik: a.email === wie })).sort((x, y) => String(x.email).localeCompare(String(y.email)));
      uit.toegang = { rechten: RECHTEN, accounts };
    }
    return uit;
  }

  // het gedeelde geheugen zoals beheer het ziet: met de namen van de prospects (alleen demo)
  function geheugenVoorPagina(G) {
    const naam = new Map(G.contacten.map((c) => [c.code, c.naam]));
    return {
      acties: ACTIES, feiten: FEITEN, aanpak: GROEI_AANPAK,
      taken: G.taken.slice(0, 60).map((x) => ({ ...x, ...(x.contact ? { contactNaam: naam.get(x.contact) || x.contact } : {}) })),
      groei: G.groei.slice(0, 30),
      contacten: G.contacten.map((c) => ({ code: c.code, naam: c.naam, segment: c.segment, therapeuten: c.therapeuten, bron: c.bron, toestemming: c.toestemming, laatsteContact: c.laatsteContact, afgemeld: isAfgemeld(G, c) })),
      afmeldingen: G.afmeldingen.length,
      audit: G.audit.slice(0, 40).map((a) => ({ ...a, ...(a.doel && naam.has(a.doel) ? { doelNaam: naam.get(a.doel) } : {}) }))
    };
  }

  // POST /api/beheer/omgeving/loket/<wat> en /api/beheer/omgeving/rechten. `c` komt van de omgeving:
  // { b, soort, wie, R, log, klaar }. Geeft true als het verzoek hier is afgehandeld.
  async function afhandelenBeheer(req, res, urlPath, c) {
    const { b, soort, wie, R, log } = c, L = staatVan(soort), t = new Date().toISOString();
    const weiger = async (recht) => { await d.sendJson(res, 403, { ok: false, geenRecht: recht, fout: "Je account heeft het recht ‘" + RECHTEN[recht].titel + "’ niet." }); return true; };
    const klaar = async (extra) => { if (soort === "echt") await bewaar(); return c.klaar(extra); };

    if (urlPath === "/api/beheer/omgeving/rechten") {
      if (!R.has("beheer")) return weiger("beheer");
      const em = String(b.email || "").trim().toLowerCase(), nieuw = schoonRechten(b.rechten);
      if (!Array.isArray(b.rechten) && b.rechten !== null) { await d.sendJson(res, 400, { ok: false, fout: "Geef een lijst met rechten, of null voor alles." }); return true; }
      if (soort === "demo") {
        const a = demo.accounts.find((x) => x.email === em);
        if (!a) { await d.sendJson(res, 404, { ok: false, fout: "Geen beheeraccount met dit e-mailadres." }); return true; }
        if (a.ik) { await d.sendJson(res, 409, { ok: false, fout: "Je eigen rechten kun je niet wijzigen. Vraag het een andere beheerder met volledig beheer." }); return true; }
        a.rechten = nieuw;
        return c.klaar();
      }
      const alle = alleAccounts(), a = Object.hasOwn(alle, em) ? alle[em] : null;
      req.beheerDoel = em;
      if (!a) { await d.sendJson(res, 404, { ok: false, fout: "Geen beheeraccount met dit e-mailadres." }); return true; }
      if (em === wie) { await d.sendJson(res, 409, { ok: false, fout: "Je eigen rechten kun je niet wijzigen. Vraag het een andere beheerder met volledig beheer." }); return true; }
      // er blijft altijd iemand over die alles mag, tenzij de server een eigen sleutel heeft
      if (nieuw && !(d.sleutelAan && d.sleutelAan()) && !Object.values(alle).some((x) => x.email !== em && beheerKlaar(x) && heeftAlles(x))) {
        await d.sendJson(res, 409, { ok: false, fout: "Dit is het laatste account met volledig beheer. Geef eerst een ander account volledig beheer." });
        return true;
      }
      if (nieuw) a.rechten = nieuw; else delete a.rechten;
      await d.bewaarAccounts();
      await log({ actie: "rechten van beheeraccount gewijzigd", doel: em, reden: nieuw ? (nieuw.map((r) => RECHTEN[r].titel).join(", ") || "geen rechten") : "volledig beheer" });
      return c.klaar();
    }

    if (!urlPath.startsWith("/api/beheer/omgeving/loket/")) return false;
    const wat = urlPath.slice("/api/beheer/omgeving/loket/".length);

    if (wat === "sleutel") {
      if (!R.has("beheer")) return weiger("beheer");
      const rol = b.rol == null || b.rol === "" ? null : String(b.rol);
      if (rol !== null && !Object.hasOwn(AGENT_ROLLEN, rol)) { await d.sendJson(res, 400, { ok: false, fout: "Onbekende agent." }); return true; }
      if (b.actie === "intrekken") {
        // zonder rol: de oude gedeelde sleutel
        if (rol) delete L.sleutels[rol]; else L.sleutel = null;
        await log({ actie: rol ? "agents: sleutel van de " + AGENT_ROLLEN[rol].wie + " ingetrokken" : "agents: gedeelde sleutel ingetrokken" });
        return klaar();
      }
      if (!rol) { await d.sendJson(res, 400, { ok: false, fout: "Een gedeelde sleutel voor alle agents kan niet meer. Kies de agent waarvoor je een sleutel maakt." }); return true; }
      // de sleutel is één keer te zien, nu; de server bewaart alleen de afdruk
      const nieuw = soort === "demo" ? "fpa_" + "demo".repeat(12) : nieuweSleutel();
      L.sleutels[rol] = { ...(soort === "demo" ? {} : { hash: sleutelHash(nieuw) }), gemaakt: t, door: wie };
      await log({ actie: "agents: nieuwe sleutel voor de " + AGENT_ROLLEN[rol].wie });
      return klaar({ nieuweSleutel: nieuw, rol });
    }
    if (!R.has("agents")) return weiger("agents");

    if (wat === "pauze") {
      L.pauze = b.aan ? { door: wie, op: t } : null;
      await log({ actie: b.aan ? "agents: alle agents stilgezet" : "agents: stilzetten opgeheven" });
      return klaar();
    }
    if (wat === "agent") {
      const rol = String(b.rol || "");
      if (!Object.hasOwn(AGENT_ROLLEN, rol)) { await d.sendJson(res, 400, { ok: false, fout: "Onbekende agent." }); return true; }
      const was = L.agents[rol] || { stand: "uit" }, nieuw = { ...was };
      if (b.stand !== undefined) {
        if (!AGENT_STANDEN.includes(b.stand)) { await d.sendJson(res, 400, { ok: false, fout: "Onbekende stand." }); return true; }
        if (b.stand === "aan" && AGENT_ROLLEN[rol].alleenProef) { await d.sendJson(res, 409, { ok: false, fout: "De " + AGENT_ROLLEN[rol].titel.toLowerCase() + " kan voorlopig alleen op proef: het gedeelde geheugen bestaat nog alleen in de demo." }); return true; }
        nieuw.stand = b.stand;
      }
      if (b.mergen !== undefined) {
        if (rol !== "tech" || typeof b.mergen !== "boolean") { await d.sendJson(res, 400, { ok: false, fout: "Zelf mergen is alleen voor de tech-agent in te stellen." }); return true; }
        nieuw.mergen = b.mergen;
      }
      L.agents[rol] = { ...nieuw, door: wie, op: t };
      await log({ actie: "agents: " + AGENT_ROLLEN[rol].wie + " op ‘" + nieuw.stand + "’" + (rol === "tech" ? ", zelf mergen " + (nieuw.mergen ? "aan" : "uit") : "") });
      return klaar();
    }
    if (wat === "demoronde") {
      const rol = b.rol;
      if (soort !== "demo" || !["staf", "groei"].includes(rol)) { await d.sendJson(res, 403, { ok: false, fout: "Een modelronde is alleen voor staf en groei in de demo." }); return true; }
      const gestopt = () => echt.pauze || demo.pauze || demo.agents[rol]?.stand !== "proef";
      if (gestopt()) { await d.sendJson(res, 423, { ok: false, fout: "Zet deze demo-agent op proef en hef een eventuele stop op." }); return true; }
      if (!d.demoModelAan?.()) { await d.sendJson(res, 503, { ok: false, fout: "Nog geen model gekoppeld: de server mist de Anthropic API-sleutel." }); return true; }
      if (modelBezig) { await d.sendJson(res, 409, { ok: false, fout: "Er loopt al een modelronde. Wacht tot die klaar is." }); return true; }
      if (telDag(echt, "demomodel|" + rol, Date.now()) >= DEMO_RONDES_PER_DAG) { await d.sendJson(res, 429, { ok: false, fout: `De ${DEMO_RONDES_PER_DAG} modelrondes voor deze agent zijn vandaag gebruikt, inclusief mislukte pogingen.` }); return true; }
      modelBezig = true;
      const startDemo = demo, ronde = nieuwId("r").toLowerCase();
      try {
        const invoer = demoModelInvoer(rol, werkVoor(rol, "demo", demo.agents[rol]));
        // Reserveer vóór de externe aanvraag. Demo resetten of herstarten geeft geen nieuw budget.
        plusDag(echt, "demomodel|" + rol, Date.now());
        await bewaar();
        const plan = leesDemoPlan(await d.demoModelVraag({ ...invoer, model: DEMO_MODEL, schema: DEMO_SCHEMA }));
        if (demo !== startDemo || gestopt()) { await d.sendJson(res, 409, { ok: false, fout: "De demo is gestopt of opnieuw begonnen. Het modelantwoord is niet verwerkt." }); return true; }
        const verslag = keurVerslag({ tekst: plan.samenvatting });
        if (!verslag.ok) throw new Error("ongeldig-modelverslag");
        const resultaten = plan.acties.map((a, i) => {
          const body = { ...a.gegevens, sleutel: ronde + "-" + i };
          const r = poort(demo.geheugen, { rol, actie: a.actie, b: body, nu: Date.now(), uitvoer: (G) => voerUit(G, { rol, actie: a.actie, b: body, nu: Date.now() }) });
          return { actie: a.actie, status: r.status, ...r.body };
        });
        demo.verslagen.unshift({ id: nieuwId("v"), t: new Date().toISOString(), rol, model: DEMO_MODEL, ...verslag.verslag,
          punten: resultaten.map((r) => ({ soort: r.ok ? "gedaan" : "let-op", tekst: r.ok ? r.actie + ": opgeslagen in de demo; eventueel akkoord blijft nodig." : r.actie + ": geweigerd. " + (r.fouten?.join(" ") || r.fout || "Controleer de regels.") })) });
        demo.verslagen = demo.verslagen.slice(0, 60);
        demo.gezien[rol] = new Date().toISOString();
        om.demoGewijzigd?.();
        modelBezig = false;
        return await c.klaar({ modelRonde: { model: DEMO_MODEL, resultaten } });
      } catch (e) {
        // Alleen vaste categorieën teruggeven; nooit providertekst of modelinhoud lekken.
        const m = String(e?.message || "");
        const code = e?.name === "TimeoutError" ? "model-timeout"
          : m === "modelantwoord-afgebroken" ? "modelantwoord-afgebroken"
          : m === "ongeldig-modelverslag" ? "verslag-geweigerd"
          : m === "ongeldig-modelantwoord" || e instanceof SyntaxError ? "modelantwoord-ongeldig"
          : m === "ai-tegoed" ? "model-tegoed"
          : /^api \d+/.test(m) ? "model-provider" : "model-verwerking";
        const uitleg = {
          "modelantwoord-afgebroken": "Het modelantwoord is afgebroken door de uitvoerlimiet; er zijn geen acties verwerkt.",
          "model-timeout": "Het taalmodel antwoordde niet binnen een minuut.",
          "verslag-geweigerd": "Het modelverslag voldoet niet aan de privacy- of tekstregels; er zijn geen acties verwerkt.",
          "modelantwoord-ongeldig": "Het taalmodel gaf geen volledig geldig antwoord; er zijn geen acties verwerkt.",
          "model-tegoed": "De modelprovider meldt onvoldoende tegoed.",
          "model-provider": "De modelprovider heeft de aanvraag geweigerd.",
          "model-verwerking": "Het verwerken of opslaan is mislukt. Controleer de takenlijst voordat je opnieuw probeert."
        }[code];
        await d.sendJson(res, 502, { ok: false, code, fout: uitleg + " De poging telt mee voor de daglimiet. Er volgt geen automatische herhaling." });
        return true;
      } finally { modelBezig = false; }
    }
    // het gedeelde geheugen: een taak, een concept van de groei-agent of een afmelding (alleen demo)
    if (wat === "taak" || wat === "groei" || wat === "afmelding") {
      if (soort !== "demo") { await d.sendJson(res, 409, { ok: false, fout: "Het gedeelde geheugen bestaat nog alleen in de demo." }); return true; }
      const G = demo.geheugen, nu = Date.now();
      const r = wat === "taak" ? besluitTaak(G, { id: b.id, besluit: b.besluit, reden: schoon(b.reden, 200), wie, nu })
        : wat === "groei" ? besluitConcept(G, { id: b.id, besluit: b.besluit, reden: schoon(b.reden, 200), wie, nu })
        : meldAf(G, { contact: b.contact, wie, nu });
      if (r.status !== 200) { await d.sendJson(res, r.status, r.body); return true; }
      return c.klaar();
    }
    if (wat === "concept" && b.besluit === "nagekeken") {
      // alleen voor een bericht met onbekende uitkomst: de beheerder keek bij de mailprovider na of
      // het aankwam. Opnieuw versturen kan hier bewust niet.
      const k = L.concepten.find((x) => x.id === b.id && x.stand === "onbekend");
      if (!k) { await d.sendJson(res, 404, { ok: false, fout: "Geen bericht met een onbekende uitkomst met dit id." }); return true; }
      if (b.uitkomst !== "verstuurd" && b.uitkomst !== "niet-verstuurd") { await d.sendJson(res, 400, { ok: false, fout: "Kies verstuurd of niet-verstuurd." }); return true; }
      Object.assign(k, { stand: b.uitkomst, door: wie, op: k.t, nagekeken: { door: wie, op: t } });
      await log({ actie: "agents: uitkomst van een eigen bericht nagekeken: " + b.uitkomst, praktijk: k.pk, naam: k.praktijk, reden: k.onderwerp });
      return klaar();
    }
    if (wat === "concept") {
      const k = L.concepten.find((x) => x.id === b.id && x.stand === "wacht");
      if (!k) { await d.sendJson(res, 404, { ok: false, fout: "Dit concept is er niet meer, of er is al over beslist." }); return true; }
      if (b.besluit === "afwijzen") {
        Object.assign(k, { stand: "afgewezen", door: wie, op: t, reden: schoon(b.reden, 200) });
        await log({ actie: "agents: eigen bericht afgewezen", praktijk: k.pk, naam: k.praktijk, reden: k.onderwerp });
        return klaar();
      }
      if (b.besluit !== "verstuur") { await d.sendJson(res, 400, { ok: false, fout: "Kies verstuur of afwijzen." }); return true; }
      const { bron, s } = om.staat(soort);
      const z = zakenVoor(k.rol, bron, s).find((x) => x.sleutel === k.sleutel);
      if (!z) {
        Object.assign(k, { stand: "vervallen", op: t });
        if (soort === "echt") await bewaar();
        await d.sendJson(res, 409, { ok: false, fout: "Deze zaak is intussen opgelost; het concept is vervallen en er is niets verstuurd." });
        return true;
      }
      if (soort === "echt" && (s.agent.stand["eigen-bericht"] || "uit") === "uit") { await d.sendJson(res, 409, { ok: false, fout: "Eigen berichten van agents staan uit. Zet de soort eerst op ‘handmatig’ bij de support-agent." }); return true; }
      if (soort === "echt" && !d.mailIngesteld()) { await d.sendJson(res, 503, { ok: false, fout: "Op deze server staat mail niet aan." }); return true; }
      const laatst = s.agent.verstuurd[z.sleutel] || 0;
      if (laatst && bron.nu - laatst < 7 * DAG) { await d.sendJson(res, 409, { ok: false, fout: "Voor deze zaak is deze week al gemaild." }); return true; }
      // ook bij akkoord: één eigen bericht per praktijk per week, over alle rollen heen
      if (k.pk && L.concepten.some((x) => x !== k && x.pk === k.pk && (x.stand === "bezig" || x.stand === "onbekend" || (x.stand === "verstuurd" && aanleidingVan(x.soort) === aanleidingVan(k.soort) && bron.nu - Date.parse(x.op || x.t) < 7 * DAG)))) {
        await d.sendJson(res, 409, { ok: false, fout: "Deze praktijk kreeg deze week al een eigen bericht over dit onderwerp, of er is een bericht waarvan de uitkomst nog moet worden nagekeken. Wijs dit concept af of wacht." });
        return true;
      }
      req.beheerGelogd = true; // verstuurZaak schrijft de regel in het beheerlogboek, met wie akkoord gaf
      // dubbelklik of twee beheerders tegelijk: het concept staat op "bezig" zolang de mail onderweg is
      k.stand = "bezig";
      let n = 0;
      try { n = await stuurEigen(soort, s, bron, z, k, k.rol, wie); } catch { n = 0; }
      if (!n) { k.stand = "wacht"; await d.sendJson(res, 502, { ok: false, fout: "De mail kon niet weg (of dit adres kreeg het afgelopen uur al drie mails). Er is niets veranderd." }); return true; }
      Object.assign(k, { stand: "verstuurd", door: wie, op: t, aan: n });
      return klaar();
    }
    return false;
  }

  // de demo van het loket bewaren en terugzetten (lib/beheer-omgeving-routes.js, beheer-demo.json).
  // demoIn zet alleen een demo terug die de vorm heeft die deze code verwacht; anders false.
  const demoUit = () => demo;
  function demoIn(o) {
    const obj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    if (!obj(o) || typeof o.zout !== "string" || !o.zout.startsWith("demo-")) return false;
    if (![o.sleutels, o.agents, o.gezien, o.dag, o.geheugen, o.fouten].every(obj) || ![o.concepten, o.verslagen, o.notities, o.pogingen, o.accounts].every(Array.isArray)) return false;
    onbekendNaHerstart(o.concepten);
    demo = o;
    return true;
  }

  // art. 17 AVG: bij het wissen van een praktijk gaan ook de berichten van de agents aan die
  // praktijk weg (praktijknaam, onderwerp en tekst). Alleen echt; de demo heeft verzonnen praktijken.
  async function wisPraktijk(pk) {
    const voor = echt.concepten.length;
    echt.concepten = echt.concepten.filter((c) => c.pk !== pk);
    const weg = voor - echt.concepten.length;
    if (weg) await bewaar();
    return weg;
  }

  return { laad, tik, nieuweDemo, voorPagina, afhandelenAgent, afhandelenBeheer, demoUit, demoIn, wisPraktijk };
}
