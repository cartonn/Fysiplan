// Legal 2026-11-13 05u, voorwaarden (c) tegen de code (d).
// - Art. 4 zei vast "exclusief btw", terwijl de btw-keuze sinds #243 in de beheeromgeving ligt
//   (kleineondernemersregeling, inclusief of exclusief). De landing volgde die keuze al, de
//   voorwaarden niet: bij "inclusief" beloofden ze een ander bedrag dan Mollie afschrijft.
// - De server hanteert een grens op lopende kaarten (lib/plaatsen.js, #245): 100 in de proef,
//   300 per login voor een klant. De voorwaarden noemden geen grens.
// - Art. 9 zei "wat je toevoegt, gebruikt Fysiplan alleen voor jou", maar ideeën uit de
//   Ideeënbox (#237) gebruikt Fysiplan om het product te verbeteren.
// Faalt zonder de fix. Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KAARTEN_PROEF, KAARTEN_PER_LOGIN } from "../lib/plaatsen.js";
import { readFileSync } from "node:fs";
const serverBron = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const plaatsenBron = readFileSync(new URL("../lib/plaatsen.js", import.meta.url), "utf8");

const tekst = (html) => html.replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&euml;/g, "ë").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

async function metServer(inst, doe) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-av-"));
  if (inst) await writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify(inst));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let uit = ""; app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  const origin = "http://127.0.0.1:" + port;
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    await doe(async (pad) => (await fetch(origin + pad)).text());
  } catch (e) { e.message += "\n--- server ---\n" + uit.slice(-1500); throw e; }
  finally { if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } await rm(dataDir, { recursive: true, force: true }); }
}

