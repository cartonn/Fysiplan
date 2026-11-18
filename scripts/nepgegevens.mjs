#!/usr/bin/env node
// Nepgegevens voor een testomgeving: twee verzonnen praktijken met logins, een collega,
// kaarten en wat een patiënt thuis invult.
//
//   node scripts/nepgegevens.mjs https://adres-van-de-testomgeving
//   node scripts/nepgegevens.mjs http://localhost:3000 --set=b
//
// Alles gaat door de voordeur: dezelfde verzoeken die een therapeut en een patiënt doen.
// Zo kloppen de gegevens altijd met wat de server van nu bewaart, en is er geen tweede weg
// naar de bestanden die bij een wijziging vergeten wordt.
//
// Het script begint alleen als /health zegt dat dit een testomgeving of een lokale server
// is. Op productie doet het niets. Alle namen en adressen zijn verzonnen; de adressen
// eindigen op example.org, een domein dat voor voorbeelden is gereserveerd.
//
// Twee keer draaien op dezelfde omgeving: de tweede keer zegt het script dat de gegevens
// er al staan. Een tweede stel naast het eerste: --set=b, op zijn vroegst een dag later.
//
// De server remt nieuwe praktijken (vijf per dag per adres; één keer draaien gebruikt er
// vier) en schrijven zonder login (veertig per vijf minuten per adres; één keer draaien
// gebruikt er ongeveer dertig). De remmen zijn in een testomgeving dezelfde als in productie.

import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const DAG = 86400000;

// wat er komt te staan. `dagen` is hoeveel dagen geleden; de server neemt tikken tot 14 dagen terug aan.
export const PRAKTIJKEN = [
  {
    naam: "Proefpraktijk De Linde",
    beheerder: { naam: "Sanne de Vries", post: "sanne" },
    collega: { naam: "Bram Jansen", post: "bram", rol: "therapeut" },
    kaarten: [
      { naam: "Jan K.", groep: "Onderste extremiteit", aantal: 4, sets: "3", herh: "12",
        doel: "Weer traplopen zonder pijn", opm: "Rustig opbouwen, pijn tot 4 mag.",
        pijn: [[8, 6], [6, 5], [3, 4], [1, 2]], gedaan: [8, 6, 3], ervaring: [1, 1] },
      { naam: "Fatima B.", groep: "Bovenste extremiteit", aantal: 3, sets: "2", herh: "10",
        doel: "Arm boven het hoofd zonder steek", opm: "",
        pijn: [[5, 3], [3, 5], [1, 7]], gedaan: [5], ervaring: [1, -1] },
      { naam: "Piet V.", groep: "Rug", aantal: 3, sets: "3", herh: "10",
        doel: "Een halfuur kunnen zitten", opm: "Net gestart, nog niets ingevuld." },
    ],
  },
  {
    naam: "Fysio Voorbeeld Zuid",
    beheerder: { naam: "Karin Bakker", post: "karin" },
    kaarten: [
      { naam: "Anna W.", groep: "Balans en valpreventie", aantal: 4, sets: "2", herh: "8",
        doel: "Veilig naar de winkel lopen", opm: "",
        pijn: [[7, 2], [4, 2], [1, 1]], gedaan: [7, 4, 1], ervaring: [1, 2] },
      { naam: "Henk D.", groep: "Nek", aantal: 3, sets: "3", herh: "10",
        doel: "Over de schouder kijken bij het fietsen", opm: "", gedaan: [3, 1] },
    ],
  },
];

class Stop extends Error {}

const normEx = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const wachtwoord = () => randomBytes(9).toString("base64url");

