// Gebruikers-sweep 2026-11-13 02u, drie kleine schermfouten:
// - Vandaag (Sanne, desktop): "Iedereen met een kaart heeft deze week geoefend." terwijl niemand
//   oefende; kaarten jonger dan twee dagen tellen niet mee en de lege tekst ging ervan uit dat
//   er wel kaarten meetelden.
// - Proefteller "12 / 12 oefeningen" (Sanne): rood van V2 (--fout = #ffb4a8) op een witte pil, 1,7:1.
// - Engelse kaart (Jayden, Pixel 7 / iPhone 14): "December 27, 2026" (en-US) naast "Tuesday 17
//   November" (en-GB) op dezelfde kaart.
// De functies worden uit de pagina's gehaald en zonder browser uitgevoerd; past in CI.
// `npm run test:vandaagdatums`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
const knip = (bron, begin, eind) => {
  const a = bron.indexOf(begin);
  assert.ok(a >= 0, "niet gevonden: " + begin);
  const b = bron.indexOf(eind, a);
  assert.ok(b > a, "einde niet gevonden: " + eind);
  return bron.slice(a, b);
};

// ---- Vandaag: niet geoefend ----
{
  const code = knip(idx, "function tekenNietGeoefend(", "\n  // met een login opent");
  const el = { innerHTML: "", addEventListener() {} };
  const blok = { appendChild() {}, insertBefore() {} };
  const ctx = {
    document: { getElementById: (id) => (id === "k_nietgeoefend" ? el : null), createElement: () => el },
    PRAKSLOT: { wie: "Sanne de Vries" }, INBOX_ALLEEN_MIJN: false,
    oefDagen: (c) => c.dagen || [], esc: (x) => String(x), avRond: () => "", wanneerTekst: () => "",
    openSrvKaart() {}
  };
  vm.createContext(ctx);
  vm.runInContext(code + ";this.teken=tekenNietGeoefend;", ctx);
  const dag = 864e5, nu = Date.now();
  const tekst = (lijst) => { ctx.teken(blok, lijst); return el.innerHTML; };

  let h = tekst([{ id: "a", naam: "Jan", ts: nu - 3600e3 }, { id: "b", naam: "Els", ts: nu - dag }]);
  assert.doesNotMatch(h, /Iedereen/, "alleen nieuwe kaarten: niet 'iedereen heeft geoefend'");
  assert.match(h, /vanaf twee dagen/);
  h = tekst([]);
  assert.doesNotMatch(h, /Iedereen/, "geen kaarten: niet 'iedereen heeft geoefend'");
  assert.match(h, /Nog geen gedeelde kaarten/);
  h = tekst([{ id: "a", naam: "Jan", ts: nu - 5 * dag, dagen: [{ t: nu - dag }] }, { id: "b", naam: "Els", ts: nu - dag }]);
  assert.match(h, /Iedereen met een kaart heeft deze week geoefend/, "wel als er een kaart meetelde en die oefende");
  h = tekst([{ id: "a", naam: "Jan", ts: nu - 5 * dag, bekeken: 1 }]);
  assert.match(h, /Deze week niet geoefend <span class='ib-tel'>1/, "wie niet oefende staat er nog steeds");
  assert.match(h, /Jan/);
}

// ---- proefteller: leesbaar rood op de witte pil ----
{
  const code = knip(idx, "function proefTeller(", "\n  function proefZetPraktijk");
  assert.doesNotMatch(code, /var\(--fout/, "geen --fout (licht in V2) op de witte pil");
  assert.match(code, /classList\.toggle\('vol'/);
  assert.match(idx, /\.proefbalk \.pb-tel\.vol\{color:#b42318\}/, "vol: vast drukrood op de witte pil");
}

// ---- Engelse kaart: datums in en-GB ----
{
  const code = knip(kaart, "function datumLocale(", "\n");
  const ctx = { TAAL: "en" };
  vm.createContext(ctx);
  vm.runInContext(code + ";this.loc=datumLocale;", ctx);
  const d = new Date(Date.UTC(2026, 11, 27, 12));
  assert.equal(d.toLocaleDateString(ctx.loc(), { day: "numeric", month: "long", year: "numeric" }), "27 December 2026");
  ctx.TAAL = "nl";
  assert.equal(ctx.loc(), "nl-NL");
  ctx.TAAL = "de";
  assert.equal(ctx.loc(), "de");
  assert.doesNotMatch(kaart, /toLocaleDateString\(TAAL==='nl'\?'nl-NL':TAAL,/, "geen en-US-datums meer via TAAL");
}
console.log("PASS Vandaag zegt niet 'iedereen geoefend' zonder meetellende kaarten, proefteller leesbaar, Engelse datums en-GB");
