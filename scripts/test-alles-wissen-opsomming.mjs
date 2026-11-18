// "Alles wissen" op /v2/gegevens tegen wat praktijkAllesWissen echt wist (legal-routine 2026-11-18, gebied (e)).
// Vóór deze fix noemde de lijst onder "Alles wissen" alleen kaarten, eigen oefeningen, sjablonen, logo,
// proefaanmelding, wachtwoord en logboek. De server wist ook de logins van het team, de eigen vragen, het
// leeslog, open ideeën in de ideeënbox en wat Fysiplan-support over de praktijk bijhoudt. Wie zijn rechten
// uitoefent, moet vooraf weten wat er weggaat en wat blijft (AVG art. 12 lid 1, art. 17).
// Fail-closed: elke wisstap in praktijkAllesWissen (server.js) moet hieronder een plek hebben, en die plek
// moet in het blok "Alles wissen" (public/proef.html) én in de bevestiging na het wissen staan.
// Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bron = await readFile(["ser", "ver.js"].join(""), "utf8");
const proef = await readFile("public/proef.html", "utf8");

const fn = bron.match(/async function praktijkAllesWissen\(pk\) \{([\s\S]*?)\n\}\n/);
assert.ok(fn, "praktijkAllesWissen niet gevonden in server.js");
const romp = fn[1];

// wisstap (zoals hij in de code staat) → [woord in de lijst op /v2/gegevens, woord in de bevestiging]
const PLEK = {
  "delete kaarten[": ["alle kaarten", "kaart"],
  "ruimKaartVideosOp(": ["eigen video", null],
  "delete praktijkOefeningen[": ["eigen oefeningen", "eigen oefeningen"],
  "delete praktijkSjablonen[": ["sjablonen", "sjablonen"],
  "delete praktijkVragen[": ["eigen vragen", "vragen"],
  "delete praktijken[": ["praktijkgegevens", "praktijkgegevens"],
  "proefNaPraktijkWissen(": ["proefaanmelding", "proefaanmelding"],
  "delete praktijkAccounts[": ["logins van je team", "logins van je team"],
  "praktijkAudit = ": ["logboek", "logboek"],
  "leeslogRegels.wisPraktijk(": ["leeslog", "leeslog"],
  "ideeenbox.wisPraktijk(": ["idee&euml;nbox", "ideeën"],
  "beheerOmgeving.wisPraktijk(": ["Fysiplan-support", "Fysiplan-support"],
  // afgeleid: vertaalde namen van eigen oefeningen (al genoemd onder eigen oefeningen)
  "vertaalCacheOpschonen(": [null, null],
  // geheugen, geen opslag van gegevens
  "praktijkSessies.delete(": [null, null],
};

// alle wisstappen in de functie: delete X[, X = X.filter, .wisPraktijk(, en de bekende helpers
const stappen = new Set([
  ...[...romp.matchAll(/delete (\w+)\[/g)].map((m) => `delete ${m[1]}[`),
  ...[...romp.matchAll(/(\w+) = \1\.filter\(/g)].map((m) => `${m[1]} = `),
  ...[...romp.matchAll(/(\w+(?:\.\w+)?)\.wisPraktijk\(/g)].map((m) => `${m[1]}.wisPraktijk(`),
  ...[...romp.matchAll(/\b(ruimKaartVideosOp|proefNaPraktijkWissen|vertaalCacheOpschonen|praktijkSessies\.delete)\(/g)].map((m) => `${m[1]}(`),
]);
assert.ok(stappen.size >= 10, "te weinig wisstappen gevonden; is praktijkAllesWissen omgebouwd?");

const blok = proef.match(/<h2>Alles wissen<\/h2>([\s\S]*?)<form/);
assert.ok(blok, "blok 'Alles wissen' niet gevonden in public/proef.html");
const lijst = blok[1];
const bevestiging = bron.match(/KOP: "Alles van je praktijk is gewist\.",\s*\n?([\s\S]*?)KNOP_HTML/);
assert.ok(bevestiging, "bevestiging na Alles wissen niet gevonden in server.js");

for (const s of stappen) {
  assert.ok(Object.hasOwn(PLEK, s), `nieuwe wisstap "${s}" in praktijkAllesWissen zonder plek: noem hem onder "Alles wissen" op /v2/gegevens en in de bevestiging, en zet hem in PLEK`);
  const [inLijst, inBevestiging] = PLEK[s];
  if (inLijst) assert.ok(lijst.includes(inLijst), `"Alles wissen" op /v2/gegevens noemt "${inLijst}" niet (wisstap ${s})`);
  if (inBevestiging) assert.ok(bevestiging[1].includes(inBevestiging), `bevestiging na Alles wissen noemt "${inBevestiging}" niet (wisstap ${s})`);
}
// wat blijft, moet er ook staan
assert.ok(/besloten idee&euml;n en stemmen blijven/.test(lijst), "'Alles wissen' zegt niet dat besloten ideeën en stemmen blijven");
assert.ok(/reservekopie staat het nog hooguit 7 dagen/.test(blok[1]), "'Alles wissen' noemt de reservekopie niet");

console.log(`test-alles-wissen-opsomming: ${stappen.size} wisstappen, elk genoemd op /v2/gegevens en in de bevestiging`);
