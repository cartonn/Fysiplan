// Wat de praktijk zelf in Fysiplan zet, tegen /privacy (legal-routine 2026-11-13 17u, gebied (i) en (d)).
// Vóór deze fix:
// - het praktijkprofiel (naam, adres, telefoon, e-mail, website, logo), de sjablonen van het team, de eigen
//   oefeningen (naam, foto, uitleg) en de vaste vragen met antwoorden (#254) stonden alleen in "Als je stopt",
//   zonder doel, grondslag of bewaartermijn in de tabel "Voor praktijken" (AVG art. 13 lid 1 c, lid 2 a);
// - /privacy#patient noemde niet dat de kaart ook het praktijkprofiel en de vragen van de praktijk toont, terwijl
//   /api/kaart die meestuurt (`praktijk: prof` en `patientKaart.vasteVragen`).
// Fail-closed:
// - elk bestand dat server.js in de datamap bewaart (`const …Path = join(dataDir, "…")`) staat in de lijst
//   hieronder, met de plek in /privacy die het uitlegt of met de reden waarom het geen persoonsgegevens van een
//   praktijk of patiënt bevat; een nieuw bestand zonder plek laat de test falen;
// - elk veld dat /api/kaart buiten PATIENT_VELDEN aan de patiëntkaart hangt (`patientKaart.x = …`), en elk veld
//   van het praktijkprofiel (PROFIEL_VELDEN), heeft een uitleg op /privacy#patient.
// Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bron = await readFile("server.js", "utf8");

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-privinhoud-"));
const port = await vrijePoort();
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "",
    DATABASE_URL: "", DATABASE_MEESCHRIJVEN: "" },
  stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });

