// Grens van de vraaghulp (legal 2026-11-07): vragen over pijn, klachten, medicijnen,
// operatie of herstel gaan niet naar de AI-dienst; uitvoeringsvragen wel.
// `node scripts/test-vraaghulp-grens.mjs` (ook in npm run test:privacy)
import assert from "node:assert/strict";
import { vraagOverKlacht, verwijzing, VERWIJZING, vraagOverDosering, doseringVerwijzing, DOSERING_VERWIJZING } from "../lib/vraaghulp-grens.js";

const klacht = [
  "Mijn knie doet pijn bij het zakken, moet ik doorgaan?",
  "Het doet erg zeer in mijn schouder",
  "Mag ik dit doen met paracetamol?",
  "Ik ben vorige maand geopereerd aan mijn knie",
  "Wanneer ben ik hersteld?",
  "Mijn enkel is gezwollen",
  "Ik word duizelig van deze oefening",
  "Is dit goed voor mijn hernia?",
  "My back hurts when I do this",
  "Can I take my pills before exercising?",
  "My leg feels numb",
  "Ich habe Schmerzen im Rücken",
  "Es tut sehr weh",
  "J'ai mal au genou",
  "Me duele la rodilla",
  "Boli mnie kolano",
  "Dizim ağrıyor",
  "ركبتي تؤلمني، هل أستمر؟ عندي ألم",
  "Мені болить коліно"
];
const uitvoering = [
  "Hoe diep moet ik zakken?",
  "Moet mijn rug recht blijven?",
  "Hoe pak ik de halter vast?",
  "Mag ik dit op een zachte mat doen?",
  "Doe ik dit met pilates-bal of zonder?",
  "How deep should I go?",
  "Wie tief soll ich gehen?",
  "Je mets la sangle comment ?",
  "¿Cómo hago la rotación?",
  "Jak nisko mam zejść?",
  "Ne kadar alçalmalıyım?",
  "إلى أي مدى أنزل؟",
  "Як низько присідати?"
];
for (const v of klacht) assert.equal(vraagOverKlacht(v), true, "klacht, niet naar AI: " + v);
for (const v of uitvoering) assert.equal(vraagOverKlacht(v), false, "uitvoeringsvraag mag naar AI: " + v);
assert.equal(vraagOverKlacht(""), false);
assert.equal(vraagOverKlacht(null), false);

// verwijzing in alle 9 talen van de kaart, nooit leeg, onbekende taal valt terug op nl
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) {
  assert.ok(VERWIJZING[t] && VERWIJZING[t].length > 40, "verwijzing in " + t);
}
assert.equal(verwijzing("__proto__"), VERWIJZING.nl);
assert.equal(verwijzing("xx"), VERWIJZING.nl);
assert.match(verwijzing("nl"), /eigen praktijk/);
assert.doesNotMatch(Object.values(VERWIJZING).join(" "), /\bAI\b/, "verwijzing doet zich niet voor als AI-antwoord");

// dosering (legal 2026-11-09): hoe vaak/hoeveel/hoe lang/hoe zwaar bepaalt de fysiotherapeut;
// de AI-dienst kent de dosering van de kaart niet en mag hem niet invullen (MDR)
const dosering = [
  "Hoeveel herhalingen moet ik doen?",
  "Hoe vaak per dag moet ik dit doen?",
  "Hoe lang moet ik dit volhouden?",
  "Mag ik al zwaarder gaan trainen?",
  "Kan ik 3 series doen in plaats van 2?",
  "Moet ik dit elke dag doen?",
  "How many reps should I do?",
  "How many seconds should I hold?",
  "How often should I do this?",
  "Can I use a heavier weight?",
  "Wie oft soll ich das machen?",
  "Wie viele Wiederholungen?",
  "Combien de répétitions je fais ?",
  "¿Cuántas repeticiones hago?",
  "Ile powtórzeń mam robić?",
  "Günde kaç kez yapmalıyım?",
  "كم مرة في اليوم؟",
  "Скільки повторень робити?"
];
for (const v of dosering) assert.equal(vraagOverDosering(v), true, "dosering, niet naar AI: " + v);
for (const v of uitvoering) assert.equal(vraagOverDosering(v), false, "uitvoeringsvraag mag naar AI: " + v);
assert.equal(vraagOverDosering(""), false);
assert.equal(vraagOverDosering("Hoe gebruik ik de bal?"), false, "ook geen valse treffer op 'ile' in een woord");
assert.equal(vraagOverDosering("Wie halte ich die Hantel?"), false);
assert.equal(vraagOverDosering("هل أتحكم في الحركة ببطء؟"), false, "كم binnen een woord (تحكم) telt niet");
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) {
  assert.ok(DOSERING_VERWIJZING[t] && DOSERING_VERWIJZING[t].length > 60, "doseringsverwijzing in " + t);
}
assert.equal(doseringVerwijzing("__proto__"), DOSERING_VERWIJZING.nl);
assert.match(doseringVerwijzing("nl"), /op je kaart/);
assert.doesNotMatch(Object.values(DOSERING_VERWIJZING).join(" "), /\bAI\b/, "verwijzing doet zich niet voor als AI-antwoord");

// de server stuurt een doseringsvraag niet naar de AI-dienst (bron gecontroleerd, want de
// echte aanroep heeft een sleutel nodig)
const { readFileSync } = await import("node:fs");
const srv = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const route = srv.slice(srv.indexOf('urlPath === "/api/kaart/vraag"'));
assert.ok(route.indexOf("vraagOverDosering(vraag)") > 0 && route.indexOf("vraagOverDosering(vraag)") < route.indexOf("vraagClaude("),
  "doseringsvraag wordt afgevangen vóór de aanroep van de AI-dienst");

console.log("vraaghulp-grens: " + dosering.length + " doseringsvragen verwezen; " + klacht.length + " klachtvragen verwezen, " + uitvoering.length + " uitvoeringsvragen door: ok");
