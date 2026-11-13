// Verwerkersovereenkomst en privacyverklaring tegen de beheeromgeving (legal-routine 2026-11-13 01u, gebied b/d):
// sinds de beheer- en finance-omgeving (#232 e.v.) meet de server per praktijk en per login het gebruik (laatste login,
// actieve logins per dag, foute wachtwoorden, tweede stap, kaarten per week), maakt daar een stand van, stuurt de
// praktijk supportmails via Resend, en kunnen agents met een taalmodel die stand lezen (met codes in plaats van namen).
// /privacy noemde dat nergens (AVG art. 13 lid 1 c/e, lid 2 a/b), de Resend- en Anthropic-rij niet, en VWO art. 2
// zei "niet voor eigen analyses" terwijl Fysiplan kaarten per praktijk telt (art. 28 lid 3 a en lid 10).
// Fail-closed: elke mailsoort van support en elk veld dat een support-agent per praktijk ziet, moet een plek in de tekst
// hebben; een nieuwe soort of een nieuw veld zonder tekst laat deze test falen. Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAIL_SOORTEN } from "../lib/beheer-omgeving.js";
import { werkSupport } from "../lib/beheer-toegang.js";

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-privsupport-"));
const port = await vrijePoort();
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "",
    DATABASE_URL: "", DATABASE_MEESCHRIJVEN: "" },
  stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
const pagina = {};
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  for (const pad of ["/privacy", "/verwerkersovereenkomst"]) {
    const res = await fetch(origin + pad);
    assert.equal(res.status, 200, pad + " bereikbaar\n" + uitvoer);
    pagina[pad] = await res.text();
  }
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}

const privacy = pagina["/privacy"];
assert.doesNotMatch(privacy, /__[A-Z_]+__/, "geen placeholders over");
const rij = (privacy.match(/<tr id="support">[\s\S]*?<\/tr>/) || [""])[0];
assert.ok(rij, "/privacy heeft een rij over de hulp van Fysiplan-support");
for (const [re, wat] of [
  [/beslist Fysiplan zelf/, "rol: verwerkingsverantwoordelijke"], [/gerechtvaardigd belang/, "grondslag"],
  [/agents van support/, "agents"], [/taalmodel/, "taalmodel"], [/code in plaats van de naam/, "pseudoniem"],
  [/geen e-mailadressen of pati&euml;ntgegevens/, "geen adressen of patiëntgegevens naar de agents"],
  [/alleen het aantal, niet wat erop staat/, "kaarten alleen als aantal"],
  [/120 dagen/, "termijn actieve logins (maakGebruik bewaart 120 dagen)"], [/Foute wachtwoorden: 24 uur/, "termijn foute wachtwoorden"],
  [/Stopt je praktijk, dan blijven die regels staan/, "wat er na het stoppen blijft"]]) assert.match(rij, re, "supportrij noemt " + wat);

// elke mailsoort van support moet in de rij of de Resend-rij te herkennen zijn
const SOORT_TEKST = {
  "inloggen-mislukt": [rij, /inloggen niet lukt/], "tweede-stap-slot": [rij, /tweede stap op slot/],
  "uitnodiging-verlopen": [rij, /als iets misgaat/], "een-beheerder": [rij, /als iets misgaat/],
  "stil": [rij, /lang stil is/], "storing": [null, /over een storing/], "eigen-bericht": [rij, /agents van support/]
};
const resend = (privacy.match(/<tr><td>Resend<\/td>[\s\S]*?<\/tr>/) || [""])[0];
assert.match(resend, /berichten van Fysiplan-support/, "Resend-rij noemt de supportmails");
for (const soort of Object.keys(MAIL_SOORTEN)) {
  assert.ok(Object.hasOwn(SOORT_TEKST, soort), "nieuwe mailsoort '" + soort + "': noem hem in /privacy#support en voeg hem hier toe");
  const [waar, re] = SOORT_TEKST[soort];
  assert.match(waar || resend, re, "mailsoort " + soort + " staat in /privacy");
}

// wat een support-agent per praktijk ziet: elk veld moet in de rij te herkennen zijn
const nu = Date.parse("2026-11-13T01:00:00Z");
const werk = werkSupport({ zout: "test", zaken: [], bron: { nu, praktijken: [{ pk: "p1", naam: "Praktijk Test", status: "klant", plaatsen: 2,
  sinds: nu - 40 * 864e5, kaarten30: 3, kaartenTotaal: 9, weken: [1, 2, 3, 4, 1, 2, 3, 4],
  leden: [{ id: "a", naam: "Anna", email: "anna@example.invalid", rol: "beheerder", actief: true, laatst: nu - 864e5, tweedeStap: true }] }] } });
const VELD_TEKST = {
  praktijk: /code in plaats van de naam van je praktijk/, status: /stand per praktijk/, health: /goed, aandacht of probleem/, score: /stand per praktijk/,
  therapeuten: /hoeveel logins/, uitgenodigd: /hoeveel logins/, betaaldePlaatsen: /hoeveel logins/, actiefLaatste7Dagen: /logins per dag actief/,
  zonderTweedeStap: /tweede stap aan staat/, kaartenLaatste30Dagen: /kaarten er per week/, kaartenPerWeek: /kaarten er per week/,
  dagenSindsLaatsteGebruik: /het laatst inlogde/, dagenBijFysiplan: /stand per praktijk/, dagenTotEindeProef: /stand per praktijk/, signalen: /als iets misgaat/
};
assert.equal(werk.praktijken.length, 1, "testpraktijk zichtbaar voor de agent");
for (const veld of Object.keys(werk.praktijken[0])) {
  assert.ok(Object.hasOwn(VELD_TEKST, veld), "nieuw veld '" + veld + "' voor de support-agent: noem het in /privacy#support en voeg het hier toe");
  assert.match(rij, VELD_TEKST[veld], "veld " + veld + " staat in /privacy#support");
}
assert.doesNotMatch(JSON.stringify(werk), /Praktijk Test|Anna|example\.invalid/, "de agent ziet geen namen of adressen (zoals /privacy belooft)");

const anthropic = (privacy.match(/<tr><td>Anthropic<\/td>[\s\S]*?<\/tr>/) || [""])[0];
assert.match(anthropic, /agents van Fysiplan-support/, "Anthropic-rij noemt de agents");
assert.match(anthropic, /codes in plaats van namen/, "Anthropic-rij zegt wat de agents krijgen");
const einde = (privacy.match(/<p id="einde">[\s\S]*?<\/p>/) || [""])[0];
assert.match(einde, /supportmails/, "Als je stopt noemt wat er in beheer blijft staan");
assert.match(privacy, /hulp van Fysiplan-support<\/a>; daartegen kun je bezwaar maken/, "grondslagalinea noemt support en bezwaar (art. 21)");

const vwo = pagina["/verwerkersovereenkomst"];
const art2 = (vwo.match(/<h2>2\. Welke gegevens en waarvoor<\/h2>[\s\S]*?<\/ul>/) || [""])[0];
assert.match(art2, /telt per praktijk en per login hoeveel kaarten/, "VWO art. 2 noemt het tellen van kaarten");
assert.match(art2, /zonder iets van wat erop staat/, "VWO art. 2: alleen aantallen");
console.log("test-privacy-support: ok (" + Object.keys(MAIL_SOORTEN).length + " mailsoorten, " + Object.keys(werk.praktijken[0]).length + " velden voor de agent)");
