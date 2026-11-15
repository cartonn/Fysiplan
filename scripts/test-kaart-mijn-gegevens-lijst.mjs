// "Mijn gegevens" op /k tegen wat de patiëntkaart echt bewaart (legal-routine 2026-11-15 17u, gebied (e)/(a)).
// Vóór deze fix noemde de opsomming "Wat je aantikt" alleen pijnscores, gedaan, te zwaar en seintjes, terwijl
// de server ook "ervaren herstel sinds de start" (/api/kaart/ervaring) en de score van de doelactiviteit
// (/api/kaart/psk) bewaart, in de download zet en /privacy#patient ze wel noemt (AVG art. 12 lid 1, art. 13).
// Fail-closed: elke dagscore-route in lib/patient-routes.js moet een vaste plek hieronder hebben, en die plek
// moet in de Nederlandse tekst én in /privacy#patient staan; elke kaarttaal noemt evenveel onderdelen.
// Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const kaart = await readFile("public/kaart.html", "utf8");
const routes = await readFile("lib/patient-routes.js", "utf8");
const juridisch = await readFile("public/juridisch.html", "utf8");

// dagscore-veld → [woorden in "Mijn gegevens" (nl), woorden in /privacy#patient]
const PLEK = {
  metingen: ["pijnscores", "pijnscore"],
  ervaring: ["hoe het gaat sinds de start", "hoe het gaat sinds de start"],
  psk: ["hoe je doelactiviteit gaat", "hoe je doelactiviteit gaat"],
};

const velden = [...routes.matchAll(/dagScore\("([a-z]+)"/g)].map((m) => m[1]);
assert.ok(velden.length >= 3, "dagScore-routes niet gevonden in lib/patient-routes.js");

const tmg = kaart.match(/var TMG=\{([\s\S]*?)\};\n/);
assert.ok(tmg, "TMG (Mijn gegevens) niet gevonden in public/kaart.html");
const l2 = Object.fromEntries([...tmg[1].matchAll(/([a-z]{2}):\{kop:'[^']*'[^}]*?l2:'([^']*)'/g)].map((m) => [m[1], m[2]]));
assert.deepEqual(Object.keys(l2).sort(), ["ar", "de", "en", "es", "fr", "nl", "pl", "tr", "uk"], "niet alle kaarttalen hebben een l2");

const aantik = juridisch.match(/<b>Wat je zelf aantikt:<\/b>([^<]*)/);
assert.ok(aantik, "/privacy#patient: regel 'Wat je zelf aantikt' niet gevonden");

for (const v of velden) {
  assert.ok(PLEK[v], `nieuwe dagscore "${v}" zonder plek in Mijn gegevens: zet hem in kaart.html (TMG.l2) en in PLEK`);
  assert.ok(l2.nl.includes(PLEK[v][0]), `Mijn gegevens (nl) noemt "${PLEK[v][0]}" niet`);
  assert.ok(aantik[1].includes(PLEK[v][1]), `/privacy#patient noemt "${PLEK[v][1]}" niet`);
}
for (const w of ["gedaan", "te zwaar", "seintjes"]) assert.ok(l2.nl.includes(w), `Mijn gegevens (nl) noemt "${w}" niet`);

// Elke taal noemt evenveel onderdelen als het Nederlands (gescheiden door komma's).
const delen = (t) => t.slice(t.indexOf(":") + 1).split(/[,،]/).length;
for (const [taal, t] of Object.entries(l2)) assert.equal(delen(t), delen(l2.nl), `Mijn gegevens (${taal}) noemt niet alle onderdelen: ${t}`);

console.log("test-kaart-mijn-gegevens-lijst: ok (" + velden.join(", ") + ")");
