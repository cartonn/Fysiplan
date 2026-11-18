// De beheerkant van de vertalingen: /dashboard88/vertalingen en /api/beheer/vertalingen/*.
// Het rekenwerk staat in lib/vertaling.js.
//
// Wie mag wat: een beheeraccount met het recht "vertalen" (een lezer krijgt een account met alleen
// dat recht) en volledig beheer. Een lezer ziet alleen de teksten van de bibliotheek: geen kaart,
// geen praktijk en geen eigen oefening van een praktijk.
//
// Vooraf vertalen kost geld (het taalmodel): het gebeurt alleen als iemand op de knop drukt, en
// alleen voor teksten die nog geen vertaling hebben. Eén ronde tegelijk.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TALEN, isTaal, bibliotheekTeksten, stand, bladzijde, FILTERS, lees, zetAuto, zetNagelezen, trekIn, begrens, PER_RONDE } from "./vertaling.js";

export function maakVertaalbeheer(d) {
  // de ronde die nu loopt (of het laatst liep): { talen, taal, totaal, gedaan, mislukt, klaar, stop, fout, start }
  let ronde = null;

  const fout = (response, status, tekst) => d.sendJson(response, status, { ok: false, fout: tekst });
  async function teksten() { return bibliotheekTeksten(await d.manifest()); }
  const cacheVan = (taal) => { const v = d.vertalingen(); return Object.hasOwn(v, taal) && v[taal] && typeof v[taal] === "object" ? v[taal] : (v[taal] = {}); };

  async function overzicht() {
    const lijst = await teksten();
    return {
      talen: Object.entries(TALEN).map(([code, naam]) => ({ code, naam, ...stand(cacheVan(code), lijst) })),
      ai: d.aiAan(), ronde
    };
  }

  // de teksten zonder vertaling, per taal in rondes van PER_RONDE
  async function vertaalVooraf(talen) {
    const lijst = await teksten();
    const werk = talen.map((taal) => ({ taal, open: lijst.filter((x) => !lees(cacheVan(taal), x.nl)).map((x) => x.nl) }));
    ronde = { talen, taal: talen[0], totaal: werk.reduce((s, w) => s + w.open.length, 0), gedaan: 0, mislukt: 0, klaar: false, stop: false, fout: "", start: Date.now() };
    const r = ronde;
    try {
      for (const w of werk) {
        r.taal = w.taal;
        let achterElkaarMis = 0;
        for (let i = 0; i < w.open.length; i += PER_RONDE) {
          if (r.stop) { r.fout = "Gestopt."; return; }
          const stuk = w.open.slice(i, i + PER_RONDE);
          let uit = null;
          for (let poging = 0; poging < 2 && !uit; poging++) {
            try {
              const a = await d.vertaal(w.taal, stuk);
              if (Array.isArray(a) && a.length === stuk.length) uit = a;
            } catch (e) {
              if (e && e.message === "ai-tegoed") { r.fout = "Het tegoed bij de AI-dienst is op."; return; }
            }
          }
          if (!uit) {
            r.mislukt += stuk.length;
            if (++achterElkaarMis >= 3) { r.fout = "Drie rondes achter elkaar mislukt; later opnieuw proberen."; return; }
            continue;
          }
          achterElkaarMis = 0;
          const cache = cacheVan(w.taal);
          stuk.forEach((tekst, j) => zetAuto(cache, tekst, uit[j]));
          begrens(cache);
          r.gedaan += stuk.length;
          await d.bewaar();
        }
      }
    } finally {
      r.klaar = true;
    }
  }

  async function body(request) {
    const b = JSON.parse(await d.readBody(request));
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("vorm");
    return b;
  }

  async function afhandelen(request, response, urlPath) {
    if (urlPath === "/dashboard88/vertalingen") {
      response.setHeader("x-frame-options", "DENY");
      response.setHeader("x-robots-tag", "noindex, noarchive");
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'");
      try { await d.send(response, 200, "text/html; charset=utf-8", await readFile(join(d.publicDir, "vertalingen-beheer.html"), "utf8")); }
      catch { await d.send(response, 404, "text/plain; charset=utf-8", "Not found"); }
      return true;
    }
    if (urlPath !== "/api/beheer/vertalingen" && !urlPath.startsWith("/api/beheer/vertalingen/")) return false;
    if (!d.beheerEigen(request) || !d.magVertalen(request)) { await d.denied(request, response, urlPath); return true; }

    if (request.method === "GET" && urlPath === "/api/beheer/vertalingen") {
      await d.sendJson(response, 200, { ok: true, ...(await overzicht()) });
      return true;
    }
    if (request.method === "GET" && urlPath === "/api/beheer/vertalingen/lijst") {
      const q = new URLSearchParams((request.url || "").split("?")[1] || "");
      const taal = String(q.get("taal") || "");
      if (!isTaal(taal)) { await fout(response, 400, "Onbekende taal."); return true; }
      const filter = FILTERS.includes(String(q.get("filter"))) ? String(q.get("filter")) : "open";
      const blad = bladzijde(cacheVan(taal), await teksten(), { filter, zoek: String(q.get("zoek") || "").slice(0, 80), van: q.get("van"), aantal: q.get("aantal") });
      await d.sendJson(response, 200, { ok: true, taal, filter, ...blad });
      return true;
    }
    if (request.method !== "POST") { await fout(response, 405, "Niet toegestaan."); return true; }
    if (d.kruisSite(request)) { await d.weigerKruis(response); return true; }
    let b;
    try { b = await body(request); } catch { await fout(response, 400, "Ongeldig verzoek."); return true; }

    if (urlPath === "/api/beheer/vertalingen/nagelezen" || urlPath === "/api/beheer/vertalingen/intrekken") {
      const taal = String(b.taal || "");
      if (!isTaal(taal)) { await fout(response, 400, "Onbekende taal."); return true; }
      const x = (await teksten()).find((t) => t.sleutel === String(b.sleutel || ""));
      if (!x) { await fout(response, 404, "Deze tekst staat niet (meer) in de bibliotheek. Ververs de pagina."); return true; }
      const cache = cacheVan(taal);
      request.beheerDoel = taal + ":" + x.sleutel;
      if (urlPath.endsWith("/intrekken")) {
        trekIn(cache, x.nl);
      } else if (!zetNagelezen(cache, x.nl, b.vertaling, request.beheerWie)) {
        await fout(response, 400, "De vertaling is leeg."); return true;
      }
      await d.bewaar();
      const v = lees(cache, x.nl);
      await d.sendJson(response, 200, { ok: true, rij: { ...x, vertaling: v ? v.t : "", nagelezen: !!(v && v.nagelezen), wie: (v && v.wie) || "", op: (v && v.op) || 0 } });
      return true;
    }
    if (urlPath === "/api/beheer/vertalingen/vooraf") {
      if (!d.aiAan()) { await fout(response, 503, "Vertalen staat uit: er is geen sleutel voor de AI-dienst op de server."); return true; }
      if (ronde && !ronde.klaar) { await fout(response, 409, "Er loopt al een ronde."); return true; }
      const talen = b.taal === "alle" ? Object.keys(TALEN) : isTaal(String(b.taal || "")) ? [String(b.taal)] : null;
      if (!talen) { await fout(response, 400, "Onbekende taal."); return true; }
      request.beheerDoel = talen.join(",");
      vertaalVooraf(talen).catch((e) => { if (ronde) { ronde.fout = "Onverwachte fout: " + String((e && e.message) || e).slice(0, 80); ronde.klaar = true; } });
      await d.sendJson(response, 202, { ok: true, ronde });
      return true;
    }
    if (urlPath === "/api/beheer/vertalingen/stop") {
      if (ronde && !ronde.klaar) ronde.stop = true;
      await d.sendJson(response, 200, { ok: true, ronde });
      return true;
    }
    await fout(response, 404, "Onbekende route.");
    return true;
  }

  return { afhandelen, _ronde: () => ronde };
}
