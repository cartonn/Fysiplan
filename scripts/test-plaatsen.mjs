// Plaatsen (lib/plaatsen.js): het aantal therapeuten is het aantal logins, en de grens op kaarten
// telt alleen lopende kaarten.
//
// 1. de regels zelf
// 2. de echte server: afrekenen zonder beveiligde praktijk is voor één therapeut
// 3. de echte server: de grens op kaarten tijdens de proef en voor een klant
// 4. de echte server: de aankondiging van een nieuwe maand volgt de logins en de piek
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_PLAATSEN, KAARTEN_PROEF, KAARTEN_PER_LOGIN, KAARTEN_BEWAARD_KEER, telLogins, plaatsenVan, merkPiek, volgendAantal,
  nieuwePeriode, kaartGrens, telKaarten, kaartVol } from "../lib/plaatsen.js";
import { MAX_THERAPEUTEN } from "../lib/mollie.js";

// ---- 1. de regels ----
{
  const lid = (hash) => ({ id: "x", naam: "N", ...(hash ? { hash } : {}) });
  assert.equal(telLogins([lid("a"), lid(""), lid("b"), null]), 2, "alleen wie een wachtwoord heeft gekozen, telt");
  assert.equal(telLogins(undefined), 0);
  assert.equal(plaatsenVan([]), 1, "een praktijk zonder login is één persoon");
  assert.equal(plaatsenVan([lid("a"), lid("b"), lid("")]), 2);
  assert.equal(plaatsenVan(Array.from({ length: 80 }, () => lid("a"))), MAX_PLAATSEN, "nooit meer dan het maximum");
  assert.equal(MAX_THERAPEUTEN, MAX_PLAATSEN, "één maximum, op één plek");

  const a = { aantal: 2 };
  assert.equal(merkPiek(a, 3), true); assert.equal(a.piek, 3);
  assert.equal(merkPiek(a, 3), false, "dezelfde stand is geen wijziging");
  assert.equal(merkPiek(a, 2), false); assert.equal(a.piek, 3, "de piek zakt niet tijdens de maand");
  assert.equal(merkPiek(a, 99), true); assert.equal(a.piek, MAX_PLAATSEN);
  assert.equal(volgendAantal({ piek: 3 }, 2), 3, "wie een collega vlak voor de afschrijving verwijdert, betaalt die maand nog");
  assert.equal(volgendAantal({ piek: 3 }, 5), 5);
  assert.equal(volgendAantal({}, 0), 1);
  assert.equal(volgendAantal(null, 2), 2);
  const b = { aantal: 1, piek: 4 };
  assert.equal(nieuwePeriode(b, 2), 4); assert.deepEqual(b, { aantal: 4, piek: 2 }, "na de aankondiging begint de piek opnieuw bij de logins van nu");
  assert.equal(nieuwePeriode(b, 2), 2, "de maand daarna is weer voor twee");

  assert.equal(kaartGrens({ klant: false, logins: 9 }), KAARTEN_PROEF, "tijdens de proef telt het aantal logins niet");
  assert.equal(kaartGrens({ klant: true, logins: 3 }), 3 * KAARTEN_PER_LOGIN);
  assert.equal(kaartGrens({ klant: true, logins: 0 }), KAARTEN_PER_LOGIN);
  assert.equal(kaartGrens({ klant: true, logins: 999 }), MAX_PLAATSEN * KAARTEN_PER_LOGIN);
  const nu = 1000, verloopt = (k) => (k.verwijderdOp ? 0 : k.tot);
  const map = { a: { tot: 2000 }, b: { tot: 2000, gearchiveerd: true }, c: { tot: 2000, verwijderdOp: 5 }, d: { tot: 500 }, e: { tot: 2000, demo: true }, f: null };
  assert.deepEqual(telKaarten(map, nu, verloopt), { lopend: 1, totaal: 4 }, "lopend: niet afgerond, niet verwijderd, niet verlopen; de voorbeeldkaart telt nergens");
  assert.deepEqual(telKaarten(undefined, nu, verloopt), { lopend: 0, totaal: 0 });
  const vol = (lopend, bewaard, wie) => {
    const m = {};
    for (let i = 0; i < lopend; i++) m["l" + i] = { tot: 2000 };
    for (let i = 0; i < bewaard; i++) m["b" + i] = { tot: 2000, gearchiveerd: true };
    return kaartVol(m, nu, verloopt, wie);
  };
  const proef = { klant: false, logins: 1 };
  assert.equal(vol(KAARTEN_PROEF - 1, 50, proef), null, "afgeronde kaarten tellen niet mee voor de grens");
  assert.deepEqual(vol(KAARTEN_PROEF, 0, proef), { soort: "lopend", grens: KAARTEN_PROEF, lopend: KAARTEN_PROEF, totaal: KAARTEN_PROEF });
  assert.equal(vol(KAARTEN_PROEF, 0, { klant: true, logins: 1 }), null, "een klant heeft meer ruimte dan de proef");
  assert.equal(vol(KAARTEN_PER_LOGIN, 0, { klant: true, logins: 1 }).soort, "lopend");
  assert.equal(vol(KAARTEN_PER_LOGIN, 0, { klant: true, logins: 2 }), null, "elke login geeft ruimte");
  assert.equal(vol(10, KAARTEN_PROEF * KAARTEN_BEWAARD_KEER - 11, proef), null);
  assert.equal(vol(10, KAARTEN_PROEF * KAARTEN_BEWAARD_KEER - 10, proef).soort, "bewaard", "archief en prullenbak samen hebben wel een plafond");
}

