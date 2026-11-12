// De routes van de ideeënbox: /api/ideeen/* voor de praktijken, /api/beheer/ideeen/* en de
// pagina /dashboard88/ideeen voor Fysiplan. Het rekenwerk staat in lib/ideeen.js.
//
// Los van server.js, zodat die niet nog groter wordt: de server geeft zijn eigen hulpjes mee
// (sessies, beheer, antwoorden, opslag, mail, het beheerlogboek en het taalmodel).
//
// Wie mag wat:
// - Indienen, stemmen en het eigen idee weghalen: iedereen met een sessie van een beveiligde
//   V2-praktijk (therapeut of beheerder). Eén stem per login per idee, altijd te veranderen.
//   Een beheerder van de praktijk mag ook een idee van een collega uit de eigen praktijk weghalen.
// - Besluiten, verbergen en de ronde eerder sluiten: alleen beheer van Fysiplan met een eigen
//   account of een eigen sleutel (beheerEigen). Elk besluit krijgt een regel in het beheerlogboek.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  normaliseer, leegBestand, nieuwId, stemmerVan, telling, ranglijst, huidigeTop, lijktOp, ideeVoorPraktijk, ideeVoorBeheer,
  sluitRonde, rondeOm, besluit, openVoorgesteld, wisPraktijk, ideeenVanPraktijk, regelTekst, agentInvoer, agentUitkomst, AGENT_SCHEMA, AGENT_SYSTEEM,
  schoneRegel, schoneTekst, TITEL_MAX, TEKST_MAX, NIEUW_PER_DAG, TOP_AANTAL
} from "./ideeen.js";

const KIJK_MS = 5 * 60e3;

