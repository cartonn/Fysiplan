// Praktijksessies die een herstart overleven (platformreview 2026-11-11).
//
// Tot nu toe stonden de sessies alleen in het geheugen: elke uitrol (ruim twintig per dag)
// logde alle therapeuten uit. Nu staan ze ook in een bestand in de datamap.
//
// Wat er op schijf staat:
// - de SHA-256 van het sessietoken, nooit het token zelf. Het token is 192 bits toeval; wie
//   het bestand in handen krijgt (volume, kopie), kan er niet mee inloggen;
// - praktijk, tijdstip van inloggen, eventueel het lid;
// - een korte afdruk van de wachtwoordhash waarmee is ingelogd. De server vergelijkt die bij
//   elk verzoek met het wachtwoord van nu: na een wachtwoordwijziging, of als iemand anders
//   dezelfde praktijknaam opnieuw beveiligt, werkt een oude sessie niet meer, ook als hij nog
//   in het bestand staat (bijvoorbeeld na het terugzetten van een reservekopie).
//
// Het bestand hoort niet in de reservekopie buiten Railway: sessies zijn tijdelijk.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const SESSIE_MS = 30 * 86400000;
export const sessieSleutel = (token) => createHash("sha256").update(String(token)).digest("hex");
export const wachtwoordAfdruk = (hash) => createHash("sha256").update("fysiplan-sessie|" + String(hash || "")).digest("hex").slice(0, 16);

// Leest het sessiebestand en geeft alleen rijen terug die nog kunnen gelden: goede vorm,
// niet verlopen, niet uit de toekomst. Een ontbrekend of kapot bestand is een lege lijst
// (iedereen logt dan één keer opnieuw in, zoals voorheen bij elke herstart).
export async function laadSessies(pad, nu = Date.now()) {
  let inhoud;
  try { inhoud = JSON.parse(await readFile(pad, "utf8")); } catch { return []; }
  const rijen = [];
  const sessies = inhoud && typeof inhoud === "object" && inhoud.sessies && typeof inhoud.sessies === "object" ? inhoud.sessies : {};
  for (const [sleutel, s] of Object.entries(sessies)) {
    if (!/^[a-f0-9]{64}$/.test(sleutel) || !s || typeof s !== "object") continue;
    if (typeof s.pk !== "string" || !s.pk || !Number.isFinite(s.t) || typeof s.w !== "string") continue;
    if (nu - s.t > SESSIE_MS || s.t > nu + 60000) continue;
    rijen.push([sleutel, typeof s.lid === "string" && s.lid ? { pk: s.pk, t: s.t, lid: s.lid, w: s.w } : { pk: s.pk, t: s.t, w: s.w }]);
  }
  return rijen;
}

// Een Map die zichzelf bewaart: elke set, delete of clear zet het bestand opnieuw op schijf.
// Zo kan een ingetrokken sessie na een herstart niet terugkomen doordat ergens een
// schrijfactie is vergeten. Wijzigingen uit dezelfde beurt gaan in één keer weg.
//
// De server wacht met zijn antwoord tot de wijziging op schijf staat (achter / bijgewerkt()):
// "je bent ingelogd" of "je bent uitgelogd" klopt dan ook als het proces direct daarna stopt.
// Daarmee schrijft de server na zijn laatste antwoord ook niets meer naar de datamap; een test
// die het proces stopt en meteen de map opruimt, zag het sessiebestand anders soms nog
// verschijnen (ENOTEMPTY bij het opruimen).
export class SessieTabel extends Map {
  #bewaar;
  #klaar = false;
  #bezig = null;
  #opnieuw = false;
  #versie = 0;     // telt elke wijziging sinds het inlezen
  #geschreven = 0; // tot en met welke wijziging het bestand bij is
  #wachters = [];
  constructor(bewaar) { super(); this.#bewaar = bewaar; }
  // bij de start: inlezen zonder terug te schrijven; pas daarna telt elke wijziging
  vul(rijen) {
    for (const [sleutel, s] of rijen) super.set(sleutel, s);
    this.#klaar = true;
    return this;
  }
  set(sleutel, s) { super.set(sleutel, s); this.#plan(); return this; }
  delete(sleutel) { const weg = super.delete(sleutel); if (weg) this.#plan(); return weg; }
  clear() { const had = this.size > 0; super.clear(); if (had) this.#plan(); }
  #plan() {
    if (!this.#klaar) return;
    this.#versie++;
    if (this.#bezig) { this.#opnieuw = true; return; }
    this.#bezig = (async () => {
      do {
        this.#opnieuw = false;
        await new Promise((klaar) => setImmediate(klaar));
        // de stand en het volgnummer horen bij hetzelfde moment: wat hierna nog wijzigt,
        // zet #opnieuw en komt in de volgende ronde
        const tot = this.#versie;
        try { await this.#bewaar({ v: 1, sessies: Object.fromEntries(this) }); }
        catch (err) { console.error("sessies bewaren:", err && err.message ? err.message : err); }
        // ook na een schrijffout verder: de fout staat in het log, en wie wacht blijft niet hangen
        this.#geschreven = tot;
        const wachters = this.#wachters;
        this.#wachters = [];
        for (const klaar of wachters) klaar();
      } while (this.#opnieuw);
      this.#bezig = null;
    })();
  }
  // true zolang er een wijziging is die nog niet op schijf staat
  get achter() { return this.#geschreven < this.#versie; }
  // Wachten tot alles wat tot nu toe gewijzigd is op schijf staat. Wijzigingen van daarna
  // tellen niet mee: de wachttijd is dus hooguit de lopende schrijfactie plus één volgende,
  // ook als er intussen steeds nieuwe sessies bijkomen.
  async bijgewerkt() {
    const doel = this.#versie;
    while (this.#geschreven < doel) await new Promise((klaar) => this.#wachters.push(klaar));
  }
  // wachten tot er geen schrijfactie meer loopt (bij afsluiten en in tests)
  async opSchijf() { while (this.#bezig) await this.#bezig; }
}
