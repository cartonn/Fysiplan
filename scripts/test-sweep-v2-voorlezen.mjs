// Regressietest gebruikers-sweep 2026-11-22 02u (Truus, iPhone SE): /v2 beloofde "oefeningen met voorgelezen
// uitleg" en "uitleg bij elke oefening, ook voorgelezen" zonder voorbehoud, terwijl maar een klein deel van de
// oefeningen een Nederlandse opname heeft; bij haar zes gangbare oefeningen ontbrak de knop. Elders op /v2 stond
// al "waar beschikbaar". Nu overal. Zonder browser. `npm run test:v2voorlezen`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/v2.html", import.meta.url), "utf8");
assert.doesNotMatch(html, /voorgelezen uitleg/i, "geen 'voorgelezen uitleg' zonder voorbehoud");
assert.doesNotMatch(html, /ook voorgelezen/i, "geen 'ook voorgelezen' zonder voorbehoud");
// elke zin met "voorgelezen" noemt dat het niet overal kan
for (const zin of html.replace(/<[^>]+>/g, " ").split(/[.!?]\s/)) {
  if (/voorgelezen/i.test(zin)) assert.match(zin, /waar beschikbaar/i, "voorbehoud ontbreekt: " + zin.trim().slice(0, 120));
}
console.log("test-sweep-v2-voorlezen: /v2 belooft voorlezen alleen waar beschikbaar");
