// Regressietest gebruikers-sweep 2026-11-19 02u (Jayden, Pixel 7 + iPhone 14, Engelse kaart): in de lightbox kreeg
// een niet-vertaalde Nederlandse oefennaam ("Bruggen beginner") geen lang="nl", ook niet in de alt van de foto, en
// de stem van "Toon houdingen" las de Nederlandse naam voor met een Engelse stem. In de lijst had de naam wel lang="nl".
// Broncontrole, draait zonder browser. `npm run test:lightboxlang`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");

const blok = kaart.match(/\['lbnaam','lbimg'\]\.forEach\(function\(id\)\{var el=document\.getElementById\(id\);\s*if\(oefEl&&oefEl\.getAttribute\('lang'\)==='nl'\)el\.setAttribute\('lang','nl'\);else el\.removeAttribute\('lang'\);\}\);/);
assert.ok(blok, "lightbox neemt lang=\"nl\" van de oefennaam over, op naam en foto");

// gedrag: een Nederlandse naam krijgt lang, een vertaalde naam niet (en een oude lang gaat weg)
function nepEl() { const a = {}; return { setAttribute: (k, v) => { a[k] = v; }, removeAttribute: (k) => { delete a[k]; }, getAttribute: (k) => (k in a ? a[k] : null), a }; }
for (const [naamLang, verwacht] of [["nl", "nl"], [null, null]]) {
  const els = { lbnaam: nepEl(), lbimg: nepEl() };
  els.lbnaam.setAttribute("lang", "nl"); // van een vorige oefening
  const oefEl = nepEl(); if (naamLang) oefEl.setAttribute("lang", naamLang);
  vm.runInNewContext(blok[0], { document: { getElementById: (id) => els[id] }, oefEl });
  assert.equal(els.lbnaam.getAttribute("lang"), verwacht, "lbnaam bij " + naamLang);
  assert.equal(els.lbimg.getAttribute("lang"), verwacht, "lbimg bij " + naamLang);
}

// voorlezen: de Nederlandse naam niet met een stem in een andere taal
assert.match(kaart, /naamNl=lbNaamEl\.getAttribute\('lang'\)==='nl';\s*demo\.introTekst=\(naamNl\?'':lbNaamEl\.textContent\+'\. '\)/,
  "intro van Toon houdingen slaat een niet-vertaalde naam over");
console.log("PASS lightboxlang (Nederlandse oefennaam in de lightbox met lang=\"nl\", niet voorgelezen met een andere stem)");
