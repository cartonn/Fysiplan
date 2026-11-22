// Legal 2026-11-22 21u, verwerkersovereenkomst (b).
// Art. 2 van de verwerkersovereenkomst noemt twee groepen betrokkenen: patiënten én medewerkers van de
// praktijk (leeslog, Activiteit, logins). Art. 4 (geheimhouding), art. 9 (datalekken) en art. 12 (looptijd)
// spraken alleen over "patiëntgegevens". Art. 28 lid 3 b en art. 33 lid 2 AVG gelden voor alle
// persoonsgegevens die de verwerker voor de praktijk verwerkt, en art. 33 lid 3 en 4 zeggen wat een melding
// bevat (soorten gegevens, ongeveer hoeveel mensen, maatregelen, een contactpunt; stapsgewijs als nog niet
// alles bekend is). Faalt zonder de fix. Zonder server en zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/juridisch.html", import.meta.url), "utf8");
const blok = html.match(/<!--blok:vwo-->([\s\S]*?)<!--\/blok-->/);
assert.ok(blok, "blok vwo gevonden");
const tekst = (h) => h.replace(/<[^>]+>/g, " ").replace(/&euml;/g, "ë").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
const artikel = (n) => {
  const m = blok[1].match(new RegExp("<h2>" + n + "\\. [^<]*</h2>([\\s\\S]*?)(?=<h2>|</main>|$)"));
  assert.ok(m, "artikel " + n + " gevonden");
  return tekst(m[1]);
};

const a2 = artikel(2);
assert.match(a2, /medewerkers van de praktijk/, "art. 2 noemt medewerkers als betrokkenen");

for (const n of [4, 9, 12]) {
  const t = artikel(n);
  assert.doesNotMatch(t, /patiëntgegevens/, "art. " + n + " beperkt zich niet tot patiëntgegevens");
  assert.match(t, /medewerkers/, "art. " + n + " noemt ook de medewerkers van de praktijk");
}

const a9 = artikel(9);
assert.match(a9, /48 uur/, "art. 9 houdt de termijn van 48 uur");
assert.match(a9, /soorten gegevens/, "art. 33 lid 3 a: soorten gegevens");
assert.match(a9, /ongeveer hoeveel mensen/, "art. 33 lid 3 a: ongeveer hoeveel betrokkenen");
assert.match(a9, /nog gaat doen/, "art. 33 lid 3 d: voorgestelde maatregelen");
assert.match(a9, /wie de praktijk erover kan bereiken/, "art. 33 lid 3 b: contactpunt");
assert.match(a9, /de rest zodra/, "art. 33 lid 4: stapsgewijs melden");

// een inhoudelijke wijziging vraagt een nieuw akkoord: de versie en de uitleg in de app horen erbij
const server = await readFile(new URL("../server.js", import.meta.url), "utf8");
const versie = server.match(/const VWO_VERSIE = "([^"]+)"/)[1];
assert.ok(versie >= "2026-11-22", "VWO_VERSIE opgehoogd voor deze wijziging");
assert.match(server, /stuk: "vwo", versie: "2026-11-22", tekst: "Datalekken/, "AKKOORD_WIJZIGINGEN legt de wijziging uit");

console.log("OK: geheimhouding, datalekken en looptijd in de verwerkersovereenkomst gelden ook voor gegevens van medewerkers.");
