// De bewaker van buitenaf (scripts/bewaker.mjs, .github/workflows/bewaker.yml, docs/bewaker.md).
// - De teller van serverfouten (lib/uurteller.js) en wat /health erover zegt.
// - Nakijken: wat goed is, wat een storing is en wat alleen een waarschuwing; één mislukte poging
//   is nog geen storing; de bewaker telt niet als bezoek.
// - Melden in issues van de repository, tegen een nagemaakte GitHub: openen op naam van de
//   eigenaar, niets herhalen, pas sluiten na twee goede rondes, verdergaan in hetzelfde issue,
//   nooit een stroom nieuwe issues.
// - De proefmelding, het bericht voor de telefoon en het uitzetten in een besloten repository.
// - De workflow zelf: rooster, rechten en de schakelaar.
// Zonder browser en zonder internet, past in CI. `npm run test:bewaker`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UurTeller, telAntwoord } from "../lib/uurteller.js";
import { AGENT, STANDAARD, beoordeelHealth, bewaak, meld, meldTelefoon, meldingTekst, merkVan, proefmelding, zuinigheid } from "./bewaker.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const luister = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r("http://127.0.0.1:" + srv.address().port)));
const lees = (req) => new Promise((r) => { let t = ""; req.on("data", (c) => { t += c; }); req.on("end", () => r(t)); });
const UUR = 3600e3, MIN = 60e3;
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0); // een vaste klok voor alles wat tijd meet

// ---- 1. de teller ----
{
  const t = new UurTeller();
  assert.equal(t.som(T0), 0, "een nieuwe teller staat op nul");
  t.tel(T0); t.tel(T0 + 1000); t.tel(T0 + 30 * MIN);
  assert.equal(t.som(T0 + 30 * MIN), 3);
  assert.equal(t.som(T0 + 59 * MIN), 3, "binnen het uur telt alles mee");
  assert.equal(t.som(T0 + 60 * MIN), 1, "na een uur vallen de twee van het begin af");
  assert.equal(t.som(T0 + 89 * MIN), 1);
  assert.equal(t.som(T0 + 90 * MIN), 0, "en daarna ook de derde");
  t.tel(T0 + 5 * UUR);
  assert.equal(t.som(T0 + 5 * UUR), 1, "na uren stilte begint de teller schoon");
  t.tel(T0); // een klok die terugloopt, mag niets stukmaken
  assert.equal(t.som(T0 + 5 * UUR), 2);
  assert.equal(t.som(T0 + 5 * UUR + 60 * MIN), 0);

  // een antwoord telt mee zodra het de deur uit is; een verbinding die wegvalt voordat de
  // server iets stuurde, telt niet (dat is de bezoeker, niet de server)
  const tellers = { server: new UurTeller(), buiten: new UurTeller() };
  const srv = createServer((req, res) => {
    telAntwoord(res, tellers);
    if (req.url === "/wacht") { req.socket.once("close", () => setTimeout(() => { try { res.writeHead(500); res.end(); } catch {} }, 20)); return; }
    res.writeHead(Number(req.url.slice(1)) || 200);
    res.end("x");
  });
  const basis = await luister(srv);
  for (const s of [200, 500, 500, 502, 503, 507, 404]) await (await fetch(basis + "/" + s)).text();
  await new Promise((klaar) => { const r = httpRequest(basis + "/wacht"); r.on("error", () => {}); r.end(); setTimeout(() => { r.destroy(); setTimeout(klaar, 150); }, 50); });
  await wacht(50);
  assert.equal(tellers.server.som(), 2, "alleen een antwoord 500 is een serverfout");
  assert.equal(tellers.buiten.som(), 1, "alleen een antwoord 502 is een fout van buiten");
  await new Promise((r) => srv.close(r));
}

// ---- 2. wat /health zegt ----
const gezond = () => ({ ok: true, service: "Fysiplan", commit: "abc1234def5678901234", volumeActief: true, backupElders: "ok",
  backupEldersOp: new Date(T0 - 5 * UUR).toISOString(), backupRuimte: "ok", fouten: { uur: 0, buiten: 0 } });
