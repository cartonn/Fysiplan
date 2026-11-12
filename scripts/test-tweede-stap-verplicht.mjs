// Platformreview 2026-11-11: "Iedereen die patiëntkaarten ziet, krijgt een eigen login met een
// tweede stap, en het gedeelde praktijkwachtwoord verdwijnt." De tweede stap zelf is er
// (test:tweedestap). Hier: een praktijk kan hem van iedereen vragen.
// - Aanzetten kan alleen een beheerder met een eigen login die zelf een tweede stap heeft, met
//   het eigen wachtwoord. Niet met het praktijkwachtwoord, niet door een therapeut.
// - Daarna werkt het gedeelde praktijkwachtwoord niet meer en kan het niet weer aan.
// - Wie nog geen tweede stap heeft, is uitgelogd en stelt hem in bij het inloggen: na het goede
//   wachtwoord een geheim, en pas met de eerste code een sessie en de reservecodes. Elk antwoord
//   met een geheim maakt het vorige ongeldig, en een foute code krijgt het geheim niet terug:
//   wie alleen het wachtwoord kent, kan niet stil meekijken naar het geheim van de eigenaar.
// - De formulieren zonder script weigeren een login die hem nog niet heeft ingesteld.
// - Uitzetten is in zo'n praktijk "opnieuw instellen": de login is uitgelogd en stelt hem bij
//   het inloggen opnieuw in. Een gewiste tweede stap (door een beheerder) net zo.
// - Opheffen vraagt wachtwoord én code; het praktijkwachtwoord blijft dan uit.
// - De keuze staat op schijf en overleeft een herstart.
// Zonder browser, past in CI. `npm run test:stapverplicht`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. de app kent de schakelaar en het instellen bij het inloggen ----
{
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  assert.match(idx, /teamPost\('stap-verplicht'/, "Team-venster: verplicht stellen en opheffen");
  assert.match(idx, /d\.stapInstellen&&act==='login'/, "inloggen: de app toont het instellen als de server erom vraagt");
  assert.match(idx, /geheim:lopend,code:c/, "inloggen: de app stuurt het geheim van de getoonde QR mee met de eerste code");
  for (const actie of ["tweede-stap-verplicht", "tweede-stap-niet-verplicht"]) {
    assert.ok(idx.includes("'" + actie + "':"), "de Activiteit kent een leesbare regel voor " + actie);
  }
}

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-stapverplicht-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
let origin = "", log = "";
async function start() {
  const port = await vrijePoort();
  origin = `http://127.0.0.1:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "" };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV") delete kind[k];
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
const adres = () => "10.87." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const team = async (S) => (await get("/api/praktijk/team", S)).json();
const login = (lijf) => post("/api/praktijk/login", lijf);
const P = "Fysio Verplicht";
const activiteit = async (S) => (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S)).json()).activiteit;
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
// een goede code die de server niet zal verbruiken (het wachtwoord erbij is fout)
const onverbruikt = (geheim) => codeVoor(geheim, versStap(geheim));
// zes cijfers die nu zeker niet kloppen
function mis(geheim) {
  const nu = stapVan(Date.now());
  const goed = new Set([-2, -1, 0, 1, 2, 3].map((d) => codeVoor(geheim, nu + d)));
  for (let n = 0; ; n++) { const c = String(n).padStart(6, "0"); if (!goed.has(c)) return c; }
}
// de tweede stap instellen in het Team-venster, voor de login van sessie S
async function stelIn(S, wachtwoord) {
  let r = await post("/api/praktijk/team/tweede-stap/start", { wachtwoord }, S);
  assert.equal(r.status, 200, await r.clone().text());
  const st = await r.json();
  r = await post("/api/praktijk/team/tweede-stap/bevestig", { code: vers(st.geheim) }, S);
  assert.equal(r.status, 200, await r.clone().text());
  const b = await r.json();
  return { geheim: st.geheim, reservecodes: b.reservecodes, S: ses(b) };
}
const uitnodigen = async (S, email, naam, rol, wachtwoord) => {
  const u = await (await post("/api/praktijk/team/uitnodigen", { email, naam, rol }, S)).json();
  assert.ok(u.ok, JSON.stringify(u));
  const r = await formulier("/v2/uitnodiging", { t: new URL(u.link).searchParams.get("t"), naam, wachtwoord, regels: "1" });
  assert.ok(r.status < 400, naam + " neemt de uitnodiging aan: " + r.status);
  return u.lid.id;
};

let app = await start();
try {
  // een praktijk met het gedeelde wachtwoord, beheerder Eva, therapeut Tom en therapeut Lot
  let r = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const G = ses(await r.json());
  r = await post("/api/praktijk/team/eigen-login", { naam: "Eva Bos", email: "eva@verplicht.invalid", wachtwoord: "eva-wachtwoord", regels: true }, G);
  assert.equal(r.status, 200, await r.clone().text());
  let E = ses(await r.json());
  const tomId = await uitnodigen(E, "tom@verplicht.invalid", "Tom Smit", "therapeut", "tom-wachtwoord");
  await uitnodigen(E, "lot@verplicht.invalid", "Lot Visser", "therapeut", "lot-wachtwoord");
  r = await login({ email: "tom@verplicht.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 200);
  let T = ses(await r.json());
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord" });
  assert.equal(r.status, 200);
  const L = ses(await r.json());

  // ---- 2a. wie mag het aanzetten ----
  let t = await team(E);
  assert.equal(t.stapVerplicht, false, "standaard niet verplicht");
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "praktijk-wachtwoord" }, G);
  assert.equal(r.status, 400, "met het praktijkwachtwoord kan het niet");
  assert.equal((await r.json()).eigenLogin, true);
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "tom-wachtwoord" }, T);
  assert.equal(r.status, 403, "een therapeut kan het niet");
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 400, "een beheerder zonder eigen tweede stap kan het niet");
  assert.equal((await r.json()).eigenStap, true);
  assert.equal((await accounts())[P.toLowerCase()].stapVerplicht, undefined, "er is niets veranderd");

  // Eva en Tom stellen hun tweede stap in; Lot niet
  const eva = await stelIn(E, "eva-wachtwoord");
  E = eva.S;
  const tom = await stelIn(T, "tom-wachtwoord");
  T = tom.S;
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "fout-wachtwoord" }, E);
  assert.equal(r.status, 403, "zonder het goede wachtwoord niet");
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true }, E);
  assert.equal(r.status, 403, "zonder wachtwoord niet");
  assert.equal((await team(E)).stapVerplicht, false);

  // ---- 2b. aanzetten: praktijkwachtwoord uit, wie geen tweede stap heeft is uitgelogd ----
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 200, await r.clone().text());
  let d = await r.json();
  assert.equal(d.stapVerplicht, true);
  assert.equal(d.gedeeldUit, true);
  assert.equal(d.gedeeldWasAan, true);
  assert.equal(d.zonder, 1, "één actieve login zonder tweede stap (Lot)");
  let acc = (await accounts())[P.toLowerCase()];
  assert.ok(acc.stapVerplicht && acc.stapVerplicht.sinds > 0, "de keuze staat op schijf");
  assert.equal(acc.gedeeldUit, true);
  t = await team(E);
  assert.equal(t.stapVerplicht, true);
  assert.ok(t.stapVerplichtSinds > 0);
  assert.equal(t.gedeeldUit, true);
  assert.equal((await get("/api/praktijk/team", G)).status, 401, "de sessie met het praktijkwachtwoord is weg");
  assert.equal((await get("/api/praktijk/team", L)).status, 401, "Lot (zonder tweede stap) is uitgelogd");
  assert.equal((await get("/api/praktijk/team", T)).status, 200, "Tom (met tweede stap) blijft ingelogd");
  r = await login({ praktijk: P, wachtwoord: "praktijk-wachtwoord" });
  assert.notEqual(r.status, 200, "inloggen met het praktijkwachtwoord kan niet meer");
  r = await post("/api/praktijk/team/gedeeld-uit", { uit: false, wachtwoord: "nieuw-praktijkwachtwoord" }, E);
  assert.equal(r.status, 400, "het praktijkwachtwoord kan niet weer aan zolang de tweede stap verplicht is");
  assert.match((await r.json()).fout, /verplicht/);
  r = await post("/api/praktijk/team/stap-verplicht", { aan: true, wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 200, "nog een keer aanzetten verandert niets");

  // ---- 2c. Lot stelt hem in bij het inloggen ----
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "fout-wachtwoord" });
  assert.equal(r.status, 403, "een fout wachtwoord geeft geen geheim");
  assert.equal((await r.json()).geheim, undefined);
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord" });
  assert.equal(r.status, 401, "goed wachtwoord, nog geen sessie");
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.equal(d.sessie, undefined);
  assert.match(d.geheim, /^[A-Z2-7]{32}$/);
  assert.ok(d.uri.startsWith("otpauth://totp/Fysiplan:lot@verplicht.invalid?secret=" + d.geheim), d.uri);
  const eersteGeheim = d.geheim;
  const lotOpSchijfNu = async () => (await accounts())[P.toLowerCase()].leden.find((l) => l.email === "lot@verplicht.invalid") || {};
  // Elk antwoord met een geheim maakt het vorige ongeldig. Wie het wachtwoord kent en het geheim
  // ophaalt, kan dus niet stil meekijken: het geheim dat op schijf komt, heeft alleen de browser
  // gezien die het instellen afmaakt.
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord" });
  d = await r.json();
  const meekijker = d.geheim;
  assert.notEqual(meekijker, eersteGeheim, "een tweede keer inloggen geeft een nieuw geheim");
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", geheim: eersteGeheim, code: onverbruikt(eersteGeheim) });
  assert.equal(r.status, 401, "het eerste geheim werkt niet meer, ook niet met een goede code");
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.equal(d.vernieuwd, true);
  assert.equal(d.sessie, undefined);
  const lotGeheim = d.geheim;
  assert.ok(lotGeheim !== eersteGeheim && lotGeheim !== meekijker, "de app krijgt een vers geheim (nieuwe QR)");
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", geheim: lotGeheim, code: mis(lotGeheim) });
  assert.equal(r.status, 403, "een foute eerste code");
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.equal(d.code, true);
  assert.equal(d.geheim, undefined, "een foute code krijgt het geheim niet terug");
  assert.equal(d.uri, undefined);
  assert.equal(d.sessie, undefined);
  assert.equal((await lotOpSchijfNu()).totp, undefined, "er staat nog niets op schijf");
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord" });
  assert.notEqual(r.status, 200, "formulier zonder script: Lot is geen beheerder");
  // het geheim van de meekijker is intussen vervallen: daarmee instellen kan niet, en de poging
  // geeft opnieuw een vers geheim, waardoor ook het lopende van Lot vervalt
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", geheim: meekijker, code: onverbruikt(meekijker) });
  assert.equal(r.status, 401, "een vervallen geheim stelt niets in");
  assert.equal((await lotOpSchijfNu()).totp, undefined);
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", geheim: lotGeheim, code: onverbruikt(lotGeheim) });
  assert.equal(r.status, 401, "en Lot scant daarna een nieuwe QR");
  d = await r.json();
  assert.equal(d.vernieuwd, true);
  const lotGeheim2 = d.geheim;
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", code: onverbruikt(lotGeheim2) });
  assert.equal(r.status, 401, "een code zonder het geheim erbij stelt niets in");
  const lotGeheim3 = (await r.json()).geheim;
  assert.ok(lotGeheim3 && lotGeheim3 !== lotGeheim2);
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", geheim: lotGeheim3, code: vers(lotGeheim3) });
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.ok(d.sessie, "met de eerste code is er een sessie");
  assert.equal(d.reservecodes.length, 8, "en acht reservecodes");
  const lotReserve = d.reservecodes;
  let L2 = ses(d);
  t = await team(L2);
  assert.equal(t.ik.tweedeStap, true);
  assert.equal(t.ik.reservecodesOver, 8);
  const lotOpSchijf = (await accounts())[P.toLowerCase()].leden.find((l) => l.email === "lot@verplicht.invalid");
  assert.equal(lotOpSchijf.totp.geheim, lotGeheim3, "op schijf staat het geheim van de laatste QR");
  for (const c of lotReserve) assert.ok(!JSON.stringify(lotOpSchijf).includes(c.replace(/-/g, "")), "reservecodes staan niet leesbaar op schijf");
  // daarna is het een gewone login met tweede stap
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord" });
  assert.equal(r.status, 401);
  d = await r.json();
  assert.equal(d.tweedeStap, true);
  assert.equal(d.stapInstellen, undefined, "geen nieuw geheim voor een login die hem al heeft");
  assert.equal(d.geheim, undefined);
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord", code: vers(lotGeheim3) });
  assert.equal(r.status, 200);
  L2 = ses(await r.json());
  let act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-verplicht" && a.wie === "Eva Bos"), "Activiteit: verplicht gesteld door Eva");
  assert.ok(act.some((a) => a.actie === "praktijkwachtwoord-uit"), "Activiteit: praktijkwachtwoord uit");
  assert.ok(act.some((a) => a.actie === "tweede-stap-aan" && a.wie === "Lot Visser"), "Activiteit: Lot zette hem aan");

  // ---- 2d. een nieuwe collega, en de formulieren zonder script ----
  await uitnodigen(E, "bas@verplicht.invalid", "Bas Kok", "beheerder", "bas-wachtwoord");
  r = await login({ email: "bas@verplicht.invalid", wachtwoord: "bas-wachtwoord" });
  assert.equal(r.status, 401, "een nieuwe collega stelt hem ook in bij het inloggen");
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  const basGeheim = d.geheim;
  assert.notEqual(basGeheim, lotGeheim3);
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "bas@verplicht.invalid", wachtwoord: "bas-wachtwoord" });
  assert.equal(r.status, 403, "formulier zonder script: eerst de tweede stap instellen");
  assert.match(await r.text(), /vraagt een tweede stap/);
  r = await formulier("/v2/gegevens/download", { praktijk: P, wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 403, "formulier zonder script: het praktijkwachtwoord werkt niet meer");
  r = await login({ email: "bas@verplicht.invalid", wachtwoord: "bas-wachtwoord", geheim: basGeheim, code: vers(basGeheim) });
  assert.equal(r.status, 200);
  const B = ses(await r.json());
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "bas@verplicht.invalid", wachtwoord: "bas-wachtwoord", code: vers(basGeheim) });
  assert.equal(r.status, 200, "met de code werkt het formulier");
  const pakket = JSON.parse(await r.text());
  assert.equal(pakket.account.tweedeStapVerplicht.aan, true, "de download zegt dat de tweede stap verplicht is");
  assert.ok(!JSON.stringify(pakket).includes(basGeheim), "geen geheim in de download");

  // ---- 2e. uitzetten is hier opnieuw instellen; wissen door een beheerder net zo ----
  r = await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "tom-wachtwoord", code: vers(tom.geheim) }, T);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).opnieuwInloggen, true);
  assert.equal((await get("/api/praktijk/team", T)).status, 401, "Tom is uitgelogd");
  r = await login({ email: "tom@verplicht.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 401);
  d = await r.json();
  assert.equal(d.stapInstellen, true);
  assert.notEqual(d.geheim, tom.geheim, "een nieuw geheim (nieuwe telefoon)");
  const tomGeheim2 = d.geheim;
  r = await login({ email: "tom@verplicht.invalid", wachtwoord: "tom-wachtwoord", geheim: tomGeheim2, code: vers(tomGeheim2) });
  assert.equal(r.status, 200);
  T = ses(await r.json());
  r = await post("/api/praktijk/team/tweede-stap/wis", { id: tomId }, E);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await get("/api/praktijk/team", T)).status, 401, "na het wissen is Tom uitgelogd");
  r = await login({ email: "tom@verplicht.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 401);
  d = await r.json();
  assert.equal(d.stapInstellen, true, "en stelt hij hem bij het inloggen opnieuw in");
  r = await login({ email: "tom@verplicht.invalid", wachtwoord: "tom-wachtwoord", geheim: d.geheim, code: vers(d.geheim) });
  assert.equal(r.status, 200);
  T = ses(await r.json());

  // ---- 2f. na een herstart geldt het nog; opheffen vraagt wachtwoord en code ----
  await stop(app);
  app = await start();
  assert.equal((await get("/api/praktijk/team", E)).status, 200, "Eva is na de herstart nog ingelogd");
  assert.equal((await team(E)).stapVerplicht, true, "de verplichting staat er na een herstart nog");
  r = await login({ praktijk: P, wachtwoord: "praktijk-wachtwoord" });
  assert.notEqual(r.status, 200);
  r = await post("/api/praktijk/team/stap-verplicht", { aan: false, wachtwoord: "tom-wachtwoord", code: "000000" }, T);
  assert.equal(r.status, 403, "een therapeut kan het niet opheffen");
  r = await post("/api/praktijk/team/stap-verplicht", { aan: false, wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 400, "opheffen zonder code kan niet");
  r = await post("/api/praktijk/team/stap-verplicht", { aan: false, wachtwoord: "eva-wachtwoord", code: mis(eva.geheim) }, E);
  assert.equal(r.status, 403, "opheffen met een foute code kan niet");
  r = await post("/api/praktijk/team/stap-verplicht", { aan: false, wachtwoord: "fout-wachtwoord", code: onverbruikt(eva.geheim) }, E);
  assert.equal(r.status, 403, "opheffen met een fout wachtwoord kan niet");
  assert.equal((await team(E)).stapVerplicht, true);
  r = await post("/api/praktijk/team/stap-verplicht", { aan: false, wachtwoord: "eva-wachtwoord", code: vers(eva.geheim) }, E);
  assert.equal(r.status, 200, await r.clone().text());
  d = await r.json();
  assert.equal(d.stapVerplicht, false);
  assert.equal(d.gedeeldUit, true, "het praktijkwachtwoord blijft uit");
  acc = (await accounts())[P.toLowerCase()];
  assert.equal(acc.stapVerplicht, undefined);
  assert.equal(acc.gedeeldUit, true);
  r = await login({ praktijk: P, wachtwoord: "praktijk-wachtwoord" });
  assert.notEqual(r.status, 200, "het oude praktijkwachtwoord werkt niet vanzelf weer");
  // zonder verplichting: uitzetten is weer gewoon uitzetten, en inloggen kan met alleen het wachtwoord
  r = await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "lot-wachtwoord", code: lotReserve[0] }, L2);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).opnieuwInloggen, undefined);
  assert.equal((await get("/api/praktijk/team", L2)).status, 200, "Lot blijft ingelogd");
  r = await login({ email: "lot@verplicht.invalid", wachtwoord: "lot-wachtwoord" });
  assert.equal(r.status, 200, "Lot logt weer in met alleen het wachtwoord");
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-niet-verplicht" && a.wie === "Eva Bos"), "Activiteit: verplichting opgeheven door Eva");
  assert.equal((await get("/api/praktijk/team", B)).status, 200, "Bas is nog ingelogd");

  console.log("test-tweede-stap-verplicht: ok (aanzetten alleen door een beheerder met eigen tweede stap, praktijkwachtwoord uit, instellen bij het inloggen, formulieren, opnieuw instellen, opheffen met wachtwoord en code, herstart)");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
