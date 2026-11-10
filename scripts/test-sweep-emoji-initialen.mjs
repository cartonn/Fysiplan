// Gebruikers-sweep 2026-11-10 (Sanne, desktop): een emoji vooraan in de praktijknaam of roepnaam
// ("🦵 Fysio…", "👩‍⚕️ Émile") gaf als initiaal een half teken "�" in de praktijkbadge en het
// kaartenoverzicht. `npm run test:emojiinitialen`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const html = await readFile(join(process.cwd(), "public/index.html"), "utf8");
const tussen = html.match(/var TUSSEN=\{[^\n]*\};/)[0];
const begin = html.indexOf("function avInitialen(naam){");
const eind = html.indexOf("function avKleur(naam){");
assert.ok(begin > 0 && eind > begin, "avInitialen gevonden");
const ctx = {};
vm.runInNewContext(tussen + "\n" + html.slice(begin, eind) + "\nthis.f=avInitialen;", ctx);
const f = ctx.f;
const geenHalf = (s) => !/[\uD800-\uDFFF]/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""));
const gevallen = {
  "😀 Sanne": "S",
  "👩‍⚕️ Émile": "É",
  "🦵 Fysio Beweeg": "FB",
  "Jan van der Berg": "JB",
  "sanne.de.vries@voorbeeld.nl": "SV",
  "Fysio 🦵": "F",
  "": "?",
  "🦵": "?",
};
for (const [in_, uit] of Object.entries(gevallen)) {
  const r = f(in_);
  assert.ok(geenHalf(r), `geen halve surrogaat voor ${JSON.stringify(in_)}: ${JSON.stringify(r)}`);
  assert.equal(r, uit, `initialen van ${JSON.stringify(in_)}`);
}
console.log("emoji-initialen: ok");
