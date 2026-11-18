// Privacyverklaring (legal-routine 2026-11-12 09u, gebied a):
// 1. Sinds #214, #217, #222 en #225 bewaart Fysiplan per eigen login de sleutel van de tweede stap,
//    reservecodes, een teller van foute codes, een link voor een nieuw wachtwoord en de inlogsessies.
//    /privacy noemde daarvan niets (art. 13 lid 1 c en lid 2 a AVG: welke gegevens, waarvoor, hoe lang).
// 2. De vraaghulp op de kaart staat sinds #206 standaard uit (VRAAGHULP=aan zet hem aan), maar
//    /privacy beschreef hem voor patiënten alsof hij altijd werkt. Nu volgt de tekst de server.
// Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSIE_MS } from "../lib/sessie-opslag.js";

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

async function privacyPagina(extraEnv, pad = "/privacy") {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-privinlog-"));
  const port = await vrijePoort();
  const origin = "http://127.0.0.1:" + port;
  let uitvoer = "";
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", VRAAGHULP: "", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    const res = await fetch(origin + pad);
    assert.equal(res.status, 200, pad + " bereikbaar\n" + uitvoer);
    return await res.text();
  } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}

// --- vraaghulp uit (standaard) ---
const uit = await privacyPagina({});
assert.doesNotMatch(uit, /__[A-Z_]+__/, "geen placeholders over");
assert.doesNotMatch(uit, /<!--\/?vraaghulp-->/, "markeringen weg");
assert.doesNotMatch(uit, /<b>Vraaghulp:<\/b>/, "vraaghulp uit: patiënt leest geen uitleg over een vraaghulp die er niet is");
assert.match(uit, /de vraaghulp op de kaart \(staat nu uit\)/, "vraaghulp uit: subverwerkersrij zegt dat hij uit staat");

// eigen login: tweede stap, reservecodes, foute codes, herstellink, sessies, met termijnen
const rij = (uit.match(/<tr id="inloggen">[\s\S]*?<\/tr>/) || [""])[0];
assert.ok(rij, "rij over inloggen met een eigen login staat in de tabel voor praktijken");
for (const [re, wat] of [
  [/tweede stap/, "tweede stap"], [/reservecodes \(alleen als hash\)/, "reservecodes als hash"],
  [/foute codes/, "teller foute codes"], [/Foute codes: 24 uur/, "termijn foute codes"],
  [/nieuw wachtwoord \(alleen als hash\)/, "herstellink als hash"], [/een uur, of 48 uur/, "termijn herstellink"],
  [/werkt &eacute;&eacute;n keer/, "herstellink eenmalig"], [/hash van de inlogsleutel/, "sessies als hash"],
  [new RegExp("hooguit " + Math.round(SESSIE_MS / 86400000) + " dagen"), "sessieduur uit de code"],
  [/artikel 32 AVG/, "doel en grondslag"],
]) assert.match(rij, re, "rij inloggen noemt " + wat + ": " + rij);


