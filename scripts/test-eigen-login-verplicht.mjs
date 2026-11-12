// Besluit 2026-11-12: elke praktijk start met een eigen login en een tweede stap; een gedeeld
// praktijkwachtwoord is er niet meer (EIGEN_LOGIN_VERPLICHT: standaard aan in productie, lokaal
// en in de andere tests uit; =aan|uit dwingt het af).
// - Een nieuwe praktijk wordt beveiligd met de eigen login van wie dat doet (naam, e-mail,
//   wachtwoord, akkoord en werkregels). Dat is de eerste beheerder. Er komt geen sessie, geen
//   praktijkwachtwoord en geen herstelcode: eerst de tweede stap, pas met de eerste code een
//   sessie en de reservecodes.
// - Team kan de tweede stap niet opheffen en het praktijkwachtwoord niet aanzetten.
// - Een account van vóór de regel met alleen een praktijkwachtwoord krijgt daarmee geen sessie
//   meer. Wie het kent, maakt er de eigen login mee (de overstap); daarna werkt het
//   praktijkwachtwoord en zijn herstelcode niet meer.
// - Heeft zo'n account al een beheerder met een eigen login, dan is het praktijkwachtwoord meteen
//   dood, en logins zonder tweede stap stellen hem in bij het inloggen.
// - De formulieren zonder script blijven voor een account dat de overstap nog niet maakte met het
//   praktijkwachtwoord werken (gegevens downloaden of wissen is een recht van de praktijk).
// - De schakelaar terugzetten breekt niets: logins en tweede stappen blijven staan.
// Zonder browser, past in CI. `npm run test:eigenloginverplicht`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. de app kent het venster voor de eigen login en de overstap ----
{
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  assert.match(idx, /function openEigenLogin\(soort,opts\)/, "het venster voor de eigen login bestaat");
  assert.match(idx, /PRAKSLOT\.eigenLogin=!!d\.eigenLogin/, "de app leest uit de status of de eigen login voor iedereen geldt");
  assert.match(idx, /knop\.dataset\.act=eig\?'eigen':'claim'/, "Beveiligen opent dan het venster in plaats van een wachtwoordveld");
  assert.match(idx, /d\.eigenLoginNodig&&act==='login'/, "inloggen met het praktijkwachtwoord opent de overstap");
  assert.match(idx, /eigen:\{naam:nm,email:em,wachtwoord:eigenWw,regels:true\}/, "de overstap stuurt de eigen login mee met het praktijkwachtwoord");
  assert.match(idx, /stap:'Stap 2 van 2'/, "na de login volgt het instellen van de tweede stap");
  assert.match(idx, /d\.stapVoorIedereen/, "het Team-venster toont dat de tweede stap voor iedereen geldt");
  const css = await readFile(join(root, "public/v2.css"), "utf8");
  assert.match(css, /#ovEigenLogin \.modal/, "het venster heeft de opmaak van de andere vensters");
}

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-eigenlogin-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
// een lopende proef op "dit apparaat": naam en e-mail zijn de voorzet voor de eigen login
const proefToken = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  loopt00000000001: { id: "loopt00000000001", email: "noor@nieuw.invalid", naam: "Noor Jansen", tel: "+31612340000", akkoord: "x",
    praktijk: "Fysio Nieuw", gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, tokens: [sha(proefToken)] }
}));
const proefCookie = { cookie: "fpproef=" + proefToken };

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
let origin = "", log = "";
async function start(extra = {}) {
  const port = await vrijePoort();
  origin = `http://127.0.0.1:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "" };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV" || k === "EIGEN_LOGIN_VERPLICHT") delete kind[k];
  Object.assign(kind, extra);
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { log += c; });
  app.stderr.on("data", (c) => { log += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  return app;
}
async function stop(app) {
  app.kill();
  await new Promise((r) => app.once("exit", r));
}

let ip = 1;
const adres = () => "10.88." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const metNaam = async (naam) => Object.entries(await accounts()).filter(([, a]) => a.naam === naam);
const team = async (S) => (await get("/api/praktijk/team", S)).json();
const status = async (naam, extra) => (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(naam), extra)).json();
const login = (lijf) => post("/api/praktijk/login", lijf);
const claim = (lijf, extra) => post("/api/praktijk/claim", lijf, extra);
const activiteit = async (naam, S) => (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(naam), S)).json()).activiteit;
const kaart = (naam, S) => post("/api/kaarten", { praktijk: naam, naam: "Jan K.", chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} }, S);
// Een verse code voor dit geheim: nooit twee keer dezelfde tijdstap (een code werkt één keer).
// De server telt de huidige stap en één vooruit mee, dus per geheim hooguit twee codes kort na
// elkaar; wat daarna nog een code vraagt, gebruikt een reservecode.
const laatst = new Map();
const versStap = (geheim) => Math.max(stapVan(Date.now()), (laatst.get(geheim) || 0) + 1);
function vers(geheim) {
  const s = versStap(geheim);
  laatst.set(geheim, s);
  return codeVoor(geheim, s);
}
// een goede code die de server niet zal verbruiken (het geheim erbij is vervallen)
const onverbruikt = (geheim) => codeVoor(geheim, versStap(geheim));
const eigenLogin = (naam, email, wachtwoord, extra = {}) => ({ naam, email, wachtwoord, regels: true, ...extra });
// de tweede stap instellen bij het inloggen, met het geheim uit het antwoord `d`
async function stelIn(email, wachtwoord, d, praktijk) {
  assert.equal(d.stapInstellen, true, JSON.stringify(d));
  assert.match(d.geheim, /^[A-Z2-7]{32}$/);
  const r = await login({ ...(praktijk ? { praktijk } : {}), email, wachtwoord, geheim: d.geheim, code: vers(d.geheim) });
  assert.equal(r.status, 200, await r.clone().text());
  const b = await r.json();
  assert.ok(b.sessie, "met de eerste code is er een sessie");
  assert.equal(b.reservecodes.length, 8, "en acht reservecodes");
  return { geheim: d.geheim, reservecodes: b.reservecodes, S: ses(b) };
}
const uitnodigen = async (S, email, naam, rol, wachtwoord) => {
  const u = await (await post("/api/praktijk/team/uitnodigen", { email, naam, rol }, S)).json();
  assert.ok(u.ok, JSON.stringify(u));
  const r = await formulier("/v2/uitnodiging", { t: new URL(u.link).searchParams.get("t"), naam, wachtwoord, regels: "1" });
  assert.ok(r.status < 400, naam + " neemt de uitnodiging aan: " + r.status);
  return u.lid.id;
};

const oud = {}; // sessies en herstelcodes van vóór de regel
let app = await start(); // zonder de schakelaar: zo is het lokaal, in de andere tests en met =uit
try {
  // ---- 2a. zonder de schakelaar verandert er niets; hier ontstaan de accounts van vóór de regel ----
  let d = await status("Fysio Nieuw", proefCookie);
  assert.equal(d.eigenLogin, undefined, "zonder de schakelaar geen eigen login voor iedereen");
  assert.equal(d.voorstel, undefined);
  assert.equal(d.proefNodig, undefined);
  let r = await get("/v2/proef");
  assert.match(await r.text(), /Zet een wachtwoord op je praktijk\./, "proefpagina: de oude stap");
  // alleen een praktijkwachtwoord
  for (const naam of ["Fysio Oud", "Fysio Vergeten", "Fysio Formulier", "Fysio Gemengd", "Fysio Therapeut", "Fysio Tegelijk"]) {
    r = await claim({ praktijk: naam, wachtwoord: "praktijk-wachtwoord", akkoord: true });
    assert.equal(r.status, 200, await r.clone().text());
    d = await r.json();
    assert.ok(d.sessie && d.herstelcode, "zonder de schakelaar: sessie en herstelcode, zoals altijd");
    oud[naam] = { S: ses(d), herstelcode: d.herstelcode };
  }
  // Fysio Gemengd: beheerder Eva met een eigen login, therapeut Tom, en het praktijkwachtwoord werkt nog
  r = await post("/api/praktijk/team/eigen-login", eigenLogin("Eva Bos", "eva@gemengd.invalid", "eva-wachtwoord"), oud["Fysio Gemengd"].S);
  assert.equal(r.status, 200, await r.clone().text());
  oud.eva = ses(await r.json());
  await uitnodigen(oud.eva, "tom@gemengd.invalid", "Tom Smit", "therapeut", "tom-wachtwoord");
  r = await login({ email: "tom@gemengd.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 200);
  oud.tom = ses(await r.json());
  // Fysio Therapeut: het praktijkwachtwoord en therapeut Kim, geen beheerder met een eigen login
  await uitnodigen(oud["Fysio Therapeut"].S, "kim@therapeut.invalid", "Kim de Wit", "therapeut", "kim-wachtwoord");

  // ---- 2b. met de schakelaar ----
  await stop(app);
  app = await start({ EIGEN_LOGIN_VERPLICHT: "aan" });
  d = await status("Fysio Nieuw");
  assert.equal(d.eigenLogin, true, "de status zegt dat de eigen login voor iedereen geldt");
  assert.equal(d.geclaimd, false);
  assert.equal(d.voorstel, undefined, "zonder proef op dit apparaat geen voorzet");
  assert.equal(d.proefNodig, undefined, "PROEF_VERPLICHT staat in deze test uit");
  d = await status("Fysio Nieuw", proefCookie);
  assert.deepEqual(d.voorstel, { naam: "Noor Jansen", email: "noor@nieuw.invalid" }, "naam en e-mail uit de proef als voorzet");
  r = await get("/v2/proef");
  let html = await r.text();
  assert.match(html, /Beveilig je praktijk met je eigen login\./, "proefpagina: de nieuwe stap");
  assert.doesNotMatch(html, /halve minuut|__BEVEILIG_STAP__/);

  // een nieuwe praktijk: alleen met een eigen login
  const N = "Fysio Nieuw";
  r = await claim({ praktijk: N, wachtwoord: "noor-wachtwoord", akkoord: true });
  assert.equal(r.status, 400, "een app van vóór de regel (zonder naam en e-mail) krijgt de uitleg");
  d = await r.json();
  assert.equal(d.eigenLogin, true);
  assert.match(d.fout, /Ververs/);
  const goed = { praktijk: N, naam: "Noor Jansen", email: " Noor@Nieuw.invalid ", wachtwoord: "noor-wachtwoord", akkoord: true, regels: true };
  for (const [fout, lijf, veld] of [
    ["zonder naam", { ...goed, naam: " " }, { veld: "naam" }],
    ["zonder geldig e-mailadres", { ...goed, email: "noor" }, { veld: "email" }],
    ["zonder akkoord", { ...goed, akkoord: false }, { akkoord: true }],
    ["zonder werkregels", { ...goed, regels: false }, { regels: true }]
  ]) {
    r = await claim(lijf, proefCookie);
    assert.equal(r.status, 400, fout);
    d = await r.json();
    for (const [k, v] of Object.entries(veld)) assert.equal(d[k], v, fout + ": " + JSON.stringify(d));
  }
  r = await claim({ ...goed, wachtwoord: "kort" }, proefCookie);
  assert.equal(r.status, 400, "een wachtwoord van minder dan 8 tekens");
  assert.equal((await metNaam(N)).length, 0, "er is nog geen account");
  r = await claim(goed, proefCookie);
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.equal(d.stapInstellen, true, "na het beveiligen: eerst de tweede stap");
  assert.equal(d.voorIedereen, true);
  assert.equal(d.email, "noor@nieuw.invalid");
  assert.equal(d.sessie, undefined, "nog geen sessie");
  assert.equal(d.herstelcode, undefined, "en geen herstelcode: er is geen praktijkwachtwoord");
  assert.ok(d.uri.startsWith("otpauth://totp/Fysiplan:noor@nieuw.invalid?secret=" + d.geheim), d.uri);
  const noorEerste = d;
  let [[nk, acc]] = await metNaam(N);
  assert.equal(nk, "fysio nieuw");
  assert.equal(acc.gedeeldUit, true, "het gedeelde wachtwoord staat uit");
  assert.equal(acc.herstel, undefined, "geen herstelcode op schijf");
  assert.equal(acc.stapVerplicht, undefined, "de regel staat niet per praktijk op schijf");
  assert.equal(acc.leden.length, 1);
  assert.equal(acc.leden[0].rol, "beheerder", "wie beveiligt, is de eerste beheerder");
  assert.equal(acc.leden[0].email, "noor@nieuw.invalid");
  assert.equal(acc.leden[0].naam, "Noor Jansen");
  assert.ok(acc.leden[0].regels && acc.leden[0].regels.versie, "de werkregels zijn vastgelegd");
  assert.equal(acc.leden[0].totp, undefined, "nog geen tweede stap op schijf");
  assert.equal(acc.akkoord.wie, "Noor Jansen", "het akkoord staat op naam");
  assert.equal(acc.proef.id, "loopt00000000001", "het account hangt aan de proef van dit apparaat");
  assert.ok(!JSON.stringify(acc).includes("noor-wachtwoord"), "geen wachtwoord leesbaar op schijf");
  d = await status(N);
  assert.equal(d.geclaimd, true);
  assert.equal(d.perEmail, true, "de praktijk logt alleen per persoon in");
  r = await login({ praktijk: N, wachtwoord: "noor-wachtwoord" });
  assert.equal(r.status, 401, "het wachtwoord van de login is geen praktijkwachtwoord");
  assert.equal((await r.json()).perEmail, true);
  r = await login({ praktijk: N, wachtwoord: "noor-wachtwoord", eigen: eigenLogin("Indringer", "x@indringer.invalid", "indringer-wachtwoord") });
  assert.equal(r.status, 401, "een overstap bestaat hier niet: de praktijk heeft al een beheerder");
  assert.equal((await metNaam(N))[0][1].leden.length, 1);
  r = await claim({ ...goed, naam: "Piet Paulus", email: "piet@nieuw.invalid", wachtwoord: "piet-wachtwoord" });
  assert.equal(r.status, 409, "dezelfde naam nog een keer beveiligen kan niet zomaar");
  assert.equal((await r.json()).login, true);
  // de tweede stap, met het geheim uit het antwoord op het beveiligen
  const noor = await stelIn("noor@nieuw.invalid", "noor-wachtwoord", noorEerste, N);
  let t = await team(noor.S);
  assert.equal(t.ok, true);
  assert.equal(t.beheer, true);
  assert.equal(t.ik.rol, "beheerder");
  assert.equal(t.ik.tweedeStap, true);
  assert.equal(t.stapVerplicht, true, "de tweede stap geldt voor iedereen");
  assert.equal(t.stapVoorIedereen, true);
  assert.equal(t.stapVerplichtSinds, undefined, "niet door de praktijk gekozen, dus geen datum");
  assert.equal(t.gedeeldUit, true);
  d = await status(N, noor.S);
  assert.equal(d.ingelogd, true);
  assert.equal(d.wie, "Noor Jansen");
  assert.equal(d.voorstel, undefined, "ingelogd: geen voorzet meer");
  assert.equal((await kaart(N, noor.S)).status, 200, "de praktijk deelt een kaart");
  let act = await activiteit(N, noor.S);
  for (const actie of ["geclaimd", "eigen-login-gemaakt", "tweede-stap-aan", "ingelogd"]) {
    assert.ok(act.some((a) => a.actie === actie && a.wie === "Noor Jansen"), "Activiteit: " + actie + " door Noor");
  }
  // Team: niets op te heffen, en het praktijkwachtwoord kan niet aan
  r = await post("/api/praktijk/team/gedeeld-uit", { uit: false, wachtwoord: "nieuw-praktijkwachtwoord" }, noor.S);
  assert.equal(r.status, 400);
  assert.match((await r.json()).fout, /kan niet meer aan/);
  r = await post("/api/praktijk/team/stap-verplicht", { aan: false, wachtwoord: "noor-wachtwoord", code: noor.reservecodes[0] }, noor.S);
  assert.equal(r.status, 400, "de verplichting is niet per praktijk op te heffen");
  assert.equal((await r.json()).voorIedereen, true);
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "noor-wachtwoord" }, noor.S);
  assert.equal(r.status, 200, "aanzetten is al zo");
  [[, acc]] = await metNaam(N);
  assert.equal(acc.stapVerplicht, undefined, "en schrijft niets per praktijk");
  assert.equal(acc.gedeeldUit, true);
  assert.equal((await team(noor.S)).ik.reservecodesOver, 8, "de geweigerde poging kostte geen reservecode");
  // een collega: uitnodigen, en bij het inloggen de tweede stap
  await uitnodigen(noor.S, "sam@nieuw.invalid", "Sam Vos", "therapeut", "sam-wachtwoord");
  r = await login({ email: "sam@nieuw.invalid", wachtwoord: "sam-wachtwoord" });
  assert.equal(r.status, 401, "een collega krijgt geen sessie zonder tweede stap");
  d = await r.json();
  assert.equal(d.voorIedereen, true);
  assert.match(d.fout, /^Fysiplan vraagt een tweede stap/);
  const sam = await stelIn("sam@nieuw.invalid", "sam-wachtwoord", d);
  assert.equal((await team(sam.S)).beheer, false);
  // uitzetten is hier opnieuw instellen
  r = await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "sam-wachtwoord", code: sam.reservecodes[0] }, sam.S);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).opnieuwInloggen, true);
  assert.equal((await get("/api/praktijk/team", sam.S)).status, 401, "Sam is uitgelogd");
  // formulier zonder script: met de eigen login en een code
  r = await formulier("/v2/gegevens/download", { praktijk: N, email: "noor@nieuw.invalid", wachtwoord: "noor-wachtwoord" });
  assert.equal(r.status, 403, "zonder code geen download");
  r = await formulier("/v2/gegevens/download", { praktijk: N, email: "noor@nieuw.invalid", wachtwoord: "noor-wachtwoord", code: noor.reservecodes[1] });
  assert.equal(r.status, 200, "met een reservecode wel");
  const pakket = JSON.parse(await r.text());
  assert.deepEqual(pakket.account.tweedeStapVerplicht, { aan: true, voorIedereen: true });
  assert.ok(!JSON.stringify(pakket).includes(noor.geheim), "geen geheim in de download");

  // een praktijk met dezelfde naam: bewust "andere praktijk", met een eigen login
  r = await claim({ ...goed, naam: "Piet Paulus", email: "piet@nieuw.invalid", wachtwoord: "piet-wachtwoord", nieuw: true });
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.equal((await metNaam(N)).length, 2, "twee praktijken met deze naam, elk met een eigen sleutel");
  const piet = await stelIn("piet@nieuw.invalid", "piet-wachtwoord", d, N);
  t = await team(piet.S);
  assert.equal(t.leden.length, 1, "Piet ziet alleen zijn eigen praktijk");
  assert.equal(t.leden[0].email, "piet@nieuw.invalid");

  // ---- 2c. beveiligd, maar de tweede stap nog niet af ----
  const O = "Fysio Onderbroken";
  r = await claim({ praktijk: O, naam: "Ida Mol", email: "ida@onderbroken.invalid", wachtwoord: "ida-wachtwoord", akkoord: true, regels: true });
  assert.equal(r.status, 200);
  const idaEerste = (await r.json()).geheim;
  r = await formulier("/v2/gegevens/download", { praktijk: O, email: "ida@onderbroken.invalid", wachtwoord: "ida-wachtwoord" });
  assert.equal(r.status, 403, "formulier zonder script: eerst de tweede stap instellen");
  assert.match(await r.text(), /Fysiplan vraagt een tweede stap/);
  r = await login({ email: "ida@onderbroken.invalid", wachtwoord: "fout-wachtwoord" });
  assert.equal(r.status, 403, "een fout wachtwoord geeft geen geheim");
  r = await login({ email: "ida@onderbroken.invalid", wachtwoord: "ida-wachtwoord" });
  assert.equal(r.status, 401, "later inloggen: opnieuw het instellen");
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.equal(d.voorIedereen, true);
  assert.notEqual(d.geheim, idaEerste, "met een nieuw geheim");
  r = await login({ email: "ida@onderbroken.invalid", wachtwoord: "ida-wachtwoord", geheim: idaEerste, code: onverbruikt(idaEerste) });
  assert.equal(r.status, 401, "het geheim van het beveiligen is daarmee vervallen");
  d = await r.json();
  assert.equal(d.vernieuwd, true);
  const ida = await stelIn("ida@onderbroken.invalid", "ida-wachtwoord", d);
  assert.equal((await team(ida.S)).beheer, true);

  // ---- 2d. de overstap: een account met alleen een praktijkwachtwoord ----
  const OUD = "Fysio Oud";
  assert.equal((await get("/api/praktijk/team", oud[OUD].S)).status, 401, "de sessie met het praktijkwachtwoord van vóór de regel is weg");
  d = await status(OUD);
  assert.equal(d.geclaimd, true);
  assert.equal(d.perEmail, false, "het praktijkwachtwoord doet nog mee, voor de overstap");
  r = await login({ praktijk: OUD, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 401, "het praktijkwachtwoord geeft geen sessie meer");
  d = await r.json();
  assert.equal(d.eigenLoginNodig, true);
  assert.equal(d.sessie, undefined);
  r = await login({ praktijk: OUD, wachtwoord: "fout-wachtwoord", eigen: eigenLogin("Vreemde", "vreemde@oud.invalid", "vreemde-wachtwoord") });
  assert.equal(r.status, 403, "zonder het goede praktijkwachtwoord geen overstap");
  for (const [fout, eigen, veld] of [
    ["zonder naam", eigenLogin("", "ans@oud.invalid", "ans-wachtwoord"), { veld: "naam" }],
    ["zonder geldig e-mailadres", eigenLogin("Ans Bakker", "ans", "ans-wachtwoord"), { veld: "email" }],
    ["met een te kort wachtwoord", eigenLogin("Ans Bakker", "ans@oud.invalid", "kort"), { veld: "wachtwoord" }],
    ["met het praktijkwachtwoord als eigen wachtwoord", eigenLogin("Ans Bakker", "ans@oud.invalid", "praktijk-wachtwoord"), { veld: "wachtwoord" }],
    ["zonder werkregels", eigenLogin("Ans Bakker", "ans@oud.invalid", "ans-wachtwoord", { regels: false }), { regels: true }]
  ]) {
    r = await login({ praktijk: OUD, wachtwoord: "praktijk-wachtwoord", eigen });
    assert.equal(r.status, 400, "overstap " + fout);
    d = await r.json();
    assert.equal(d.eigenLoginNodig, true);
    for (const [k, v] of Object.entries(veld)) assert.equal(d[k], v, fout + ": " + JSON.stringify(d));
  }
  [[, acc]] = await metNaam(OUD);
  assert.ok(!acc.leden || !acc.leden.length, "er is nog niets veranderd");
  assert.notEqual(acc.gedeeldUit, true);
  r = await login({ praktijk: OUD, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin("Ans Bakker", "Ans@Oud.invalid", "ans-wachtwoord") });
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.equal(d.voorIedereen, true);
  assert.equal(d.email, "ans@oud.invalid");
  assert.equal(d.sessie, undefined, "ook na de overstap eerst de tweede stap");
  [[, acc]] = await metNaam(OUD);
  assert.equal(acc.gedeeldUit, true, "het praktijkwachtwoord is vervallen");
  assert.equal(acc.leden.length, 1);
  assert.equal(acc.leden[0].rol, "beheerder", "wie de overstap maakt, wordt beheerder");
  const ansEerste = d;
  r = await login({ praktijk: OUD, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).perEmail, true, "het praktijkwachtwoord werkt nu nergens meer voor");
  r = await login({ praktijk: OUD, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin("Tweede", "tweede@oud.invalid", "tweede-wachtwoord") });
  assert.equal(r.status, 401, "een tweede overstap kan niet");
  assert.equal((await metNaam(OUD))[0][1].leden.length, 1);
  r = await post("/api/praktijk/herstel", { praktijk: OUD, herstelcode: oud[OUD].herstelcode, nieuw: "weer-een-praktijkwachtwoord" });
  assert.equal(r.status, 401, "de herstelcode van het praktijkwachtwoord werkt niet meer");
  assert.equal((await r.json()).perEmail, true);
  r = await formulier("/v2/gegevens/download", { praktijk: OUD, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 403, "formulier zonder script: het praktijkwachtwoord werkt niet meer");
  const ans = await stelIn("ans@oud.invalid", "ans-wachtwoord", ansEerste, OUD);
  t = await team(ans.S);
  assert.equal(t.beheer, true);
  assert.equal(t.ik.naam, "Ans Bakker");
  act = await activiteit(OUD, ans.S);
  assert.ok(act.some((a) => a.actie === "eigen-login-gemaakt" && a.wie === "Ans Bakker"), "Activiteit: eigen login gemaakt");
  assert.ok(act.some((a) => a.actie === "praktijkwachtwoord-uit" && a.wie === "Ans Bakker"), "Activiteit: praktijkwachtwoord uit");

  // wachtwoord vergeten vóór de overstap: de herstelcode zet een nieuw praktijkwachtwoord, zonder sessie
  const V = "Fysio Vergeten";
  r = await post("/api/praktijk/herstel", { praktijk: V, herstelcode: oud[V].herstelcode, nieuw: "nieuw-praktijkwachtwoord" });
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.equal(d.eigenLoginNodig, true);
  assert.equal(d.sessie, undefined, "herstellen geeft geen sessie");
  assert.ok(d.herstelcode, "wel een nieuwe herstelcode, voor wie de overstap uitstelt");
  r = await login({ praktijk: V, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin("Bo Kramer", "bo@vergeten.invalid", "bo-wachtwoord") });
  assert.equal(r.status, 403, "het oude praktijkwachtwoord werkt niet meer");
  r = await login({ praktijk: V, wachtwoord: "nieuw-praktijkwachtwoord", eigen: eigenLogin("Bo Kramer", "bo@vergeten.invalid", "bo-wachtwoord") });
  assert.equal(r.status, 200, "met het nieuwe praktijkwachtwoord volgt de overstap");
  await stelIn("bo@vergeten.invalid", "bo-wachtwoord", await r.json(), V);

  // Twee overstappen tegelijk met hetzelfde praktijkwachtwoord: precies één wint. Met de
  // proefcookie wacht de eerste na de wachtwoordcontrole op schijf (de proefkoppeling); de
  // tweede is dan al klaar, en de eerste mag er niet óók nog een beheerder bij maken.
  const TG = "Fysio Tegelijk";
  const tegelijk = await Promise.all([["Een Eerst", "een@tegelijk.invalid"], ["Twee Tegelijk", "twee@tegelijk.invalid"]].map(([naam, email]) =>
    post("/api/praktijk/login", { praktijk: TG, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin(naam, email, "eigen-wachtwoord-1") }, proefCookie)));
  assert.deepEqual(tegelijk.map((x) => x.status).sort(), [200, 401], "twee overstappen tegelijk: één lukt, één is te laat");
  assert.equal((await tegelijk.find((x) => x.status === 401).json()).perEmail, true);
  [[, acc]] = await metNaam(TG);
  assert.equal(acc.leden.length, 1, "en er is precies één login gemaakt, de beheerder");
  assert.ok(acc.proef, "de proef van dit apparaat is daarbij gekoppeld");

  // ---- 2e. een account dat al een beheerder met een eigen login had ----
  const G = "Fysio Gemengd";
  r = await login({ praktijk: G, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 401, "het praktijkwachtwoord is hier meteen dood");
  assert.equal((await r.json()).perEmail, true);
  r = await login({ praktijk: G, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin("Indringer", "x@gemengd.invalid", "indringer-wachtwoord") });
  assert.equal(r.status, 401, "en er is geen overstap mee te maken");
  assert.equal((await metNaam(G))[0][1].leden.length, 2);
  assert.equal((await get("/api/praktijk/team", oud[G].S)).status, 401);
  assert.equal((await get("/api/praktijk/team", oud.eva)).status, 401, "Eva (zonder tweede stap) is uitgelogd");
  assert.equal((await get("/api/praktijk/team", oud.tom)).status, 401, "Tom ook");
  r = await login({ email: "eva@gemengd.invalid", wachtwoord: "eva-wachtwoord" });
  assert.equal(r.status, 401);
  const eva = await stelIn("eva@gemengd.invalid", "eva-wachtwoord", await r.json());
  t = await team(eva.S);
  assert.equal(t.beheer, true);
  assert.ok(t.leden.some((l) => l.email === "tom@gemengd.invalid" && !l.tweedeStap), "Tom stelt hem nog in");
  r = await login({ email: "tom@gemengd.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).stapInstellen, true);

  // een account met het praktijkwachtwoord en alleen een therapeut met een eigen login
  const T = "Fysio Therapeut";
  r = await login({ email: "kim@therapeut.invalid", wachtwoord: "kim-wachtwoord" });
  assert.equal(r.status, 401);
  const kim = await stelIn("kim@therapeut.invalid", "kim-wachtwoord", await r.json());
  assert.equal((await team(kim.S)).beheer, false, "Kim blijft therapeut");
  r = await login({ praktijk: T, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin("Kim de Wit", "kim@therapeut.invalid", "ander-wachtwoord") });
  assert.equal(r.status, 409, "de overstap op het adres van een collega kan niet");
  assert.equal((await r.json()).veld, "email");
  r = await login({ praktijk: T, wachtwoord: "praktijk-wachtwoord", eigen: eigenLogin("Lot Visser", "lot@therapeut.invalid", "lot-wachtwoord") });
  assert.equal(r.status, 200, "wie het praktijkwachtwoord kent, wordt de beheerder");
  const lot = await stelIn("lot@therapeut.invalid", "lot-wachtwoord", await r.json(), T);
  assert.equal((await team(lot.S)).leden.length, 2);
  assert.equal((await get("/api/praktijk/team", kim.S)).status, 200, "Kim blijft ingelogd");

  // formulier zonder script voor een account dat de overstap nog niet maakte: het praktijkwachtwoord
  const F = "Fysio Formulier";
  r = await formulier("/v2/gegevens/download", { praktijk: F, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 200, "gegevens downloaden blijft kunnen met het praktijkwachtwoord");
  assert.equal(JSON.parse(await r.text()).praktijk, "fysio formulier");

  // ---- 2f. herstart: de sessies met een tweede stap blijven ----
  await stop(app);
  app = await start({ EIGEN_LOGIN_VERPLICHT: "aan" });
  assert.equal((await get("/api/praktijk/team", noor.S)).status, 200, "Noor is na de herstart nog ingelogd");
  assert.equal((await team(noor.S)).stapVoorIedereen, true);

  // ---- 2g. de schakelaar terug uit: niets breekt ----
  await stop(app);
  app = await start({ EIGEN_LOGIN_VERPLICHT: "uit" });
  assert.equal((await status("Fysio Nog Niet")).eigenLogin, undefined);
  r = await login({ praktijk: F, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 200, "een account zonder overstap logt weer in met het praktijkwachtwoord");
  assert.ok((await r.json()).sessie);
  r = await login({ praktijk: N, wachtwoord: "noor-wachtwoord" });
  assert.equal(r.status, 401, "een praktijk die met eigen logins is gestart, houdt alleen eigen logins");
  r = await login({ praktijk: OUD, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 401, "na de overstap blijft het praktijkwachtwoord uit");
  assert.equal((await r.json()).perEmail, true);
  r = await login({ praktijk: G, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 200, "stond het nog aan naast een beheerder met een eigen login, dan werkt het weer");
  r = await login({ praktijk: N, email: "noor@nieuw.invalid", wachtwoord: "noor-wachtwoord" });
  assert.equal(r.status, 401, "en Noor houdt haar tweede stap");
  assert.equal((await r.json()).tweedeStap, true);
  r = await login({ praktijk: N, email: "noor@nieuw.invalid", wachtwoord: "noor-wachtwoord", code: noor.reservecodes[2] });
  assert.equal(r.status, 200, await r.clone().text());
  t = await team(ses(await r.json()));
  assert.equal(t.stapVerplicht, false, "zonder de schakelaar is hij weer een eigen keuze");
  assert.equal(t.stapVoorIedereen, undefined);

  // ---- 2h. productie: standaard aan, en uit te zetten ----
  await stop(app);
  app = await start({ NODE_ENV: "production", ADMIN_KEY: "eigen-beheersleutel-1234", PROEF_VERPLICHT: "" });
  d = await status("Fysio Live");
  assert.equal(d.eigenLogin, true, "productie: standaard aan");
  assert.equal(d.proefNodig, true, "productie zonder proef op dit apparaat: eerst de proef");
  d = await status("Fysio Live", proefCookie);
  assert.equal(d.proefNodig, undefined);
  assert.ok(d.voorstel);
  r = await claim({ praktijk: "Fysio Live", naam: "Zoë Live", email: "zoe@live.invalid", wachtwoord: "zoe-wachtwoord", akkoord: true, regels: true });
  assert.equal(r.status, 403, "productie: zonder proef geen nieuwe praktijk, ook niet met een eigen login");
  assert.equal((await r.json()).proefNodig, true);
  r = await claim({ praktijk: "Fysio Live", wachtwoord: "zoe-wachtwoord", akkoord: true }, proefCookie);
  assert.equal(r.status, 400, "productie met proef: de eigen login is nodig");
  assert.equal((await r.json()).eigenLogin, true);
  await stop(app);
  app = await start({ NODE_ENV: "production", ADMIN_KEY: "eigen-beheersleutel-1234", PROEF_VERPLICHT: "", EIGEN_LOGIN_VERPLICHT: "uit" });
  assert.equal((await status("Fysio Live")).eigenLogin, undefined, "productie met EIGEN_LOGIN_VERPLICHT=uit: de oude weg");

  console.log("test-eigen-login-verplicht: ok (nieuwe praktijk met eigen login en tweede stap, geen praktijkwachtwoord of herstelcode, Team kan het niet opheffen, overstap voor oude accounts, formulieren, herstart, schakelaar terug, productie standaard aan)");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