// Vult één omgeving. Geeft terug wat er gemaakt is: { basis, omgeving, praktijken: [...] }.
// opties.set: achtervoegsel voor een tweede stel; opties.haal: een eigen fetch (voor de test).
export async function vulNepgegevens(basis, opties = {}) {
  const haal = opties.haal || fetch;
  const set = String(opties.set || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  basis = String(basis || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(basis)) throw new Stop("Geef het adres van de testomgeving op, bijvoorbeeld https://test.voorbeeld.nl.");

  const json = async (pad, body, kop = {}) => {
    const r = await haal(basis + pad, { method: "POST", headers: { "content-type": "application/json", ...kop }, body: JSON.stringify(body) });
    let d = null;
    try { d = await r.json(); } catch {}
    return { status: r.status, d: d || {} };
  };
  const formulier = (pad, velden, kop = {}) => haal(basis + pad, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", ...kop }, body: new URLSearchParams(velden).toString() });
  const moet = (r, wat) => {
    if (r.status === 429) throw new Stop("De server remt (" + wat + "): er is vanaf dit adres al veel geschreven. Wacht vijf minuten" +
      " (bij nieuwe praktijken: tot morgen) en draai het script opnieuw met een andere --set, want een deel staat er al.");
    if (r.status !== 200 || r.d.ok === false) throw new Stop(wat + " lukte niet (status " + r.status + (r.d.fout ? ": " + r.d.fout : "") + ").");
    return r.d;
  };

  // 1. alleen op een testomgeving of een lokale server
  let gezondheid;
  try { gezondheid = await (await haal(basis + "/health", { cache: "no-store" })).json(); }
  catch { throw new Stop("Geen antwoord van " + basis + "/health. Draait de server, en klopt het adres?"); }
  const omgeving = gezondheid && gezondheid.omgeving;
  if (omgeving !== "test" && omgeving !== "lokaal") {
    throw new Stop("Dit is geen testomgeving: /health zegt " + (omgeving ? "\"" + omgeving + "\"" : "niet welke omgeving dit is") +
      ". Nepgegevens komen alleen op een testomgeving of een lokale server. Er is niets gedaan.");
  }

  // de namen van de oefeningen komen uit de bibliotheek van de server zelf
  const bieb = await (await haal(basis + "/oefeningen-v2.json")).json();
  const uitGroep = (groep, aantal) => {
    const lijst = (Array.isArray(bieb) ? bieb : []).filter((o) => o && o.groep === groep && o.naam).slice(0, aantal);
    if (lijst.length < aantal) throw new Stop("De bibliotheek heeft geen " + aantal + " oefeningen in de groep \"" + groep + "\".");
    return lijst.map((o) => o.naam);
  };

  // eerste login met een tweede stap: de server geeft een geheim, wij antwoorden met de code van dit moment
  const eersteLogin = async (praktijk, email, ww, geheim) => {
    const d = moet(await json("/api/praktijk/login", { praktijk, email, wachtwoord: ww, geheim, code: codeVoor(geheim, stapVan(Date.now())) }),
      "Inloggen als " + email);
    if (!d.sessie) throw new Stop("Inloggen als " + email + " gaf geen sessie terug.");
    return { sessie: d.sessie, reservecodes: d.reservecodes || [] };
  };

  const uit = { basis, omgeving, praktijken: [] };
  const nu = Date.now();
  for (const p of PRAKTIJKEN) {
    const praktijk = p.naam + (set ? " " + set.toUpperCase() : "");
    const adres = (post) => post + (set ? "+" + set : "") + "@example.org";
    const b = { ...p.beheerder, email: adres(p.beheerder.post), wachtwoord: wachtwoord() };

    // 2. de proef: zonder proef geen praktijk
    const aanmelding = await formulier("/v2/proef", { email: b.email, email_ok: "1", naam: b.naam, tel: "0201230000", praktijk, akkoord: "1", vwo: "1" });
    if (aanmelding.status === 429) throw new Stop("De server remt aanmeldingen vanaf dit adres. Probeer het over een uur opnieuw.");
    const koek = (aanmelding.headers.getSetCookie ? aanmelding.headers.getSetCookie() : []).map((c) => c.split(";")[0]).find((c) => c.startsWith("fpproef="));
    if (aanmelding.status !== 303 || !koek) {
      if (aanmelding.status === 200) throw new Stop("De nepgegevens staan er al: met " + b.email + " loopt al een proef. " +
        "Wil je er een tweede stel naast? Draai het script dan morgen met --set=b (of een andere letter).");
      throw new Stop("Aanmelden voor de proef lukte niet (status " + aanmelding.status + ").");
    }

    // 3. de praktijk beveiligen met de eigen login van de beheerder, en voor het eerst inloggen
    const claim = moet(await json("/api/praktijk/claim", { praktijk, wachtwoord: b.wachtwoord, naam: b.naam, email: b.email, akkoord: true, regels: true }, { cookie: koek }),
      "De praktijk " + praktijk + " beveiligen");
    if (!claim.geheim) throw new Stop("De server vroeg geen tweede stap bij " + praktijk + ". Dit script hoort bij een server waar elke login een tweede stap heeft.");
    Object.assign(b, { geheim: claim.geheim, ...(await eersteLogin(praktijk, b.email, b.wachtwoord, claim.geheim)) });
    const metSessie = { cookie: koek, "x-praktijk-sessie": b.sessie };
    const logins = [b];

    // 4. een collega uitnodigen, de uitnodiging aannemen en de tweede stap instellen
    if (p.collega) {
      const c = { ...p.collega, email: adres(p.collega.post), wachtwoord: wachtwoord() };
      const uitnodiging = moet(await json("/api/praktijk/team/uitnodigen", { email: c.email, naam: c.naam, rol: c.rol }, metSessie), c.naam + " uitnodigen");
      const t = new URL(uitnodiging.link).searchParams.get("t");
      const aannemen = await formulier("/v2/uitnodiging", { t, naam: c.naam, wachtwoord: c.wachtwoord, regels: "1" });
      if (aannemen.status >= 400) throw new Stop("De uitnodiging van " + c.naam + " aannemen lukte niet (status " + aannemen.status + ").");
      const vraag = await json("/api/praktijk/login", { praktijk, email: c.email, wachtwoord: c.wachtwoord });
      if (vraag.status === 429) moet(vraag, "Inloggen als " + c.email);
      if (!vraag.d.geheim) throw new Stop("Inloggen als " + c.email + " lukte niet (status " + vraag.status + (vraag.d.fout ? ": " + vraag.d.fout : "") + ").");
      Object.assign(c, { geheim: vraag.d.geheim, ...(await eersteLogin(praktijk, c.email, c.wachtwoord, vraag.d.geheim)) });
      logins.push(c);
    }

    // 5. kaarten, en wat de patiënt thuis invulde
    const kaarten = [];
    for (const k of p.kaarten) {
      const namen = uitGroep(k.groep, k.aantal);
      const cells = {};
      for (const n of namen) { cells["n" + normEx(n) + ".0|r0|S"] = k.sets; cells["n" + normEx(n) + ".0|r0|H"] = k.herh; }
      const d = moet(await json("/api/kaarten", { praktijk, naam: k.naam, kaartId: "", chosen: namen.map((n) => ({ n, i: 0 })), rows: {}, cells, vids: {},
        client: { c_naam: k.naam, c_doel: k.doel, ...(k.opm ? { c_opm: k.opm } : {}) } }, metSessie), "De kaart van " + k.naam);
      const tik = async (pad, body, dagen) => moet(await json(pad, { id: d.id, ...body, wanneer: nu - dagen * DAG }), "Een tik op de kaart van " + k.naam);
      for (const [dagen, score] of k.pijn || []) await tik("/api/kaart/meting", { score }, dagen);
      for (const dagen of k.gedaan || []) await tik("/api/kaart/gedaan", { aan: true }, dagen);
      if (k.ervaring) await tik("/api/kaart/ervaring", { score: k.ervaring[1] }, k.ervaring[0]);
      kaarten.push({ naam: k.naam, id: d.id, link: basis + "/k/" + d.id, oefeningen: namen.length });
    }
    uit.praktijken.push({ naam: praktijk, logins: logins.map(({ naam, email, wachtwoord: ww, geheim, reservecodes, rol }) =>
      ({ naam, email, wachtwoord: ww, geheim, reservecodes, rol: rol || "beheerder" })), kaarten });
  }
  return uit;
}

// het overzicht voor wie het script draaide: hiermee log je in
export function overzicht(uit) {
  const r = ["Nepgegevens staan klaar op " + uit.basis + " (omgeving: " + uit.omgeving + ").", "",
    "Bewaar dit overzicht: de wachtwoorden zijn zojuist gemaakt en staan nergens anders.",
    "Inloggen: " + uit.basis + "/v2/app, knop Kaarten. Voor de tweede stap zet je de sleutel in een code-app",
    "(\"sleutel invoeren\"), of je gebruikt één keer een reservecode.", ""];
  for (const p of uit.praktijken) {
    r.push("Praktijk: " + p.naam);
    for (const l of p.logins) {
      r.push("  " + l.naam + " (" + l.rol + ")", "    e-mail:       " + l.email, "    wachtwoord:   " + l.wachtwoord,
        "    sleutel:      " + l.geheim, "    reservecodes: " + l.reservecodes.join("  "));
    }
    for (const k of p.kaarten) r.push("  Kaart " + k.naam + " (" + k.oefeningen + " oefeningen): " + k.link);
    r.push("");
  }
  return r.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const set = (args.find((a) => a.startsWith("--set=")) || "").slice(6);
  const basis = args.find((a) => !a.startsWith("--"));
  try {
    console.log(overzicht(await vulNepgegevens(basis, { set })));
  } catch (e) {
    console.error(e instanceof Stop ? e.message : "Nepgegevens: onverwachte fout: " + (e && e.stack || e));
    process.exit(1);
  }
}
