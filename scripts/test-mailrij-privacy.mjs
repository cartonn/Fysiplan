// Legal (verwerkersovereenkomst art. 6 en /privacy#subverwerkers): elke soort mail die de server
// via de maildienst naar een praktijk stuurt, moet in de rij van de maildienst op /privacy staan.
// Fail-closed: een nieuwe plek in de code die een mail verstuurt en hier niet bekend is, laat de
// test falen, zodat de privacytekst niet stil achterloopt (legal 2026-11-20: de mail bij een
// seintje van een patiënt, sinds #355, stond er niet in).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const jsIn = (map) => existsSync(join(root, map)) ? readdirSync(join(root, map)).filter((f) => f.endsWith(".js")).map((f) => map + "/" + f) : [];
const bestanden = ["server.js", ...jsIn("lib"), ...jsIn("routes")];

// herkenning van de plek in de code -> zin die in de rij van de maildienst moet staan,
// of null als de mail alleen naar Fysiplan zelf gaat (geen ontvanger bij de praktijk)
// of bij de oude app (v1) hoort, die buiten deze privacyverklaring valt.
const SOORTEN = [
  { naam: "seintje van een patiënt", herken: /stuurMail\(g\.o\.email, m\.onderwerp/, zin: "seintje gaf" },
  { naam: "te veel foute codes", herken: /te veel foute codes/, zin: "inloggen" },
  { naam: "mails rond de proef", herken: /proefmail mislukt/, zin: "over de proef" },
  { naam: "uitnodiging collega", herken: /uitgenodigd voor Fysiplan/, zin: "uitnodigingen voor collega" },
  { naam: "nieuw wachtwoord", herken: /Nieuw wachtwoord kiezen/, zin: "je wachtwoord" },
  { naam: "herstelcode", herken: /Herstelcode voor Fysiplan/, zin: "inloggen" },
  { naam: "agent van support", herken: /agent-mail mislukt/, zin: "Fysiplan-support" },
  { naam: "storing", herken: /storingsmail/, zin: "storing" },
  { naam: "intern: beheerwaarschuwing", herken: /Weet je hier niets van\? Kijk dan in het beheerlogboek/, zin: null },
  { naam: "intern: reservekopie", herken: /proefMeldingAan\) stuurMail\(aan,"Fysiplan: (gegevens over de helft|reservekopie)/, zin: null },
  { naam: "intern: ideeënbox", herken: /fysiplanAdressen\(\)\) d\.stuurMail/, zin: null },
  { naam: "v1: wachtwoord instellen", herken: /Je Fysiplan-wachtwoord (opnieuw )?instellen/, zin: null }
];

const fouten = [];
const gezien = new Set();
for (const f of bestanden) {
  const regels = readFileSync(join(root, f), "utf8").split("\n");
  regels.forEach((r, i) => {
    if (!/\bstuurMail\(/.test(r) || /function stuurMail\(/.test(r)) return;
    // de onderwerpregel staat soms op de regel erna
    const stuk = r + "\n" + (regels[i + 1] || "");
    const s = SOORTEN.find((x) => x.herken.test(stuk));
    if (!s) fouten.push(f + ":" + (i + 1) + " verstuurt een mail die deze test niet kent. Zet de soort in /privacy (rij van de maildienst) en hier in SOORTEN.");
    else gezien.add(s.naam);
  });
}
for (const s of SOORTEN) if (!gezien.has(s.naam)) fouten.push("soort \"" + s.naam + "\" komt niet meer voor in de code; haal hem uit SOORTEN (en zo nodig uit /privacy).");

const html = readFileSync(join(root, "public/juridisch.html"), "utf8");
const rij = (html.match(/<tr><td>Resend<\/td>[\s\S]*?<\/tr>/) || [""])[0];
if (!rij) fouten.push("rij van de maildienst niet gevonden op /privacy#subverwerkers");
for (const s of SOORTEN) if (s.zin && rij && !rij.includes(s.zin)) fouten.push("/privacy#subverwerkers: de maildienst noemt \"" + s.naam + "\" niet (verwacht: \"" + s.zin + "\")");
if (rij && !/geen pati&euml;ntgegevens/.test(rij)) fouten.push("/privacy#subverwerkers: de maildienst zegt niet meer \"geen patiëntgegevens\"");

// de mail bij een seintje zelf: echt zonder gegevens van de patiënt (geen roepnaam, soort of tekst)
const server = readFileSync(join(root, "server.js"), "utf8");
const tekstFn = (server.match(/function seinMailTekst\([\s\S]*?\n}\n/) || [""])[0];
if (!tekstFn) fouten.push("seinMailTekst niet gevonden");
else if (/\b(k|kaart)\.(naam|roepnaam)|sein\.(tekst|soort)|\.seintje/.test(tekstFn)) fouten.push("seinMailTekst gebruikt gegevens van de kaart of het seintje; /privacy belooft een mail zonder patiëntgegevens");

if (fouten.length) { console.error("test-mailrij-privacy: FOUT\n- " + fouten.join("\n- ")); process.exit(1); }
console.log("test-mailrij-privacy: ok (" + gezien.size + " soorten mail, alle soorten naar de praktijk staan in /privacy)");
