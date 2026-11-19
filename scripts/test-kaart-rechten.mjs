// "Mijn gegevens" op /k noemt in elke kaarttaal de rechten van de patiënt (legal-routine 2026-11-19 09u, gebied (i)/(a)).
// Vóór deze fix stond alleen "Vragen over je gegevens? Stel ze aan je praktijk." op de kaart. Wie de kaart in een andere
// taal leest, kon de rechten, wie verantwoordelijk is en het klachtrecht bij de Autoriteit Persoonsgegevens alleen op
// /privacy vinden, en die pagina is Nederlands (AVG art. 12 lid 1: begrijpelijk, in duidelijke taal; art. 13 lid 1 a,
// lid 2 b en d). Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const TALEN = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
const kaart = await readFile("public/kaart.html", "utf8");
const juridisch = await readFile("public/juridisch.html", "utf8");
const m = kaart.match(/var TMG=(\{[\s\S]*?\n?\});\n/);
assert.ok(m, "TMG (Mijn gegevens) niet gevonden in public/kaart.html");
const TMG = vm.runInNewContext("(" + m[1] + ")");

const gezien = new Set();
for (const t of TALEN) {
  const d = TMG[t];
  assert.ok(d && d.rechten && d.rk, `Mijn gegevens (${t}) heeft geen kop en tekst over je rechten`);
  assert.ok(d.rk.includes("Autoriteit Persoonsgegevens"), `rechten (${t}) noemen het klachtrecht bij de Autoriteit Persoonsgegevens niet`);
  assert.ok(d.rk.includes("autoriteitpersoonsgegevens.nl"), `rechten (${t}) zonder adres van de Autoriteit Persoonsgegevens`);
  assert.ok(d.rk.includes("Fysiplan"), `rechten (${t}) zeggen niet wat de rol van Fysiplan is`);
  const zinnen = d.rk.split(/[.?؟!]\s/).map((z) => z.trim().split(/\s+/).length);
  assert.ok(Math.max(...zinnen) <= 30, `rechten (${t}): zin te lang voor een patiënt (${Math.max(...zinnen)} woorden)`);
  assert.ok(!gezien.has(d.rk), `rechten (${t}) zijn niet vertaald`);
  gezien.add(d.rk);
}
for (const w of ["verantwoordelijk", "inzien", "verbeteren", "wissen", "praktijk"]) assert.ok(TMG.nl.rk.includes(w), `rechten (nl) noemen "${w}" niet`);

// De kaart toont de kop en de tekst echt.
assert.match(kaart, /<h3 id="mg_rechten">[^<]*<\/h3>\s*<p id="mg_rk"><\/p>/, "plek voor de rechten ontbreekt in Mijn gegevens");
assert.match(kaart, /\['kop','wat','hoelang','waar','rechten'[^\]]*\]\.forEach/, "tekenMijnGegevens zet de kop 'rechten' niet");
assert.match(kaart, /\['l1','l2','l3','dos','rk'[^\]]*\]\.forEach/, "tekenMijnGegevens zet de tekst 'rk' niet");

// Wat de kaart in het kort zegt, staat ook in de volledige privacyverklaring.
const rechten = juridisch.slice(juridisch.indexOf('id="rechten"'), juridisch.indexOf('id="rechten"') + 6000);
for (const w of ["inzien", "verbeteren", "wissen"]) assert.ok(rechten.includes(w), `/privacy#rechten noemt "${w}" niet`);
assert.ok(juridisch.includes("Autoriteit Persoonsgegevens"), "/privacy noemt de Autoriteit Persoonsgegevens niet");

console.log("test-kaart-rechten: ok (" + TALEN.length + " talen)");

// Sweep 2026-11-19 10u: geen houterige vraag "Do you disagree?" (waarmee?), en het adres is een echte link,
// in het Engels naar de Engelse site van de Autoriteit Persoonsgegevens.
for (const t of TALEN) assert.ok(!/disagree|niet mee eens|nicht einverstanden|pas d’accord|de acuerdo|Nie zgadzasz|Katılmıyor|غير موافق|Не згоден/i.test(TMG[t].rk), `rechten (${t}): onduidelijke vraag "ben je het er niet mee eens?"`);
assert.ok(!/You may see/.test(TMG.en.rk), "rechten (en): 'You may see' is houterig");
assert.match(kaart, /linkAP\(document\.getElementById\('mg_rk'\)\)/, "het adres van de AP in Je rechten wordt geen link");
assert.match(kaart, /function linkAP\(el\)\{[\s\S]{0,400}createElement\('a'\)[\s\S]{0,300}autoriteitpersoonsgegevens\.nl'\+\(TAAL==='en'\?'\/en':''\)/, "linkAP maakt geen veilige link (createElement, Engelse site voor en)");
assert.ok(!/innerHTML/.test(kaart.slice(kaart.indexOf("function linkAP"), kaart.indexOf("function linkAP") + 500)), "linkAP gebruikt innerHTML");
console.log("test-kaart-rechten: Engelse tekst en AP-link ok");