export function maakIdeeenbox(d) {
  const pad = join(d.dataDir, "ideeen.json");
  let bestand = leegBestand();
  let kapot = false; // stond er een bestand dat niet te lezen was? Dan niet overschrijven.
  let rij = Promise.resolve();
  // schrijven op volgorde: twee snelle stemmen achter elkaar mogen elkaar nooit inhalen
  const bewaar = () => {
    if (kapot) return Promise.reject(new Error("ideeen.json is niet te lezen; niet overschreven"));
    const stand = JSON.parse(JSON.stringify(bestand));
    rij = rij.catch(() => {}).then(() => d.saveJson(pad, stand));
    return rij;
  };
  const nieuwTeller = new Map(); // stemmer -> tijden van nieuwe ideeën (24 uur)

  async function laad() {
    let tekst = null;
    try { tekst = await readFile(pad, "utf8"); } catch { bestand = leegBestand(); return; }
    try { bestand = normaliseer(JSON.parse(tekst)); }
    catch { kapot = true; console.error("ideeen.json is niet te lezen; de ideeënbox schrijft niets tot het bestand hersteld is."); }
  }

  // wie kijkt: de sessie van een beveiligde praktijk, met lid en rol
  function wieVan(req) {
    const s = d.sessieVan(req);
    if (!s || !d.praktijkGeclaimd(s.pk)) return null;
    return { pk: s.pk, lid: s.lid || "", beheer: d.isBeheer(s) };
  }
  const lijstVoor = (wie) => {
    const topIds = new Set(huidigeTop(bestand).map((i) => i.id));
    return Object.values(bestand.ideeen).filter((i) => !i.verborgen).map((i) => ideeVoorPraktijk(i, wie, topIds));
  };
  const rondeUit = () => ({ nr: bestand.ronde.nr, start: bestand.ronde.start, eind: bestand.ronde.eind, top: TOP_AANTAL });

  // ---- de agent: na het sluiten van een ronde ----
  async function laatAgentSchrijven(voorstel) {
    for (const v of voorstel.ideeen) {
      const i = bestand.ideeen[v.id];
      v.regel = regelTekst(v);
      if (i) v.tekst = i.tekst;
    }
    if (d.aiAan()) {
      try {
        const antwoord = await d.vraagClaude(agentInvoer(bestand, voorstel));
        voorstel.agent = { bron: "taalmodel", klaar: true, t: Date.now(), teksten: agentUitkomst(voorstel, antwoord) };
      } catch (e) {
        voorstel.agent = { bron: "regels", klaar: true, t: Date.now(), fout: "Het taalmodel gaf geen antwoord (" + schoneRegel(e && e.message, 80) + "). De top 4 en de stemmen staan er wel." };
      }
    } else {
      voorstel.agent = { bron: "regels", klaar: true, t: Date.now() };
    }
    await bewaar().catch(() => {});
  }
  function meldFysiplan(voorstel) {
    if (!d.mailIngesteld()) return;
    const regels = voorstel.ideeen.map((v) => v.plek + ". " + v.titel + " (" + v.score + " punten, " + v.praktijken + (v.praktijken === 1 ? " praktijk" : " praktijken") + ")");
    const tekst = "De ideeënronde van " + voorstel.maand + " is gesloten. De agent heeft de top " + voorstel.ideeen.length + " voor je klaargezet:\n\n" +
      regels.join("\n") + "\n\nKies per idee Bouwen, Niet nu of Afwijzen op " + d.basis + "/dashboard88/ideeen\n\nDe therapeuten zien je keuze terug in de ideeënbox.\n\nFysiplan";
    for (const adres of d.fysiplanAdressen()) d.stuurMail(adres, "Ideeënbox: de top " + voorstel.ideeen.length + " van " + voorstel.maand + " wacht op je keuze", tekst)
      .catch((err) => console.error("mail ideeënbox mislukt:", err.message));
  }
  async function sluit(nu, hoe) {
    const voorstel = sluitRonde(bestand, nu, hoe);
    await bewaar();
    if (voorstel) { await laatAgentSchrijven(voorstel); meldFysiplan(voorstel); }
    return voorstel;
  }
  let bezig = false;
  async function kijk(nu = Date.now()) {
    if (bezig || kapot || !rondeOm(bestand, nu)) return null;
    bezig = true;
    try { return await sluit(nu, "einde"); } finally { bezig = false; }
  }
  function start() { const t = setInterval(() => { kijk().catch((e) => console.error("ideeënbox:", e.message)); }, KIJK_MS); t.unref(); kijk().catch(() => {}); }

  async function body(req) { const b = JSON.parse(await d.readBody(req, 8 * 1024)); if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("geen object"); return b; }
  const fout = (res, status, tekst) => d.sendJson(res, status, { ok: false, fout: tekst });

  async function praktijkRoutes(request, response, urlPath) {
    if (urlPath === "/api/ideeen" && request.method === "GET") {
      if (d.leesLimiet(request, response)) return true;
      const wie = wieVan(request);
      if (!wie) { await fout(response, 401, "Log in bij je praktijk om de ideeënbox te gebruiken."); return true; }
      await d.sendJson(response, 200, { ok: true, ronde: rondeUit(), ideeen: lijstVoor(wie), ik: { beheer: wie.beheer } });
      return true;
    }
    if (urlPath === "/api/ideeen/lijkt" && request.method === "GET") {
      if (d.leesLimiet(request, response)) return true;
      const wie = wieVan(request);
      if (!wie) { await fout(response, 401, "Log in bij je praktijk."); return true; }
      const q = new URLSearchParams((request.url || "").split("?")[1] || "").get("q") || "";
      const topIds = new Set(huidigeTop(bestand).map((i) => i.id));
      await d.sendJson(response, 200, { ok: true, ideeen: lijktOp(bestand, schoneRegel(q, TITEL_MAX + TEKST_MAX)).map((i) => ideeVoorPraktijk(i, wie, topIds)) });
      return true;
    }
    if (request.method !== "POST" || !["/api/ideeen", "/api/ideeen/stem", "/api/ideeen/weg"].includes(urlPath)) return false;
    if (d.schrijfLimiet(request, response)) return true;
    if (d.kruisSite(request)) { await d.weigerKruis(response); return true; }
    const wie = wieVan(request);
    if (!wie) { await fout(response, 401, "Log in bij je praktijk om de ideeënbox te gebruiken."); return true; }
    if (kapot) { await fout(response, 503, "De ideeënbox is even niet beschikbaar."); return true; }
    let b;
    try { b = await body(request); } catch { await fout(response, 400, "Ongeldig verzoek."); return true; }
    const nu = Date.now();
    if (urlPath === "/api/ideeen") {
      const titel = schoneRegel(b.titel, TITEL_MAX), tekst = schoneTekst(b.tekst, TEKST_MAX);
      if (titel.length < 4) { await fout(response, 400, "Schrijf in een paar woorden wat je idee is."); return true; }
      const sleutel = stemmerVan(wie.pk, wie.lid);
      const tijden = (nieuwTeller.get(sleutel) || []).filter((t) => nu - t < 86400e3);
      if (tijden.length >= NIEUW_PER_DAG) { await fout(response, 429, "Je hebt vandaag al " + NIEUW_PER_DAG + " ideeën geplaatst. Morgen kan er weer een bij."); return true; }
      tijden.push(nu); nieuwTeller.set(sleutel, tijden);
      const id = nieuwId();
      // wie een idee plaatst, stemt er zelf meteen voor
      bestand.ideeen[id] = { id, titel, tekst, pk: wie.pk, lid: wie.lid, t: nu, stemmen: { [sleutel]: 1 }, stand: "open" };
      await bewaar();
      await d.sendJson(response, 200, { ok: true, idee: ideeVoorPraktijk(bestand.ideeen[id], wie, new Set(huidigeTop(bestand).map((i) => i.id))) });
      return true;
    }
    const id = String(b.id || "");
    const i = Object.hasOwn(bestand.ideeen, id) && !bestand.ideeen[id].verborgen ? bestand.ideeen[id] : null;
    if (!i) { await fout(response, 404, "Dit idee bestaat niet (meer)."); return true; }
    if (urlPath === "/api/ideeen/stem") {
      if (i.stand !== "open") { await fout(response, 409, "Over dit idee is al besloten; stemmen kan niet meer."); return true; }
      const stem = Number(b.stem);
      if (![1, -1, 0].includes(stem)) { await fout(response, 400, "Ongeldige stem."); return true; }
      const sleutel = stemmerVan(wie.pk, wie.lid);
      if (stem === 0) delete i.stemmen[sleutel]; else i.stemmen[sleutel] = stem;
      await bewaar();
      const top = huidigeTop(bestand);
      await d.sendJson(response, 200, { ok: true, idee: ideeVoorPraktijk(i, wie, new Set(top.map((x) => x.id))), top: top.map((x) => x.id) });
      return true;
    }
    // weghalen
    const eigen = i.pk === wie.pk && (i.lid || "") === wie.lid;
    if (!(eigen || (wie.beheer && i.pk === wie.pk))) { await fout(response, 403, "Alleen wie het idee plaatste, of een beheerder van die praktijk, kan het weghalen."); return true; }
    if (i.stand !== "open") { await fout(response, 409, "Over dit idee is al besloten; het blijft staan."); return true; }
    delete bestand.ideeen[id];
    await bewaar();
    await d.sendJson(response, 200, { ok: true });
    return true;
  }

  async function beheerRoutes(request, response, urlPath) {
    if (urlPath === "/dashboard88/ideeen") {
      response.setHeader("x-frame-options", "DENY");
      response.setHeader("x-robots-tag", "noindex, noarchive");
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'");
      try { await d.send(response, 200, "text/html; charset=utf-8", await readFile(join(d.publicDir, "ideeen-beheer.html"), "utf8")); }
      catch { await d.send(response, 404, "text/plain; charset=utf-8", "Not found"); }
      return true;
    }
    if (!urlPath.startsWith("/api/beheer/ideeen")) return false;
    if (!d.beheerEigen(request)) { await d.denied(request, response, urlPath); return true; }
    if (urlPath === "/api/beheer/ideeen" && request.method === "GET") {
      const alle = Object.values(bestand.ideeen).map(ideeVoorBeheer);
      const top = huidigeTop(bestand).map((i) => i.id);
      await d.sendJson(response, 200, {
        ok: true, ronde: rondeUit(), ideeen: alle, top, voorstellen: bestand.voorstellen.slice().reverse(),
        wacht: openVoorgesteld(bestand).length, ai: d.aiAan(), mail: d.mailIngesteld(), kapot
      });
      return true;
    }
    if (request.method !== "POST") { await fout(response, 405, "Niet toegestaan."); return true; }
    if (d.kruisSite(request)) { await d.weigerKruis(response); return true; }
    if (kapot) { await fout(response, 503, "ideeen.json is niet te lezen; herstel het bestand eerst."); return true; }
    let b;
    try { b = await body(request); } catch { await fout(response, 400, "Ongeldig verzoek."); return true; }
    const log = (actie, doel) => { request.beheerGelogd = true; d.beheerLog.schrijf({ wie: request.beheerWie, actie, doel, ip: d.beheerIp(request) }); };
    if (urlPath === "/api/beheer/ideeen/besluit") {
      const id = String(b.id || ""), wat = String(b.besluit || "");
      const f = besluit(bestand, id, wat, b.reden, request.beheerWie);
      if (f) { await fout(response, 400, f); return true; }
      await bewaar();
      log("ideeënbox: besluit " + wat, id);
      await d.sendJson(response, 200, { ok: true, idee: ideeVoorBeheer(bestand.ideeen[id]) });
      return true;
    }
    if (urlPath === "/api/beheer/ideeen/verberg") {
      const id = String(b.id || "");
      const i = Object.hasOwn(bestand.ideeen, id) ? bestand.ideeen[id] : null;
      if (!i) { await fout(response, 404, "Dit idee bestaat niet (meer)."); return true; }
      if (b.verborgen === false) delete i.verborgen; else i.verborgen = true;
      await bewaar();
      log(i.verborgen ? "ideeënbox: idee verborgen" : "ideeënbox: idee weer zichtbaar", id);
      await d.sendJson(response, 200, { ok: true, idee: ideeVoorBeheer(i) });
      return true;
    }
    if (urlPath === "/api/beheer/ideeen/ronde-sluiten") {
      if (Number(b.ronde) !== bestand.ronde.nr) { await fout(response, 409, "De ronde is intussen al gesloten. Ververs de pagina."); return true; }
      if (bezig) { await fout(response, 409, "De ronde wordt al gesloten."); return true; }
      bezig = true;
      let voorstel;
      try { voorstel = await sluit(Date.now(), "beheer"); } finally { bezig = false; }
      log("ideeënbox: ronde " + (bestand.ronde.nr - 1) + " eerder gesloten", voorstel ? voorstel.ideeen.map((v) => v.id).join(",") : "geen top");
      await d.sendJson(response, 200, { ok: true, voorstel });
      return true;
    }
    if (urlPath === "/api/beheer/ideeen/agent-opnieuw") {
      const v = bestand.voorstellen.find((x) => x.ronde === Number(b.ronde));
      if (!v) { await fout(response, 404, "Dit voorstel bestaat niet."); return true; }
      await laatAgentSchrijven(v);
      log("ideeënbox: agent opnieuw voor ronde " + v.ronde, String(v.ronde));
      await d.sendJson(response, 200, { ok: true, voorstel: v });
      return true;
    }
    await fout(response, 404, "Onbekende route.");
    return true;
  }

  return {
    laad, start, kijk,
    pad,
    // voor praktijkAllesWissen in server.js
    async wisPraktijk(pk) { if (kapot) return 0; const n = wisPraktijk(bestand, pk); await bewaar(); return n; },
    // voor de download op /v2/gegevens: ideeën en stemmen van deze praktijk
    vanPraktijk: (pk, naamVan) => ideeenVanPraktijk(bestand, pk, naamVan),
    // voor de beheeromgeving: hoeveel ideeën wachten op een besluit
    wacht: () => openVoorgesteld(bestand).length,
    async afhandelen(request, response, urlPath) {
      if (urlPath === "/dashboard88/ideeen" || urlPath.startsWith("/api/beheer/ideeen")) return beheerRoutes(request, response, urlPath);
      if (urlPath === "/api/ideeen" || urlPath.startsWith("/api/ideeen/")) return praktijkRoutes(request, response, urlPath);
      return false;
    },
    // alleen voor tests
    _bestand: () => bestand
  };
}
export { telling, ranglijst };
