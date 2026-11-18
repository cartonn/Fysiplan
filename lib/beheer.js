// Persoonlijke beheeraccounts en het beheerlogboek (platformreview 2026-11-11).
//
// Beheer was één gedeelde sleutel in een kop: van niemand persoonlijk, niet per persoon in te
// trekken, en zonder spoor van wie wat deed. Dit onderdeel houdt bij wie beheerder is, wie er
// is ingelogd en wat beheer heeft gedaan. De routes en de schermen staan in server.js en
// public/beheersleutel.js; hier staat alleen wat zonder webserver te testen is.
//
// Een sessie overleeft een herstart van de server: de server rolt vele keren per dag uit, en wie
// dan telkens opnieuw moet inloggen, blijft de gedeelde sleutel gebruiken. Op schijf en in het
// geheugen staat alleen de SHA-256 van de sessiesleutel, nooit de sleutel zelf, met een afdruk
// van het wachtwoord waarmee is ingelogd: na twaalf uur, een ander wachtwoord of uitzetten
// werkt een sessie niet meer, ook als hij nog in het bestand staat (bijvoorbeeld na het
// terugzetten van een reservekopie van de datamap).
import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export const BEHEER_SESSIE_MS = 12 * 3600e3; // een werkdag; daarna opnieuw inloggen met de code
export const BEHEER_WW_MIN = 12;
// Een nieuw account moet binnen een week voor het eerst inloggen. Tot dat moment kent ook de
// maker het wachtwoord; zo'n half account blijft daarom niet onbeperkt openstaan.
export const BEHEER_EERSTE_KEER_MS = 7 * 86400e3;
// stuurtekens en de twee regelscheiders van Unicode: een logregel blijft altijd één regel
const STUUR = new RegExp("[\\u0000-\\u001f\\u007f\\u2028\\u2029]", "g");
const sleutelVan = (token) => createHash("sha256").update(String(token)).digest("hex");
const afdruk = (hash) => createHash("sha256").update("fysiplan-beheer|" + String(hash || "")).digest("hex").slice(0, 16);

// klaar: het account heeft een tweede stap, de eigenaar heeft dus zelf ingelogd
export const beheerKlaar = (a) => !!a && typeof a === "object" && !a.uit && !!(a.totp && typeof a.totp.geheim === "string" && a.totp.geheim);
// verlopen: gemaakt, maar niet binnen een week in gebruik genomen
export const beheerVerlopen = (a, nu = Date.now()) => !!a && !a.uit && !beheerKlaar(a) && !(nu - Date.parse(a.gemaakt) <= BEHEER_EERSTE_KEER_MS);
// wat van een account naar het scherm mag: nooit de hash, het geheim of de reservecodes
export const beheerUit = (a, nu = Date.now()) => ({
  email: a.email, naam: a.naam || "", gemaakt: a.gemaakt || null, door: a.door || "",
  status: a.uit ? "uit" : beheerKlaar(a) ? "actief" : beheerVerlopen(a, nu) ? "verlopen" : "nog niet ingelogd",
  laatst: a.laatst ? new Date(a.laatst).toISOString() : null,
  ...(a.uit ? { uit: a.uit, uitDoor: a.uitDoor || "" } : {})
});

// Het pad voor het beheerlogboek: zonder query, en zonder een id dat de sleutel tot een kaart is.
export const beheerPad = (url) => String(url || "").split("?")[0].replace(/\/[a-f0-9]{10,}(?=\/|$)/gi, "/…").slice(0, 200);

