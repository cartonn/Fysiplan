// MDR en AI-verordening (legal-routine 2026-11-12):
// 1. De zoekhulp in de therapeut-app (/v2/app) laat een AI-dienst oefeningen kiezen en er een
//    korte zin bij schrijven. Art. 50 lid 1 AI-verordening: wie met een AI-systeem werkt, hoort
//    dat te weten. De therapeut moet ook zien dat de keuze ernaast kan zitten (hij kiest zelf).
// 2. Op de patiëntkaart (/k) wordt de uitleg van een oefening in een andere taal automatisch
//    vertaald. Een fout in een uitvoeringsinstructie kan iemand verkeerd laten oefenen; onder
//    een vertaalde uitleg staat dus dat het een automatische vertaling is, in elke kaarttaal.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const lees = (p) => readFileSync(new URL("../public/" + p, import.meta.url), "utf8");
const app = lees("index.html");
const kaart = lees("kaart.html");
const pak = (bron, re, wat) => { const m = bron.match(re); assert.ok(m, wat + " niet gevonden"); return m[0]; };

// 1. zoekhulp: melding in het venster en bij de uitkomst
const venster = pak(app, /<div class="ov" id="ovAi">[\s\S]*?<label for="ai_regio">/, "zoekhulpvenster");
assert.match(venster, /werkt met AI/, "zoekhulpvenster zegt dat de zoekhulp met AI werkt");
assert.match(venster, /kijk zelf/i, "zoekhulpvenster zegt dat de therapeut zelf beoordeelt");
assert.match(pak(app, /<div class='ai-toel'>[^<]*<\/div>/, "uitkomstregel zoekhulp"), /met AI/, "uitkomst van de zoekhulp zegt dat die met AI gekozen is");

// 2. kaart: vertaalde uitleg krijgt een regel "automatisch vertaald", onvertaalde niet
const TALEN = ["en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
const code = [
  pak(kaart, /function esc\([^)]*\)\{[^\n]*\n/, "esc"),
  "var TAAL='nl',VERT={};",
  pak(kaart, /function vt\(s\)\{[^\n]*\n/, "vt"),
  pak(kaart, /function uitlegNietVertaald\(s\)\{[^\n]*\n/, "uitlegNietVertaald"),
  pak(kaart, /var NIET_VERTAALD=\{[^\n]*\n/, "NIET_VERTAALD"),
  pak(kaart, /var AUTO_VERTAALD=\{[^\n]*\n/, "AUTO_VERTAALD"),
  pak(kaart, /function uitlegAutoVertaald\(s\)\{[^\n]*\n/, "uitlegAutoVertaald"),
  pak(kaart, /var ZO_DOE=\{[^\n]*\n/, "ZO_DOE"),
  pak(kaart, /function uitlegZinnen\(t\)\{[\s\S]*?\n  \}\n/, "uitlegZinnen"),
  pak(kaart, /function oefUitlegBlok\(o,gehouden\)\{[\s\S]*?\n  \}\n/, "oefUitlegBlok"),
].join("\n");
const ctx = vm.createContext({});
vm.runInContext(code, ctx);
const AUTO = vm.runInContext("AUTO_VERTAALD", ctx);
const uitleg = "Ga rechtop staan. Zak langzaam door de knieën.";
for (const t of TALEN) {
  assert.ok(String(AUTO[t] || "").length > 10, "regel 'automatisch vertaald' bestaat in " + t);
  assert.ok(!/\bAI\b/.test(AUTO[t]), "geen AI-woord waar de wet het niet vraagt (" + t + ")");
  vm.runInContext(`TAAL=${JSON.stringify(t)};VERT={};VERT[TAAL]={};VERT[TAAL][${JSON.stringify(uitleg)}]='vertaald: '+${JSON.stringify(t)};`, ctx);
  const html = vm.runInContext(`oefUitlegBlok({uitleg:${JSON.stringify(uitleg)}},false)`, ctx);
  assert.ok(html.includes("autovertaald") && html.includes(vm.runInContext("esc(AUTO_VERTAALD[TAAL])", ctx)), "vertaalde uitleg (" + t + ") draagt de regel: " + html);
  vm.runInContext("VERT[TAAL]={}", ctx);
  const nietVertaald = vm.runInContext(`oefUitlegBlok({uitleg:${JSON.stringify(uitleg)}},false)`, ctx);
  assert.ok(!nietVertaald.includes("autovertaald"), "onvertaalde uitleg (" + t + ") zegt niet dat hij vertaald is");
}
vm.runInContext("TAAL='nl'", ctx);
assert.ok(!vm.runInContext(`oefUitlegBlok({uitleg:${JSON.stringify(uitleg)}},false)`, ctx).includes("autovertaald"), "Nederlandse kaart zonder vertaalregel");

console.log("AI-melding zoekhulp en regel 'automatisch vertaald' op de kaart: in orde.");