// 1. nog niet gekozen: de tekst zoals altijd (exclusief); en de grens en de ideeënbox staan erin
await metServer(null, async (haal) => {
  const av = tekst(await haal("/voorwaarden"));
  assert.match(av, /afsluit, exclusief btw\./, "open keuze: exclusief btw zoals de landing");
  assert.match(av, new RegExp("hooguit " + KAARTEN_PROEF + " lopende kaarten"), "art. 3 noemt de grens van de proef uit lib/plaatsen.js");
  assert.match(av, new RegExp(KAARTEN_PER_LOGIN + " lopende kaarten per eigen login"), "art. 4 noemt de grens voor een klant uit lib/plaatsen.js");
  assert.match(av, /Ideeënbox/, "art. 9 noemt de Ideeënbox als uitzondering");
  assert.match(av, /Fysiplan beter te maken/, "art. 9: wat Fysiplan met een idee mag");
  assert.doesNotMatch(av, /__[A-Z_]+__/, "geen open plekhouders");
  // Legal 2026-11-14 05u: sinds #306 kan een praktijk een mislukte maandincasso zelf betalen
  // (/v2/proef/maand-betalen); art. 4 zei alleen "we nemen contact met je op".
  if (/\/v2\/proef\/maand-betalen/.test(serverBron)) assert.match(av, /die maand dan zelf betalen met iDEAL of je bankkaart/, "art. 4 noemt zelf betalen na een mislukte incasso");
  // De app vraagt bij elke nieuwe versie meteen opnieuw akkoord (zonder blokkade); art. 11
  // beloofde voor elke inhoudelijke wijziging 30 dagen vooraf. Nu: 30 dagen voor wat in je nadeel is.
  assert.match(av, /Elke wijziging krijgt een nieuwe versie/, "art. 11: elke wijziging een nieuwe versie");
  assert.match(av, /in je nadeel, dan melden we dat minstens 30 dagen vooraf/, "art. 11: 30 dagen voor een wijziging in je nadeel");
  assert.match(av, /gewoon doorwerken/, "art. 11 zegt hetzelfde als de app: doorwerken kan");
  // Legal 2026-11-14 21u (g): de app gebruikt AI (video's en stem met AI gemaakt, vertaling en
  // zoekhulp via vraagClaude), maar de voorwaarden noemden AI nergens. Art. 2 zegt nu welke delen
  // en dat AI nooit zelf een oefening of dosering op een kaart zet (MDR-grens).
  if (/vraagClaude\(/.test(serverBron)) {
    assert.match(av, /Met AI\. Een deel van Fysiplan is met AI gemaakt of werkt met AI/, "art. 2 noemt dat Fysiplan AI gebruikt");
    for (const deel of ["video", "stem", "vertaling", "zoekhulp"]) assert.match(av, new RegExp("Met AI\\.[^.]*" + deel), "art. 2 noemt " + deel);
    assert.match(av, /AI zet nooit zelf een oefening of dosering op een kaart/, "art. 2: AI kiest geen oefening of dosering");
  }
  // de vraaghulp staat standaard uit: dan noemen de voorwaarden hem ook niet
  assert.doesNotMatch(av, /\(de vraaghulp\)/, "vraaghulp uit: niet in de voorwaarden");
  // Legal 2026-11-15 01u (c): de server laat alleen een beheerder namens de praktijk akkoord geven,
  // betalen, opzeggen en alles downloaden of wissen (#323 legt een poging van een collega vast in
  // Activiteit). Art. 5 zei "Opzeggen doe je zelf in de app", alsof elke therapeut dat kan.
  if (/"proef-geweigerd"/.test(serverBron) && /"akkoord-geweigerd"/.test(serverBron)) {
    assert.match(av, /Opzeggen doet een beheerder van je praktijk/, "art. 5: alleen een beheerder zegt op");
    assert.match(av, /Een beheerder van je praktijk regelt namens de praktijk[^.]*akkoord[^.]*betalen[^.]*opzeggen[^.]*downloaden of wissen/, "art. 6: wat alleen een beheerder doet");
    assert.match(av, /onder Activiteit/, "art. 6: een poging van een collega staat in Activiteit");
  }
  // Legal 2026-11-16 13u (c): sinds #245 is een nieuwe maand voor het hoogste aantal logins van de
  // maand ervoor (lib/plaatsen.js, piek; de server kijkt elk uur), en tussentijds wordt niets
  // bijgeschreven of teruggegeven. Art. 4 zei alleen "elke login telt als één therapeut".
  if (/export function merkPiek/.test(plaatsenBron)) {
    assert.match(av, /Een uitnodiging die nog niet is aangenomen, telt niet/, "art. 4: open uitnodiging telt niet");
    assert.match(av, /of voor het hoogste aantal in de maand daarvoor als dat hoger was/, "art. 4 noemt de piek van de maand ervoor");
    assert.match(av, /Tijdens een maand rekenen we niets bij en geven we niets terug/, "art. 4: niets tussentijds");
  }
  const akkoord = serverBron.match(/const AKKOORD_WIJZIGINGEN = \[[\s\S]*?\n\];/)[0];
  const avVersie = serverBron.match(/const AV_VERSIE = "([^"]+)"/)[1];
  assert.ok(akkoord.includes('stuk: "av", versie: "' + avVersie + '"'), "AKKOORD_WIJZIGINGEN noemt de huidige AV_VERSIE");
});
// 2. inclusief en kleineondernemersregeling: de voorwaarden volgen de keuze, zoals de landing
await metServer({ kor: "nee", prijsBtw: "inclusief" }, async (haal) => {
  const av = tekst(await haal("/voorwaarden"));
  assert.doesNotMatch(av, /exclusief btw/, "inclusief gekozen: de voorwaarden zeggen geen exclusief btw");
  assert.match(av, /afsluit, inclusief btw\./);
  const landing = tekst(await haal("/v2"));
  assert.doesNotMatch(landing, /exclusief btw/, "landing en voorwaarden zeggen hetzelfde");
});
await metServer({ kor: "ja" }, async (haal) => {
  const av = tekst(await haal("/voorwaarden"));
  assert.doesNotMatch(av, /exclusief btw/, "kleineondernemersregeling: geen exclusief btw");
  assert.match(av, /afsluit, Fysiplan rekent geen btw\./);
  // privacyverklaring en verwerkersovereenkomst gaan niet over de prijs en blijven ongemoeid
  assert.doesNotMatch(tekst(await haal("/privacy")), /rekent geen btw/);
});
console.log("test-voorwaarden-code: ok (btw volgt de keuze, grens op kaarten, Ideeënbox in art. 9)");
