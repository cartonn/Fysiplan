// /k op een Engelse (of andere niet-Nederlandse) kaart: de tabtitel staat meteen in de taal van de kaart,
// ook op een trage lijn voordat het hoofdscript draait, en de tooltip van de printknop is vertaald
// (gebruikers-sweep 2026-11-19 18u, Jayden, Pixel 7 en iPhone 14). Zonder browser. `npm run test:kaarttitel`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../public/kaart.html", import.meta.url), "utf8");
const vroeg = html.match(/<script>\s*\/\/ laadtekst meteen in de taal van de kaart[\s\S]*?<\/script>/);
assert.ok(vroeg, "vroeg taalscript gevonden");
const code = vroeg[0].replace(/^<script>|<\/script>$/g, "");

// het vroege script draaien met een nagebootste pagina
function draai(zoek, talen) {
  const doc = { title: "Trainingskaart — Fysiplan", documentElement: { lang: "nl", dir: "" }, getElementById: () => ({ textContent: "" }) };
  const ctx = { document: doc, location: { search: zoek, pathname: "/k/abc123def456" }, navigator: { languages: talen, language: talen[0] },
    localStorage: { getItem: () => null }, URLSearchParams, JSON, Object, String };
  vm.runInNewContext(code, ctx);
  return doc;
}
assert.equal(draai("?taal=en", ["nl-NL"]).title, "Training card — Fysiplan");
assert.equal(draai("", ["en-GB"]).title, "Training card — Fysiplan", "Engelse telefoontaal");
assert.equal(draai("?taal=de", ["nl-NL"]).title, "Trainingskarte — Fysiplan");
assert.equal(draai("?taal=fr", ["nl-NL"]).title, "Carte d'entraînement — Fysiplan");
assert.equal(draai("", ["nl-NL"]).title, "Trainingskaart — Fysiplan", "Nederlands blijft Nederlands");

// de titels in het vroege script zijn dezelfde als de 'eyebrow' uit de vertaaltabel
const titels = [...code.matchAll(/([a-z]{2}):(?:'([^']*)'|"([^"]*)")/g)].filter((m) => code.indexOf("TITEL=") < m.index);
for (const m of titels) {
  const t = m[1], tekst = m[2] ?? m[3];
  const eb = html.match(new RegExp("\\b" + t + ":\\{eyebrow:(?:'([^']*)'|\"([^\"]*)\")"));
  if (eb) assert.equal(tekst, eb[1] ?? eb[2], "titel " + t + " gelijk aan eyebrow");
}

// printknop: title mee vertaald (aria-label en tekst werden al vertaald)
assert.match(html, /prb\.title=TAAL==='nl'\?'Print of bewaar als PDF':trg\('print'\)/, "title van de printknop volgt de taal");
console.log("kaarttitel-taal: ok");
