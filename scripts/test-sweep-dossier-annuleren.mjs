// Gebruikers-sweep 2026-11-14 10u en 14u (Mark, desktop, Vandaag): zonder klembord toont "Naar dossier" een venster
// om de samenvatting zelf te kopiëren. Annuleren zette toch het label "in dossier" op de kaart, terwijl er niets in
// het dossier stond. Nu: Annuleren (prompt geeft null) zet geen label. Draait zonder browser (CI).
// `npm run test:dossierannuleren`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const html = await readFile(join(process.cwd(), "public/index.html"), "utf8");
assert.doesNotMatch(html, /window\.prompt\('Kopieer de samenvatting voor het dossier:',tekst\);label\(\);/, "geen label meer direct na het venster");
const m = html.match(/              var handmatig=function\(\)\{[\s\S]*?\n              \};\n/);
assert.ok(m, "handmatig kopiëren staat in een eigen functie");

function draai(antwoord) {
  const ctx = { gelabeld: 0, getoond: [], tekst: "samenvatting", window: { prompt: () => antwoord } };
  vm.runInNewContext("var label=function(){gelabeld++;};var toon=function(t){getoond.push(t);};" + m[0] + "handmatig();", ctx);
  return ctx;
}
const annuleren = draai(null);
assert.equal(annuleren.gelabeld, 0, "Annuleren zet geen label");
assert.match(annuleren.getoond.join(" "), /Niet gekopieerd/, "en zegt dat");
const ok = draai("samenvatting");
assert.equal(ok.gelabeld, 1, "OK zet het label");
// beide takken (geen klembord, en klembord geweigerd) gaan via handmatig
assert.match(html, /navigator\.clipboard\.writeText\(tekst\)\.then\(label\)\.catch\(handmatig\);\s*\}else handmatig\(\);/, "beide takken via handmatig");
console.log("test-dossier-annuleren: ok (Annuleren zet geen label 'in dossier')");
