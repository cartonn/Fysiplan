// Gebruikers-sweep 2026-11-18 10u (Sanne, desktop): een kaartnaam van 61 tekens met een emoji op het eind werd
// op 60 UTF-16-eenheden afgekapt, midden in de emoji. De losse helft werd "�" in Kaarten, de CSV en de
// bevestigvraag. Zelfde functie voor praktijknaam, therapeutnaam en teamnamen. Nu kapt cleanName nooit
// midden in een emoji af; de lengte blijft in eenheden zodat bestaande praktijksleutels gelijk blijven.
// Zonder browser, past in CI. `npm run test:naamemoji`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = await readFile(join(root, "server.js"), "utf8");
const regel = src.split("\n").find((r) => r.startsWith("const cleanName = "));
assert.ok(regel, "cleanName staat in server.js");
const verbodenSleutel = /^(__proto__|prototype|constructor)$/;
const cleanName = new Function("verbodenSleutel", regel.replace(/^const cleanName = /, "return ").replace(/;\s*$/, ""))(verbodenSleutel);

const losseHelft = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const naam = "x".repeat(59) + "🦵"; // 61 eenheden
const uit = cleanName(naam, 60);
assert.equal(losseHelft(uit), false, "geen losse helft van een emoji: " + JSON.stringify(uit.slice(-3)));
assert.equal(uit, "x".repeat(59), "de emoji die niet past valt helemaal weg");
assert.equal(cleanName("x".repeat(58) + "🦵", 60), "x".repeat(58) + "🦵", "een emoji die past blijft heel");
assert.equal(cleanName("Fysio 💪 Noord", 80), "Fysio 💪 Noord");
assert.equal(cleanName("  a   b  ", 80), "a b", "spaties zoals voorheen");
assert.equal(cleanName("a".repeat(100), 80).length, 80, "lengte blijft in eenheden");
assert.equal(cleanName("constructor", 80), "", "verboden sleutels zoals voorheen");
for (let i = 0; i < 200; i++) {
  const s = Array.from({ length: 30 }, () => (Math.random() < 0.5 ? "🦵" : "a")).join("");
  for (const max of [1, 5, 17, 40]) assert.equal(losseHelft(cleanName(s, max)), false, "willekeurig " + max);
}
console.log("PASS cleanName kapt nooit midden in een emoji af");
