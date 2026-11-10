// Gebruikers-sweep 2026-11-10 (Jayden, Pixel 7 + iPhone 14): op een Engelse (of andere niet-Nederlandse)
// kaart stonden bij een oefening in controle de vaste Nederlandse zinnen "De oefenafbeelding wordt
// gecontroleerd…" en "De algemene uitleg wordt gecontroleerd…". Nu komen ze via tr() in de taal van de
// kaart. De reviewstatus zelf blijft ongemoeid. `npm run test:controletaal`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const kaart = await readFile(join(process.cwd(), "public/kaart.html"), "utf8");
const begin = kaart.indexOf("var T={");
assert.ok(begin > 0, "teksttabel T gevonden");
const eind = kaart.indexOf("\n  };", begin);
const T = vm.runInNewContext("(" + kaart.slice(begin + 6, eind + 4).trim().replace(/;$/, "") + ")");
const talen = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
for (const taal of talen) {
  for (const sleutel of ["holdBeeld", "holdUitleg"]) {
    assert.ok(T[taal] && typeof T[taal][sleutel] === "string" && T[taal][sleutel].length > 20, `${taal}.${sleutel} bestaat`);
    if (taal !== "nl") assert.notEqual(T[taal][sleutel], T.nl[sleutel], `${taal}.${sleutel} is vertaald`);
  }
}
// De kaartweergave mag deze zinnen niet meer vast in het Nederlands bevatten.
const render = kaart.slice(0, begin) + kaart.slice(eind);
assert.doesNotMatch(render, /<p class="vmeta">De oefenafbeelding wordt gecontroleerd/, "beeldcontrole niet vast in het Nederlands");
assert.doesNotMatch(render, /<p class="vmeta">De algemene uitleg wordt gecontroleerd/, "uitlegcontrole niet vast in het Nederlands");
assert.match(kaart, /tr\('holdBeeld'\)/);
assert.match(kaart, /tr\('holdUitleg'\)/);
console.log("controlezinnen in de taal van de kaart: ok");
