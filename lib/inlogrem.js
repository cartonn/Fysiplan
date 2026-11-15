// De inlogrem per praktijk en per e-mailadres overleeft een herstart (security 2026-11-15 12u).
//
// Tien foute pogingen op één praktijk of één e-mailadres binnen een kwartier zetten die
// sleutel een kwartier op slot, ongeacht het IP. Die teller stond alleen in het geheugen:
// sinds #207 overleven sessies een uitrol, de rem niet. Elke uitrol (ruim twintig per dag)
// gaf een aanvaller die zijn pogingen over veel IP's verdeelt dus tien nieuwe pogingen, ook
// midden in een slot. Nu staat de teller ook in een bestand in de datamap.
//
// Wat er op schijf staat: per sleutel alleen de SHA-256 ervan (dus geen praktijknaam en geen
// e-mailadres), het begin van het kwartier en het aantal missers. Bij het inlezen vallen
// verlopen, kapotte en toekomstige rijen weg. Het bestand hoort niet in de reservekopie.
//
// Schrijven gaat via SessieTabel: een wijziging staat op schijf vóór het antwoord vertrekt
// (send() wacht op `achter`), en wijzigingen uit één beurt gaan samen weg.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SessieTabel } from "./sessie-opslag.js";

export const REM_MS = 15 * 60000;
export const REM_MAX = 10;
const MAX_RIJEN = 5000;
export const remSleutel = (k) => createHash("sha256").update("fysiplan-inlogrem|" + String(k)).digest("hex");

export async function laadRem(pad, nu = Date.now()) {
  let inhoud;
  try { inhoud = JSON.parse(await readFile(pad, "utf8")); } catch { return []; }
  const rem = inhoud && typeof inhoud === "object" && inhoud.rem && typeof inhoud.rem === "object" && !Array.isArray(inhoud.rem) ? inhoud.rem : {};
  const rijen = [];
  for (const [sleutel, r] of Object.entries(rem)) {
    if (rijen.length >= MAX_RIJEN) break;
    if (!/^[a-f0-9]{64}$/.test(sleutel) || !r || typeof r !== "object") continue;
    if (!Number.isFinite(r.start) || !Number.isInteger(r.n) || r.n < 1 || r.n > 1e6) continue;
    if (nu - r.start > REM_MS || r.start > nu + 60000) continue;
    rijen.push([sleutel, { start: r.start, n: r.n }]);
  }
  return rijen;
}

// Zelfde gebruik als de Map van vroeger (get/set/delete/size), maar de sleutel wordt gehasht
// en elke wijziging gaat naar schijf.
export class InlogRem {
  #t;
  constructor(bewaar) { this.#t = new SessieTabel((inhoud) => bewaar({ v: 1, rem: inhoud.sessies })); }
  vul(rijen) { this.#t.vul(rijen); return this; }
  get size() { return this.#t.size; }
  get(k) { return this.#t.get(remSleutel(k)); }
  set(k, v) { this.#t.set(remSleutel(k), { start: v.start, n: v.n }); return this; }
  delete(k) { return this.#t.delete(remSleutel(k)); }
  // op slot: tien of meer missers in het lopende kwartier
  opSlot(k, nu = Date.now()) {
    if (this.#t.size > MAX_RIJEN) this.ruimOp(nu);
    const t = this.get(k);
    return !!t && nu - t.start <= REM_MS && t.n >= REM_MAX;
  }
  tel(k, nu = Date.now()) {
    const t = this.get(k);
    this.set(k, !t || nu - t.start > REM_MS ? { start: nu, n: 1 } : { start: t.start, n: t.n + 1 });
  }
  ruimOp(nu = Date.now()) {
    for (const [s, v] of [...this.#t]) if (nu - v.start > REM_MS) this.#t.delete(s);
  }
  get achter() { return this.#t.achter; }
  bijgewerkt() { return this.#t.bijgewerkt(); }
  opSchijf() { return this.#t.opSchijf(); }
}