// Rem op het raden van een wachtwoord of code: na `max` missers binnen `ms` zit de sleutel
// (hier: het e-mailadres van een beheeraccount) op slot tot die tijd om is. Een eigen teller,
// los van die van de praktijken: een praktijknaam kan zo nooit een beheeraccount op slot zetten.
export class Rem {
  #tellers = new Map();
  #max; #ms; #nu;
  constructor(max, ms, nu = () => Date.now()) { this.#max = max; this.#ms = ms; this.#nu = nu; }
  opSlot(k) {
    const t = this.#tellers.get(k);
    return !!t && this.#nu() - t.start <= this.#ms && t.n >= this.#max;
  }
  tel(k) {
    const nu = this.#nu();
    if (this.#tellers.size > 1000) for (const [s, t] of this.#tellers) if (nu - t.start > this.#ms) this.#tellers.delete(s);
    const t = this.#tellers.get(k);
    if (!t || nu - t.start > this.#ms) this.#tellers.set(k, { start: nu, n: 1 });
    else t.n++;
  }
  wis(k) { this.#tellers.delete(k); }
}

// Leest het bestand met beheersessies en geeft alleen rijen terug die nog kunnen gelden: goede
// vorm, niet verlopen, niet uit de toekomst. Een ontbrekend of kapot bestand is een lege lijst:
// beheer logt dan één keer opnieuw in.
export async function laadBeheerSessies(pad, nu = Date.now()) {
  let inhoud;
  try { inhoud = JSON.parse(await readFile(pad, "utf8")); } catch { return []; }
  const sessies = inhoud && typeof inhoud === "object" && inhoud.sessies && typeof inhoud.sessies === "object" ? inhoud.sessies : {};
  const rijen = [];
  for (const [sleutel, s] of Object.entries(sessies)) {
    if (!/^[a-f0-9]{64}$/.test(sleutel) || !s || typeof s !== "object") continue;
    if (typeof s.email !== "string" || !s.email || !Number.isFinite(s.t) || typeof s.w !== "string") continue;
    if (nu - s.t > BEHEER_SESSIE_MS || s.t > nu + 60000) continue;
    rijen.push([sleutel, { email: s.email, t: s.t, w: s.w }]);
  }
  return rijen;
}

// De ingelogde beheerders. `accounts` is een functie die de stand van nu geeft: een account dat
// is uitgezet, of waarvan het wachtwoord is gewijzigd, heeft meteen geen geldige sessie meer.
// `tabel` is waar de sessies staan: een Map, of de tabel uit lib/sessie-opslag.js die zichzelf
// bij elke wijziging op schijf zet.
export class BeheerSessies {
  #sessies; // sha256(token) -> { email, t, w }
  #accounts;
  #nu;
  constructor(accounts, nu = () => Date.now(), tabel = new Map()) { this.#accounts = accounts; this.#nu = nu; this.#sessies = tabel; }
  get aantal() { return this.#sessies.size; }
  nieuw(account) {
    // verlopen sessies opruimen en het totaal begrenzen: er zijn maar een handvol beheerders
    for (const [k, s] of this.#sessies) if (this.#nu() - s.t > BEHEER_SESSIE_MS) this.#sessies.delete(k);
    while (this.#sessies.size >= 50) this.#sessies.delete(this.#sessies.keys().next().value);
    const token = randomBytes(24).toString("hex");
    this.#sessies.set(sleutelVan(token), { email: String(account.email).toLowerCase(), t: this.#nu(), w: afdruk(account.hash) });
    return token;
  }
  // het account bij deze sessiesleutel, of null
  van(token) {
    if (!token) return null;
    const sleutel = sleutelVan(token), s = this.#sessies.get(sleutel);
    if (!s) return null;
    const alle = this.#accounts();
    const a = Object.hasOwn(alle, s.email) ? alle[s.email] : null;
    if (this.#nu() - s.t > BEHEER_SESSIE_MS || !beheerKlaar(a) || s.w !== afdruk(a.hash)) { this.#sessies.delete(sleutel); return null; }
    return a;
  }
  weg(token) { return !!token && this.#sessies.delete(sleutelVan(token)); }
  // alle sessies van één account intrekken (uitgezet, of opnieuw aangemaakt)
  trekIn(email) {
    const e = String(email).toLowerCase();
    let n = 0;
    for (const [k, s] of this.#sessies) if (s.email === e) { this.#sessies.delete(k); n++; }
    return n;
  }
}

// Het beheerlogboek: één regel JSON per beheeractie, alleen erbij schrijven. Er is geen functie
// die een regel wijzigt of weghaalt. De laatste regels blijven in het geheugen voor het scherm.
export class BeheerLogboek {
  #pad;
  #max;
  #staart = [];
  #rij = Promise.resolve();
  constructor(pad, max = 200) { this.#pad = pad; this.#max = max; }
  // bij de start: de laatste regels inlezen (alleen het eind van het bestand, hoe groot het ook is)
  async laad() {
    let bestand;
    try { bestand = await open(this.#pad, "r"); } catch { return this; }
    try {
      const { size } = await bestand.stat();
      const lengte = Math.min(size, 256 * 1024);
      const buf = Buffer.alloc(lengte);
      await bestand.read(buf, 0, lengte, size - lengte);
      let regels = buf.toString("utf8").split("\n");
      // begonnen we midden in het bestand, dan is de eerste regel waarschijnlijk half
      if (lengte < size) regels = regels.slice(1);
      this.#staart = regels.filter(Boolean).map((r) => { try { return JSON.parse(r); } catch { return null; } })
        .filter((r) => r && typeof r === "object").slice(-this.#max);
    } catch {} finally { await bestand.close().catch(() => {}); }
    return this;
  }
  // de regels van nieuw naar oud
  staart(n = this.#max) { return this.#staart.slice(-n).reverse(); }
  // schrijft een regel; de volgorde op schijf is de volgorde van aanroepen
  schrijf(regel) {
    const schoon = {};
    for (const [k, v] of Object.entries(regel)) {
      if (v == null || v === "") continue;
      schoon[k] = typeof v === "string" ? v.replace(STUUR, " ").slice(0, 300) : v;
    }
    const rij = { t: new Date().toISOString(), ...schoon };
    this.#staart.push(rij);
    if (this.#staart.length > this.#max) this.#staart.shift();
    this.#rij = this.#rij
      .then(() => mkdir(dirname(this.#pad), { recursive: true }))
      .then(() => appendFile(this.#pad, JSON.stringify(rij) + "\n"))
      .catch((err) => console.error("beheerlogboek:", err && err.message ? err.message : err));
    return this.#rij;
  }
  // wacht tot alles wat tot nu toe is aangeboden op schijf staat
  opSchijf() { return this.#rij; }
}