// ---- de echte server, met een nagemaakte Mollie en een nagemaakte mailer ----
const mails = [], gevraagd = [];
const nep = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const json = (s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url === "/emails") { mails.push(JSON.parse(body)); return json(200, { id: "m" }); }
    if (req.method === "POST" && req.url === "/v2/customers") return json(201, { id: "cst_test1" });
    if (req.method === "POST" && req.url === "/v2/payments") {
      const b = JSON.parse(body);
      gevraagd.push(b);
      return json(201, { id: "tr_plaats" + gevraagd.length, status: "open", amount: b.amount, metadata: b.metadata, _links: { checkout: { href: "https://www.mollie.com/checkout/test" } } });
    }
    json(404, {});
  });
});
await new Promise((r) => nep.listen(0, "127.0.0.1", r));
const nepUrl = "http://127.0.0.1:" + nep.address().port;

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-plaatsen-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const nu = Date.now(), dag = 86400000;
const token = Object.fromEntries(["proef", "vol", "los", "klant", "piek", "rust", "zonder"].map((n) => [n, randomBytes(24).toString("hex")]));
const basis = (id) => ({ id, email: id + "@praktijk.invalid", naam: "Naam " + id, tel: "+31201230000", praktijk: "Fysio " + id, akkoord: "x", tokens: [sha(token[id])] });
const klant = (id, aantal, betaaldTot, extra = {}) => ({ ...basis(id), gestart: nu - 60 * dag, verloopt: nu - 46 * dag, klant: true,
  betaling: { id: "tr_eerste" + id, klant: "cst_" + id + "1234", aantal, status: "paid", gemaakt: nu - 27 * dag },
  abonnement: { status: "actief", aantal, bedrag: (9.99 * aantal).toFixed(2), sinds: nu - 27 * dag, betaaldTot, eersteBetaling: "tr_eerste" + id,
    factuurNr: "FP-2026-00" + id.length + aantal, mollieKlant: "cst_" + id + "1234", mandaat: "mdt_" + id + "1234", ...extra } });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proef: { ...basis("proef"), gestart: nu - 2 * dag, verloopt: nu + 12 * dag }, // in de proef, 99 lopende kaarten
  vol: { ...basis("vol"), gestart: nu - 2 * dag, verloopt: nu + 12 * dag }, // in de proef, een vol archief
  los: { ...basis("los"), gestart: nu - 15 * dag, verloopt: nu - dag }, // proef voorbij, geen beveiligde praktijk
  klant: klant("klant", 1, nu + 3 * dag), // betaalde voor 1, heeft nu 3 logins; de aankondiging is aan de beurt
  piek: klant("piek", 2, nu + 3 * dag, { piek: 4 }), // had deze maand 4 logins, nu nog 2
  rust: klant("rust", 1, nu + 20 * dag), // heeft nu 2 logins; de aankondiging is nog niet aan de beurt
  zonder: klant("zonder", 2, nu + 3 * dag), // klant zonder beveiligde praktijk: er valt niets te tellen
}));
await writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify({ kor: "nee", prijsBtw: "inclusief" }));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
async function start(incasso) {
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MOLLIE_API_KEY: "test_nep", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: incasso ? "aan" : "",
    MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.invalid", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.invalid" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$)/.test(k)) delete env[k];
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++ % 250), ...extra }, body: JSON.stringify(body) });
const pagina = async (pad, id) => (await fetch(origin + pad, { headers: { cookie: "fpproef=" + token[id] } })).text();

