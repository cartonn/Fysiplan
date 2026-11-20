// Gebruikers-sweep 2026-11-20 10u (Sanne, desktop): /v2/proef nam een e-mailadres met een emoji en
// een omkeerteken (U+202E) vóór de @ aan. "Mijn proef" toonde het gespiegeld, de welkomstmail ging
// naar dat adres en Beveiligen weigerde het daarna ("Vul een geldig e-mailadres in"): vast.
// De aanmelding toetst nu met dezelfde geldigEmail als Beveiligen en Team. Zonder browser (CI).
// `npm run test:proefemailteken`
import assert from "node:assert/strict";
import { valideerAanmelding, geldigEmail } from "../lib/proef.js";

const basis = { naam: "Sanne Proef", tel: "0612345678", praktijk: "Fysio Proefteken", akkoord: true, vwo: true };
const fout = (email) => valideerAanmelding({ ...basis, email }).fouten.email || "";

for (const email of [
  "sanne\u{1F600}8781@voorbeeldpraktijk.nl",
  "sanne‮8781@voorbeeldpraktijk.nl",
  "sa​nne@voorbeeldpraktijk.nl",
  "sanne@voorbeeld‮praktijk.nl",
  "sänne@voorbeeldpraktijk.nl"
]) {
  assert.match(fout(email), /klopt niet/, "geweigerd: " + JSON.stringify(email));
  assert.equal(geldigEmail(email.toLowerCase()), false, "ook Beveiligen weigert " + JSON.stringify(email));
}
// gewone adressen blijven werken, ook met + en een IDN-domein
for (const email of ["sanne@voorbeeldpraktijk.nl", "s.de-vries+proef@voorbeeldpraktijk.nl", "sanne@fysio-ölmez.nl"]) {
  assert.equal(fout(email), "", "aangenomen: " + email);
}
// de oude zin bij een kapotte @ of punt blijft
assert.match(fout("sanne@voorbeeldpraktijk"), /controleer de @ en de punt/);
// wat de aanmelding aanneemt, neemt Beveiligen ook aan (geen proef die daarna vastloopt)
for (const email of ["sanne@voorbeeldpraktijk.nl", "s.de-vries+proef@voorbeeldpraktijk.nl"]) {
  const r = valideerAanmelding({ ...basis, email });
  assert.equal(geldigEmail(r.waarden ? r.waarden.email : email), true, "Beveiligen neemt " + email + " aan");
}
console.log("test-sweep-proef-email-teken: alles groen");
