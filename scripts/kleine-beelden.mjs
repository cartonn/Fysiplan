// Bouwstap: kleine versies van de bibliotheekbeelden voor de oefenlijst (zie lib/klein-beeld.js).
// Draait in `npm run build`, dus op Railway en in CI. Schrijft naar dist/klein/ en legt in
// dist/klein/index.json vast hoeveel er staan; /health toont dat getal als "kleineBeelden".
//
// Deze stap houdt een uitrol nooit tegen: lukt een beeld niet, of laadt de beeldbibliotheek niet,
// dan staat dat in het log en toont de app op die plek het volledige bestand, zoals voorheen.
// Dat het wél werkt bewaakt de test (`npm run test:lichtladen`): die is rood als de kleine
// beelden ontbreken.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { kleinMap, maakKleineBeelden } from "../lib/klein-beeld.js";

const start = Date.now();
let uit = { totaal: 0, gemaakt: 0, bijgewerkt: 0, fouten: [], bytes: 0 };
try {
  uit = await maakKleineBeelden();
} catch (e) {
  uit.fouten.push("beeldbibliotheek: " + ((e && e.message) || e));
}
const aantal = uit.gemaakt + uit.bijgewerkt;
try {
  await mkdir(kleinMap(), { recursive: true });
  await writeFile(join(kleinMap(), "index.json"), JSON.stringify({ aantal, bytes: uit.bytes, px: 160, gemaakt: new Date().toISOString() }, null, 2));
} catch (e) {
  uit.fouten.push("index.json: " + ((e && e.message) || e));
}
for (const f of uit.fouten.slice(0, 20)) console.warn("kleine beelden: overgeslagen:", f);
if (uit.fouten.length > 20) console.warn(`kleine beelden: en nog ${uit.fouten.length - 20} overgeslagen`);
console.log(`Kleine beelden: ${aantal} van ${uit.totaal} (${uit.gemaakt} nieuw, samen ${(uit.bytes / 1048576).toFixed(1)} MB) in ${((Date.now() - start) / 1000).toFixed(1)} s` +
  (uit.fouten.length ? `; ${uit.fouten.length} niet gelukt, daar toont de app het volledige bestand` : ""));