let app = await start(false);
try {
  // ---- 2. afrekenen zonder beveiligde praktijk: één therapeut, wat het formulier ook zegt ----
  let html = await pagina("/v2/proef", "los");
  assert.doesNotMatch(html, /name="aantal"/, "het aantal therapeuten is geen invulveld");
  assert.match(html, /nog niet beveiligd, dus je betaalt voor <b>1 therapeut<\/b>.*je betaalt nu <b>€ 9,99<\/b>/s, "zonder praktijk: één therapeut, met het bedrag erbij");
  let r = await fetch(origin + "/v2/proef/betalen", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: "fpproef=" + token.los }, body: "aantal=40" });
  assert.equal(r.status, 303, "afrekenen start");
  assert.deepEqual(gevraagd.at(-1).amount, { currency: "EUR", value: "9.99" }, "een meegestuurd aantal telt niet");
  assert.match(gevraagd.at(-1).description, /1 therapeut$/);
  assert.equal((await lees("proef-aanmeldingen.json")).los.betaling.aantal, 1);

  // ---- praktijken beveiligen (koppelt het account aan de aanmelding) ----
  const S = {};
  for (const id of ["proef", "vol", "klant", "piek", "rust"]) {
    r = await post("/api/praktijk/claim", { praktijk: "Fysio " + id, wachtwoord: "wachtwoord-" + id + "-plaatsen", akkoord: true }, { cookie: "fpproef=" + token[id] });
    assert.equal(r.status, 200, id + " beveiligen");
    S[id] = { "x-praktijk-sessie": (await r.json()).sessie, cookie: "fpproef=" + token[id] };
  }
  await stop(app);

  // tussen twee starts: logins en kaarten klaarzetten
  const accounts = await lees("praktijk-accounts.json");
  const pk = Object.fromEntries(Object.keys(S).map((id) => [id, Object.keys(accounts).find((k) => accounts[k].proef?.id === id)]));
  for (const id of Object.keys(S)) assert.ok(pk[id], id + ": het account hangt aan de aanmelding");
  const logins = (id, n, genodigd = 0) => {
    const eigen = (accounts[pk[id]].leden || []).filter((l) => l && l.hash);
    accounts[pk[id]].leden = [...eigen,
      ...Array.from({ length: n - eigen.length }, (_, i) => ({ id: "extra" + id + i, naam: "Collega " + i, rol: "therapeut", hash: "scrypt$00$00" })),
      ...Array.from({ length: genodigd }, (_, i) => ({ id: "gen" + id + i, naam: "Genodigd " + i, rol: "therapeut" }))];
    assert.equal(telLogins(accounts[pk[id]].leden), n, "testopzet: " + id + " heeft " + n + " logins");
  };
  logins("klant", 3, 2); logins("piek", 2); logins("rust", 2); logins("proef", 4);
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accounts));
  const kaart = (naam, extra = {}) => [naam.toLowerCase(), { id: "id" + naam.toLowerCase(), naam, praktijk: "x", oefeningen: [], chosen: [], ts: nu - dag, ...extra }];
  const stapel = (lopend, afgerond, weg) => Object.fromEntries([
    ...Array.from({ length: lopend }, (_, i) => kaart("Lopend" + i)),
    ...Array.from({ length: afgerond }, (_, i) => kaart("Klaar" + i, { gearchiveerd: true, gearchiveerdOp: nu - dag })),
    ...Array.from({ length: weg }, (_, i) => kaart("Weg" + i, { verwijderdOp: nu - dag, herstelTot: nu + 6 * dag }))]);
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
    [pk.proef]: stapel(KAARTEN_PROEF - 1, 30, 20), // 149 kaarten in totaal: met de oude grens van 100 zat deze praktijk al vast
    [pk.vol]: stapel(10, KAARTEN_PROEF * KAARTEN_BEWAARD_KEER - 10 - 20, 20),
    [pk.klant]: stapel(3 * KAARTEN_PER_LOGIN - 1, 5, 0),
    [pk.rust]: stapel(2 * KAARTEN_PER_LOGIN - 1, 0, 0),
  }));

  app = await start(true);
  // Mijn abonnement, vóór de eerste ronde (5 s na de start): wat de praktijk nu heeft en wat de volgende maand wordt
  html = await pagina("/v2/proef?mijn=1", "klant");
  assert.match(html, /Actief voor 1 therapeut,/);
  assert.match(html, /id="abo-logins">Elke login in je team telt als één therapeut; je team heeft nu 3 logins\. De volgende maand is voor <b>3 therapeuten<\/b>\.</, "meer logins dan betaald: dat staat erbij");
  html = await pagina("/v2/proef?mijn=1", "piek");
  assert.match(html, /je team heeft nu 2 logins\. De volgende maand is voor <b>4 therapeuten<\/b>, omdat je team er deze maand zoveel had\./, "de piek staat erbij, met de reden");
  html = await pagina("/v2/proef?mijn=1", "zonder");
  assert.doesNotMatch(html, /abo-logins/, "zonder beveiligde praktijk valt er niets te tellen");

  // ---- 3. de grens op kaarten ----
  const deel = (id, naam, extra = {}) => post("/api/kaarten", { praktijk: "Fysio " + id, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "", ...extra }, S[id]);
  // de proef: 99 lopende kaarten plus 50 in archief en prullenbak; er kan er nog één bij
  r = await deel("proef", "Honderdste");
  assert.equal(r.status, 200, "afgeronde en verwijderde kaarten tellen niet mee: " + uitvoer.slice(-300));
  const honderdste = await r.json();
  r = await deel("proef", "Te veel");
  assert.equal(r.status, 400);
  let j = await r.json();
  assert.equal(j.kaartenVol, true); assert.equal(j.grens, KAARTEN_PROEF);
  assert.match(j.fout, /100 lopende kaarten; dat is het maximum tijdens de proef\. Rond kaarten af/, "de melding zegt wat er aan de hand is en wat je kunt doen (vier logins geven tijdens de proef geen ruimte)");
  assert.ok(!(await lees("kaarten.json"))[pk.proef]["te veel"], "de geweigerde kaart staat er niet");
  // een bestaande kaart bijwerken kan altijd
  r = await deel("proef", "Honderdste", { kaartId: honderdste.id || honderdste.kaartId || "", overschrijf: true });
  assert.equal(r.status, 200, "bijwerken van een bestaande kaart kan ook als de praktijk vol zit");
  // een vol archief: dan wijst de melding naar de prullenbak
  r = await deel("vol", "Nieuw");
  assert.equal(r.status, 400);
  j = await r.json();
  assert.equal(j.kaartenVol, true);
  assert.match(j.fout, /te veel afgeronde en verwijderde kaarten.*Leeg de prullenbak/, "vol archief: een eigen melding");
  // een klant met drie logins: 900 lopende kaarten
  r = await deel("klant", "Laatste");
  assert.equal(r.status, 200, "een klant komt ver voorbij de 100");
  r = await deel("klant", "Te veel");
  assert.equal(r.status, 400);
  j = await r.json();
  assert.equal(j.grens, 3 * KAARTEN_PER_LOGIN, "drie logins, niet vijf: een uitnodiging geeft geen ruimte");
  assert.match(j.fout, /900 lopende kaarten; dat is het maximum voor het aantal logins in je team/);
  r = await deel("rust", "Laatste");
  assert.equal(r.status, 200);
  assert.equal((await (await deel("rust", "Te veel")).json()).grens, 2 * KAARTEN_PER_LOGIN);

  // ---- 4. de ronde: de aankondiging volgt de logins en de piek ----
  let p = null;
  for (let i = 0; i < 80; i++) {
    await new Promise((res) => setTimeout(res, 150));
    p = await lees("proef-aanmeldingen.json");
    if (p.klant.abonnement.gemeld && p.piek.abonnement.gemeld && p.zonder.abonnement.gemeld && p.rust.abonnement.piek) break;
  }
  assert.deepEqual([p.klant.abonnement.aantal, p.klant.abonnement.piek], [3, 3], "betaalde voor 1, heeft 3 logins: de nieuwe maand is voor 3\n" + uitvoer.slice(-600));
  assert.deepEqual([p.klant.abonnement.gemeldBedrag.aantal, p.klant.abonnement.gemeldBedrag.bedrag], [3, "29.97"], "en dat bedrag is aangekondigd");
  assert.deepEqual([p.piek.abonnement.aantal, p.piek.abonnement.piek], [4, 2], "de piek van de afgelopen maand telt; daarna begint ze opnieuw bij de logins van nu");
  assert.equal(p.piek.abonnement.gemeldBedrag.bedrag, "39.96");
  assert.deepEqual([p.zonder.abonnement.aantal, p.zonder.abonnement.gemeldBedrag.bedrag], [2, "19.98"], "zonder beveiligde praktijk blijft het aantal waarvoor is afgesloten");
  assert.ok(!("piek" in p.zonder.abonnement), "en er wordt geen piek bijgehouden");
  assert.deepEqual([p.rust.abonnement.aantal, p.rust.abonnement.piek, p.rust.abonnement.gemeld], [1, 2, undefined],
    "nog niet aan de beurt: de lopende maand blijft voor 1, de piek van 2 is onthouden");
  const aankondiging = (id) => mails.find((m) => m.to[0] === id + "@praktijk.invalid" && /aankondiging/.test(m.subject));
  assert.match(aankondiging("klant").text, /EUR 29\.97/, "de mail noemt het bedrag voor drie");
  assert.match(aankondiging("piek").text, /EUR 39\.96/);
  assert.ok(!aankondiging("rust"));
  html = await pagina("/v2/proef?mijn=1", "klant");
  assert.match(html, /Actief voor 3 therapeuten,.*je team heeft nu 3 logins\.<\/span>/s, "na de aankondiging staat het nieuwe aantal er, zonder regel over de volgende maand");
  html = await pagina("/v2/proef?mijn=1", "rust");
  assert.match(html, /je team heeft nu 2 logins\. De volgende maand is voor <b>2 therapeuten<\/b>\.</);

  console.log("test-plaatsen: ok (de regels, afrekenen zonder praktijk, de grens op lopende kaarten in de proef en voor een klant, de aankondiging volgt de logins en de piek)");
} catch (e) {
  e.message += "\n--- server ---\n" + uitvoer.slice(-1500);
  throw e;
} finally {
  await stop(app);
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
