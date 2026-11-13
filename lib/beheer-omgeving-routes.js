// De routes van de beheer- en finance-omgeving: /dashboard88/omgeving en /api/beheer/omgeving/*.
//
// Los van server.js, zodat die niet nog groter wordt: de server geeft hier zijn eigen hulpjes aan
// (inloggen van beheer, antwoorden, mail, het beheerlogboek) en een functie die de echte bron
// bouwt. Het rekenwerk staat in lib/beheer-omgeving.js, de nepgegevens in lib/beheer-demo.js.
//
// Twee bronnen, strikt gescheiden:
// - "echt": de gegevens van de server. Instellingen, kosten en wat de agent verstuurde staan in
//   eigen bestanden in de datamap (finance-instellingen.json, finance-kosten.json, beheer-agent.json).
// - "demo": nepgegevens. Wat beheer en de agents op proef in demo veranderen (btw-keuze, kosten,
//   concepten, notities, het postvak) staat in één eigen bestand, beheer-demo.json, zodat een
//   uitrol of herstart een lopende test niet wist. Dat bestand raakt de echte bestanden niet en staat
//   niet in de reservekopie. Het wordt alleen gewist met "Demo opnieuw beginnen"; is het bij het
//   starten niet te lezen of van een andere vorm, dan gaat het opzij (beheer-demo.<reden>-<tijd>.json)
//   en ziet beheer op de pagina waarom de demo opnieuw begon. In demo gaat er nooit een mail weg.
//
// Mail naar echte adressen: per soort bericht staat de agent standaard op "uit". Pas als een
// beheerder met een eigen account een soort op "handmatig" of "automatisch" zet (in het logboek),
// kan er voor die soort iets naar een praktijk. Een storingsbericht is altijd handmatig en vraagt
// het aantal ontvangers als bevestiging.
//
// Rechten: een beheeraccount met een lijst `rechten` ziet en doet hier alleen wat in die lijst
// staat (lib/beheer-toegang.js); wat het niet mag zien, wordt voor dat account niet eens berekend.
// Agents met taalmodel komen binnen via het loket (lib/beheer-loket-routes.js).
import { readFile, rename, copyFile, constants as fsc } from "node:fs/promises";
import { join } from "node:path";
import { praktijkOverzicht, supportRonde, storingOntvangers, financeOverzicht, financeAgent, financeInstellingen, jaarControle, jaarCijfers, jaarStand, exportCsv,
  MAIL_SOORTEN, STORING_SJABLONEN, jaarVan, kwartaalVan, maakGebruik } from "./beheer-omgeving.js";
import { demoBron, demoInstellingen, demoAgent, DEMO_LEVERANCIER } from "./beheer-demo.js";
import { RECHTEN, ALLE_RECHTEN } from "./beheer-toegang.js";
import { maakLoket, merkAntwoord } from "./beheer-loket-routes.js";

// server.js meldt hier elk antwoord dat de deur uit is: de tech-agent leest de telling van fouten
export { merkAntwoord };

// Wat de server over gebruik meet (zie maakGebruik). Eén telling per proces, op moduleniveau:
// server.js roept merkGezien aan bij elk verzoek met een geldige eigen login en merkLoginMis bij
// een fout wachtwoord, ook al voordat de omgeving hieronder is opgezet.
const gebruik = maakGebruik();
let kenLid = null; // (email) => bestaat er een login met dit adres? Gezet door maakBeheerOmgeving.
export function merkGezien(pk, lid) { if (pk && lid) gebruik.gezien(String(pk), String(lid), Date.now()); }
// alleen adressen van bestaande logins: een willekeurig ingetikt adres wordt niet bewaard
export function merkLoginMis(email) { if (email && kenLid && kenLid(email)) gebruik.loginMis(String(email), Date.now()); }

const STANDEN = new Set(["uit", "handmatig", "automatisch"]);
// De vorm van beheer-demo.json. Verhoog dit getal als de vorm van de demo verandert: een bewaarde
// demo van een andere vorm wordt dan niet teruggezet: dat bestand gaat opzij en de demo begint
// opnieuw, met de reden zichtbaar op de pagina.
const DEMO_VERSIE = 1;
const RONDE_MS = 10 * 60e3;
const RONDE_MAX = 25;
const MAIL_PAUZE_MS = 600;
const schoon = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, max);

// Per dag (UTC) van de laatste 30: het deel van de minuten waarin de server een tik zette. De
// eerste dag telt vanaf de eerste tik, vandaag tot nu. Dagen met minder dan tien minuten meting
// doen niet mee.
export function beschikbaarheid(hart, nu) {
  const uit = [];
  if (!hart || !hart.eerste) return uit;
  for (let i = 29; i >= 0; i--) {
    const start = Date.UTC(new Date(nu).getUTCFullYear(), new Date(nu).getUTCMonth(), new Date(nu).getUTCDate() - i);
    const van = Math.max(start, hart.eerste), tot = Math.min(start + 86400e3, nu);
    const verwacht = Math.floor((tot - van) / 60e3);
    if (verwacht < 10) continue;
    const datum = new Date(start).toISOString().slice(0, 10);
    const n = Number(hart.dagen[datum]) || 0;
    uit.push({ datum, pct: Math.round(Math.min(100, n / verwacht * 100) * 100) / 100 });
  }
  return uit;
}