const oordeel = (h, o = {}) => beoordeelHealth({ status: 200, tekst: JSON.stringify(h) }, { nu: T0, ...o });
const codes = (lijst) => lijst.map((s) => s.code).join(",");
{
  let b = oordeel(gezond());
  assert.deepEqual([b.storingen, b.waarschuwingen], [[], []], "een gezonde server geeft niets te melden");
  assert.equal(b.health.commit, "abc1234def5678901234");

  // een server van vóór deze wijziging (zonder fouten, gestart en omgeving) is ook goed
  const oud = gezond(); delete oud.fouten;
  assert.deepEqual(oordeel(oud).storingen, []);

  b = beoordeelHealth({ status: 0, tekst: "", fout: "geeft geen antwoord binnen 15 seconden" });
  assert.equal(codes(b.storingen), "health");
  assert.equal(b.health, null);
  assert.match(b.storingen[0].tekst, /^De server \(\/health\) geeft geen antwoord binnen 15 seconden\.$/);
  assert.match(beoordeelHealth({ status: 502, tekst: "Bad gateway" }).storingen[0].tekst, /geeft status 502 in plaats van 200/);
  for (const tekst of ["<html>geparkeerd</html>", "{}", JSON.stringify({ ok: true, service: "Iets anders" }), JSON.stringify({ ok: false, service: "Fysiplan" }), "null", "[]"])
    assert.match(beoordeelHealth({ status: 200, tekst }).storingen[0].tekst, /geeft geen geldig antwoord van Fysiplan/, "een 200 van iets anders is geen Fysiplan: " + tekst);

  assert.equal(codes(oordeel({ ...gezond(), volumeActief: false }).storingen), "volume");
  assert.equal(codes(oordeel({ ...gezond(), backupElders: "fout" }).storingen), "kopie");
  b = oordeel({ ...gezond(), backupElders: "deels" });
  assert.deepEqual([codes(b.storingen), codes(b.waarschuwingen)], ["", "kopie-deels"], "een onvolledige kopie is een waarschuwing");
  b = oordeel({ ...gezond(), backupElders: "uit", backupEldersOp: null });
  assert.deepEqual([codes(b.storingen), codes(b.waarschuwingen)], ["", "kopie-uit"]);
  b = oordeel({ ...gezond(), backupElders: "wacht", backupEldersOp: null });
  assert.deepEqual([codes(b.storingen), codes(b.waarschuwingen)], ["", ""], "vlak na een herstart is er nog geen kopie gedraaid");
  assert.equal(codes(oordeel({ ...gezond(), backupEldersOp: new Date(T0 - 36 * UUR).toISOString() }).storingen), "", "36 uur oud mag nog net");
  b = oordeel({ ...gezond(), backupEldersOp: new Date(T0 - 40 * UUR).toISOString() });
  assert.equal(codes(b.storingen), "kopie-oud");
  assert.match(b.storingen[0].tekst, /40 uur oud/);
  assert.equal(codes(oordeel({ ...gezond(), backupRuimte: "krap" }).waarschuwingen), "kopie-krap");

  assert.equal(codes(oordeel({ ...gezond(), fouten: { uur: 10, buiten: 0 } }).storingen), "", "tien serverfouten in een uur is de grens");
  b = oordeel({ ...gezond(), fouten: { uur: 11, buiten: 21 } });
  assert.deepEqual([codes(b.storingen), codes(b.waarschuwingen)], ["fouten", "buiten"]);
  assert.match(b.storingen[0].tekst, /11 keer een serverfout/);
  assert.equal(codes(oordeel({ ...gezond(), fouten: { uur: 3, buiten: 20 } }).waarschuwingen), "");
  assert.equal(codes(oordeel({ ...gezond(), fouten: "veel" }).storingen), "", "een onverwachte vorm is geen storing");

  // het adres van productie mag niet de testomgeving zijn, en omgekeerd
  assert.equal(codes(oordeel({ ...gezond(), omgeving: "productie" }).storingen), "");
  b = oordeel({ ...gezond(), omgeving: "test" });
  assert.equal(codes(b.storingen), "omgeving");
  assert.match(b.storingen[0].tekst, /hoort productie te zijn, maar de server zegt: test/);
  // een testomgeving heeft geen reservekopie buiten Railway en geen blijvend volume nodig
  b = oordeel({ ...gezond(), omgeving: "test", backupElders: "uit", volumeActief: false }, { omgeving: "test" });
  assert.deepEqual([codes(b.storingen), codes(b.waarschuwingen)], ["", ""]);
}

