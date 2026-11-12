// De patiëntkant: wat de patiënt op /k/<id> aantikt (reviewlijst punt 15, server in losse onderdelen).
//
//   POST /api/kaart/meting            pijnscore 0-10, één per dag
//   POST /api/kaart/ervaring          ervaren herstel -2..+2, één per dag
//   POST /api/kaart/psk               PSK-score 0-10 bij de doelactiviteit, één per dag
//   POST /api/kaart/gedaan            "ik heb vandaag geoefend" aan of uit
//   POST /api/kaart/oefening          een oefening afgevinkt (of weer uit)
//   POST /api/kaart/oefzwaar          "te zwaar" bij een oefening
//   POST /api/kaart/seintje           vraag, pijn of goed: één tik naar de praktijk
//   POST /api/kaart/antwoord/gezien   het bericht van de praktijk weghalen
//
// Wie de kaartlink heeft, is de patiënt: geen login. Daarom gaat elk verzoek door dezelfde poort
// (kaartVerzoek): de rem op schrijven, geen verzoek van een andere site, een body die een
// JSON-object is (lib/invoer.js), en een kaart die bestaat (met de rem op raden). Alleen
// registreren en tonen: de duiding blijft bij de fysiotherapeut. Een voorbeeldkaart (demo)
// reageert wel, maar bewaart niets.
//
// Alles van de server komt binnen via `d`; deze module leest of schrijft zelf geen bestanden.
import { leesObject, geheel, eenVan, index } from "./invoer.js";

export const PATIENT_ROUTES = ["/api/kaart/meting", "/api/kaart/ervaring", "/api/kaart/psk", "/api/kaart/gedaan",
  "/api/kaart/oefening", "/api/kaart/oefzwaar", "/api/kaart/seintje", "/api/kaart/antwoord/gezien"];

