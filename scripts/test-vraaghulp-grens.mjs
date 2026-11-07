// Grens van de vraaghulp (legal 2026-11-07): vragen over pijn, klachten, medicijnen,
// operatie of herstel gaan niet naar de AI-dienst; uitvoeringsvragen wel.
// `node scripts/test-vraaghulp-grens.mjs` (ook in npm run test:privacy)
import assert from "node:assert/strict";
import { vraagOverKlacht, verwijzing, VERWIJZING } from "../lib/vraaghulp-grens.js";

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
  "How many seconds should I hold my number of reps?",
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

console.log("vraaghulp-grens: " + klacht.length + " klachtvragen verwezen, " + uitvoering.length + " uitvoeringsvragen door: ok");
