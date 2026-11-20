// Gebruikers-sweep 2026-11-20 06u (Mark, Sanne): formuliervelden in Team, "Eigen oefening",
// "Eigen instructievideo" en de afspraak in Kaarten hadden alleen een placeholder of niets. Een
// schermlezer las "bewerkbaar, leeg" en na het typen verdween de placeholder, zodat ook een
// ziende gebruiker niet meer wist wat er in het veld hoorde. Elk veld krijgt nu een toegankelijke
// naam (aria-label of <label for>). Deze test leest de bron, zodat hij zonder browser in CI draait.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function tag(re, wat) {
  const m = html.match(re);
  assert.ok(m, wat + ": veld niet gevonden");
  return m[0];
}
const verwacht = [
  [/<input id='tm_unaam'[^>]*>/, "Naam van de collega"],
  [/<input id='tm_uemail'[^>]*>/, "E-mailadres van de collega"],
  [/<select id='tm_urol'[^>]*>/, "Rol van de collega"],
  [/<input id='eo_naam'[^>]*>/, "Naam van de oefening"],
  [/<textarea id='eo_uitleg'[^>]*>/, "Uitleg voor de pati"],
  [/<input id='ev_yt'[^>]*>/, "YouTube-link"],
  [/<input type='datetime-local'[^>]*data-safspraak=[^>]*>/, "Volgende afspraak"],
  [/<select [^>]*data-safherhaal=[^>]*>/, "Herhaling van de afspraak"],
];
for (const [re, naam] of verwacht) {
  const t = tag(re, naam);
  assert.match(t, new RegExp("aria-label='" + naam), naam + ": heeft een toegankelijke naam");
}
// de foto in "Eigen oefening" heeft al een zichtbaar label; dat moet aan het veld hangen
assert.match(html, /<label [^>]*for='eo_foto'[^>]*>Foto/, "fotolabel hangt aan #eo_foto");
// geen YouTube-veld van type url: dat weigert links zonder https:// stil in sommige browsers
assert.doesNotMatch(tag(/<input id='ev_yt'[^>]*>/, "ev_yt"), /type='url'/, "YouTube-veld blijft tekst");

// Zelfde run (Mark, verlopen proef): de proefbalk beloofde "iets wijzigen kan niet meer", maar
// afhandelen ("In dossier", "gezien", archief, mail bij een seintje, terugzetten uit de prullenbak)
// blijft bewust open (security-backlog, afgesloten 18-11). De tekst zegt nu wat wel en niet kan.
const proef = readFileSync(new URL("../public/proef.html", import.meta.url), "utf8");
assert.doesNotMatch(html, /of iets wijzigen kan niet meer/, "proefbalk belooft niet dat niets meer kan");
assert.match(html, /Seintjes afhandelen en kaarten opruimen kan nog wel\./, "proefbalk noemt wat nog kan");
assert.doesNotMatch(html, /niet meer beantwoorden of afhandelen/, "afhandelen kan nog");
assert.doesNotMatch(proef, /niets wijzigen of beantwoorden/, "/v2/proef/overzicht belooft niet 'niets wijzigen'");

console.log("veldlabels: ok (Team, eigen oefening, eigen video en afspraak hebben een toegankelijke naam)");
