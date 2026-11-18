// Gebruikers-sweep 2026-11-13 18u (Sanne, desktop): roepnaam "Kees Kramer" → "Test de QR op je
// telefoon" deelde de volledige naam zonder roepnaamvraag (kaart "Kees Kramer" op de server).
// Daarna Printen met QR → OK bij "maak er Kees K. van": de editor stuurde geen roepnaamHernoem,
// de server vroeg "andere patiënt?" en OK maakte een TWEEDE kaart "Kees K."; de kaart met de
// volledige naam bleef staan. Nu stelt "Test de QR" dezelfde vraag, en zetten beide vragen
// ROEP_VOOR, zodat de server de bestaande kaart op zijn plek hernoemt (zelfde QR).
// Het serverdeel (roepnaamHernoem bij dezelfde voornaam) staat in test:roepnaamander.
// Broncontrole, zonder browser, past in CI. `npm run test:printroepnaam`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const idx = await readFile(join(process.cwd(), "public/index.html"), "utf8");
// printvenster: de bevestiging van het voorstel zet ROEP_VOOR
const print = idx.match(/if\(IS_V2&&cn&&naamLijktVolledig\(cn\.value\)&&NAAM_OK!==cn\.value\.trim\(\)\.toLowerCase\(\)\)\{[\s\S]*?\n    \}/);
assert.ok(print, "roepnaamvraag in het printvenster gevonden");
assert.match(print[0], /cn\.value=vs;cn\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\);ROEP_VOOR=vs\.toLowerCase\(\)/, "printvenster: OK bij het voorstel zet ROEP_VOOR (anders een tweede kaart)");
// Test de QR: eerst de roepnaamvraag, en ook die zet ROEP_VOOR
const qr = idx.match(/getElementById\('pb_qr'\)\.addEventListener\('click',function\(\)\{[\s\S]*?saveServerCard\(/);
assert.ok(qr, "Test de QR gevonden");
assert.match(qr[0], /naamLijktVolledig\(cn\.value\)&&NAAM_OK!==/, "Test de QR vraagt eerst om een roepnaam");
assert.match(qr[0], /ROEP_VOOR=vsq\.toLowerCase\(\)/, "Test de QR: OK bij het voorstel zet ROEP_VOOR");
// en serverKaart stuurt bij ROEP_VOOR de roepnaamHernoem mee
assert.match(idx, /KAART_ID&&ROEP_VOOR&&ROEP_VOOR===String\(naam\)\.toLowerCase\(\)\)c\.roepnaamHernoem=true/);
console.log("print/QR roepnaam: ok");
