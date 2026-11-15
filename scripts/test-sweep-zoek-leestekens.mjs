// Regressietest gebruikers-sweep 2026-11-15 (MIDDEL, Sanne, desktop): zoeken in de bibliotheek plakte woorden aan elkaar.
// "rug/nek", "knie-oefening" of "hamstring rekken" werd één woord ("rugnek", "knieoefening") dat nergens in staat: 0 treffers.
// Ook "enkels" vond niets, terwijl er enkeloefeningen zijn. Nu splitst het zoeken eerst op spaties en leestekens en kijkt het
// ook naar het enkelvoud. Geen browser nodig: de zoekfuncties komen rechtstreeks uit public/index.html.
// `npm run test:zoekleestekens`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
const lib = JSON.parse(await readFile(join(root, "public/oefeningen-v2.json"), "utf8"));

const pak = (re, wat) => { const m = index.match(re); assert.ok(m, wat + " gevonden in index.html"); return m[0]; };
const bron = [
  pak(/function normEx\(s\)\{[^\n]*\}/, "normEx"),
  pak(/var SEARCH_SYNONYMS=\{[\s\S]*?\n  \};/, "SEARCH_SYNONYMS"),
  pak(/if\(USE_V2_LIBRARY\)Object\.assign\(SEARCH_SYNONYMS,\{[\s\S]*?\n  \}\);/, "v2-synoniemen"),
  pak(/function searchWords\(value\)\{[\s\S]*?\n  \}/, "searchWords"),
  pak(/function searchScore\(o,value\)\{[\s\S]*?\n  \}/, "searchScore")
].join("\n");
const { searchWords, searchScore } = new Function("USE_V2_LIBRARY", bron + "\nreturn {searchWords:searchWords,searchScore:searchScore};")(true);

const treffers = (q) => lib.filter((o) => searchScore(o, q) > 0);
const telt = (q) => treffers(q).length;

// leestekens en spaties scheiden woorden
assert.deepEqual(searchWords("rug/nek").slice(0, 2), ["rug", "nek"], "rug/nek wordt twee woorden");
assert.deepEqual(searchWords("knie-oefening").slice(0, 2), ["knie", "oefening"], "knie-oefening wordt twee woorden");
assert.ok(telt("rug/nek") >= telt("nek") && telt("rug/nek") > 0, "rug/nek vindt minstens de nekoefeningen");
assert.ok(telt("knie-oefening") >= telt("knie") && telt("knie") > 0, "knie-oefening vindt de knieoefeningen");
assert.ok(telt("hamstring, rekken") > 0, "komma tussen woorden");
// meervoud
assert.ok(telt("enkel") > 0, "enkel heeft treffers");
assert.ok(telt("enkels") >= telt("enkel"), "enkels vindt ook de enkeloefeningen");
assert.ok(telt("knieën") > 0, "knieën vindt kniebeoefeningen");
// twee woorden: de oefening met beide woorden staat bovenaan
const eTop = treffers("enkel elastiek").sort((a, b) => searchScore(b, "enkel elastiek") - searchScore(a, "enkel elastiek"))[0];
assert.ok(eTop && /enkel/i.test(eTop.naam) && /elastiek/i.test(eTop.naam), "enkel elastiek: beste treffer heeft beide woorden (" + (eTop && eTop.naam) + ")");
assert.ok(telt("rug nek") > 0, "rug nek met spatie");
// gangbare woorden die niet in de namen staan
assert.ok(telt("Theraband") > 0 && telt("hurken") > 0 && telt("bridge") > 0, "Theraband, hurken, bridge");
// beste treffer bovenaan blijft gelijk voor een gewone naam
const naam = lib.find((o) => /brug/i.test(o.naam)).naam;
const top = treffers(naam).sort((a, b) => searchScore(b, naam) - searchScore(a, naam))[0];
assert.equal(top.naam, naam, "exacte naam staat bovenaan");
// losse letters/cijfers maken de lijst niet ineens vol
assert.ok(telt("brug 3 x") <= telt("brug"), "losse tekens tellen niet mee naast echte woorden");
assert.equal(telt("<script>"), telt("script"), "script-tag gedraagt zich als gewoon woord");
console.log("test-sweep-zoek-leestekens: ok (rug/nek " + telt("rug/nek") + ", knie-oefening " + telt("knie-oefening") + ", enkels " + telt("enkels") + ")");
