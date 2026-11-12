// AI-verordening art. 50 lid 4: de luisterstem op de patiëntkaart (/k) is vooraf met AI
// gemaakt (HeyGen-stem). Overal waar die stem speelt moet de patiënt dat kunnen zien:
// bij de knop per oefening (ook zonder AI-video) én bij de knop bovenaan en in de
// vergroting, waar de zin per oefening niet in beeld staat.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/kaart.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../public/audio/noor/manifest.json", import.meta.url), "utf8"));
assert.match(String(manifest.engine || "") + " " + JSON.stringify(manifest.clips?.[0]?.provenance || {}), /heygen/i, "uitgangspunt: de stem komt uit een AI-stemdienst");

const pak = (re, wat) => { const m = html.match(re); assert.ok(m, wat + " niet gevonden"); return m[0]; };
const AI = "met AI gemaakt";

// 1. de regel bij de knop per oefening noemt AI, met en zonder AI-video
const code = [
  pak(/var STEM_NOOT='[^']+';/, "STEM_NOOT"),
  pak(/var STEM_VIDEO_NOOT='[^']+';/, "STEM_VIDEO_NOOT"),
  pak(/function noorClipNaam\(item\)\{[\s\S]*?\n  \}\n/, "noorClipNaam"),
  pak(/function noorRegel\(o,idx,metAiVideo\)\{[\s\S]*?\n  \}\n/, "noorRegel"),
].join("\n");
const NoorAudio = { match: () => true };
const ctx = vm.createContext({ bezigLezen: false, noorBron: -1, NOOR_LABEL: "Luister", tr: (k) => k, NoorAudio, window: { NoorAudio } });
vm.runInContext(code, ctx);
for (const metVideo of [false, true]) {
  const regel = vm.runInContext(`noorRegel({naam:'x',uitleg:'y'},0,${metVideo})`, ctx);
  assert.ok(regel.includes(AI), `luisterregel ${metVideo ? "met" : "zonder"} AI-video zegt dat de stem met AI is gemaakt: ${regel}`);
}

// 2. bovenaan en in de vergroting: een zichtbare regel zolang de stem speelt
for (const id of ["leesNoot", "lbStemNoot"]) {
  const el = pak(new RegExp(`<p class="vmeta stemnoot" id="${id}" hidden>[^<]*</p>`), id);
  assert.ok(el.includes(AI), id + " zegt dat de stem met AI is gemaakt");
}
const toon = pak(/function toonStemNoot\(aan\)\{[\s\S]*?\n  \}\n/, "toonStemNoot");
const els = { leesNoot: { hidden: true }, lbStemNoot: { hidden: true } };
const ctx2 = vm.createContext({ document: { getElementById: (id) => els[id] || null } });
vm.runInContext(toon, ctx2);
vm.runInContext("toonStemNoot(true)", ctx2);
assert.ok(!els.leesNoot.hidden && !els.lbStemNoot.hidden, "toonStemNoot(true) toont de regel");
vm.runInContext("toonStemNoot(false)", ctx2);
assert.ok(els.leesNoot.hidden && els.lbStemNoot.hidden, "toonStemNoot(false) verbergt de regel");

const speel = pak(/async function speelNoor\(items,bron\)\{[\s\S]*?\n  \}\n/, "speelNoor");
assert.ok(/stopLezen\(\);[\s\S]*toonStemNoot\(bron<0\)/.test(speel), "speelNoor toont de regel na het stoppen van de vorige beurt, alleen zonder knop per oefening");
const stop = pak(/function stopLezen\(\)\{[\s\S]*?\n  \}\n/, "stopLezen");
assert.ok(stop.includes("toonStemNoot(false)"), "stoppen verbergt de regel weer");

console.log("Stem-AI-melding: luisterregel per oefening, knop bovenaan en vergroting noemen dat de stem met AI is gemaakt.");