export function maakBeheerOmgeving(d) {
  const paden = {
    instellingen: join(d.dataDir, "finance-instellingen.json"),
    kosten: join(d.dataDir, "finance-kosten.json"),
    agent: join(d.dataDir, "beheer-agent.json"),
    hartslag: join(d.dataDir, "beheer-hartslag.json"),
    gebruik: join(d.dataDir, "beheer-gebruik.json"),
    // de demo, zodat een uitrol of herstart een lopende test niet wist. Een eigen bestand met alleen
    // verzonnen gegevens: het staat niet in de reservekopie en raakt de echte bestanden niet.
    demo: join(d.dataDir, "beheer-demo.json")
  };
  kenLid = d.lidBekend || null;
  // Beschikbaarheid, gemeten door de server zelf: elke minuut één tik per dag. Stond de server
  // stil (een uitrol, een storing), dan ontbreken die minuten. Een storing waarbij de server wel
  // draait maar niet bereikbaar is, ziet hij zo niet: daarvoor komt de bewaker van buitenaf.
  const hart = { eerste: 0, laatste: 0, dagen: {} };
  const legeAgent = () => ({ stand: {}, verstuurd: {}, rondes: [], open: null, logboek: [], laatsteRonde: null });
  const echt = { inst: {}, kosten: [], agent: legeAgent() };
  let demo = null;
  // De demo begint met een agent die al een week werkt: twee soorten op automatisch, één op
  // handmatig, een logboek en een postvak. Zo is meteen te zien wat de agent doet; in echt staat
  // alles uit tot een beheerder het aanzet. Van de ingediende aangiftes liggen de bedragen vast,
  // en bij één kwartaal kwam er daarna nog een bon bij, zodat het verschil te zien is.
  // demoGeblokkeerd: het bewaarde bestand kon niet opzij; dan nooit eroverheen schrijven
  let demoGemaakt = 0, demoVuil = false, demoReset = null, demoGeblokkeerd = null;
  const nieuweDemo = () => {
    demoGemaakt = Date.now();
    const nu = Date.now(), bron = demoBron(nu), inst = demoInstellingen(nu), a = demoAgent(bron);
    const fin = financeOverzicht(bron, inst);
    const ingediend = fin.btw.filter((b) => b.stand === "ingediend");
    ingediend.forEach((b, i) => {
      const extra = i === 1 ? 2100 : 0; // één bon met 21,00 btw kwam na het indienen
      inst.aangiftes[b.kwartaal].bedragen = { omzet: b.r1a.omzet, btw: b.r1a.btw, voorbelasting: b.r5b - extra, teBetalen: b.teBetalen + extra };
    });
    // eigen berichten van de agents met taalmodel staan in de demo op handmatig: zo zijn de
    // concepten te zien die op akkoord wachten
    demo = { inst, kosten: [], agent: { ...legeAgent(), stand: { ...a.stand, "eigen-bericht": "handmatig" }, verstuurd: a.verstuurd, rondes: a.rondes, open: a.open, logboek: a.logboek, laatsteRonde: a.rondes[0]?.t || null }, mails: a.mails };
    loket.nieuweDemo(bron, supportRonde(bron, { stand: demo.agent.stand, verstuurd: demo.agent.verstuurd }), fin, ingediend[1] ? ingediend[1].kwartaal : "");
  };
  // het loket voor de agents met taalmodel; het leest de bron en verstuurt via deze omgeving
  // het loket antwoordt via stuur(): een verandering in de demo is opgeslagen vóór het antwoord
  const loket = maakLoket({ ...d, sendJson: (...a) => stuur(...a) }, { staat: (soort) => staat(soort), verstuurZaak: (...a) => verstuurZaak(...a), leverancier: (soort) => (soort === "demo" ? DEMO_LEVERANCIER : d.leverancier()), demoGewijzigd: () => { demoVuil = true; } });
  nieuweDemo();

  // De demo bewaren en terugzetten. Alleen het eigen bestand beheer-demo.json. Opslaan gaat op
  // volgorde: elke opdracht neemt een momentopname op het moment zelf, en de schrijfacties lopen
  // achter elkaar, zodat een oudere stand nooit een nieuwere overschrijft. Een fout komt terug bij
  // wie opslaat; de demo blijft dan "vuil", zodat de klok het opnieuw probeert.
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  let demoRij = Promise.resolve();
  function bewaarDemo() {
    if (demoGeblokkeerd) { demoVuil = true; return Promise.reject(new Error(demoGeblokkeerd)); }
    demoVuil = false;
    const foto = structuredClone({ versie: DEMO_VERSIE, gemaakt: demoGemaakt, bewaard: Date.now(), reset: demoReset, omgeving: demo, loket: loket.demoUit() });
    const klus = demoRij.then(() => d.saveJson(paden.demo, foto));
    demoRij = klus.catch(() => {});
    return klus.catch((err) => { demoVuil = true; throw err; });
  }
  // Antwoorden op een verzoek. Een verzoek dat de demo wijzigde (res.demoWijzigt) wacht altijd op
  // een eigen save: die neemt de momentopname nu, dus na zijn eigen wijziging, en staat in de rij
  // achter alle eerdere. Op "demoVuil" alleen vertrouwen kan niet: een ander verzoek kan die vlag al
  // hebben gewist met een momentopname van vóór deze wijziging. Lukt de save niet, dan geen succes
  // maar 500, want na een herstart zou de wijziging weg zijn. Een verzoek aan de echte kant of een
  // lezer krijgt gewoon zijn antwoord; ligt er nog iets, dan gaat dat mee in een save op de achtergrond.
  async function stuur(res, code, body) {
    if (res.demoWijzigt) {
      try { await bewaarDemo(); }
      catch (err) {
        console.error("demo bewaren:", err.message);
        if (code < 400) return d.sendJson(res, 500, { ok: false, opslagFout: true, fout: "De demo kon niet worden opgeslagen. Deze wijziging staat nu alleen in het geheugen en is na een herstart weg. Probeer het opnieuw." });
      }
    } else if (demoVuil && !demoGeblokkeerd) bewaarDemo().catch((err) => console.error("demo bewaren:", err.message));
    return d.sendJson(res, code, body);
  }
  // Een bestand dat niet terug kan, gaat opzij (niet weg), en de reden komt op de pagina. Lukt
  // verplaatsen niet, dan kopiëren (nooit over een bestaand bestand heen). Lukt ook dat niet, dan
  // blijft het origineel staan en schrijft de demo er niet overheen (demoGeblokkeerd): de demo werkt
  // dan alleen in het geheugen, en elke wijziging krijgt een fout tot beheer het bestand nakijkt.
  // (d.demoFs bestaat alleen in de test, om een mislukte verplaatsing na te bootsen.)
  async function zetOpzij(soort, reden) {
    const op = new Date().toISOString();
    const bestand = "beheer-demo." + soort + "-" + op.replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 6) + ".json";
    try { await (d.demoFs?.rename || rename)(paden.demo, join(d.dataDir, bestand)); return { op, reden, bestand }; }
    catch (err) { console.error("demo opzij zetten:", err.message); }
    try { await (d.demoFs?.copyFile || copyFile)(paden.demo, join(d.dataDir, bestand), fsc.COPYFILE_EXCL); return { op, reden, bestand }; }
    catch (err) { console.error("demo opzij kopiëren:", err.message); }
    demoGeblokkeerd = "het demobestand kon niet opzij en wordt niet overschreven";
    return { op, reden: reden + " Het kon niet apart worden gezet; daarom blijft het staan en wordt de demo niet bewaard tot iemand het bestand nakijkt.", bestand: null };
  }
  async function laadDemo() {
    let tekst = null, o = null;
    try { tekst = await readFile(paden.demo, "utf8"); }
    catch (err) {
      // er is (nog) geen demobestand: gewoon beginnen. Een andere leesfout (rechten, schijf): het
      // bestand kan er nog zijn, dus nooit eroverheen schrijven
      if (err.code !== "ENOENT") {
        console.error("demo lezen:", err.message);
        nieuweDemo();
        demoGeblokkeerd = "het demobestand kon niet worden gelezen en wordt niet overschreven";
        demoReset = { op: new Date().toISOString(), reden: "Het bewaarde demobestand kon niet worden gelezen (" + String(err.code || "fout").slice(0, 20) + "). Het blijft staan; de demo wordt niet bewaard tot iemand het bestand nakijkt.", bestand: null };
        return false;
      }
    }
    if (tekst === null) { nieuweDemo(); demoReset = null; await bewaarDemo().catch((err) => console.error("demo bewaren:", err.message)); return false; }
    try { o = JSON.parse(tekst); } catch {}
    const goed = isObj(o) && o.versie === DEMO_VERSIE && Number.isFinite(Number(o.gemaakt)) && isObj(o.omgeving)
      && isObj(o.omgeving.inst) && Array.isArray(o.omgeving.kosten) && isObj(o.omgeving.agent) && Array.isArray(o.omgeving.mails) && loket.demoIn(o.loket);
    if (goed) {
      demo = o.omgeving; demoGemaakt = Number(o.gemaakt);
      demoReset = isObj(o.reset) && typeof o.reset.reden === "string" ? { op: String(o.reset.op || ""), reden: o.reset.reden.slice(0, 200), bestand: typeof o.reset.bestand === "string" ? o.reset.bestand : null } : null;
      return true;
    }
    const r = !isObj(o) ? await zetOpzij("onleesbaar", "Het bewaarde demobestand was niet te lezen.")
      : o.versie !== DEMO_VERSIE ? await zetOpzij("versie-" + String(o.versie).replace(/[^\w-]/g, "").slice(0, 10), "Het bewaarde demobestand had een andere vorm (versie " + String(o.versie).slice(0, 10) + ", nu " + DEMO_VERSIE + "), na een uitrol.")
      : await zetOpzij("onbekend", "Het bewaarde demobestand had een onbekende vorm.");
    nieuweDemo();
    demoReset = r;
    console.error("demo opnieuw begonnen:", r.reden, r.bestand || "(niet opzij gezet)");
    await bewaarDemo().catch((err) => console.error("demo bewaren:", err.message));
    return false;
  }

  async function laad() {
    const lees = async (p, std) => { try { const v = JSON.parse(await readFile(p, "utf8")); return v && typeof v === "object" ? v : std; } catch { return std; } };
    echt.inst = await lees(paden.instellingen, {});
    const k = await lees(paden.kosten, { kosten: [] });
    echt.kosten = Array.isArray(k.kosten) ? k.kosten : [];
    const a = await lees(paden.agent, {});
    const h = await lees(paden.hartslag, {});
    hart.eerste = Number(h.eerste) || 0;
    hart.laatste = Number(h.laatste) || 0;
    hart.dagen = h.dagen && typeof h.dagen === "object" ? h.dagen : {};
    echt.agent = { stand: a.stand && typeof a.stand === "object" ? a.stand : {}, verstuurd: a.verstuurd && typeof a.verstuurd === "object" ? a.verstuurd : {}, rondes: Array.isArray(a.rondes) ? a.rondes.slice(0, 50) : [],
      open: a.open && typeof a.open === "object" ? a.open : null, logboek: Array.isArray(a.logboek) ? a.logboek.slice(0, 200) : [], laatsteRonde: a.laatsteRonde || null };
    gebruik.laad(await lees(paden.gebruik, null));
    await loket.laad();
    await laadDemo();
    tik();
  }
  // wat bij een gewiste praktijk of login hoorde, verdwijnt ook uit de meting: één keer per dag,
  // op het moment dat de bron toch al gebouwd is
  let gesnoeid = "";
  function snoeiGebruik(bron) {
    const dag = new Date(bron.nu).toISOString().slice(0, 10);
    if (gesnoeid === dag) return;
    gesnoeid = dag;
    const leden = new Map(bron.praktijken.map((p) => [p.pk, new Set((p.leden || []).map((l) => l.id))]));
    gebruik.snoei((pk, lid) => leden.has(pk) && (lid == null || leden.get(pk).has(lid)), bron.nu);
  }
  const bewaarAgent = () => d.saveJson(paden.agent, echt.agent);
  // de sleutel van een zaak is "soort|pk|lid" (lib/beheer-omgeving.js)
  const pkVanSleutel = (k) => String(k).split("|")[1] || "";

  // elke klokminuut telt één keer, ook als de server in die minuut herstartte
  function tik(nu = Date.now()) {
    const minuut = Math.floor(nu / 60e3);
    if (minuut <= hart.laatste) return false;
    hart.laatste = minuut;
    if (!hart.eerste) hart.eerste = nu;
    const dag = new Date(nu).toISOString().slice(0, 10);
    hart.dagen[dag] = (hart.dagen[dag] || 0) + 1;
    const dagen = Object.keys(hart.dagen).sort();
    while (dagen.length > 60) delete hart.dagen[dagen.shift()];
    d.saveJson(paden.hartslag, hart).catch(() => {});
    if (gebruik.vuil()) d.saveJson(paden.gebruik, gebruik.uit()).catch(() => {});
    loket.tik(nu);
    if (demoVuil && !demoGeblokkeerd) bewaarDemo().catch((err) => console.error("demo bewaren:", err.message));
    return true;
  }
  const hartTimer = setInterval(tik, 30e3);
  hartTimer.unref?.();

  // de bron en de staat die bij een verzoek hoort
  function staat(soort) {
    if (soort === "demo") {
      const b = demoBron();
      b.kosten = [...b.kosten, ...demo.kosten];
      return { soort, bron: b, s: demo };
    }
    const b = d.bronEcht();
    b.kosten = echt.kosten;
    b.systeem.beschikbaarheid = beschikbaarheid(hart, b.nu);
    // wat de server zelf meet, over de bron heen: laatst gezien (in plaats van alleen de laatste
    // login), foute wachtwoorden van de laatste 24 uur en het aantal actieve therapeuten per dag
    snoeiGebruik(b);
    b.systeem.gebruikSinds = gebruik.sinds() || null;
    for (const p of b.praktijken) {
      if (p.status === "v1") continue;
      p.actiefDagen = gebruik.dagen(p.pk, b.nu);
      for (const l of p.leden || []) {
        l.loginMis = l.email ? gebruik.misSinds(l.email, l.laatst || 0, b.nu) : 0;
        l.laatst = Math.max(l.laatst || 0, gebruik.laatst(p.pk, l.id)) || null;
      }
    }
    return { soort: "echt", bron: b, s: echt };
  }
  const bronVan = (req, body) => {
    const v = (body && body.bron) || new URL(req.url, "http://x").searchParams.get("bron");
    return v === "demo" ? "demo" : "echt";
  };

  // Eén ronde van de support-agent. Zaken waarvoor de soort op "automatisch" staat en die de
  // afgelopen week nog niet zijn gemaild, krijgen nu hun mail (echt) of een nepverzending (demo).
  // De agent houdt bij welke zaken open staan: wat er nieuw bij komt en wat verdwijnt (opgelost)
  // komt in zijn logboek, zodat te zien is wat hij deed en wat het opleverde.
  async function ronde(soort, wie = "agent") {
    const { bron, s } = staat(soort);
    const zaken = supportRonde(bron, { stand: s.agent.stand, verstuurd: s.agent.verstuurd });
    const t = new Date(bron.nu).toISOString();
    const schrijf = (regel) => { s.agent.logboek.unshift({ t, ...regel }); };
    const vorige = s.agent.open, open = {};
    let nieuw = 0, opgelost = 0;
    for (const z of zaken) {
      open[z.sleutel] = (vorige && vorige[z.sleutel]) || { praktijk: z.praktijk, tekst: z.tekst, sinds: bron.nu };
      if (vorige && !vorige[z.sleutel]) { nieuw++; schrijf({ wat: "nieuw", pk: z.pk, praktijk: z.praktijk, tekst: z.tekst }); }
    }
    for (const [k, v] of Object.entries(vorige || {})) {
      if (open[k]) continue;
      opgelost++;
      schrijf({ wat: "opgelost", pk: pkVanSleutel(k), praktijk: v.praktijk, tekst: v.tekst, gemaild: !!s.agent.verstuurd[k], dagen: Math.max(0, Math.round((bron.nu - (v.sinds || bron.nu)) / 86400e3)) });
    }
    if (!vorige && zaken.length) schrijf({ wat: "start", tekst: zaken.length + (zaken.length === 1 ? " open zaak" : " open zaken") + " bij de eerste ronde" });
    s.agent.open = open;
    let verstuurd = 0;
    // hooguit 25 zaken per ronde, in echt met een korte pauze: de mailprovider remt bij veel
    // tegelijk, en wat nu niet meegaat, gaat tien minuten later
    for (const z of zaken.filter((x) => x.nu).slice(0, RONDE_MAX)) {
      if (soort === "echt" && verstuurd) await new Promise((r) => setTimeout(r, MAIL_PAUZE_MS));
      verstuurd += await verstuurZaak(soort, s, z, wie);
    }
    // wat ouder is dan een maand hoeft de agent niet meer te onthouden
    for (const [k, ms] of Object.entries(s.agent.verstuurd)) if (bron.nu - ms > 30 * 86400e3 && !open[k]) delete s.agent.verstuurd[k];
    s.agent.logboek = s.agent.logboek.slice(0, 200);
    s.agent.laatsteRonde = t;
    const r = { t, wie, zaken: zaken.length, problemen: zaken.filter((z) => z.ernst === "probleem").length, verstuurd, nieuw, opgelost };
    // een ronde van de klok waarin niets gebeurde, hoeft niet in de lijst
    const gebeurd = verstuurd || nieuw || opgelost || !vorige;
    if (wie !== "agent" || gebeurd) { s.agent.rondes.unshift(r); s.agent.rondes = s.agent.rondes.slice(0, 50); }
    if (soort === "echt" && (wie !== "agent" || gebeurd)) await bewaarAgent().catch(() => {});
    return { ronde: r, zaken };
  }

  // `extra` is voor een eigen bericht van een agent met taalmodel: { actie, reden } voor het
  // beheerlogboek en `akkoord` (de beheerder die het concept goedkeurde)
  async function verstuurZaak(soort, s, z, wie, extra = {}) {
    let n = 0;
    for (const m of z.mails) {
      if (soort === "demo") { s.mails.unshift({ t: new Date().toISOString(), aan: m.aan, onderwerp: m.onderwerp, tekst: m.tekst, praktijk: z.praktijk, wie }); n++; continue; }
      if (!d.mailIngesteld() || /\.invalid$/i.test(m.aan) || d.mailOpSlot(m.aan)) continue;
      try { await d.stuurMail(m.aan, m.onderwerp, m.tekst); n++; } catch (err) { console.error("agent-mail mislukt:", err.message); }
    }
    if (soort === "demo") s.mails = s.mails.slice(0, 100);
    if (n) {
      s.agent.verstuurd[z.sleutel] = Date.now();
      s.agent.logboek.unshift({ t: new Date().toISOString(), wat: "gemaild", pk: z.pk, praktijk: z.praktijk, tekst: z.tekst, onderwerp: z.mails[0].onderwerp, aan: n, wie, ...(extra.akkoord ? { akkoord: extra.akkoord } : {}) });
      s.agent.logboek = s.agent.logboek.slice(0, 200);
      if (soort === "echt") {
        await bewaarAgent().catch(() => {});
        await d.beheerLog.schrijf({ wie: extra.akkoord || wie, actie: extra.actie || "support-agent mailde een praktijk", praktijk: z.pk, naam: z.praktijk, reden: extra.reden || MAIL_SOORTEN[z.soort]?.titel || z.soort, naar: z.mails.map((m) => d.maskeerEmail(m.aan)).join(", ") });
      }
    }
    return n;
  }

  // Een gewiste praktijk (Alles wissen, of 30 dagen na proef of abonnement) verdwijnt ook uit het
  // geheugen van de support-agent: logboekregels (praktijknaam, onderwerp), open zaken en wat
  // verstuurd is. Oude regels zonder pk herkennen we aan de naam. Daarna het loket (concepten).
  // Het beheerlogboek blijft: dat is de verantwoording van wie wat deed (eigen termijn).
  async function wisPraktijk(pk, naam) {
    if (!pk) return 0;
    const a = echt.agent, voor = a.logboek.length;
    a.logboek = a.logboek.filter((r) => (r.pk ? r.pk !== pk : !(naam && r.praktijk === naam)));
    let weg = voor - a.logboek.length;
    for (const k of Object.keys(a.open || {})) if (pkVanSleutel(k) === pk) { delete a.open[k]; weg++; }
    for (const k of Object.keys(a.verstuurd || {})) if (pkVanSleutel(k) === pk) { delete a.verstuurd[k]; weg++; }
    if (weg) await bewaarAgent();
    return weg + await loket.wisPraktijk(pk);
  }

  // De agent draait vanzelf, alleen voor echt. Staat er geen soort op automatisch, dan verstuurt
  // de ronde niets, maar houdt hij wel bij wat er nieuw is en wat is opgelost.
  const timer = setInterval(() => {
    ronde("echt").catch((err) => console.error("support-agent:", err.message));
  }, RONDE_MS);
  timer.unref?.();

  const ALLES = new Set(ALLE_RECHTEN);
  // Wat de pagina krijgt, naar de rechten van wie kijkt (R). Wat een account niet mag zien, wordt
  // gebouwd uit een lege bron: de vorm blijft gelijk, maar er staat niets in.
  const ideeenWacht = () => { try { const n = Number(d.ideeenWacht()); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch { return 0; } };
  function antwoord(soort, R = ALLES, wie = "") {
    const { bron, s } = staat(soort);
    const lev = soort === "demo" ? DEMO_LEVERANCIER : d.leverancier();
    const leeg = { ...bron, praktijken: [], facturen: [], kosten: [], systeem: { versie: "", uptimeUren: 0, checks: [], beschikbaarheid: [] } };
    const zien = (recht) => (R.has(recht) ? bron : leeg);
    const fin = financeOverzicht(zien("finance"), R.has("finance") ? s.inst : {});
    const nuJaar = jaarVan(bron.nu);
    const jaren = [...new Set([nuJaar, String(Number(nuJaar) - 1), ...fin.jaren.map((j) => j.periode)])].sort().reverse().slice(0, 4);
    const support = R.has("support");
    return {
      ok: true, bron: soort, nu: bron.nu, kwartaal: kwartaalVan(bron.nu),
      rechten: ALLE_RECHTEN.filter((r) => R.has(r)),
      // de ideeënbox (lib/ideeen-routes.js) is een eigen beheerpagina buiten deze omgeving: alleen
      // wie volledig beheer heeft komt er, en alleen die ziet hoeveel ideeën op een besluit wachten
      ...(R.has("beheer") && soort === "echt" && d.ideeenWacht ? { ideeen: { wacht: ideeenWacht() } } : {}),
      overzicht: praktijkOverzicht(zien("praktijken")),
      zaken: supportRonde(zien("support"), { stand: s.agent.stand, verstuurd: s.agent.verstuurd }),
      agent: { stand: s.agent.stand, rondes: support ? s.agent.rondes.slice(0, 12) : [], logboek: support ? s.agent.logboek.slice(0, 40).map(({ pk, ...r }) => r) : [], laatsteRonde: s.agent.laatsteRonde, elke: RONDE_MS / 60e3,
        soorten: MAIL_SOORTEN, sjablonen: STORING_SJABLONEN, mails: soort === "demo" && (support || R.has("berichten") || R.has("agents")) ? s.mails.slice(0, 30) : [] },
      ontvangers: { beheerders: storingOntvangers(zien("berichten"), { wie: "beheerders" }).length, iedereen: storingOntvangers(zien("berichten"), { wie: "iedereen" }).length },
      systeem: zien("praktijken").systeem,
      finance: fin,
      financeAgent: R.has("finance") ? financeAgent(bron, fin) : [],
      jaren: jaren.map((j) => ({ ...jaarControle(zien("finance"), R.has("finance") ? s.inst : {}, j, lev), ...jaarStand(fin, j) })),
      mail: soort === "demo" ? true : d.mailIngesteld(),
      ...(soort === "demo" && demoReset ? { demoReset } : {}),
      ...loket.voorPagina(soort, R, wie, bron)
    };
  }
  // welk recht een wijziging vraagt
  const ROUTE_RECHT = { mailstand: "agents", ronde: "support", verstuur: "support", storing: "berichten", finance: "boekhouding", aangifte: "boekhouding", afsluiten: "boekhouding", kosten: "finance" };

  const jaarDicht = (s, jaar) => !!(s.inst.afgesloten && s.inst.afgesloten[jaar]);
  const leesBody = async (req) => { try { const b = JSON.parse(await d.readBody(req)); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch { return null; } };

  // geeft true als het verzoek hier is afgehandeld. Elk antwoord gaat via stuur(), dat een
  // veranderde demo eerst opslaat; het vangnet hier vangt alleen een verzoek dat zonder antwoord
  // eindigde (zoals een fout halverwege), zodat ook dan niets blijft liggen.
  async function afhandelen(req, res, urlPath) {
    try { return await afhandelenBinnen(req, res, urlPath); }
    finally { if (demoVuil && !demoGeblokkeerd) await bewaarDemo().catch((err) => console.error("demo bewaren:", err.message)); }
  }
  async function afhandelenBinnen(req, res, urlPath) {
    if (urlPath === "/dashboard88/omgeving" || urlPath === "/dashboard88/omgeving/") {
      res.setHeader("x-robots-tag", "noindex, noarchive");
      res.setHeader("x-frame-options", "DENY");
      res.setHeader("cache-control", "no-store");
      res.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      try { await d.send(res, 200, "text/html; charset=utf-8", await readFile(join(d.publicDir, "beheer.html"))); }
      catch { await d.send(res, 404, "text/plain; charset=utf-8", "Not found"); }
      return true;
    }
    // het bestand zelf is geen adres: de pagina hoort bij /dashboard88/omgeving, met haar eigen koppen
    if (urlPath === "/beheer.html") { res.writeHead(302, { location: "/dashboard88/omgeving", "cache-control": "no-store" }); res.end(); return true; }
    // agents met taalmodel: geen beheeraccount maar de sleutel van de agents
    if (urlPath === "/api/agent" || urlPath.startsWith("/api/agent/")) return loket.afhandelenAgent(req, res, urlPath);
    if (!urlPath.startsWith("/api/beheer/omgeving")) return false;
    if (!d.beheerEigen(req)) { await d.denied(req, res, urlPath); return true; }
    const wie = req.beheerWie;
    // de rechten van dit account; met de sleutel van de server (of zonder opgave) alles
    const R = d.beheerRechten ? d.beheerRechten(req) : ALLES;
    const geenRecht = async (recht) => { await stuur(res, 403, { ok: false, geenRecht: recht, fout: "Je account heeft het recht ‘" + RECHTEN[recht].titel + "’ niet." }); return true; };

    if (urlPath === "/api/beheer/omgeving" && req.method === "GET") {
      await stuur(res, 200, antwoord(bronVan(req), R, wie));
      return true;
    }
    if (urlPath === "/api/beheer/omgeving/export" && req.method === "GET") {
      if (!R.has("finance")) return geenRecht("finance");
      const q = new URL(req.url, "http://x").searchParams;
      const soort = bronVan(req), jaar = /^\d{4}$/.test(q.get("jaar") || "") ? q.get("jaar") : "";
      const { bron, s } = staat(soort);
      const tekst = exportCsv(String(q.get("soort") || ""), financeOverzicht(bron, s.inst), jaar);
      if (!tekst) { await stuur(res, 404, { ok: false, fout: "Onbekende export." }); return true; }
      res.setHeader("content-disposition", 'attachment; filename="fysiplan-' + (soort === "demo" ? "DEMO-" : "") + q.get("soort") + (jaar ? "-" + jaar : "") + '.csv"');
      res.setHeader("cache-control", "no-store");
      if (soort === "echt") await d.beheerLog.schrijf({ wie, actie: "finance-export gedownload", reden: q.get("soort") + (jaar ? " " + jaar : ""), ip: d.beheerIp(req) });
      await d.send(res, 200, "text/csv; charset=utf-8", tekst);
      return true;
    }
    if (req.method !== "POST") return false;
    if (d.kruisSite(req)) { await d.weigerKruis(res); return true; }
    const b = await leesBody(req);
    if (!b) { await stuur(res, 400, { ok: false, fout: "Ongeldig verzoek." }); return true; }
    const soort = bronVan(req, b);
    const { s } = staat(soort);
    // Het beheerlogboek: een wijziging in echt krijgt hier haar eigen regel (de server schrijft dan
    // niet ook nog de algemene). Wat beheer in demo doet verandert niets echts en komt er niet in.
    if (soort === "demo") { req.beheerGelogd = true; demoVuil = true; res.demoWijzigt = true; }
    const log = (regel) => { if (soort !== "echt") return null; req.beheerGelogd = true; return d.beheerLog.schrijf({ wie, ...regel, ip: d.beheerIp(req) }); };
    const klaar = async (extra) => { await stuur(res, 200, { ...antwoord(soort, R, wie), ...(extra || {}) }); return true; };
    const nodig = ROUTE_RECHT[urlPath.slice("/api/beheer/omgeving/".length)];
    if (nodig && !R.has(nodig)) return geenRecht(nodig);

    if (urlPath === "/api/beheer/omgeving/demo-opnieuw") { nieuweDemo(); demoReset = null; demoVuil = true; await stuur(res, 200, antwoord("demo", R, wie)); return true; }

    if (urlPath === "/api/beheer/omgeving/mailstand") {
      const ms = String(b.soort || ""), st = String(b.stand || "");
      if (!Object.hasOwn(MAIL_SOORTEN, ms) || !STANDEN.has(st) || (ms === "storing" && st === "automatisch")) { await stuur(res, 400, { ok: false, fout: "Onbekende soort of stand." }); return true; }
      if (st === "uit") delete s.agent.stand[ms]; else s.agent.stand[ms] = st;
      if (soort === "echt") { await bewaarAgent(); await log({ actie: "support-agent: mails ‘" + MAIL_SOORTEN[ms].titel + "’ op " + st }); }
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/ronde") {
      await ronde(soort, wie);
      if (soort === "echt") await log({ actie: "support-agent: ronde met de hand gestart" });
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/verstuur") {
      const { bron } = staat(soort);
      const z = supportRonde(bron, { stand: s.agent.stand, verstuurd: s.agent.verstuurd }).find((x) => x.sleutel === b.sleutel);
      if (!z || !z.mails.length) { await stuur(res, 404, { ok: false, fout: "Deze zaak is er niet meer, of er is niemand om te mailen." }); return true; }
      if (soort === "echt" && (s.agent.stand[z.soort] || "uit") === "uit") { await stuur(res, 409, { ok: false, fout: "Mails van deze soort staan uit. Zet de soort eerst op ‘handmatig’ bij Instellingen van de agent." }); return true; }
      if (soort === "echt" && !d.mailIngesteld()) { await stuur(res, 503, { ok: false, fout: "Op deze server staat mail niet aan." }); return true; }
      if (z.verstuurd && z.opnieuwVanaf > bron.nu) { await stuur(res, 409, { ok: false, fout: "Voor deze zaak is deze week al gemaild." }); return true; }
      const n = await verstuurZaak(soort, s, z, wie);
      if (!n) { await stuur(res, 502, { ok: false, fout: "De mail kon niet weg (of dit adres kreeg het afgelopen uur al drie mails). Er is niets veranderd." }); return true; }
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/storing") {
      const { bron } = staat(soort);
      const naar = storingOntvangers(bron, { wie: b.wie === "iedereen" ? "iedereen" : "beheerders" });
      const onderwerp = schoon(b.onderwerp, 140).replace(/\s+/g, " ").trim(), tekst = schoon(b.tekst, 4000).trim();
      if (onderwerp.length < 5 || tekst.length < 20) { await stuur(res, 400, { ok: false, fout: "Vul een onderwerp en een bericht in." }); return true; }
      if (/\[[^\]]{2,40}\]/.test(tekst)) { await stuur(res, 400, { ok: false, fout: "Er staan nog [invulplekken] in het bericht." }); return true; }
      if (Number(b.bevestig) !== naar.length) { await stuur(res, 409, { ok: false, fout: "Bevestig het aantal ontvangers (" + naar.length + ")." , aantal: naar.length }); return true; }
      if (soort === "echt") {
        if ((s.agent.stand.storing || "uit") === "uit") { await stuur(res, 409, { ok: false, fout: "Storingsberichten staan uit. Zet ze eerst op ‘handmatig’ bij Instellingen van de agent." }); return true; }
        if (!d.mailIngesteld()) { await stuur(res, 503, { ok: false, fout: "Op deze server staat mail niet aan." }); return true; }
        await log({ actie: "storingsbericht verstuurd", reden: onderwerp, naar: naar.length + " adressen" });
        // achter elkaar, met een korte pauze: de mailprovider remt bij veel tegelijk
        (async () => { for (const o of naar) { if (/\.invalid$/i.test(o.email)) continue; try { await d.stuurMail(o.email, onderwerp, tekst); } catch (err) { console.error("storingsmail:", err.message); } await new Promise((r) => setTimeout(r, MAIL_PAUZE_MS)); } })();
      } else {
        for (const o of naar.slice(0, 5)) s.mails.unshift({ t: new Date().toISOString(), aan: o.email, onderwerp, tekst, praktijk: o.praktijk, wie });
        if (naar.length > 5) s.mails.unshift({ t: new Date().toISOString(), aan: "… en " + (naar.length - 5) + " anderen", onderwerp, tekst: "", praktijk: "", wie });
        s.mails = s.mails.slice(0, 100);
      }
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/finance") {
      const inst = financeInstellingen(s.inst);
      if (["onbekend", "inclusief", "exclusief"].includes(b.prijsBtw)) inst.prijsBtw = b.prijsBtw;
      if (["onbekend", "ja", "nee"].includes(b.kor)) inst.kor = b.kor;
      if (Number.isFinite(b.btwTarief) && [0, 9, 21].includes(b.btwTarief)) inst.btwTarief = b.btwTarief;
      Object.assign(s.inst, inst);
      if (soort === "echt") { await d.saveJson(paden.instellingen, s.inst); await log({ actie: "finance: btw-instelling gewijzigd", reden: "prijs " + inst.prijsBtw + " btw, KOR " + inst.kor + ", tarief " + inst.btwTarief + "%" }); }
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/aangifte") {
      const kw = String(b.kwartaal || "");
      if (!/^\d{4}-K[1-4]$/.test(kw)) { await stuur(res, 400, { ok: false, fout: "Onbekend kwartaal." }); return true; }
      if (jaarDicht(s, kw.slice(0, 4))) { await stuur(res, 409, { ok: false, fout: "Boekjaar " + kw.slice(0, 4) + " is afgesloten. Heropen het jaar om een aangifte te wijzigen." }); return true; }
      s.inst.aangiftes = s.inst.aangiftes && typeof s.inst.aangiftes === "object" ? s.inst.aangiftes : {};
      if (b.ingediend) {
        const { bron } = staat(soort);
        const rij = financeOverzicht(bron, s.inst).btw.find((x) => x.kwartaal === kw);
        if (!rij || rij.stand === "loopt") { await stuur(res, 409, { ok: false, fout: rij ? "Dit kwartaal loopt nog; de aangifte kan pas na afloop." : "In dit kwartaal zijn geen cijfers." }); return true; }
        // de bedragen van dit moment liggen vast: een latere wijziging valt dan op als verschil
        s.inst.aangiftes[kw] = { door: wie, op: new Date().toISOString(), kenmerk: schoon(b.kenmerk, 60), bedragen: { omzet: rij.r1a.omzet, btw: rij.r1a.btw, voorbelasting: rij.r5b, teBetalen: rij.teBetalen } };
      } else delete s.inst.aangiftes[kw];
      if (soort === "echt") { await d.saveJson(paden.instellingen, s.inst); await log({ actie: "finance: btw-aangifte " + kw + (b.ingediend ? " als ingediend gemarkeerd" : " weer open gezet") }); }
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/kosten") {
      const lijst = soort === "demo" ? s.kosten : echt.kosten;
      if (b.actie === "weg") {
        const i = lijst.findIndex((k) => k.id === b.id);
        if (i < 0) { await stuur(res, 404, { ok: false, fout: "Deze kostenpost bestaat niet (nepkosten uit de demo zelf kun je niet weghalen)." }); return true; }
        if (jaarDicht(s, jaarVan(lijst[i].datum))) { await stuur(res, 409, { ok: false, fout: "Boekjaar " + jaarVan(lijst[i].datum) + " is afgesloten. Heropen het jaar om kosten te wijzigen." }); return true; }
        const [weg] = lijst.splice(i, 1);
        if (soort === "echt") { await d.saveJson(paden.kosten, { kosten: lijst }); await log({ actie: "finance: kostenpost weggehaald", reden: weg.omschrijving }); }
        return klaar();
      }
      const datum = Date.parse(String(b.datum || "") + "T12:00:00Z");
      const bedragCent = Math.round(Number(String(b.bedrag || "").replace(",", ".")) * 100);
      const btwCent = Math.round(Number(String(b.btw || "0").replace(",", ".")) * 100);
      const omschrijving = schoon(b.omschrijving, 120).trim(), categorie = schoon(b.categorie, 40).trim() || "Overig";
      if (!Number.isFinite(datum) || !omschrijving || !(bedragCent > 0 && bedragCent < 1e8) || !(btwCent >= 0 && btwCent <= bedragCent)) {
        await stuur(res, 400, { ok: false, fout: "Vul een datum, omschrijving, bedrag (inclusief btw) en de btw in." }); return true;
      }
      if (jaarDicht(s, jaarVan(datum))) { await stuur(res, 409, { ok: false, fout: "Boekjaar " + jaarVan(datum) + " is afgesloten. Heropen het jaar om er kosten in te boeken." }); return true; }
      if (lijst.length >= 5000) { await stuur(res, 409, { ok: false, fout: "Te veel kostenposten." }); return true; }
      const post = { id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), datum, omschrijving, categorie, bedragCent, btwCent, door: wie };
      lijst.push(post);
      if (soort === "echt") { await d.saveJson(paden.kosten, { kosten: lijst }); await log({ actie: "finance: kostenpost toegevoegd", reden: omschrijving }); }
      return klaar();
    }
    if (urlPath === "/api/beheer/omgeving/afsluiten") {
      const jaar = String(b.jaar || "");
      const { bron } = staat(soort);
      const c = jaarControle(bron, s.inst, jaar, soort === "demo" ? DEMO_LEVERANCIER : d.leverancier());
      if (!/^\d{4}$/.test(jaar)) { await stuur(res, 400, { ok: false, fout: "Onbekend jaar." }); return true; }
      s.inst.afgesloten = s.inst.afgesloten && typeof s.inst.afgesloten === "object" ? s.inst.afgesloten : {};
      if (b.heropen) delete s.inst.afgesloten[jaar];
      else {
        if (!c.kanAfsluiten) { await stuur(res, 409, { ok: false, fout: "Dit jaar kan nog niet dicht: los eerst de rode punten op de lijst op." }); return true; }
        s.inst.afgesloten[jaar] = { door: wie, op: new Date().toISOString(), cijfers: jaarCijfers(financeOverzicht(bron, s.inst), jaar) };
      }
      if (soort === "echt") { await d.saveJson(paden.instellingen, s.inst); await log({ actie: "finance: boekjaar " + jaar + (b.heropen ? " heropend" : " afgesloten") }); }
      return klaar();
    }
    // de agents met taalmodel en de rechten van beheerders (lib/beheer-loket-routes.js)
    return loket.afhandelenBeheer(req, res, urlPath, { b, soort, wie, R, log, klaar });
  }

  // instellingen: de btw-keuze zoals ze nu geldt (echt, niet de demo), voor lib/prijs.js
  return { laad, afhandelen, ronde, tik, wisPraktijk, instellingen: () => financeInstellingen(echt.inst), stop: () => { clearInterval(timer); clearInterval(hartTimer); } };
}
