// End-to-endtest van het privacypakket: wachtwoordplicht vóór delen, akkoord op de
// verwerkersovereenkomst, minder data op de patiëntroute, botsing op roepnaam,
// bewaartermijn, opschonen van oude velden en vertaalcache, de juridische pagina's
// en wat er naar de AI-dienst gaat. Draait tegen een eigen server met een
// voorbereide datamap en een nagebootste AI-dienst. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-privacy-"));
const dag = 86400000;
const nu = Date.now();
const sha16 = (t) => createHash("sha256").update(String(t).slice(0, 300)).digest("hex").slice(0, 16);

// ---- nagebootste AI-dienst: bewaart elke aanvraag ----
const aiAanvragen = [];
const ai = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const b = JSON.parse(body || "{}");
  aiAanvragen.push(b);
  const tekst = b.output_config && b.output_config.format
    ? JSON.stringify({ oefeningen: [
      { naam: "Squat", traint: "Kracht van bovenbenen en billen." },
      { naam: "squat", traint: "dubbel, valt weg" },
      { naam: "Bestaat niet", traint: "geen bibliotheekoefening, valt weg" },
      { naam: "Lunges", traint: "Kracht en balans van de benen." }
    ] })
    : JSON.stringify({ antwoord: "Zak zo ver als prettig voelt en houd je rug recht." });
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ content: [{ type: "text", text: tekst }] }));
});
await new Promise((resolve) => ai.listen(0, "127.0.0.1", resolve));
const aiPort = ai.address().port;

// ---- datamap: de bewaartermijn liep al lang, plus een paar oude kaarten ----
const kaart = (id, extra) => ({ id, praktijk: "Fysio Oud", chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {}, ...extra });
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 400 * dag }));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio oud": {
    "stil": kaart("aaaaaaaaaaa1", { naam: "Stil", ts: nu - 200 * dag, client: { c_naam: "Stil" } }),
    "afgerond": kaart("aaaaaaaaaaa2", { naam: "Afgerond", ts: nu - 50 * dag, gearchiveerd: true, gearchiveerdOp: nu - 40 * dag, client: { c_naam: "Afgerond" } }),
    "actief": kaart("aaaaaaaaaaa3", { naam: "Actief", ts: nu - 10 * dag, metingen: [{ t: nu - 2 * dag, s: 3 }],
      client: { c_naam: "Actief", c_leeftijd: "54", c_cave: "hernia L5", c_doel: "Traplopen" } })
  }
}));
await writeFile(join(dataDir, "vertalingen.json"), JSON.stringify({
  en: { [sha16("Jan de Vries heeft een hernia")]: "Jan de Vries has a herniated disc", [sha16("Squat")]: "Squat" }
}));

// ---- server ----
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const appPort = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${appPort}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort), DATA_DIR: dataDir, ADMIN_KEY: "",
    ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: `http://127.0.0.1:${aiPort}`,
    FYSIPLAN_BEDRIJF: "Fysiplan B.V.", FYSIPLAN_KVK: "12345678", FYSIPLAN_HOSTING_REGIO: "EU West (Amsterdam)",
    MAIL_AFZENDER: "Fysiplan <privacy@fysiplan.nl>" },
  stdio: ["ignore", "pipe", "pipe"]
});
let appOutput = "";
app.stdout.on("data", (c) => { appOutput += c; });
app.stderr.on("data", (c) => { appOutput += c; });