// --- cookies (legal-routine 2026-11-12 13u, gebied d/f) ---
// Elke cookie die server.js zet, staat in /privacy#opslag (fail-closed: een nieuwe cookienaam in de
// code zonder uitleg laat deze test falen). Sinds #229 staat de inlog bij de praktijk in de cookie
// fpsessie in plaats van in de browseropslag; sinds #230 heeft beheer de cookie fpbeheer.
const bron = await readFile("server.js", "utf8");
const namen = new Set();
for (const m of bron.matchAll(/["'`](?:__Host-)?(fp[a-z0-9]*)=/g)) namen.add(m[1]);
for (const m of bron.matchAll(/["'`]__Host-(fp[a-z0-9]*)["'`]/g)) namen.add(m[1]);
for (const n of ["fp1", "fpproef", "fpsessie", "fpbeheer"]) assert.ok(namen.has(n), "cookie " + n + " gevonden in server.js");
const opslag = (uit.match(/<h2 id="opslag">[\s\S]*?<\/table>/) || [""])[0];
assert.ok(opslag, "sectie opslag gevonden");
for (const n of namen) assert.match(opslag, new RegExp("<code>" + n + "</code>"), "cookie " + n + " staat in /privacy#opslag");
const app = (opslag.match(/<tr><td>Apparaat van de therapeut \(app\)[\s\S]*?<\/tr>/) || [""])[0];
assert.match(app, /Drie cookies/, "therapeutrij telt drie cookies");
assert.match(app, new RegExp("<code>fpsessie</code>: hooguit " + Math.round(SESSIE_MS / 86400000) + " dagen"), "termijn fpsessie uit de code");
assert.doesNotMatch(app, /je inlog bij de praktijk/, "de inlog staat niet meer in de browseropslag");
assert.match(opslag, /<tr id="opslag-beheer">[\s\S]*hooguit 12 uur/i, "beheercookie met termijn");

// --- beheerlogboek in /privacy en de verwerkersovereenkomst ---
assert.match(uit, /<tr id="beheerlog">[\s\S]*?beheerlogboek[\s\S]*?Geen pati&euml;ntgegevens/, "privacy: rij beheerlogboek");
const vwo = await privacyPagina({}, "/verwerkersovereenkomst");
assert.match(vwo, /het beheerlogboek\)\. De praktijk kan dit opvragen/, "vwo art. 4: toegang door Fysiplan wordt vastgelegd");
assert.match(vwo, /eigen beheerlogin met een tweede stap/, "vwo art. 4: beheer met tweede stap");
assert.match(vwo, /eigen login per therapeut, met een tweede stap/, "vwo art. 5: tweede stap als maatregel");
assert.match(vwo, /een beheerlogboek van alles wat medewerkers van Fysiplan via beheer doen/, "vwo art. 5: beheerlogboek");

// --- ideeënbox (legal-routine 2026-11-12 17u, gebied a/d) ---
// Sinds #237 bewaart Fysiplan ideeën en stemmen van therapeuten, en kan een taalmodel (IDEEEN_AI=aan)
// er een toelichting bij schrijven. /privacy noemde de ideeënbox nergens.
const idee = (uit.match(/<tr id="ideeen">[\s\S]*?<\/tr>/) || [""])[0];
assert.ok(idee, "rij ideeënbox staat in de tabel voor praktijken");
for (const [re, wat] of [
  [/titel en toelichting/, "wat"], [/stemmen/, "stemmen"], [/zonder naam of praktijk/, "wie het ziet"],
  [/geen pati&euml;ntgegevens/, "waarschuwing"], [/beslist Fysiplan zelf/, "rol: verwerkingsverantwoordelijke"],
  [/gerechtvaardigd belang/, "grondslag"], [/tot de praktijk stopt/, "termijn open idee"], [/zonder koppeling aan je praktijk/, "termijn besloten idee"],
]) assert.match(idee, re, "rij ideeënbox noemt " + wat + ": " + idee);
assert.match(uit, /je open idee&euml;n in de idee&euml;nbox/, "Als je stopt noemt de ideeënbox");
assert.doesNotMatch(uit, /<!--\/?ideeenai-->/, "markeringen weg");
assert.doesNotMatch(uit, /toelichting voor Fysiplan bij de idee&euml;n/, "taalmodel ideeënbox uit: niet in de Anthropic-rij");
const ideeAi = await privacyPagina({ ANTHROPIC_API_KEY: "test-sleutel-niet-echt", IDEEEN_AI: "aan" });
assert.doesNotMatch(ideeAi, /<!--\/?ideeenai-->/, "markeringen weg");
assert.match(ideeAi, /een korte toelichting voor Fysiplan bij de idee&euml;n met de meeste stemmen en het vertalen/, "taalmodel aan: Anthropic-rij noemt de ideeënbox");
assert.match(ideeAi, /Bij de idee&euml;nbox: de titels en toelichtingen van de idee&euml;n en het aantal stemmen, zonder naam of praktijk\./, "taalmodel aan: welke gegevens");
// beheer bewaart ook iets in de browser: de keuze demo/echt en een ingevulde beheersleutel
const beheerRij = (opslag.match(/<tr id="opslag-beheer">[\s\S]*?<\/tr>/) || [""])[0];
assert.match(beheerRij, /demo- of echte gegevens/, "fp-beheer-bron staat in de beheerrij");
assert.match(beheerRij, /beheersleutel[\s\S]*tot het tabblad dicht gaat/, "beheersleutel in sessionStorage staat in de beheerrij");

// --- vraaghulp aan ---
const aan = await privacyPagina({ ANTHROPIC_API_KEY: "test-sleutel-niet-echt", VRAAGHULP: "aan" });
assert.doesNotMatch(aan, /<!--\/?vraaghulp-->/, "markeringen weg");
assert.match(aan, /<b>Vraaghulp:<\/b>/, "vraaghulp aan: uitleg staat er voor de patiënt");
assert.doesNotMatch(aan, /staat nu uit/, "vraaghulp aan: niet 'staat nu uit'");
assert.match(aan, /de vraaghulp op de kaart en het vertalen/, "vraaghulp aan: subverwerkersrij zonder voorbehoud");

console.log("Privacyverklaring: eigen login, vraaghulp, ideeënbox, alle cookies uit server.js en het beheerlogboek: in orde.");