export function maakPatientkant(d) {
  const ok = (response, extra) => d.sendJson(response, 200, { ok: true, ...(extra || {}) });
  const fout = (response, status, tekst) => d.sendJson(response, status, { ok: false, fout: tekst });

  // de vaste poort; `voor` controleert de invoer die geen kaart nodig heeft (vóór het opzoeken)
  async function kaartVerzoek(request, response, fn, voor) {
    if (d.schrijfLimiet(request, response)) return;
    if (d.kruisSite(request)) { await d.weigerKruis(response); return; }
    try {
      const b = await leesObject(request, d.readBody);
      if (!b) { await fout(response, 400, "Ongeldig verzoek."); return; }
      if (voor) { const f = voor(b); if (f) { await fout(response, 400, f); return; } }
      const found = d.vindKaart(d.idTekst(b.id));
      if (!found) { if (d.kaartMisLimiet(request, response)) return; await fout(response, 404, "Kaart niet gevonden."); return; }
      await fn(b, found);
    } catch {
      await fout(response, 400, "Ongeldig verzoek.");
    }
  }
  // bewaren, behalve op de voorbeeldkaart
  async function bewaar(found) { if (!found.demo) await d.bewaarKaarten(); }

  // een score per dag (pijn, herstel, PSK): een nieuwe tik op dezelfde dag vervangt de vorige
  function dagScore(veld, min, max, houd, telNaam, melding) {
    return (request, response) => kaartVerzoek(request, response, async (b, found) => {
      if (veld === "psk" && !found.pskDoel) { await fout(response, 400, "Er staat geen doelactiviteit op deze kaart."); return; }
      const score = geheel(b.score, min, max);
      if (score === undefined) { await fout(response, 400, melding); return; }
      const lijst = (found[veld] = found[veld] || []);
      const nu = Date.now();
      // een tik uit de offline-wachtrij komt op de dag waarop hij gedaan is
      d.zetDagWaarde(lijst, d.tikMoment(b, nu), score, nu);
      found[veld] = lijst.slice(-houd);
      if (found.demo) { await ok(response, { [veld]: found[veld] }); return; }
      await d.bewaarKaarten();
      if (telNaam) d.telDag(telNaam);
      await ok(response, { [veld]: found[veld] });
    });
  }

  // de oefening via haar plek op de kaart: de patiënt kan nooit een verzonnen naam laten registreren
  function oefNaam(b, found) {
    const lijst = Array.isArray(found.chosen) ? found.chosen : [];
    const i = index(b.oef, lijst.length);
    const naam = i === undefined || !lijst[i] ? "" : String(lijst[i].n || "").slice(0, 80);
    // oefeningnamen worden sleutels: prototype-sleutels ("constructor") weigeren
    return naam && !d.verbodenSleutel.test(naam) ? naam : "";
  }

  const routes = {
    "/api/kaart/meting": dagScore("metingen", 0, 10, 366, "meting", "Geef een score van 0 tot en met 10."),
    "/api/kaart/ervaring": dagScore("ervaring", -2, 2, 120, null, "Geef een score van -2 tot en met 2."),
    "/api/kaart/psk": dagScore("psk", 0, 10, 120, null, "Geef een score van 0 tot en met 10."),

    // aan:true/false zet de dag expliciet (een tweede apparaat met een oude kaart haalt de dag niet
    // weg); zonder aan blijft het de oude aan/uit-tik, voor kaartpagina's die nog in een cache staan
    "/api/kaart/gedaan": (request, response) => kaartVerzoek(request, response, async (b, found) => {
      const g = (found.gedaan = found.gedaan || []);
      const nu = Date.now();
      const t = d.tikMoment(b, nu);
      const pos = g.findIndex((x) => x && d.nlDag(x.t) === d.nlDag(t));
      const alDie = pos >= 0;
      const wil = b.aan === true ? true : b.aan === false ? false : !alDie;
      if (alDie && !wil) g.splice(pos, 1);
      else if (!alDie && wil) { g.push(d.tikVeld(t, nu)); g.sort((x, y) => (Number(x.t) || 0) - (Number(y.t) || 0)); }
      found.gedaan = g.slice(-366);
      if (found.demo) { await ok(response, { gedaan: found.gedaan }); return; }
      await d.bewaarKaarten();
      d.telDag("gedaan");
      await ok(response, { gedaan: found.gedaan });
    }),

    // afvinkdagen per oefening, één per dag; geen tijdstippen per vinkje, geen vrije tekst
    "/api/kaart/oefening": (request, response) => kaartVerzoek(request, response, async (b, found) => {
      const naam = oefNaam(b, found);
      if (!naam) { await fout(response, 400, "Onbekende oefening."); return; }
      const trouw = (found.oefTrouw = found.oefTrouw || {});
      // plafond tegen opblazen als een kaart vaak van oefeningen wisselt
      if (!Object.hasOwn(trouw, naam) && Object.keys(trouw).length >= 60) { await ok(response); return; }
      const rec = (trouw[naam] = trouw[naam] || { n: 0, d: "" });
      // een vinkje uit de offline-wachtrij telt op de dag van tikken; `d` blijft de laatste dag
      const dag = d.nlDag(d.tikMoment(b, Date.now()));
      if (b.aan !== false) { if (rec.d !== dag) { rec.n = Math.min(9999, (rec.n || 0) + 1); if (!rec.d || dag > rec.d) rec.d = dag; } }
      else if (rec.d === dag) { rec.n = Math.max(0, (rec.n || 0) - 1); rec.d = ""; }
      await bewaar(found);
      await ok(response);
    }),

    // "te zwaar": de laatste melding per oefening, en een regel in het contactlogboek
    "/api/kaart/oefzwaar": (request, response) => kaartVerzoek(request, response, async (b, found) => {
      const naam = oefNaam(b, found);
      if (!naam) { await fout(response, 400, "Onbekende oefening."); return; }
      const zwaar = (found.oefZwaar = found.oefZwaar || {});
      if (!Object.hasOwn(zwaar, naam) && Object.keys(zwaar).length >= 24) { await ok(response); return; }
      zwaar[naam] = { t: Date.now() };
      d.logContact(found, { van: "patient", soort: "zwaar", oef: naam });
      await bewaar(found);
      await ok(response);
    }),

    // een vaste soort uit een korte lijst, nooit vrije tekst. Een ouder of lichter seintje gaat in
    // het logboek maar verdringt geen nieuwer of zwaarder. Bij een nieuw open seintje (of een vraag
    // die oploopt naar pijn) krijgt de praktijk bericht, zonder dat de patiënt daarop wacht.
    "/api/kaart/seintje": (request, response) => kaartVerzoek(request, response, async (b, found) => {
      const soort = String(b.soort);
      const nu = Date.now();
      const t = d.tikMoment(b, nu);
      const oud = found.seintje;
      const stondOpen = oud && d.seinOpen(oud.soort) ? oud.soort : null;
      d.zetSeintje(found, soort, t, nu);
      d.logContact(found, { van: "patient", soort, ...d.tikVeld(t, nu) });
      if (found.demo) { await ok(response); return; }
      const nieuwOpen = d.seinOpen(soort) && (!stondOpen || d.SEIN_GEWICHT[soort] > d.SEIN_GEWICHT[stondOpen]);
      const melden = (nieuwOpen || !!(oud && oud.meld)) && !!found.seintje && d.seinOpen(found.seintje.soort) && d.seinMailKan(d.kaartSleutel(found));
      if (melden) found.seintje.meld = 1;
      await d.bewaarKaarten();
      if (melden) d.seinMailRonde();
      await ok(response);
    }, (b) => (eenVan(b.soort, ["vraag", "pijn", "goed"]) === undefined ? "Onbekend seintje." : "")),

    "/api/kaart/antwoord/gezien": (request, response) => kaartVerzoek(request, response, async (b, found) => {
      found.antwoord = null;
      await bewaar(found);
      await ok(response);
    })
  };

  return {
    // true als dit verzoek hier hoort (en dan is het afgehandeld)
    async afhandelen(request, response, urlPath) {
      if (request.method !== "POST" || !Object.hasOwn(routes, urlPath)) return false;
      await routes[urlPath](request, response);
      return true;
    }
  };
}