// elk blok een eigen nep-IP, zodat de per-IP-remmen elkaar niet raken
let ipTeller = 1;
const nieuwIp = () => "10.0.0." + (ipTeller++);
const api = (pad, { methode = "GET", body, sessie, ip, kop = {} } = {}) => fetch(origin + pad, {
  method: methode,
  headers: { "content-type": "application/json", "x-forwarded-for": ip || "10.9.9.9",
    ...(sessie ? { "x-praktijk-sessie": sessie } : {}), ...kop },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const leesJson = async (pad) => JSON.parse(await readFile(join(dataDir, pad), "utf8"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // ---- bij de start: bewaartermijn, oude velden en vertaalcache ----
  let opDisk = {};
  for (let i = 0; i < 100; i++) {
    opDisk = await leesJson("kaarten.json");
    const oud = opDisk["fysio oud"] || {};
    if (!oud.stil && oud.actief && !Object.hasOwn(oud.actief.client, "c_leeftijd")) break;
    await wacht(50);
  }
  assert.equal(opDisk["fysio oud"].stil, undefined, "90 dagen stil: van de server");
  assert.equal(opDisk["fysio oud"].afgerond, undefined, "30 dagen na afronden: van de server");
  assert.ok(opDisk["fysio oud"].actief, "een actieve kaart blijft");
  assert.deepEqual(opDisk["fysio oud"].actief.client, { c_naam: "Actief", c_doel: "Traplopen" }, "leeftijd en Casus zijn uit oude kaarten gehaald");
  assert.equal((await api("/api/kaart?id=aaaaaaaaaaa1")).status, 404, "verlopen kaart is weg voor de patiënt");
  let cache = {};
  for (let i = 0; i < 100; i++) {
    cache = (await leesJson("vertalingen.json")).en || {};
    if (!cache[sha16("Jan de Vries heeft een hernia")]) break;
    await wacht(50);
  }
  assert.equal(cache[sha16("Jan de Vries heeft een hernia")], undefined, "vrije tekst uit de vertaalcache");
  assert.equal(cache[sha16("Squat")], "Squat", "bibliotheekvertaling blijft");
  const audit = await leesJson("praktijk-audit.json");
  assert.ok(audit.some((a) => a.actie === "kaart-verlopen" && a.praktijk === "fysio oud"), "auditregel bij verlopen");

  // ---- de standaard-beheersleutel opent geen onbeveiligde praktijk ----
  const metAdmin = await api("/api/kaarten?praktijk=fysio%20oud", { kop: { "x-admin-sleutel": "admin88" } });
  assert.equal(metAdmin.status, 401);
  assert.equal((await metAdmin.json()).beveilig, true);

  // ---- wachtwoordplicht vóór delen ----
  const ipA = nieuwIp();
  const kaartBody = (extra = {}) => ({ praktijk: "Fysio Privacy", naam: "Jan de Vries", chosen: [{ n: "Squat", i: 0 }],
    rows: {}, cells: {}, client: { c_naam: "Jan de Vries", c_leeftijd: "54", c_cave: "VKB-reconstructie", c_doel: "Traplopen", c_opm: "Rustig opbouwen", c_hf: "180" },
    kaartId: "", ...extra });
  const zonder = await api("/api/kaarten", { methode: "POST", body: kaartBody(), ip: ipA });
  assert.equal(zonder.status, 401);
  assert.equal((await zonder.json()).beveilig, true, "onbeveiligde praktijk deelt niets");
  const briefZonder = await api("/api/praktijk/brief?praktijk=Fysio%20Privacy", { ip: ipA });
  assert.equal(briefZonder.status, 401);

  // ---- akkoord op de verwerkersovereenkomst bij het beveiligen ----
  const geenAkkoord = await api("/api/praktijk/claim", { methode: "POST", body: { praktijk: "Fysio Privacy", wachtwoord: "geheim-wachtwoord-1" }, ip: ipA });
  assert.equal(geenAkkoord.status, 400);
  assert.equal((await geenAkkoord.json()).akkoord, true);
  const claim = await api("/api/praktijk/claim", { methode: "POST", body: { praktijk: "Fysio Privacy", wachtwoord: "geheim-wachtwoord-1", akkoord: true }, ip: ipA });
  assert.equal(claim.status, 200);
  const { sessie } = await claim.json();
  assert.ok(sessie);
  const accounts = await leesJson("praktijk-accounts.json");
  assert.match(accounts["fysio privacy"].vwo.versie, /^\d{4}-\d{2}-\d{2}$/, "versie van de verwerkersovereenkomst vastgelegd");
  assert.ok(accounts["fysio privacy"].vwo.t);

  // ---- delen na het beveiligen: leeftijd en Casus blijven thuis ----
  const gedeeld = await api("/api/kaarten", { methode: "POST", body: kaartBody(), sessie, ip: ipA });
  assert.equal(gedeeld.status, 200);
  const { id } = await gedeeld.json();
  assert.match(id, /^[a-f0-9]{12}$/);
  const opgeslagen = (await leesJson("kaarten.json"))["fysio privacy"]["jan de vries"];
  assert.deepEqual(Object.keys(opgeslagen.client).sort(), ["c_doel", "c_hf", "c_naam", "c_opm"]);

  // ---- de patiëntroute: alleen de roepnaam en wat de patiënt nodig heeft ----
  const pat = await (await api("/api/kaart?id=" + id)).json();
  assert.deepEqual(pat.kaart.client, { c_naam: "Jan", c_doel: "Traplopen", c_opm: "Rustig opbouwen" });
  for (const veld of ["naam", "notitie", "behandelaar", "seintje", "bekeken", "contact"]) {
    assert.equal(Object.hasOwn(pat.kaart, veld), false, "patiëntroute zonder " + veld);
  }
  assert.doesNotMatch(JSON.stringify(pat), /Vries|VKB|"54"/);
  const manifest = await (await api("/api/kaart/manifest?id=" + id)).json();
  assert.equal(manifest.name, "Trainingskaart Jan");

  // ---- de volledige kaart alleen voor de ingelogde praktijk ----
  const praktijkZonder = await api("/api/praktijk/kaart?praktijk=Fysio%20Privacy&id=" + id, { ip: ipA });
  assert.equal(praktijkZonder.status, 401);
  const praktijkMet = await (await api("/api/praktijk/kaart?praktijk=Fysio%20Privacy&id=" + id, { sessie, ip: ipA })).json();
  assert.equal(praktijkMet.kaart.naam, "Jan de Vries");
  assert.ok(praktijkMet.kaart.verloopt > nu + 80 * dag, "verloopdatum mee voor het overzicht");

  // ---- botsing op roepnaam: geen stille overschrijving van een andere patiënt ----
  const botsing = await api("/api/kaarten", { methode: "POST", body: kaartBody({ kaartId: "" }), sessie, ip: ipA });
  assert.equal(botsing.status, 409);
  assert.equal((await botsing.json()).bestaat, true);
  const zelfde = await api("/api/kaarten", { methode: "POST", body: kaartBody({ kaartId: id }), sessie, ip: ipA });
  assert.equal((await zelfde.json()).id, id, "dezelfde editor werkt de eigen kaart bij");
  const bevestigd = await api("/api/kaarten", { methode: "POST", body: kaartBody({ kaartId: "", overschrijf: true }), sessie, ip: ipA });
  assert.equal((await bevestigd.json()).id, id, "met bevestiging: zelfde kaart, zelfde link");

  // ---- weekbrief zonder AI ----
  const aiVoorBrief = aiAanvragen.length;
  const brief = await (await api("/api/praktijk/brief?praktijk=Fysio%20Privacy", { sessie, ip: ipA })).json();
  assert.equal(brief.ok, true);
  assert.match(brief.brief, /Weekbrief/);
  assert.equal(aiAanvragen.length, aiVoorBrief, "de weekbrief vraagt niets aan de AI-dienst");

  // ---- zoekhulp: alleen lichaamsdeel, doel en zoekwoorden ----
  const ipZ = nieuwIp();
  const leeg = await api("/api/assistent", { methode: "POST", body: { klacht: "Jan de Vries, 54, hernia" }, ip: ipZ });
  assert.equal(leeg.status, 400, "zonder lichaamsdeel en doel geen AI-aanroep");
  const aiVoorZoek = aiAanvragen.length;
  const zoek = await (await api("/api/assistent", { methode: "POST",
    body: { regio: "Knie", doel: "Maximale kracht", zoek: "zonder materiaal", klacht: "Jan de Vries, VKB-reconstructie" }, ip: ipZ })).json();
  assert.equal(zoek.ok, true);
  assert.deepEqual(zoek.oefeningen.map((o) => o.naam), ["Squat", "Lunges"], "alleen echte bibliotheekoefeningen, geen dubbele");
  assert.equal(aiAanvragen.length, aiVoorZoek + 1);
  const zoekAanvraag = JSON.stringify(aiAanvragen[aiAanvragen.length - 1].messages);
  assert.match(zoekAanvraag, /<lichaamsdeel>Knie<\/lichaamsdeel>/);
  assert.doesNotMatch(zoekAanvraag, /Vries|VKB|klacht/i, "geen patiëntgegevens naar de AI-dienst");

  // ---- vraaghulp: de vraag en de oefeningen, niets over de patiënt ----
  const vraag = await (await api("/api/kaart/vraag", { methode: "POST", body: { id, vraag: "Hoe diep moet ik zakken?", taal: "nl" }, ip: nieuwIp() })).json();
  assert.equal(vraag.ok, true);
  const vraagAanvraag = JSON.stringify(aiAanvragen[aiAanvragen.length - 1]);
  assert.match(vraagAanvraag, /Squat/);
  assert.doesNotMatch(vraagAanvraag, /Jan|Vries|Traplopen|Rustig opbouwen|VKB/, "doel, opmerking en naam blijven bij de praktijk");
  // vraag over pijn of klachten: vaste verwijzing, niets naar de AI-dienst (MDR; AVG art. 9)
  const voorKlacht = aiAanvragen.length;
  const klacht = await (await api("/api/kaart/vraag", { methode: "POST", body: { id, vraag: "Mijn knie doet pijn sinds de operatie, moet ik doorgaan?", taal: "en" }, ip: nieuwIp() })).json();
  assert.equal(klacht.ok, true);
  assert.equal(klacht.verwezen, true);
  assert.match(klacht.antwoord, /your own practice/);
  assert.equal(aiAanvragen.length, voorKlacht, "klachtvraag gaat niet naar de AI-dienst");

  // ---- juridische pagina's ----
  for (const pad of ["/privacy", "/verwerkersovereenkomst", "/voorwaarden"]) {
    const r = await fetch(origin + pad);
    assert.equal(r.status, 200, pad);
    const html = await r.text();
    assert.doesNotMatch(html, /__[A-Z_]+__/, pad + ": geen open placeholders");
    assert.doesNotMatch(html, /<script/i, pad + ": scriptloos");
    assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(html, /Fysiplan B\.V\./);
    assert.match(html, /12345678/);
  }
  const privacy = await (await fetch(origin + "/privacy")).text();
  assert.match(privacy, /Anthropic/);
  assert.match(privacy, /Railway/);
  assert.match(privacy, /EU West \(Amsterdam\)/);
  assert.match(privacy, /privacy@fysiplan\.nl/);
  assert.match(privacy, /90 dagen/);
  // cookies en lokale opslag (legal 2026-11-06): eerlijk wat het apparaat bewaart
  assert.match(privacy, /id="opslag"/);
  assert.match(privacy, /11\.7a Telecommunicatiewet/);
  assert.match(privacy, /fpproef/);
  assert.match(privacy, /offline kopie/);
  assert.match(privacy, /naam, leeftijd en casus gaan nooit naar Fysiplan/);
  assert.doesNotMatch(privacy, /onthoudt alleen je taal/, "oude, onvolledige zin is weg");
  // art. 13 AVG volledig en B1 (legal 2026-11-07): korte samenvatting bovenaan, alle
  // rechten, antwoordtermijn, geen geautomatiseerde besluiten, of verstrekken verplicht is,
  // en een eigen versiedatum die niet blijft hangen op die van de verwerkersovereenkomst
  assert.match(privacy, /In het kort/);
  for (const recht of ["inzien", "laten verbeteren", "laten wissen", "beperken", "bezwaar maken", "meenemen"]) {
    assert.match(privacy, new RegExp("<b>" + recht + "</b>"), "recht: " + recht);
  }
  assert.match(privacy, /binnen een maand antwoord/);
  assert.match(privacy, /alleen door een computer/);
  assert.match(privacy, /zonder die gegevens kunnen we de proef niet starten/);
  assert.match(privacy, /Versie 10 november 2026/);
  assert.match(privacy, /hoe vaak, hoeveel of hoe zwaar je oefent/, "privacyverklaring noemt dat doseringsvragen niet naar de AI-dienst gaan");
  assert.match(privacy, /Foutlog/);
  assert.match(privacy, /artikel 9 lid 2 onder h AVG/, "privacyverklaring noemt de uitzondering voor gezondheidsgegevens");
  assert.match(privacy, /id="einde"/, "privacyverklaring zegt wat er gebeurt als een praktijk stopt");
  assert.match(privacy, /30 dagen na het einde van je abonnement/);
  assert.match(privacy, /zodra ook je laatste gedeelde kaart is verlopen/);
  assert.doesNotMatch(privacy, /__[A-Z_]+__/, "geen open plekhouders");
  assert.match(privacy, /WhatsApp/);
  // de foutlog belooft "zonder kaartlink": controleer de functie die het pad inkort
  const serverBron = await readFile(join(root, "server.js"), "utf8");
  const logPadBron = serverBron.match(/function logPad\(url\) \{[\s\S]*?\n\}/);
  assert.ok(logPadBron, "logPad bestaat");
  const logPad = new Function(logPadBron[0] + "; return logPad;")();
  assert.equal(logPad("/api/kaart?id=abcDEF123456"), "/api/kaart");
  assert.equal(logPad("/k/abcDEF123456"), "/k/…");
  assert.equal(logPad("/o/tok123?x=1"), "/o/…");
  assert.equal(logPad("/api/kaart/abc123/pijn"), "/api/kaart/…/pijn");
  assert.equal(logPad("/v2/app"), "/v2/app");
  assert.doesNotMatch(serverBron, /console\.error\("verzoek mislukt:", request\.method, request\.url/);
  const vwo = await (await fetch(origin + "/verwerkersovereenkomst")).text();
  const vwoVersie = serverBron.match(/const VWO_VERSIE = "(\d{4}-\d{2}-\d{2})"/)[1];
  const vwoDatum = new Date(vwoVersie + "T12:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  assert.ok(vwo.includes("Versie " + vwoDatum), "verwerkersovereenkomst toont haar eigen versie (" + vwoDatum + ")");
  assert.match(vwo, /subverwerker/i);
  assert.match(vwo, /48 uur/);
  // B1 (legal 2026-11-08): samenvatting bovenaan, en net als de voorwaarden gemarkeerd als concept
  assert.match(vwo, /In het kort[\s\S]*binnen 48 uur[\s\S]*De artikelen hieronder gelden/);
  assert.match(vwo, /class="concept"><b>Concept\.<\/b>/);
  assert.match(vwo, /na 90 dagen zonder gebruik/);
  // algemene voorwaarden (concept): proef en abonnement, beoogd gebruik, geen dossier,
  // stoppen sluit aan op de verwerkersovereenkomst, en zakelijke keuzes als invulplek
  const av = await (await fetch(origin + "/voorwaarden")).text();
  assert.match(av, /<title>Algemene voorwaarden · Fysiplan<\/title>/);
  assert.match(av, /Concept\./);
  assert.match(av, /14 dagen/);
  assert.match(av, /niet bedoeld als medisch hulpmiddel/);
  assert.match(av, /geen dossier|vervangt je dossier niet/i);
  assert.match(av, /30 dagen later wissen we alles/);
  assert.match(av, /class="invul"/);
  assert.match(av, /In het kort[\s\S]*14 dagen, is gratis[\s\S]*De artikelen hieronder gelden/);
  assert.match(av, /href="\/verwerkersovereenkomst"/);
  assert.doesNotMatch(av, /juridisch advies|kaartvoorstel|startdosering/i);
  assert.equal((await fetch(origin + "/voorwaarden/", { redirect: "manual" })).status, 301);
  assert.match(privacy, /href="\/voorwaarden"/, "voet van de juridische pagina's linkt de voorwaarden");
  const proefPagina = await (await fetch(origin + "/v2/proef")).text();
  assert.match(proefPagina, /href="\/voorwaarden"/, "proefaanmelding linkt de voorwaarden");
  const slash = await fetch(origin + "/privacy/", { redirect: "manual" });
  assert.equal(slash.status, 301);
  const oudBestand = await fetch(origin + "/juridisch.html", { redirect: "manual" });
  assert.equal(oudBestand.status, 302);
  assert.equal(oudBestand.headers.get("location"), "/privacy");

  // ---- landing: bewaartermijnen ingevuld, beoogd gebruik en juridische links ----
  const landing = await (await fetch(origin + "/v2")).text();
  assert.doesNotMatch(landing, /__BEWAAR_/);
  assert.match(landing, /90 dagen zonder activiteit/);
  assert.match(landing, /Beoogd gebruik/);
  assert.match(landing, /href="\/verwerkersovereenkomst"/);
  assert.match(landing, /href="\/voorwaarden"/);
  assert.doesNotMatch(landing, /AI-kaartassistent|startdosering|komt vanzelf bovenaan/);

  console.log("Privacypakket: alle controles geslaagd.");
} catch (fout) {
  console.error(appOutput.slice(-3000));
  throw fout;
} finally {
  app.kill();
  ai.close();
  await rm(dataDir, { recursive: true, force: true });
}