// ---- 3. nakijken, tegen een nagemaakte server ----
// `gedrag[pad]` is een rij antwoorden; het laatste blijft gelden. "goed", een statuscode,
// "leeg" (200 met iets anders), "hang" (geen antwoord), "dicht" (verbinding verbroken) of "door"
// (een doorverwijzing naar een pagina die het wel doet).
const nep = { health: gezond(), gedrag: {}, gezien: [] };
const nepServer = createServer((req, res) => {
  const pad = req.url.split("?")[0];
  nep.gezien.push({ pad, agent: req.headers["user-agent"] });
  const rij = nep.gedrag[pad] || ["goed"];
  const wat = rij.length > 1 ? rij.shift() : rij[0];
  if (wat === "hang") return;
  if (wat === "dicht") { req.socket.destroy(); return; }
  if (wat === "door") { res.writeHead(302, { location: "/v2" }); res.end(); return; }
  if (typeof wat === "number") { res.writeHead(wat, { "content-type": "text/plain" }); res.end("storing"); return; }
  if (wat === "leeg") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html><body>Deze domeinnaam is te koop</body></html>"); return; }
  if (pad === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(nep.health)); return; }
  if (pad === "/v2") { res.writeHead(200, { "content-type": "text/html" }); res.end("<html><title>Fysiplan</title></html>"); return; }
  if (pad === "/v2/app") { res.writeHead(200, { "content-type": "text/html" }); res.end("<script>window.FYSIPLAN_V2=true</script>"); return; }
  if (pad === "/v2/oefeningen.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(Array.from({ length: nep.aantal ?? 600 }, (_, i) => ({ naam: "Oefening " + i })))); return; }
  res.writeHead(404); res.end();
});
const nepAdres = await luister(nepServer);
const pauzes = [];
const snel = { timeoutMs: 400, pauzeMs: 30000, wacht: async (ms) => { pauzes.push(ms); }, nu: T0 };
const kijk = async (gedrag = {}, o = {}) => { nep.gedrag = gedrag; nep.gezien = []; pauzes.length = 0; return bewaak(nepAdres + "/", { ...snel, ...o }); };
const telPad = (pad) => nep.gezien.filter((g) => g.pad === pad).length;
{
  let u = await kijk();
  assert.deepEqual([u.ok, u.storingen, u.waarschuwingen, u.pogingen], [true, [], [], 1], "alles goed: één ronde, niets te melden");
  assert.equal(u.adres, nepAdres, "het adres zonder schuine streep aan het eind");
  assert.equal(u.commit, "abc1234def56", "de versie, ingekort");
  assert.deepEqual(nep.gezien.map((g) => g.pad).sort(), ["/health", "/v2", "/v2/app", "/v2/oefeningen.json"]);
  assert.ok(nep.gezien.every((g) => g.agent === AGENT), "elk verzoek noemt de bewaker bij naam");
  assert.equal(pauzes.length, 0);

  // een uitrol: de eerste poging mislukt, de tweede is goed. Geen storing.
  u = await kijk({ "/health": ["dicht", "goed"], "/v2": [502, "goed"] });
  assert.deepEqual([u.ok, u.pogingen], [true, 2]);
  assert.deepEqual(pauzes, [30000], "tussen twee pogingen zit een halve minuut");
  assert.deepEqual([telPad("/health"), telPad("/v2"), telPad("/v2/app"), telPad("/v2/oefeningen.json")], [2, 2, 1, 1], "alleen wat mislukte, wordt opnieuw gevraagd");

  // pas na drie mislukte pogingen is het een storing
  u = await kijk({ "/v2": [503] });
  assert.deepEqual([u.ok, codes(u.storingen), u.pogingen], [false, "landing", 3]);
  assert.equal(u.storingen[0].tekst, "De landingspagina (/v2) geeft status 503 in plaats van 200.");
  assert.deepEqual([telPad("/v2"), telPad("/health")], [3, 1]);
  assert.deepEqual(pauzes, [30000, 30000]);
  u = await kijk({ "/v2": [503, 503, "goed"] });
  assert.equal(u.ok, true, "de derde poging telt nog");

  // de server is weg: alles mislukt, in gewone woorden
  u = await kijk({ "/health": ["dicht"], "/v2": ["dicht"], "/v2/app": ["dicht"], "/v2/oefeningen.json": ["dicht"] });
  assert.deepEqual([u.ok, codes(u.storingen), u.commit], [false, "app,bibliotheek,health,landing", ""]);
  assert.ok(u.storingen.every((s) => /is niet bereikbaar \(/.test(s.tekst)), JSON.stringify(u.storingen));
  // geen antwoord binnen de tijd
  u = await kijk({ "/health": ["hang"] }, { pogingen: 1 });
  assert.equal(u.storingen[0].tekst, "De server (/health) geeft geen antwoord binnen 0 seconden.");
  // een 200 met iets anders erop (een geparkeerd domein) is geen goede pagina
  u = await kijk({ "/v2": ["leeg"], "/v2/app": ["leeg"], "/v2/oefeningen.json": ["leeg"] }, { pogingen: 1 });
  assert.equal(codes(u.storingen), "app,bibliotheek,landing");
  assert.equal(u.storingen[0].tekst, "Het werkscherm van de therapeut (/v2/app) toont niet wat er hoort te staan.");
  assert.equal(u.storingen[1].tekst, "De oefenbibliotheek (/v2/oefeningen.json) ontbreekt of heeft minder dan 500 oefeningen.");
  // een doorverwijzing wordt niet gevolgd: dan staat er iets anders op het adres
  u = await kijk({ "/v2/app": ["door"] }, { pogingen: 1 });
  assert.equal(u.storingen[0].tekst, "Het werkscherm van de therapeut (/v2/app) geeft status 302 in plaats van 200.");
  assert.equal(telPad("/v2"), 1, "en de bewaker loopt er niet achteraan");
  nep.aantal = 12;
  u = await kijk({}, { pogingen: 1 });
  assert.equal(codes(u.storingen), "bibliotheek", "een bibliotheek met twaalf oefeningen is een storing");
  delete nep.aantal;

  // wat een geldig /health over de toestand zegt, geldt meteen: geen herkansing, geen pauze
  nep.health = { ...gezond(), backupElders: "fout", fouten: { uur: 40, buiten: 0 } };
  u = await kijk();
  assert.deepEqual([u.ok, codes(u.storingen), u.pogingen, pauzes.length], [false, "fouten,kopie", 1, 0]);
  // en het blijft staan als een pagina wel een herkansing nodig heeft
  u = await kijk({ "/v2/app": [500, "goed"] });
  assert.deepEqual([codes(u.storingen), u.pogingen, telPad("/health")], ["fouten,kopie", 2, 1]);
  // /health dat pas bij de tweede poging antwoordt: wat het dan zegt, telt
  u = await kijk({ "/health": [500, "goed"] });
  assert.deepEqual([codes(u.storingen), u.pogingen], ["fouten,kopie", 2]);
  nep.health = { ...gezond(), backupElders: "uit", backupEldersOp: null };
  u = await kijk();
  assert.deepEqual([u.ok, codes(u.waarschuwingen)], [true, "kopie-uit"], "een waarschuwing is geen storing");
  nep.health = { ...gezond(), omgeving: "test" };
  assert.equal(codes((await kijk()).storingen), "omgeving");
  assert.equal((await kijk({}, { omgeving: "test" })).ok, true);
  nep.health = gezond();
}

// ---- 4. melden, tegen een nagemaakte GitHub ----
const gh = { nu: T0, issues: [], volgnr: 40, prive: false, labels: new Set(), oproepen: [], weiger: {}, uitzetten: 204 };
const ghServer = createServer(async (req, res) => {
  const lijf = await lees(req);
  const u = new URL(req.url, "http://x");
  const d = lijf ? JSON.parse(lijf) : null;
  gh.oproepen.push({ m: req.method, pad: u.pathname.replace("/repos/praktijk/fysiplan", "") || "/", zoek: u.search, d, kop: req.headers });
  const stuur = (status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };
  if (req.headers.authorization !== "Bearer geheim-token") return stuur(401, { message: "Bad credentials" });
  const pad = u.pathname;
  const sleutel = req.method + " " + pad.replace("/repos/praktijk/fysiplan", "");
  if (gh.weiger[sleutel]) return stuur(gh.weiger[sleutel], { message: "geweigerd" });
  const iso = () => new Date(gh.nu).toISOString();
  if (!pad.startsWith("/repos/praktijk/fysiplan")) return stuur(404, { message: "Not Found" });
  const rest = pad.slice("/repos/praktijk/fysiplan".length);
  if (req.method === "GET" && rest === "") return stuur(200, { full_name: "praktijk/fysiplan", private: gh.prive });
  if (req.method === "GET" && rest === "/issues") {
    const staat = u.searchParams.get("state") || "open", sinds = u.searchParams.get("since");
    const pagina = Number(u.searchParams.get("page") || 1), per = Number(u.searchParams.get("per_page") || 30);
    let lijst = gh.issues.filter((i) => i.state === staat && (!sinds || i.updated_at >= sinds));
    lijst = lijst.sort((a, b) => b.number - a.number).slice((pagina - 1) * per, pagina * per);
    return stuur(200, lijst);
  }
  if (req.method === "POST" && rest === "/labels") { if (gh.labels.has(d.name)) return stuur(422, { message: "Validation Failed" }); gh.labels.add(d.name); return stuur(201, d); }
  if (req.method === "POST" && rest === "/issues") {
    if (d.assignees && gh.geenEigenaar) return stuur(422, { message: "Validation Failed" });
    const i = { number: ++gh.volgnr, title: d.title, body: d.body, labels: d.labels || [], assignees: d.assignees || [], state: "open", created_at: iso(), updated_at: iso(), closed_at: null, berichten: [], user: { login: "github-actions[bot]" } };
    gh.issues.push(i);
    return stuur(201, i);
  }
  const m = /^\/issues\/(\d+)(\/comments)?$/.exec(rest);
  const issue = m && gh.issues.find((i) => i.number === Number(m[1]));
  if (m && !issue) return stuur(404, { message: "Not Found" });
  if (m && m[2] && req.method === "POST") { issue.berichten.push(d.body); issue.updated_at = iso(); return stuur(201, { id: 1 }); }
  if (m && !m[2] && req.method === "PATCH") {
    if (d.body !== undefined) issue.body = d.body;
    if (d.state && d.state !== issue.state) { issue.state = d.state; issue.closed_at = d.state === "closed" ? iso() : null; }
    issue.updated_at = iso();
    return stuur(200, issue);
  }
  if (req.method === "PUT" && rest === "/actions/workflows/bewaker.yml/disable") return stuur(gh.uitzetten);
  stuur(404, { message: "Not Found" });
});
const ghAdres = await luister(ghServer);
// het adres voor de telefoon (ntfy), ook nagemaakt
const telefoon = [];
const telServer = createServer(async (req, res) => { telefoon.push({ kop: req.headers, tekst: await lees(req), pad: req.url }); res.writeHead(telServer.status || 200); res.end("ok"); });
const telAdres = (await luister(telServer)) + "/fysiplan-alarm";
const env = { GITHUB_TOKEN: "geheim-token", GITHUB_REPOSITORY: "praktijk/fysiplan", GITHUB_API_URL: ghAdres, BEWAKER_WEBHOOK: telAdres };
const adres = "https://fysiplan.example";
const storing = (...welke) => ({ adres, ok: welke.length === 0, commit: "abc1234def56", omgeving: "",
  storingen: welke.sort().map((code) => ({ code, tekst: "Storing " + code + "." })), waarschuwingen: [] });
// één ronde van de bewaker op tijdstip T0 + minuten
const ronde = async (minuten, uitkomst, e = env) => { gh.nu = T0 + minuten * MIN; gh.oproepen = []; telefoon.length = 0; return meld(uitkomst, e, { nu: gh.nu, timeoutMs: 2000 }); };
const schrijft = () => gh.oproepen.filter((o) => o.m !== "GET").map((o) => o.m + " " + o.pad);
const laatste = () => gh.issues[gh.issues.length - 1];
{
  // alles goed en geen issue: niets doen, alleen kijken
  let m = await ronde(0, storing());
  assert.deepEqual([m, schrijft(), gh.issues.length], [{ gedaan: [], nieuw: false }, [], 0]);
  assert.equal(gh.oproepen.length, 1, "één blik op de open issues");
  assert.equal(gh.oproepen[0].kop["user-agent"], AGENT);

  // een storing: een issue op naam van de eigenaar, met het label en een bericht naar de telefoon
  m = await ronde(5, storing("health", "landing"));
  assert.deepEqual([m.nieuw, m.gedaan], [true, ["issue #41 geopend", "telefoon: verstuurd"]]);
  assert.deepEqual(schrijft(), ["POST /labels", "POST /issues"]);
  let i = laatste();
  assert.deepEqual([i.title, i.assignees, i.labels, i.state], ["Storing: fysiplan.example werkt niet goed", ["praktijk"], ["bewaker"], "open"]);
  assert.match(i.body, /^De bewaker heeft https:\/\/fysiplan\.example nagekeken op 12-11-2026,? 16:05 \(Nederlandse tijd\) en vond dit:\n\n- Storing health\.\n- Storing landing\.\n/);
  assert.match(i.body, /Open Railway/);
  assert.match(i.body, /Versie op de server: `abc1234def56`\./);
  assert.deepEqual(merkVan(i.body, adres), { adres, codes: ["health", "landing"], gezien: ["health", "landing"] });
  assert.equal(merkVan(i.body, "https://ander.example"), null, "een issue over een ander adres is niet van deze bewaker");
  assert.equal(telefoon.length, 1);
  assert.deepEqual([telefoon[0].pad, telefoon[0].kop.title, telefoon[0].kop.priority, telefoon[0].tekst],
    ["/fysiplan-alarm", "Storing: fysiplan.example werkt niet goed", "urgent", "Storing health. Storing landing."]);

  // dezelfde storing, vijf minuten later: niets schrijven, niets sturen
  m = await ronde(10, storing("health", "landing"));
  assert.deepEqual([m, schrijft(), telefoon.length], [{ gedaan: ["issue #41 staat al open, niets veranderd"], nieuw: false }, [], 0]);

  // de storing wordt kleiner: de tekst zegt wat er nu mis is, zonder nieuw bericht
  m = await ronde(15, storing("health"));
  assert.deepEqual([m.nieuw, schrijft(), telefoon.length, i.berichten.length], [false, ["PATCH /issues/41"], 0, 0]);
  assert.doesNotMatch(i.body, /Storing landing/);
  assert.deepEqual(merkVan(i.body, adres), { adres, codes: ["health"], gezien: ["health", "landing"] });
  // en weer groter met iets dat al gemeld was: nog steeds geen nieuw bericht
  m = await ronde(20, storing("health", "landing"));
  assert.deepEqual([m.nieuw, schrijft(), telefoon.length], [false, ["PATCH /issues/41"], 0]);
  // er komt iets bij dat nog niet gemeld was: een bericht bij het issue en naar de telefoon
  m = await ronde(25, storing("health", "landing", "kopie"));
  assert.deepEqual([m.nieuw, schrijft()], [true, ["PATCH /issues/41", "POST /issues/41/comments"]]);
  assert.match(i.berichten[0], /^Er is iets bijgekomen \(12-11-2026,? 16:25\):\n\n- Storing kopie\.$/);
  assert.equal(telefoon.length, 1);
  assert.deepEqual(merkVan(i.body, adres).gezien, ["health", "kopie", "landing"]);

  // één goede ronde sluit nog niets: een server die hapert, antwoordt soms wel
  m = await ronde(30, storing());
  assert.deepEqual([m.nieuw, schrijft(), i.state, telefoon.length, i.berichten.length], [false, ["PATCH /issues/41"], "open", 0, 1]);
  assert.equal(merkVan(i.body, adres).goed, new Date(T0 + 30 * MIN).toISOString());
  assert.match(i.body, /- Storing kopie\./, "de tekst van het issue blijft staan");
  // de storing is terug: de goede ronde telt niet meer, en er komt geen nieuw bericht
  m = await ronde(35, storing("health", "kopie", "landing"));
  assert.deepEqual([m.nieuw, schrijft(), telefoon.length, merkVan(i.body, adres).goed], [false, ["PATCH /issues/41"], 0, undefined]);
  // twee goede rondes achter elkaar: voorbij
  await ronde(40, storing());
  m = await ronde(45, storing());
  assert.deepEqual([m.nieuw, m.gedaan, schrijft(), i.state], [false, ["issue #41 gesloten", "telefoon: verstuurd"], ["POST /issues/41/comments", "PATCH /issues/41"], "closed"]);
  assert.match(i.berichten[1], /^Voorbij: sinds 12-11-2026,? 16:40 zijn alle controles weer goed\. De storing stond ongeveer 35 minuten open\.$/);
  assert.deepEqual([telefoon[0].kop.title, telefoon[0].tekst], ["Voorbij: fysiplan.example", "Alle controles zijn weer goed. De storing duurde ongeveer 35 minuten."]);
  m = await ronde(50, storing());
  assert.deepEqual([m.gedaan, schrijft()], [[], []], "daarna is het weer stil");

  // binnen twaalf uur opnieuw een storing: verder in hetzelfde issue
  m = await ronde(45 + 11 * 60, storing("app"));
  assert.deepEqual([m.nieuw, m.gedaan, schrijft(), gh.issues.length, i.state], [true, ["issue #41 heropend", "telefoon: verstuurd"], ["PATCH /issues/41", "POST /issues/41/comments"], 1, "open"]);
  assert.deepEqual(merkVan(i.body, adres), { adres, codes: ["app"], gezien: ["app"] }, "een nieuwe storing begint met een schone lei");
  assert.match(i.berichten[2], /^Opnieuw een storing \(/);
  await ronde(50 + 11 * 60, storing());
  await ronde(55 + 11 * 60, storing());
  assert.equal(i.state, "closed");
  // na meer dan twaalf uur: een nieuw issue
  m = await ronde(55 + 24 * 60, storing("app"));
  assert.deepEqual([m.gedaan[0], gh.issues.length, laatste().number], ["issue #42 geopend", 2, 42]);
  assert.deepEqual(schrijft(), ["POST /labels", "POST /issues"], "het label bestond al; dat is geen fout");

  // andere issues en pull requests met dezelfde woorden zijn niet van de bewaker
  const tekstVan42 = laatste().body;
  const robot = { login: "github-actions[bot]" };
  const los = (number, extra) => ({ number, state: "open", title: "t", body: tekstVan42, created_at: "", updated_at: "", closed_at: null, berichten: [], user: robot, ...extra });
  gh.issues.push(los(90, { title: "Storing: fysiplan.example werkt niet goed", body: "door een mens geschreven", user: { login: "praktijk" } }));
  gh.issues.push(los(91, { pull_request: {} }));
  gh.issues.push(los(92, { body: meldingTekst({ ...storing("app"), adres: "https://test.fysiplan.example" }, T0) }));
  m = await ronde(60 + 24 * 60, storing("app"));
  assert.deepEqual(m.gedaan, ["issue #42 staat al open, niets veranderd"]);
  gh.issues = gh.issues.filter((x) => x.number < 90);

  // Een buitenstaander opent een issue met een nagemaakt merk (in een openbare repository kan dat).
  // Dat verbergt een echte storing niet: de bewaker opent zijn eigen issue en laat het andere staan.
  gh.issues = [los(95, { user: { login: "iemand-anders" }, body: meldingTekst(storing("health"), T0) }),
    los(96, { user: { login: "iemand-anders" }, state: "closed", body: meldingTekst(storing("health"), T0), created_at: new Date(T0 - UUR).toISOString(), updated_at: new Date(T0 - UUR).toISOString(), closed_at: new Date(T0 - UUR).toISOString() })];
  m = await ronde(0, storing("health"));
  assert.deepEqual([m.nieuw, m.gedaan[0], gh.issues.find((x) => x.number === 95).body, gh.issues.find((x) => x.number === 96).state], [true, "issue #43 geopend", meldingTekst(storing("health"), T0), "closed"]);
  // wat de eigenaar zelf opende (de bewaker met de hand gedraaid), telt wel
  gh.issues = [los(97, { user: { login: "praktijk" }, body: meldingTekst(storing("health"), T0) })];
  assert.deepEqual((await ronde(0, storing("health"))).gedaan, ["issue #97 staat al open, niets veranderd"]);

  // de eigenaar is niet toe te wijzen (een organisatie): dan zonder, het issue komt er toch
  gh.issues = []; gh.geenEigenaar = true;
  m = await ronde(0, storing("health"));
  assert.deepEqual([m.gedaan[0], laatste().assignees, laatste().labels, schrijft()], ["issue #44 geopend", [], ["bewaker"], ["POST /labels", "POST /issues", "POST /issues"]]);
  gh.geenEigenaar = false;

  // een rem: nooit een stroom nieuwe issues, ook niet als er iets misgaat met heropenen
  gh.issues = Array.from({ length: 6 }, (_, n) => ({ number: 60 + n, state: "closed", title: "t", body: meldingTekst(storing("health"), T0), berichten: [], user: robot,
    created_at: new Date(T0 - 20 * UUR).toISOString(), updated_at: new Date(T0 - 13 * UUR).toISOString(), closed_at: new Date(T0 - 13 * UUR).toISOString() }));
  await assert.rejects(ronde(0, storing("health")), /Er zijn vandaag al 6 issues voor een storing geopend/);
  assert.deepEqual(schrijft(), []);
  gh.issues.pop();
  assert.equal((await ronde(0, storing("health"))).gedaan[0], "issue #45 geopend", "vijf mag nog");
  // zes van een buitenstaander houden de bewaker niet tegen
  gh.issues = gh.issues.filter((x) => x.state === "closed").map((x) => ({ ...x, user: { login: "iemand-anders" } })).concat(los(70, { state: "closed", user: { login: "iemand-anders" }, created_at: new Date(T0 - 20 * UUR).toISOString(), updated_at: new Date(T0 - 13 * UUR).toISOString(), closed_at: new Date(T0 - 13 * UUR).toISOString() }));
  assert.equal(gh.issues.length, 6);
  assert.equal((await ronde(0, storing("health"))).gedaan[0], "issue #46 geopend");

  // GitHub werkt niet mee: dat is een fout van de bewaker zelf, geen stille ronde
  gh.issues = [];
  await assert.rejects(ronde(0, storing("health"), { ...env, GITHUB_TOKEN: "verkeerd" }), /De issues lezen lukte niet \(GitHub gaf status 401\)/);
  gh.weiger["POST /issues"] = 403;
  await assert.rejects(ronde(0, storing("health")), /Het issue openen lukte niet \(GitHub gaf status 403\)/);
  gh.weiger = {};
  await assert.rejects(meld(storing("health"), { GITHUB_REPOSITORY: "praktijk/fysiplan" }), /GITHUB_TOKEN en GITHUB_REPOSITORY ontbreken/);
  await assert.rejects(meld(storing("health"), { GITHUB_TOKEN: "x", GITHUB_REPOSITORY: "geen-schuine-streep" }), /ontbreken/);

  // zonder adres voor de telefoon gaat het issue gewoon door
  m = await ronde(0, storing("health"), { ...env, BEWAKER_WEBHOOK: "" });
  assert.deepEqual([m.gedaan, telefoon.length], [["issue #47 geopend", "telefoon: geen adres ingesteld"], 0]);
  // en een telefoon die weigert, houdt het issue niet tegen
  gh.issues = []; telServer.status = 500;
  m = await ronde(0, storing("health"));
  assert.deepEqual(m.gedaan, ["issue #48 geopend", "telefoon: geweigerd met status 500"]);
  telServer.status = 200;
}

// ---- 5. het bericht voor de telefoon ----
{
  telefoon.length = 0;
  assert.equal(await meldTelefoon("", "t", "x"), "geen adres ingesteld");
  assert.equal(await meldTelefoon("geen adres", "t", "x"), "het adres is geen geldig webadres");
  assert.equal(await meldTelefoon("http://ntfy.example/onderwerp", "t", "x"), "het adres moet met https beginnen");
  assert.equal(telefoon.length, 0);
  // een kop mag alleen gewone tekens bevatten; de tekst zelf mag alles
  assert.equal(await meldTelefoon(telAdres, "Storing: café ’t Hoekje\nregel twee", "Tekst met é en €."), "verstuurd");
  assert.deepEqual([telefoon[0].kop.title, telefoon[0].tekst, telefoon[0].kop["content-type"]], ["Storing: caf? ?t Hoekje regel twee", "Tekst met é en €.", "text/plain; charset=utf-8"]);
  // Slack wil JSON
  const naarSlack = [];
  const uit = await meldTelefoon("https://hooks.slack.com/services/T0/B0/x", "Titel", "Tekst", { fetch: async (adres, o) => { naarSlack.push([adres, o.headers["content-type"], o.body]); return { ok: true, status: 200 }; } });
  assert.deepEqual([uit, naarSlack], ["verstuurd", [["https://hooks.slack.com/services/T0/B0/x", "application/json", JSON.stringify({ text: "Titel\nTekst" })]]]);
  assert.match(await meldTelefoon("https://ntfy.example/x", "t", "x", { fetch: async () => { throw new Error("geen netwerk"); } }), /^niet gelukt \(geen netwerk\)$/);
}

// ---- 6. de proefmelding ----
{
  gh.issues = []; gh.oproepen = []; telefoon.length = 0; gh.nu = T0;
  const p = await proefmelding(adres, env, { nu: T0 });
  const i = laatste();
  assert.deepEqual(p.gedaan, ["issue #" + i.number + " geopend en weer gesloten", "telefoon: verstuurd"]);
  assert.deepEqual([i.title, i.assignees, i.state], ["Proefmelding van de bewaker", ["praktijk"], "closed"]);
  assert.match(i.body, /Dit is een proef, er is niets aan de hand\./);
  assert.equal(merkVan(i.body, adres), null, "een proefmelding is geen storing: de bewaker ziet haar later niet voor een storing aan");
  assert.equal(telefoon[0].kop.title, "Proefmelding van de bewaker");
  // een echte ronde erna doet niets met de proefmelding
  assert.deepEqual(await ronde(5, storing()), { gedaan: [], nieuw: false });
}

// ---- 7. een besloten repository: de bewaker zet zichzelf uit, tenzij iemand ervoor kiest ----
{
  gh.issues = []; gh.oproepen = []; gh.prive = false;
  assert.deepEqual(await zuinigheid(env), { door: true }, "openbaar: gewoon doorgaan");
  assert.deepEqual(schrijft(), []);
  gh.prive = true; gh.oproepen = [];
  for (const keuze of ["snel", "zuinig"]) assert.deepEqual(await zuinigheid({ ...env, BEWAKER: keuze }), { door: true }, "wie kiest, betaalt bewust");
  assert.equal(gh.oproepen.length, 0, "met een keuze vraagt de bewaker GitHub niets");
  let z = await zuinigheid(env);
  assert.deepEqual([z.door, z.uitgezet, schrijft()], [false, true, ["POST /labels", "POST /issues", "PUT /actions/workflows/bewaker.yml/disable"]]);
  assert.deepEqual([laatste().title, laatste().assignees], ["De bewaker staat uit: de repository is besloten", ["praktijk"]]);
  assert.match(laatste().body, /Er is nu geen bewaking van buitenaf/);
  assert.equal(z.issue, laatste().number);
  // lukt het uitzetten niet, dan komt er bij de volgende ronde geen tweede issue
  gh.uitzetten = 403; gh.oproepen = [];
  z = await zuinigheid(env);
  assert.deepEqual([z.door, z.uitgezet, schrijft(), gh.issues.length], [false, false, ["PUT /actions/workflows/bewaker.yml/disable"], 1]);
  gh.uitzetten = 204; gh.prive = false;
}

// ---- 8. vanaf de opdrachtregel, zoals de workflow het doet ----
const draai = (args, extra = {}) => new Promise((klaar) => {
  const kind = spawn(process.execPath, [join(root, "scripts/bewaker.mjs"), ...args], { env: { PATH: process.env.PATH, BEWAKER_PAUZE_S: "0", BEWAKER_TIMEOUT_S: "2", ...extra } });
  let uit = "", fout = "";
  kind.stdout.on("data", (c) => { uit += c; });
  kind.stderr.on("data", (c) => { fout += c; });
  kind.on("exit", (code) => klaar({ code, uit, fout }));
});
{
  gh.issues = []; gh.nu = Date.now(); telefoon.length = 0; nep.gedrag = {}; nep.health = gezond();
  nep.health.backupEldersOp = new Date().toISOString();
  let r = await draai([nepAdres]);
  assert.deepEqual([r.code, r.fout], [0, ""]);
  assert.match(r.uit, /^Goed: http:\/\/127\.0\.0\.1:\d+, versie abc1234def56, in \d+ ms\.\n$/);
  r = await draai([]);
  assert.deepEqual([r.code, r.uit], [2, ""]);
  assert.match(r.fout, /^Gebruik: node scripts\/bewaker\.mjs <adres>/);
  for (const fout of [["fysiplan.nl"], [nepAdres, "--omgeving", "staging"], [nepAdres, nepAdres]]) assert.equal((await draai(fout)).code, 2, fout.join(" "));

  // alleen kijken: een storing geeft 1 en schrijft nergens iets
  nep.gedrag = { "/v2": [503] };
  r = await draai([nepAdres]);
  assert.equal(r.code, 1);
  assert.match(r.uit, /^STORING op http:\/\/127\.0\.0\.1:\d+:\n  - De landingspagina \(\/v2\) geeft status 503 in plaats van 200\.\n$/);
  assert.equal(gh.issues.length, 0);

  // melden: nieuw is 1 (de ronde kleurt rood), daarna 0 zolang er niets verandert
  const ghEnv = { ...env, GITHUB_ACTIONS: "true" };
  r = await draai([nepAdres, "--meld"], ghEnv);
  assert.equal(r.code, 1, r.uit + r.fout);
  assert.match(r.uit, /^STORING op [^\n]+\n::error title=Storing::De landingspagina \(\/v2\) geeft status 503 in plaats van 200\.\n  issue #\d+ geopend\n  telefoon: verstuurd\n$/);
  assert.equal(gh.issues.length, 1);
  r = await draai([nepAdres, "--meld"], ghEnv);
  assert.equal(r.code, 0, "een storing die al gemeld is, kleurt de ronde niet opnieuw rood");
  assert.match(r.uit, /staat al open, niets veranderd/);
  nep.gedrag = {};
  r = await draai([nepAdres, "--meld"], ghEnv);
  assert.equal(r.code, 0);
  r = await draai([nepAdres, "--meld"], ghEnv);
  assert.deepEqual([r.code, laatste().state], [0, "closed"]);
  assert.match(r.uit, /issue #\d+ gesloten/);

  // de bewaker kan zijn werk niet doen: 2, met de reden
  r = await draai([nepAdres, "--meld"], { ...ghEnv, GITHUB_TOKEN: "verkeerd" });
  assert.equal(r.code, 2);
  assert.match(r.fout, /^::error title=De bewaker kon zijn werk niet doen::De issues lezen lukte niet \(GitHub gaf status 401\)\.\n$/);
  r = await draai([nepAdres, "--meld"]);
  assert.equal(r.code, 2);
  assert.match(r.fout, /^De bewaker kon zijn werk niet doen: GITHUB_TOKEN en GITHUB_REPOSITORY ontbreken/);

  // de proefmelding vanaf de opdrachtregel
  gh.issues = []; telefoon.length = 0;
  r = await draai([nepAdres, "--proef"], ghEnv);
  assert.deepEqual([r.code, gh.issues.length, laatste().state, telefoon.length], [0, 1, "closed", 1]);
  assert.match(r.uit, /^Proefmelding: issue #\d+ geopend en weer gesloten\.\nProefmelding: telefoon: verstuurd\.\n$/);

  // besloten repository zonder keuze: uitzetten en klaar; lukt dat niet, dan is het een fout
  gh.prive = true; gh.issues = [];
  r = await draai([nepAdres, "--meld"], ghEnv);
  assert.equal(r.code, 0);
  assert.match(r.uit, /De bewaker heeft zichzelf uitgezet\./);
  gh.uitzetten = 403;
  r = await draai([nepAdres, "--meld"], ghEnv);
  assert.equal(r.code, 2);
  assert.match(r.fout, /De bewaker kon zichzelf niet uitzetten/);
  gh.uitzetten = 204;
  r = await draai([nepAdres, "--meld"], { ...ghEnv, BEWAKER: "zuinig" });
  assert.equal(r.code, 0);
  assert.match(r.uit, /^Goed: /);
  gh.prive = false;
}

// ---- 9. de echte server: /health, de tellers en het bezoek ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-bewaker-"));
let app = null, log = "";
try {
  const vrij = createServer();
  const poort = Number(new URL(await luister(vrij)).port);
  await new Promise((r) => vrij.close(r));
  const origin = "http://127.0.0.1:" + poort;
  // mail staat "aan" tegen een adres waar niets luistert: zo geeft registreren een 502
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(poort), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "",
    V1_REGISTRATIE_CODE: "proefcode-1234", MAIL_API_SLEUTEL: "sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: "http://127.0.0.1:9" };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV") delete kind[k];
  const voor = Date.now();
  app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { log += c; });
  app.stderr.on("data", (c) => { log += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const health = async () => (await fetch(origin + "/health")).json();
  let h = await health();
  assert.deepEqual(h.fouten, { uur: 0, buiten: 0 }, "een verse server heeft geen fouten");
  assert.ok(Date.parse(h.gestart) >= voor - 1000 && Date.parse(h.gestart) <= Date.now(), "gestart is het moment waarop dit proces begon: " + h.gestart);

  // de bewaker kijkt de echte server na. De server zegt zelf welke omgeving hij is: hier lokaal. Als lokale
  // server is hij goed; op het adres van productie zou hij een storing zijn, met de waarschuwing dat de
  // reservekopie elders uit staat.
  assert.equal(h.omgeving, "lokaal");
  const u = await bewaak(origin, { pauzeMs: 0, omgeving: "lokaal" });
  assert.deepEqual([u.ok, u.storingen, codes(u.waarschuwingen), u.pogingen, u.omgeving], [true, [], "", 1, "lokaal"], JSON.stringify(u));
  const alsProductie = await bewaak(origin, { pauzeMs: 0 });
  assert.deepEqual([alsProductie.ok, codes(alsProductie.storingen), codes(alsProductie.waarschuwingen)], [false, "omgeving", "kopie-uit"], JSON.stringify(alsProductie));

  // de bewaker telt niet als bezoek; een gewone bezoeker wel
  const bezoek = async () => { const d = await (await fetch(origin + "/api/dashboard", { headers: { "x-admin-sleutel": "admin88" } })).json(); return d.dagen[d.dagen.length - 1].bezoek; };
  const eerst = await bezoek();
  assert.equal(eerst, 0, "de twee pagina's die de bewaker opvroeg, zijn niet geteld");
  await (await fetch(origin + "/v2", { headers: { "user-agent": "Mozilla/5.0 (Macintosh)" } })).text();
  assert.equal(await bezoek(), 1);
  await (await fetch(origin + "/v2/app", { headers: { "user-agent": AGENT } })).text();
  assert.equal(await bezoek(), 1);

  // een 502 (de mail kon niet weg) telt bij "buiten"; een 400 telt nergens
  const registreer = (lijf) => fetch(origin + "/api/v1/registreer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lijf) });
  assert.equal((await registreer({ email: "noor@praktijk.invalid", code: "proefcode-1234" })).status, 502);
  assert.equal((await registreer({ email: "geen adres", code: "proefcode-1234" })).status, 400);
  h = await health();
  assert.deepEqual(h.fouten, { uur: 0, buiten: 1 });

  // de server hangt de tellers aan elk antwoord en telt ook wat niemand opving
  const bron = await readFile(join(root, "server.js"), "utf8");
  assert.match(bron, /const server = createServer\(\(request, response\) => \{\n\s*\/\/[^\n]*\n\s*telAntwoord\(response, \{ server: serverFouten, buiten: buitenFouten \}\);/, "elk antwoord gaat langs de tellers");
  assert.match(bron, /if \(response\.statusCode !== 500\) serverFouten\.tel\(\);/, "een verzoek dat na het antwoord stukloopt, telt ook");
  assert.match(bron, /process\.on\("uncaughtException", \(err\) => \{ serverFouten\.tel\(\);/);
  assert.match(bron, /process\.on\("unhandledRejection", \(err\) => \{ serverFouten\.tel\(\);/);
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  if (app) { app.kill(); await new Promise((r) => app.once("exit", r)); }
  await rm(dataDir, { recursive: true, force: true });
  for (const s of [nepServer, ghServer, telServer]) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
}

// ---- 10. de workflow ----
{
  const yml = await readFile(join(root, ".github/workflows/bewaker.yml"), "utf8");
  const roosters = [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(roosters, ["*/5 * * * *", "7,37 * * * *"], "elke vijf minuten, en een zuinig rooster van twee keer per uur");
  // de voorwaarde van de job noemt precies die twee roosters: anders draait er stil niets
  for (const r of roosters) assert.ok(yml.includes("github.event.schedule == '" + r + "'"), "de job kent het rooster " + r);
  assert.match(yml, /vars\.BEWAKER != 'uit'/);
  assert.match(yml, /vars\.BEWAKER != 'zuinig'/);
  assert.match(yml, /vars\.BEWAKER == 'zuinig'/);
  assert.match(yml, /workflow_dispatch:/);
  // niet meer rechten dan nodig: lezen, issues schrijven, en zichzelf uitzetten
  assert.match(yml, /\npermissions:\n  contents: read\n  issues: write\n  actions: write[^\n]*\n\n/);
  assert.match(yml, /timeout-minutes: 5\b/);
  assert.match(yml, /cancel-in-progress: false/);
  // het adres en de geheimen komen via de omgeving, niet in de opdrachtregel
  assert.match(yml, /run: node scripts\/bewaker\.mjs "\$ADRES" "\$WAT"\n/);
  assert.match(yml, /ADRES: \$\{\{ vars\.BEWAKER_ADRES \|\| 'https:\/\/fysiplan\.nl' \}\}/);
  assert.match(yml, /WAT: \$\{\{ inputs\.proef && '--proef' \|\| '--meld' \}\}/);
  assert.match(yml, /BEWAKER_WEBHOOK: \$\{\{ secrets\.BEWAKER_WEBHOOK \}\}/);
  assert.match(yml, /sparse-checkout: scripts\/bewaker\.mjs/, "de workflow haalt alleen het script op, niet de hele repository");
  // de uitleg noemt wat de workflow gebruikt
  const uitleg = await readFile(join(root, "docs/bewaker.md"), "utf8");
  for (const naam of ["BEWAKER_WEBHOOK", "BEWAKER_ADRES", "`BEWAKER`", "snel", "zuinig", "uit", "Proefmelding", "/health"]) assert.ok(uitleg.includes(naam), "docs/bewaker.md noemt " + naam);
  assert.equal(STANDAARD.pogingen, 3);
}

console.log("test-bewaker: ok (teller per uur, oordeel over /health, herkansing na een mislukte poging, issue openen, bijwerken, pas sluiten na twee goede rondes, heropenen, rem op nieuwe issues, telefoonbericht, proefmelding, uitzetten in een besloten repository, opdrachtregel, echte server, workflow)");