const tekst = (html) => html.replace(/<[^>]+>/g, " ").replace(/&euml;/g, "ë").replace(/&eacute;/g, "é").replace(/\s+/g, " ");

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const res = await fetch(origin + "/privacy");
  assert.equal(res.status, 200, "/privacy bereikbaar\n" + uitvoer);
  const privacy = await res.text();
  const praktijkDeel = privacy.split('id="praktijk"')[1].split("<h2")[0];
  const patientDeel = tekst(privacy.split('id="patient"')[1].split("<h2")[0]);
  const rij = (id) => { const m = praktijkDeel.match(new RegExp('<tr id="' + id + '">([\\s\\S]*?)</tr>')); return m ? tekst(m[1]) : ""; };
  const inhoud = rij("inhoud");
  assert.ok(inhoud, "/privacy#praktijk heeft een rij voor wat de praktijk zelf in Fysiplan zet (id=inhoud)");
  assert.match(inhoud, /Grondslag: de afspraak met de praktijk/, "rij inhoud noemt de grondslag");
  assert.match(inhoud, /Als je stopt/, "rij inhoud noemt de bewaartermijn");
  assert.match(inhoud, /welke login ze maakte/, "rij inhoud noemt dat de maker (door) wordt bewaard");

  // 1) elk bestand in de datamap heeft een plek in /privacy, of een reden waarom niet
  const tabelTekst = tekst(praktijkDeel);
  const plek = {
    praktijkenPath: [inhoud, /praktijkprofiel/],
    kaartenPath: [tabelTekst, /Oefenkaarten met de naam/],
    accountsPath: [tabelTekst, /Teamleden: naam, e-mail, rol/],
    auditPath: [tabelTekst, /Accountactiviteit/],
    leeslogPath: [rij("leeslog"), /Leeslog per kaart/],
    sessiesPath: [rij("inloggen"), /op welke apparaten je bent ingelogd/],
    beheerLogPath: [rij("beheerlog"), /beheerlogboek/],
    proefPath: [tabelTekst, /Proefaanmelding: e-mail, naam, telefoon/],
    praktijkSjablonenPath: [inhoud, /sjablonen voor het team/],
    praktijkOefeningenPath: [inhoud, /eigen oefeningen \(naam, foto en uitleg\)/],
    praktijkVragenPath: [inhoud, /vaste vragen met antwoorden bij oefeningen/],
    statsPath: [tabelTekst, /Tellingen per dag/],
    // geen persoonsgegevens van een praktijk of patiënt:
    renamesPath: null, videolinksPath: null, extraPath: null, deletedPath: null, customCategoriesPath: null, catsPath: null, // bibliotheek van Fysiplan
    mediaSleutelPath: null, // geheime sleutel voor tijdelijke medialinks
    beheerAccountsPath: null, beheerSessiesPath: null, // medewerkers van Fysiplan zelf, niet van een praktijk
    bewaarPath: null, // startdatum van de bewaartermijn-code
    oprichtersPath: null, // alleen een teller van vergeven plekken
    v1AccountsPath: null, v1TokensPath: null, // de oude app (v1), buiten de V2-scope van /privacy
    vertalingenPath: null // vertaalcache van oefeningnamen en uitleg (staat in de Anthropic-rij)
  };
  const bestanden = [...bron.matchAll(/const (\w+Path) = join\(dataDir, "[^"]+"\)/g)].map((m) => m[1]);
  assert.ok(bestanden.length >= 20, "bestanden in de datamap gevonden");
  for (const naam of bestanden) {
    assert.ok(Object.hasOwn(plek, naam), naam + " (server.js) heeft nog geen plek in /privacy of in deze test");
    if (plek[naam]) assert.match(plek[naam][0], plek[naam][1], "/privacy legt " + naam + " uit");
  }

  // 2) de patiëntkaart: velden buiten PATIENT_VELDEN en het praktijkprofiel staan in /privacy#patient
  const [therapeut] = ["Wat je therapeut erop zet"].map((kop) => patientDeel.split(kop)[1].split("Wat je zelf aantikt")[0]);
  const extra = {
    praktijk: null, // naam van de praktijk, staat al in PATIENT_VELDEN (test-privacy.mjs)
    client: [therapeut, /je roepnaam/],
    vids: [therapeut, /eigen video of foto/],
    mijnSeintjes: [patientDeel, /seintje aan je praktijk/],
    seinOpen: [patientDeel, /seintje aan je praktijk/],
    verloopt: [patientDeel, /tot wanneer hij minstens blijft/],
    eigenOef: [therapeut, /eigen video of foto bij een oefening/],
    vasteVragen: [therapeut, /vragen met antwoorden die je praktijk bij een oefening schreef/]
  };
  const toegevoegd = [...new Set([...bron.matchAll(/patientKaart\.(\w+) = /g)].map((m) => m[1]))];
  assert.ok(toegevoegd.includes("vasteVragen"), "server.js hangt de vaste vragen aan de patiëntkaart");
  for (const veld of toegevoegd) {
    assert.ok(Object.hasOwn(extra, veld), "patiëntkaart." + veld + " staat niet uitgelegd op /privacy#patient");
    if (extra[veld]) assert.match(extra[veld][0], extra[veld][1], "/privacy#patient noemt " + veld);
  }
  // het praktijkprofiel gaat als `praktijk: prof` mee naar de patiënt
  assert.match(bron, /kaart: patientKaart, praktijk: prof,/, "/api/kaart stuurt het praktijkprofiel mee");
  const profiel = JSON.parse(bron.match(/const PROFIEL_VELDEN = (\[[^\]]+\])/)[1]);
  const woord = { praktijk: /naam/, adres: /adres/, plaats: /adres/, tel: /telefoon/, email: /e-mail/, logo: /logo/, website: /website/ };
  const profielZin = therapeut.split("gegevens van je praktijk")[1] || "";
  assert.ok(profielZin, "/privacy#patient noemt de gegevens van je praktijk");
  for (const veld of profiel) {
    assert.ok(Object.hasOwn(woord, veld), "profielveld " + veld + " staat niet uitgelegd op /privacy#patient");
    assert.match(profielZin, woord[veld], "/privacy#patient noemt profielveld " + veld);
    assert.match(inhoud, woord[veld], "/privacy rij inhoud noemt profielveld " + veld);
  }
  console.log("ok: /privacy noemt wat de praktijk zelf in Fysiplan zet en wat de patiënt van de praktijk ziet");
} catch (e) {
  console.error(uitvoer.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
