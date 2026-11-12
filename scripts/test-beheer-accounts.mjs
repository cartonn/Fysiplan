// Platformreview 2026-11-11, "persoonlijke beheeraccounts en een noodprocedure met bericht aan
// de praktijk". Beheer was één gedeelde sleutel in een kop: van niemand persoonlijk, niet per
// persoon in te trekken, en zonder spoor van wie wat deed.
//
// Nu:
// - Een beheerder logt in met een eigen e-mailadres, een eigen wachtwoord en een tweede stap.
//   Een nieuw account krijgt een startwachtwoord (een week geldig); bij de eerste keer kiest de
//   eigenaar een eigen wachtwoord en stelt de tweede stap in, pas dan is er een sessie.
// - De sessie staat in een cookie die scripts niet kunnen lezen en telt alleen samen met de kop
//   `x-admin-sleutel: account`, niet vanaf een andere website. Ze overleeft een herstart van de
//   server (op schijf staat alleen de SHA-256 van de sleutel), maar niet het uitloggen, twaalf
//   uur, een ander wachtwoord of het uitzetten van het account.
// - Een account uitzetten trekt de sessies meteen in. Zonder sleutel op de server kan het
//   laatste werkende account niet uit.
// - Alles wat beheer doet staat in het beheerlogboek, met wie het deed. Er is geen route die een
//   regel wijzigt of weghaalt. De herstelmail aan een praktijk (de noodprocedure) staat er met
//   beheerder, praktijk, reden en bestemming in.
// - Ook met een account komt beheer niet bij de kaarten van een beveiligde praktijk.
// Nepmail-API op localhost. Het serverdeel past in CI; het browserdeel draait waar Playwright
// staat. `npm run test:beheeraccounts`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";
import { BEHEER_SESSIE_MS, BEHEER_EERSTE_KEER_MS, BEHEER_WW_MIN, BeheerSessies, BeheerLogboek, Rem, laadBeheerSessies, beheerKlaar, beheerVerlopen, beheerUit, beheerPad } from "../lib/beheer.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = await mkdtemp(join(tmpdir(), "fysiplan-beheeraccounts-"));
const dataDir = join(tmp, "data");

// ---- 0. de rekenkern (lib/beheer.js), met een eigen klok ----
{
  let nu = 1_800_000_000_000;
  const klok = () => nu;
  const acc = { email: "a@x.invalid", naam: "A", hash: "scrypt$aa$bb", gemaakt: new Date(nu).toISOString(), totp: { geheim: "GEHEIM", reserve: ["r1"] } };
  const alle = { "a@x.invalid": acc };
  const sessies = new BeheerSessies(() => alle, klok);
  const t1 = sessies.nieuw(acc);
  assert.match(t1, /^[a-f0-9]{48}$/);
  assert.equal(sessies.van(t1), acc, "de sessie geeft het account terug");
  assert.equal(sessies.van("f".repeat(48)), null);
  assert.equal(sessies.van(""), null);
  assert.equal(sessies.van(undefined), null);
  nu += BEHEER_SESSIE_MS;
  assert.equal(sessies.van(t1), acc, "na precies twaalf uur nog geldig");
  nu += 1;
  assert.equal(sessies.van(t1), null, "daarna verlopen");
  assert.equal(sessies.aantal, 0, "en opgeruimd");
  assert.equal(BEHEER_SESSIE_MS, 12 * 3600e3);
  const t2 = sessies.nieuw(acc);
  acc.hash = "scrypt$cc$dd";
  assert.equal(sessies.van(t2), null, "een ander wachtwoord: de oude sessie vervalt");
  const t3 = sessies.nieuw(acc);
  acc.uit = "2026-11-12T00:00:00.000Z";
  assert.equal(sessies.van(t3), null, "uitgezet: geen sessie meer");
  delete acc.uit;
  const t4 = sessies.nieuw(acc);
  const totp = acc.totp;
  delete acc.totp;
  assert.equal(sessies.van(t4), null, "zonder tweede stap bestaat er geen sessie");
  acc.totp = totp;
  const t5 = sessies.nieuw(acc);
  delete alle["a@x.invalid"];
  assert.equal(sessies.van(t5), null, "het account is weg");
  alle["a@x.invalid"] = acc;
  alle["b@x.invalid"] = { ...acc, email: "b@x.invalid" };
  const a1 = sessies.nieuw(acc), a2 = sessies.nieuw(acc), b1 = sessies.nieuw(alle["b@x.invalid"]);
  assert.equal(sessies.trekIn("A@X.invalid"), 2, "alle sessies van één account intrekken");
  assert.equal(sessies.van(a1), null);
  assert.equal(sessies.van(a2), null);
  assert.equal(sessies.van(b1), alle["b@x.invalid"], "die van een ander blijven");
  assert.equal(sessies.weg(b1), true);
  assert.equal(sessies.weg(b1), false);
  const veel = Array.from({ length: 60 }, () => sessies.nieuw(acc));
  assert.equal(sessies.aantal, 50, "hooguit vijftig sessies");
  assert.equal(sessies.van(veel[0]), null, "de oudste vallen af");
  assert.equal(sessies.van(veel[59]), acc);

  // de sessies staan in de tabel die de server meegeeft (daar een die zichzelf op schijf zet):
  // onder de SHA-256 van de sleutel, met het adres, het moment en een afdruk van het wachtwoord
  const tabel = new Map();
  const metTabel = new BeheerSessies(() => alle, klok, tabel);
  const t6 = metTabel.nieuw(acc);
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  assert.deepEqual([...tabel.keys()], [sha(t6)], "in de tabel staat de SHA-256, niet de sleutel");
  assert.deepEqual(Object.keys(tabel.get(sha(t6))).sort(), ["email", "t", "w"]);
  assert.doesNotMatch(JSON.stringify([...tabel]), new RegExp(t6 + "|scrypt"), "geen sleutel en geen wachtwoordhash in de tabel");
  // wat van schijf terugkomt: alleen rijen met een goede vorm die nog kunnen gelden
  const sessiePad = join(tmp, "kern-sessies.json");
  const rij = { email: "a@x.invalid", t: nu, w: tabel.get(sha(t6)).w };
  await mkdir(tmp, { recursive: true });
  await writeFile(sessiePad, JSON.stringify({ v: 1, sessies: {
    [sha(t6)]: { ...rij, extra: "telt niet mee" },
    ["a".repeat(64)]: { ...rij, t: nu - BEHEER_SESSIE_MS - 1 },
    ["b".repeat(64)]: { ...rij, t: nu + 61000 },
    ["c".repeat(64)]: { ...rij, email: "" },
    ["d".repeat(64)]: { ...rij, w: 5 },
    ["e".repeat(64)]: { ...rij, t: "gisteren" },
    ["f".repeat(63)]: rij,
    ["g".repeat(64)]: rij,
    ["0".repeat(64)]: null,
    ["1".repeat(64)]: { ...rij, t: nu - BEHEER_SESSIE_MS }
  } }));
  const terug = await laadBeheerSessies(sessiePad, nu);
  assert.deepEqual(terug.map(([k]) => k).sort(), ["1".repeat(64), sha(t6)].sort(), "verlopen, uit de toekomst of misvormd: niet terug");
  assert.deepEqual(terug.find(([k]) => k === sha(t6))[1], rij, "alleen de drie velden komen terug");
  const naHerstart = new BeheerSessies(() => alle, klok, new Map(terug));
  assert.equal(naHerstart.van(t6), acc, "na een herstart werkt de sessie verder");
  assert.equal(naHerstart.van("1".repeat(48)), null);
  acc.hash = "scrypt$ee$ff";
  assert.equal(new BeheerSessies(() => alle, klok, new Map(terug)).van(t6), null, "ook van schijf: een ander wachtwoord, geen sessie");
  assert.deepEqual(await laadBeheerSessies(join(tmp, "bestaat-niet.json"), nu), []);
  await writeFile(sessiePad, "{ kapot");
  assert.deepEqual(await laadBeheerSessies(sessiePad, nu), [], "een kapot bestand: iedereen logt één keer opnieuw in");
  await writeFile(sessiePad, JSON.stringify({ sessies: [1, 2] }));
  assert.deepEqual(await laadBeheerSessies(sessiePad, nu), []);

  const rem = new Rem(3, 1000, klok);
  rem.tel("a"); rem.tel("a");
  assert.equal(rem.opSlot("a"), false);
  rem.tel("a");
  assert.equal(rem.opSlot("a"), true, "na drie missers op slot");
  assert.equal(rem.opSlot("b"), false, "een ander adres niet");
  nu += 1000;
  assert.equal(rem.opSlot("a"), true);
  nu += 1;
  assert.equal(rem.opSlot("a"), false, "na de wachttijd weer open");
  rem.tel("a");
  assert.equal(rem.opSlot("a"), false, "en de teller begint opnieuw");
  rem.tel("a"); rem.tel("a");
  assert.equal(rem.opSlot("a"), true);
  rem.wis("a");
  assert.equal(rem.opSlot("a"), false);

  const dag = 86400e3, t0 = Date.parse("2026-11-01T00:00:00Z");
  const vers = { email: "n@x.invalid", naam: "N", hash: "HASH-GEHEIM", gemaakt: new Date(t0).toISOString(), door: "beheersleutel" };
  assert.equal(BEHEER_EERSTE_KEER_MS, 7 * dag);
  assert.equal(beheerKlaar(vers), false);
  assert.equal(beheerVerlopen(vers, t0 + 7 * dag), false, "een week lang kan de eerste keer inloggen");
  assert.equal(beheerVerlopen(vers, t0 + 7 * dag + 1), true, "daarna niet meer");
  assert.equal(beheerUit(vers, t0).status, "nog niet ingelogd");
  assert.equal(beheerUit(vers, t0 + 8 * dag).status, "verlopen");
  assert.equal(beheerVerlopen({ email: "z@x.invalid", hash: "h" }, t0), true, "zonder datum staat een nieuw account niet eeuwig open");
  const klaar = { ...vers, totp: { geheim: "TOTP-GEHEIM", reserve: ["RESERVE-HASH"] }, laatst: t0 };
  assert.equal(beheerKlaar(klaar), true);
  assert.equal(beheerVerlopen(klaar, t0 + 400 * dag), false, "een account in gebruik verloopt niet");
  const zicht = beheerUit(klaar, t0);
  assert.deepEqual(Object.keys(zicht).sort(), ["door", "email", "gemaakt", "laatst", "naam", "status"]);
  assert.equal(zicht.status, "actief");
  assert.doesNotMatch(JSON.stringify(zicht), /GEHEIM|RESERVE/, "nooit de hash, het geheim of de reservecodes naar het scherm");
  const uitgezet = beheerUit({ ...vers, hash: undefined, uit: "2026-11-02T00:00:00.000Z", uitDoor: "a@x.invalid" }, t0);
  assert.equal(uitgezet.status, "uit");
  assert.equal(uitgezet.uitDoor, "a@x.invalid");
  assert.equal(beheerKlaar({ ...klaar, uit: "2026-11-02T00:00:00.000Z" }), false, "een uitgezet account telt niet als in gebruik");
  assert.equal(beheerVerlopen({ ...vers, uit: "2026-11-02T00:00:00.000Z" }, t0 + 8 * dag), false, "en heet uit, niet verlopen");

  // het logboek: alleen erbij schrijven, in de volgorde van aanroepen, en terug te lezen
  const pad = join(tmp, "kern", "sub", "log.jsonl");
  const log = new BeheerLogboek(pad, 3);
  log.schrijf({ wie: "a", actie: "een\ntwee drie\u0000", leeg: "", niets: null, lang: "x".repeat(400), getal: 5 });
  log.schrijf({ wie: "b", actie: "2" });
  log.schrijf({ wie: "c", actie: "3" });
  await log.schrijf({ wie: "d", actie: "4" });
  const tekst = await readFile(pad, "utf8");
  const regels = tekst.trim().split("\n").map((r) => JSON.parse(r));
  assert.deepEqual(regels.map((r) => r.wie), ["a", "b", "c", "d"], "op schijf in de volgorde van aanroepen");
  assert.equal(regels[0].actie, "een twee drie ", "een regel blijft één regel");
  assert.ok(!("leeg" in regels[0]) && !("niets" in regels[0]));
  assert.equal(regels[0].lang.length, 300);
  assert.equal(regels[0].getal, 5);
  assert.ok(Math.abs(Date.parse(regels[0].t) - Date.now()) < 60000, "elke regel heeft een tijd");
  assert.deepEqual(log.staart().map((r) => r.wie), ["d", "c", "b"], "het scherm krijgt de laatste regels, nieuw eerst");
  assert.equal(log.staart(10).length, 3, "in het geheugen blijven alleen de laatste regels");
  assert.deepEqual(log.staart(1).map((r) => r.wie), ["d"]);
  // het pad in een logregel: zonder query, en zonder een id dat de sleutel tot een kaart is
  assert.equal(beheerPad("/api/kaart/antwoord?id=abcdef123456&x=1"), "/api/kaart/antwoord", "de query gaat niet mee, de naam van de route wel");
  assert.equal(beheerPad("/api/x/ABCDEF0123456789/wis"), "/api/x/…/wis", "een id in het pad wordt weggelaten");
  assert.equal(beheerPad("/api/x/abcdef0123"), "/api/x/…");
  assert.equal(beheerPad("/api/x/abcdef012"), "/api/x/abcdef012", "een kort woord is geen id");
  assert.equal(beheerPad("/api/beheer/accounts/uit"), "/api/beheer/accounts/uit");
  assert.equal(beheerPad("/a".repeat(300)).length, 200);
  assert.equal(beheerPad(undefined), "");
  assert.deepEqual((await new BeheerLogboek(pad, 3).laad()).staart().map((r) => r.wie), ["d", "c", "b"], "na een herstart staan ze er weer");
  assert.deepEqual((await new BeheerLogboek(join(tmp, "kern", "bestaat-niet.jsonl")).laad()).staart(), []);
  // een kapotte regel en een groot bestand: laad() struikelt niet en leest alleen het eind
  await appendFile(pad, "geen json\n" + (JSON.stringify({ wie: "vul", actie: "y".repeat(200) }) + "\n").repeat(2000) + JSON.stringify({ wie: "eind" }) + "\n");
  const groot = await new BeheerLogboek(pad, 5).laad();
  assert.deepEqual(groot.staart().map((r) => r.wie), ["eind", "vul", "vul", "vul", "vul"]);
  await groot.schrijf({ wie: "na" });
  assert.ok((await readFile(pad, "utf8")).startsWith(tekst), "wat er stond, staat er nog precies zo");
  assert.deepEqual(Object.getOwnPropertyNames(BeheerLogboek.prototype).sort(), ["constructor", "laad", "opSchijf", "schrijf", "staart"],
    "het logboek heeft geen functie om een regel te wijzigen of weg te halen");
  console.log("Beheeraccounts (kern): sessies van twaalf uur die een herstart overleven en vervallen bij een ander wachtwoord of uitzetten, de rem per adres, een startwachtwoord van een week, en een logboek waar alleen iets bij kan.");
}

// ---- 1. statisch: de pagina's en de server ----
{
  for (const f of ["public/index.html", "public/dashboard.html", "public/content1000.html", "public/draft-review.html"]) {
    const html = await readFile(join(root, f), "utf8");
    assert.match(html, /import\('\/beheersleutel\.js'\)\)\.vraagBeheersleutel\(\)/, f + " logt niet in via beheersleutel.js");
    assert.doesNotMatch(html, /id="key"|type="password"[^>]*beheersleutel/i, f + " vraagt zelf om de sleutel");
  }
  const module = await readFile(join(root, "public/beheersleutel.js"), "utf8");
  assert.doesNotMatch(module, /localStorage/, "de inlogmodule bewaart niets in localStorage");
  assert.doesNotMatch(module, /setItem\([^)]*(wachtwoord|geheim|reserve|start)/i, "geen wachtwoord, geheim of reservecode in de browseropslag");
  const server = await readFile(join(root, "server.js"), "utf8");
  // elke beheerroute die iets wijzigt, weigert eerst een andere website
  const regels = server.split("\n");
  const wijzigend = regels.map((r, i) => (/^  if \(urlPath === "\/api\/beheer\/[a-z\/-]+" && request\.method === "POST"\) \{$/.test(r) ? i : -1)).filter((i) => i >= 0);
  assert.ok(wijzigend.length >= 6, "de beheerroutes zijn niet gevonden: " + wijzigend.length);
  for (const i of wijzigend) {
    if (regels[i].includes("/api/beheer/praktijk-herstel")) continue; // die werkt alleen met de kop, zie het dynamische deel
    assert.ok(regels.slice(i + 1, i + 4).some((r) => r.trim() === "if (kruisSite(request)) { await weigerKruis(response); return; }"), "geen poort tegen een andere website bij " + regels[i].trim());
  }
  assert.doesNotMatch(server, /ADMIN_KEY_EIGEN && isAdmin\(|ADMIN_KEY_EIGEN \|\| !isAdmin\(/, "elke plek die een eigen sleutel vroeg, loopt via beheerEigen");
  assert.match(server, /accountsPath, auditPath, bewaarPath, v1AccountsPath, proefPath, beheerAccountsPath, beheerLogPath\];/, "de accounts en het logboek van beheer gaan mee in de reservekopie");
  // er is geen route die het logboek wijzigt: het bestand wordt alleen in lib/beheer.js aangeraakt, met appendFile
  assert.equal((server.match(/beheerLogPath/g) || []).length, 3, "beheerLogPath: alleen de definitie, het logboek zelf en de reservekopie");
  const kern = await readFile(join(root, "lib/beheer.js"), "utf8");
  assert.match(kern, /import \{ appendFile, mkdir, open, readFile \} from "node:fs\/promises";/);
  assert.match(server, /new BeheerSessies\(\(\) => beheerAccounts, undefined, beheerSessieTabel\)/, "de sessies van beheer staan in de tabel die zichzelf bewaart");
  assert.match(server, /if \(praktijkSessies\.achter \|\| beheerSessieTabel\.achter\) \{/, "het antwoord wacht tot een sessiewijziging op schijf staat");
  assert.doesNotMatch(kern, /writeFile|truncate|unlink|rename|\brm\(/, "lib/beheer.js kan het logboek niet overschrijven of weghalen");
}

// ---- nepmail en de server ----
const mails = [];
const mailApi = createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => { try { mails.push(JSON.parse(b)); } catch {} res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}'); });
});
await new Promise((r) => mailApi.listen(0, "127.0.0.1", r));
const mailUrl = `http://127.0.0.1:${mailApi.address().port}`;
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const K = { "x-admin-sleutel": SLEUTEL };
const MELDADRES = "eigenaar@fysiplan.invalid";
let origin = "", log = "";
async function start(env = {}, map = dataDir) {
  const port = await vrijePoort();
  origin = `http://127.0.0.1:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: map, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_MELDING_AAN: MELDADRES, ACCOUNT_BEHEER_EMAILS: "", FYSIPLAN_CONTACT: "hulp@fysiplan.invalid", TOTP_MIS_PER_DAG: "3",
    MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: mailUrl, ...env };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY)/.test(k) || k === "NODE_ENV" || kind[k] === undefined) delete kind[k];
  if (env.NODE_ENV) kind.NODE_ENV = env.NODE_ENV;
  log = "";
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.85." + ((ip >> 8) & 255) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const cookies = (r) => r.headers.getSetCookie();
const beheerCookie = (r) => cookies(r).find((c) => /^(__Host-)?fpbeheer=/.test(c)) || "";
// de koppen van een beheerpagina die met een account werkt: de cookie en het woord "account"
const B = (cookie, extra = {}) => ({ cookie: String(cookie).split(";")[0], "x-admin-sleutel": "account", ...extra });
// De code bij een geheim. De tijdstap van het eerste gebruik blijft de basis: "dezelfde code nog
// een keer" is dan ook echt dezelfde code als de klok intussen een halve minuut verder is, en
// `plus = 1` is de eerstvolgende die de server nog niet zag (een code werkt één keer).
const basisStap = new Map();
const code = (geheim, plus = 0) => {
  if (!basisStap.has(geheim)) basisStap.set(geheim, stapVan(Date.now()));
  return codeVoor(geheim, basisStap.get(geheim) + plus);
};
const login = (lijf, extra) => post("/api/beheer/login", lijf, extra);
const dash = (extra) => get("/api/dashboard", extra).then((r) => r.status);
const logboek = async () => (await readFile(join(dataDir, "beheer-log.jsonl"), "utf8").catch(() => "")).split("\n").filter(Boolean).map((r) => JSON.parse(r));
const accountsOpSchijf = async () => JSON.parse(await readFile(join(dataDir, "beheer-accounts.json"), "utf8"));
const beheerMails = () => mails.filter((m) => /^Fysiplan beheer:/.test(m.subject || ""));
// een account maken en in gebruik nemen; geeft alles terug wat de eigenaar daarna heeft
async function nieuwAccount(email, naam, als = K) {
  let r = await post("/api/beheer/accounts", { email, naam }, als);
  assert.equal(r.status, 200, await r.clone().text());
  const start = (await r.json()).startwachtwoord;
  r = await login({ email, wachtwoord: start });
  assert.equal(r.status, 401);
  const geheim = (await r.json()).geheim;
  const ww = "eigen-wachtwoord-" + naam.toLowerCase();
  r = await login({ email, wachtwoord: start, geheim, code: code(geheim), nieuw: ww });
  assert.equal(r.status, 200, await r.clone().text());
  return { email, naam, start, ww, geheim, reserve: (await r.clone().json()).reservecodes, cookie: beheerCookie(r), antwoord: r };
}
const metReserve = (a, extra) => login({ email: a.email, wachtwoord: a.ww, code: a.reserve.shift() }, extra);

// een praktijk zonder account (zoals de gegevens van v1): daar mag beheer wel bij
await mkdir(dataDir, { recursive: true });
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio oud": { "truus": { id: "abcdef123456", praktijk: "Fysio Oud", naam: "Truus", ts: Date.now(),
  chosen: [], rows: {}, cells: {}, vids: {}, client: { c_naam: "Truus" } } } }));

let app = await start();
let browserKlaar = async () => {};
try {
  // ---- 2. zonder account: de beheerpagina's vragen wie er is, zonder dat het een poging telt ----
  let r = await get("/api/beheer/ik");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, wie: null });
  for (let i = 0; i < 30; i++) assert.equal((await get("/api/beheer/ik", { "x-forwarded-for": "10.86.0.1", "x-admin-sleutel": "account" })).status, 200);
  assert.equal(await dash({ ...K, "x-forwarded-for": "10.86.0.1" }), 200, "een beheerpagina openen zonder login zet de verbinding niet op de rem");
  assert.deepEqual(await (await get("/api/beheer/ik", K)).json(), { ok: true, wie: "beheersleutel", eigen: true });
  assert.equal((await get("/api/beheer/ik", { "x-admin-sleutel": "fout" })).status, 200);
  assert.equal((await (await get("/api/beheer/ik", { "x-admin-sleutel": "fout" })).json()).wie, null);
  assert.equal((await get("/api/beheer/overzicht")).status, 403, "het overzicht is alleen voor beheer");
  assert.equal((await post("/api/beheer/accounts", { email: "x@y.invalid", naam: "X" })).status, 403, "zonder beheer geen account");
  assert.equal((await post("/api/beheer/accounts", { email: "x@y.invalid", naam: "X" }, { "x-admin-sleutel": "fout" })).status, 403);
  assert.equal((await post("/api/beheer/accounts", { email: "x@y.invalid", naam: "X" }, { "x-admin-sleutel": "account" })).status, 403, "het woord account zonder cookie is niets");
  assert.equal((await logboek()).length, 0, "een geweigerd verzoek komt niet in het beheerlogboek");
  // de pagina's waar beheer inlogt, staan nooit in een kader van een andere website
  for (const pad of ["/admin88", "/dashboard88", "/content1000", "/draft-review.html"]) {
    r = await get(pad);
    assert.equal(r.status, 200, pad);
    assert.equal(r.headers.get("x-frame-options"), "DENY", pad);
    assert.match(r.headers.get("content-security-policy") || "", /frame-ancestors 'none'/, pad);
  }

  // ---- 3. het eerste account: gemaakt met de sleutel van de server ----
  r = await post("/api/beheer/accounts", { email: "geen adres", naam: "X" }, K);
  assert.equal(r.status, 400);
  assert.equal((await post("/api/beheer/accounts", { email: "a@b.invalid", naam: "  " }, K)).status, 400, "een account heeft een naam");
  r = await post("/api/beheer/accounts", { email: "Ahmed@Fysiplan.invalid", naam: "Ahmed" }, K);
  assert.equal(r.status, 200, await r.clone().text());
  let j = await r.json();
  const EM = "ahmed@fysiplan.invalid";
  assert.match(j.startwachtwoord, /^[a-z2-7]{4}(-[a-z2-7]{4}){4}$/, "een startwachtwoord van vijf blokken: " + j.startwachtwoord);
  assert.equal(j.geldigDagen, 7);
  assert.deepEqual(j.account, { email: EM, naam: "Ahmed", gemaakt: j.account.gemaakt, door: "beheersleutel", status: "nog niet ingelogd", laatst: null });
  const START = j.startwachtwoord;
  let schijf = await readFile(join(dataDir, "beheer-accounts.json"), "utf8");
  assert.ok(!schijf.includes(START), "het startwachtwoord staat niet leesbaar op schijf");
  assert.match(JSON.parse(schijf)[EM].hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  await wacht(100);
  assert.deepEqual(beheerMails().map((m) => [m.to[0], m.subject]), [[MELDADRES, "Fysiplan beheer: account gemaakt voor " + EM]], "het meldadres hoort dat er een account bij is");
  assert.ok(!beheerMails()[0].text.includes(START), "het startwachtwoord gaat niet per mail");
  assert.match(beheerMails()[0].text, /Iemand met de beheersleutel van de server heeft een beheeraccount gemaakt voor Ahmed/);
  let lg = await logboek();
  assert.deepEqual(lg.slice(0, 2).map((x) => [x.wie, x.actie, x.status, x.doel]), [["beheersleutel", "POST /api/beheer/accounts", 400, "geen adres"], ["beheersleutel", "POST /api/beheer/accounts", 400, "a@b.invalid"]],
    "ook een poging die niet lukt, staat in het logboek");
  assert.equal(lg.length, 3);
  assert.deepEqual({ ...lg[2], t: 0 }, { t: 0, wie: "beheersleutel", actie: "beheeraccount gemaakt", doel: EM, naam: "Ahmed", ip: "10.85.x.x" });
  assert.equal((await post("/api/beheer/accounts", { email: EM, naam: "Ahmed" }, K)).status, 200, "een account dat nog niet in gebruik is, krijgt zo een nieuw startwachtwoord");
  assert.equal((await login({ email: EM, wachtwoord: START })).status, 403, "het vorige startwachtwoord werkt dan niet meer");
  r = await post("/api/beheer/accounts", { email: EM, naam: "Ahmed" }, K);
  const START2 = (await r.json()).startwachtwoord;
  assert.notEqual(START2, START);

  // ---- 4. de eerste keer: eigen wachtwoord en tweede stap, pas dan een sessie ----
  const FOUT = "E-mailadres of wachtwoord klopt niet.";
  r = await login({ email: EM, wachtwoord: "helemaal-fout" });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).fout, FOUT);
  r = await login({ email: "niemand@fysiplan.invalid", wachtwoord: "helemaal-fout" });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).fout, FOUT, "een adres zonder account krijgt hetzelfde antwoord");
  assert.equal((await login({ email: EM })).status, 400);
  assert.equal((await login({ email: EM, wachtwoord: START2 }, { "sec-fetch-site": "cross-site", origin: "https://elders.invalid" })).status, 403, "inloggen kan niet vanaf een andere website");
  r = await login({ email: EM, wachtwoord: START2 });
  assert.equal(r.status, 401);
  j = await r.json();
  assert.equal(j.stapInstellen, true);
  assert.match(j.geheim, /^[A-Z2-7]{32}$/);
  assert.equal(j.uri, "otpauth://totp/Fysiplan%20beheer:" + EM + "?secret=" + j.geheim, "de code-app toont Fysiplan beheer met het adres");
  assert.equal(j.wwMin, BEHEER_WW_MIN);
  assert.equal(beheerCookie(r), "", "met alleen het startwachtwoord is er geen sessie");
  const G1 = j.geheim;
  // opnieuw beginnen maakt het vorige geheim ongeldig
  r = await login({ email: EM, wachtwoord: START2 });
  const G2 = (await r.json()).geheim;
  assert.notEqual(G2, G1);
  r = await login({ email: EM, wachtwoord: START2, geheim: G1, code: code(G1), nieuw: "een-eigen-wachtwoord" });
  assert.equal(r.status, 401, "een eerder getoond geheim telt niet meer");
  j = await r.json();
  assert.equal(j.vernieuwd, true);
  const G3 = j.geheim;
  assert.ok(G3 !== G1 && G3 !== G2);
  r = await login({ email: EM, wachtwoord: START2, geheim: G3, code: code(G3), nieuw: "kort" });
  assert.equal(r.status, 400, "een eigen wachtwoord van minder dan twaalf tekens kan niet");
  assert.equal((await r.json()).nieuw, true);
  r = await login({ email: EM, wachtwoord: START2, geheim: G3, code: code(G3), nieuw: START2 });
  assert.equal(r.status, 400, "het startwachtwoord houden kan niet");
  r = await login({ email: EM, wachtwoord: START2, geheim: G3, code: "000000", nieuw: "een-eigen-wachtwoord" });
  assert.equal(r.status, 403, "een foute code stelt niets in");
  j = await r.json();
  assert.ok(j.code && !j.geheim, "en het geheim komt niet opnieuw terug");
  assert.equal((await accountsOpSchijf())[EM].totp, undefined);
  const WW = "een-eigen-wachtwoord";
  r = await login({ email: EM, wachtwoord: START2, geheim: G3, code: code(G3), nieuw: WW });
  assert.equal(r.status, 200, await r.clone().text());
  j = await r.json();
  assert.deepEqual(Object.keys(j).sort(), ["ok", "reservecodes", "wie"], "geen sessiesleutel in het antwoord");
  assert.equal(j.wie.status, "actief");
  assert.equal(j.reservecodes.length, 8);
  for (const c of j.reservecodes) assert.match(c, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  const RESERVE = j.reservecodes;
  const C1 = beheerCookie(r);
  assert.match(C1, /^fpbeheer=[a-f0-9]{48}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/, "de cookie: " + C1);
  schijf = await readFile(join(dataDir, "beheer-accounts.json"), "utf8");
  assert.ok(!schijf.includes(WW) && !schijf.includes(C1.slice(9, 57)), "geen wachtwoord en geen sessiesleutel op schijf");
  for (const c of RESERVE) assert.ok(!schijf.includes(c) && !schijf.includes(c.replace(/-/g, "")), "de reservecodes staan alleen als hash op schijf");
  assert.equal(JSON.parse(schijf)[EM].totp.reserve.length, 8);
  assert.equal((await login({ email: EM, wachtwoord: START2 })).status, 403, "het startwachtwoord werkt niet meer");
  assert.equal((await login({ email: EM, wachtwoord: START2, geheim: G3, code: code(G3, 1), nieuw: "nog-een-ander-wachtwoord" })).status, 403);

  // ---- 5. de sessie: de cookie én de kop, en niet vanaf een andere website ----
  assert.equal(await dash(B(C1)), 200, "met de cookie en de kop is dit beheer");
  assert.equal(await dash(B(C1, { "sec-fetch-site": "same-origin" })), 200);
  assert.equal(await dash({ cookie: C1.split(";")[0] }), 403, "de cookie alleen is niet genoeg: de gewone app werkt niet stil als beheer");
  assert.equal(await dash({ "x-admin-sleutel": "account" }), 403);
  assert.equal(await dash(B(C1, { "x-admin-sleutel": "fout" })), 403);
  assert.equal(await dash(B(C1, { "sec-fetch-site": "cross-site" })), 403, "vanaf een andere website telt de cookie niet");
  assert.equal(await dash(B(C1, { origin: "https://elders.invalid" })), 403);
  assert.equal(await dash(B("fpbeheer=" + "0".repeat(48))), 403);
  assert.equal(await dash(B("__Host-" + C1)), 403, "de naam voor https telt niet zonder https");
  j = await (await get("/api/beheer/ik", B(C1))).json();
  assert.deepEqual([j.wie.email, j.wie.naam, j.wie.status, j.eigen], [EM, "Ahmed", "actief", true]);
  assert.equal((await (await get("/api/beheer/ik", { cookie: C1.split(";")[0] })).json()).wie, null);
  // de lijst van praktijken is er voor beheer; zonder de kop krijgt dezelfde browser hem niet
  await post("/api/praktijken", { praktijk: "Fysio Oud", adres: "Straat 1", plaats: "Utrecht", tel: "030-1234567", email: "info@oud.invalid" }, K);
  assert.equal((await (await get("/api/praktijken", B(C1))).json()).length, 1);
  assert.equal((await (await get("/api/praktijken", { cookie: C1.split(";")[0] })).json()).length, 0);

  // ---- 6. opnieuw inloggen: wachtwoord, dan de code; een code werkt één keer ----
  r = await login({ email: EM, wachtwoord: WW });
  assert.equal(r.status, 401);
  j = await r.json();
  assert.ok(j.tweedeStap && !j.stapInstellen);
  assert.equal(beheerCookie(r), "");
  r = await login({ email: EM, wachtwoord: WW, code: code(G3) });
  assert.equal(r.status, 403, "de code van het instellen werkt niet nog een keer");
  r = await login({ email: EM, wachtwoord: WW, code: code(G3, 1) });
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(Object.keys(await r.clone().json()).sort(), ["ok", "wie"]);
  const C2 = beheerCookie(r);
  assert.notEqual(C2.split(";")[0], C1.split(";")[0]);
  assert.equal(await dash(B(C2)), 200);
  assert.equal(await dash(B(C1)), 200, "de eerste sessie loopt gewoon door");
  // met een reservecode, op https: de cookie heet dan __Host-fpbeheer en is Secure
  r = await login({ email: EM, wachtwoord: WW, code: RESERVE[0] }, { "x-forwarded-proto": "https" });
  assert.equal(r.status, 200);
  assert.equal((await r.clone().json()).reservecodesOver, 7);
  assert.equal((await accountsOpSchijf())[EM].totp.reserve.length, 7, "de gebruikte reservecode is meteen van schijf: een herstart geeft hem niet terug");
  const C3 = beheerCookie(r);
  assert.match(C3, /^__Host-fpbeheer=[a-f0-9]{48}; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=43200$/, "op https: " + C3);
  assert.equal(await dash(B(C3, { "x-forwarded-proto": "https" })), 200);
  assert.equal(await dash(B(C3.replace("__Host-", ""), { "x-forwarded-proto": "https" })), 403, "op https telt de naam zonder voorvoegsel niet");
  assert.equal((await login({ email: EM, wachtwoord: WW, code: RESERVE[0] })).status, 403, "een reservecode werkt één keer");
  assert.equal((await login({ email: EM, wachtwoord: WW, code: RESERVE[1].toLowerCase().replace(/-/g, " ") })).status, 200, "overgetypt met spaties en kleine letters mag");
  lg = await logboek();
  assert.deepEqual(lg.filter((x) => x.wie === EM).map((x) => x.actie), ["eerste keer ingelogd: eigen wachtwoord gekozen en tweede stap ingesteld", "foute code na een goed wachtwoord", "ingelogd",
    "ingelogd met een reservecode", "foute code na een goed wachtwoord", "ingelogd met een reservecode"]);
  assert.deepEqual([lg.at(-6).wie, lg.at(-6).actie, lg.at(-6).status], ["beheersleutel", "POST /api/praktijken", 200], "ook het profiel dat met de sleutel is opgeslagen");
  assert.ok(!JSON.stringify(lg).includes(WW) && !JSON.stringify(lg).includes(START2), "geen wachtwoorden in het logboek");

  // ---- 7. wat beheer doet, staat in het logboek met wie het deed ----
  const voorLog = await readFile(join(dataDir, "beheer-log.jsonl"), "utf8");
  r = await post("/api/hernoem", { van: "Bestaat Niet", naar: "Iets Anders" }, B(C1));
  assert.equal(r.status, 404);
  r = await post("/api/hernoem", { van: "Bestaat Niet", naar: "Iets Anders" }, K);
  assert.equal(r.status, 404);
  assert.equal((await post("/api/hernoem", { van: "Bestaat Niet", naar: "Iets Anders" }, { "x-admin-sleutel": "fout" })).status, 403);
  await wacht(150);
  lg = await logboek();
  assert.deepEqual(lg.slice(-2).map((x) => [x.wie, x.actie, x.status]), [[EM, "POST /api/hernoem", 404], ["beheersleutel", "POST /api/hernoem", 404]],
    "elke wijziging als beheer krijgt een regel met wie het was; een geweigerde poging niet");
  const n7 = lg.length;
  assert.equal(await dash(B(C1)), 200);
  await wacht(100);
  assert.equal((await logboek()).length, n7, "alleen kijken (GET) vult het logboek niet");
  // een praktijk zonder account: beheer mag erbij, en het staat erin (één regel per uur)
  const OUD = "/api/kaarten?praktijk=" + encodeURIComponent("Fysio Oud");
  r = await get(OUD);
  assert.equal(r.status, 401, "zonder beheer niet");
  r = await get(OUD, B(C1));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).length, 1);
  assert.equal((await get(OUD, B(C1))).status, 200);
  assert.equal((await get(OUD, K)).status, 200);
  await wacht(150);
  lg = await logboek();
  assert.deepEqual(lg.slice(n7).map((x) => [x.wie, x.actie, x.praktijk, x.pad]), [
    [EM, "gegevens gelezen van een praktijk zonder account", "fysio oud", "/api/kaarten"],
    ["beheersleutel", "gegevens gelezen van een praktijk zonder account", "fysio oud", "/api/kaarten"]], "lezen staat er één keer per beheerder en praktijk in");
  // een wijziging in zo'n praktijk staat er altijd in, met de praktijk erbij
  r = await post("/api/kaart/antwoord", { praktijk: "Fysio Oud", id: "abcdef123456", tekst: "Tot dinsdag" }, B(C1));
  await r.text();
  await wacht(150);
  lg = await logboek();
  assert.deepEqual([lg.at(-1).wie, lg.at(-1).actie, lg.at(-1).doel, lg.at(-1).status], [EM, "POST /api/kaart/antwoord", "fysio oud", r.status]);

  // ---- 8. een beveiligde praktijk: beheer komt niet bij de kaarten, ook niet met een account ----
  const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.87.0." + (ip++ & 255), ...extra }, body: new URLSearchParams(velden).toString() });
  const P = "Fysio Met Proef";
  r = await formulier("/v2/proef", { email: "eigenaar@metproef.invalid", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: P, akkoord: "1", vwo: "1" });
  assert.equal(r.status, 303, "proef gestart: " + r.status);
  const proefCookie = (r.headers.get("set-cookie") || "").split(";")[0];
  r = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wachtwoord-praktijk", akkoord: true }, { cookie: proefCookie });
  assert.equal(r.status, 200, await r.clone().text());
  const S = { "x-praktijk-sessie": (await r.json()).sessie };
  r = await post("/api/kaarten", { praktijk: P, naam: "Karel V.", client: { c_naam: "Karel V." }, chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S);
  assert.ok((await r.json()).id, "de praktijk deelt een kaart");
  const KP = "/api/kaarten?praktijk=" + encodeURIComponent(P);
  assert.equal((await get(KP, S)).status, 200);
  r = await get(KP, B(C1));
  assert.equal(r.status, 401, "een beheeraccount leest de kaarten van een beveiligde praktijk niet");
  assert.doesNotMatch(await r.text(), /Karel/);
  assert.equal((await get(KP, K)).status, 401);

  // ---- 9. de noodprocedure: een herstelmail met reden, bericht aan de praktijk en een regel met naam ----
  const REDEN = "Praktijk belde: wachtwoord en herstelcode kwijt";
  mails.length = 0;
  r = await post("/api/beheer/praktijk-herstel", { praktijk: P }, B(C1));
  assert.equal(r.status, 400, "zonder reden geen herstelmail");
  r = await post("/api/beheer/praktijk-herstel", { praktijk: P, reden: REDEN }, { cookie: C1.split(";")[0] });
  assert.equal(r.status, 403, "de noodprocedure werkt niet met de cookie alleen");
  r = await post("/api/beheer/praktijk-herstel", { praktijk: P, reden: REDEN }, B(C1, { "sec-fetch-site": "cross-site" }));
  assert.equal(r.status, 403, "en niet vanaf een andere website");
  assert.equal(mails.length, 0);
  r = await post("/api/beheer/praktijk-herstel", { praktijk: P, reden: REDEN }, B(C1));
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await r.json()).naar, ["e***@metproef.invalid"]);
  const herstelMail = mails.find((m) => /^Herstelcode voor Fysiplan/.test(m.subject));
  assert.ok(herstelMail && herstelMail.to[0] === "eigenaar@metproef.invalid" && herstelMail.text.includes(REDEN), "de praktijk krijgt bericht, met de reden");
  const act = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S)).json()).activiteit;
  assert.ok(act.some((a) => a.actie === "herstel-door-beheer" && a.wie.includes(REDEN)), "en ziet het in haar eigen logboek");
  await wacht(150);
  lg = await logboek();
  const pk = lg.at(-1).praktijk;
  assert.deepEqual({ ...lg.at(-1), t: 0 }, { t: 0, wie: EM, actie: "herstelmail aan een praktijk", praktijk: pk, naam: P, reden: REDEN, naar: "e***@metproef.invalid", ip: "10.85.x.x" },
    "het beheerlogboek zegt wie van beheer het deed, voor welke praktijk, waarom en waarheen");
  assert.deepEqual(lg.slice(-2, -1).map((x) => [x.wie, x.actie, x.status, x.doel]), [[EM, "POST /api/beheer/praktijk-herstel", 400, P.toLowerCase()]], "ook de poging zonder reden staat erin");
  assert.equal((await get(KP, B(C1))).status, 401, "ook na de herstelmail komt beheer niet bij de kaarten");

  // ---- 10. het logboek: alleen erbij, en er is geen route om het te wijzigen ----
  const naLog = await readFile(join(dataDir, "beheer-log.jsonl"), "utf8");
  assert.ok(naLog.startsWith(voorLog) && naLog.length > voorLog.length, "wat er stond, staat er nog precies zo");
  for (const [methode, pad] of [["DELETE", "/api/beheer/log"], ["POST", "/api/beheer/log"], ["DELETE", "/api/beheer/overzicht"], ["POST", "/api/beheer/overzicht"], ["PUT", "/api/beheer/log"]]) {
    r = await fetch(origin + pad, { method: methode, headers: kop(B(C1)), body: methode === "DELETE" ? undefined : "{}" });
    assert.equal(r.status, 404, methode + " " + pad);
  }
  assert.equal(await readFile(join(dataDir, "beheer-log.jsonl"), "utf8"), naLog);
  r = await get("/api/beheer/overzicht", B(C1));
  assert.equal(r.status, 200);
  const overzichtTekst = await r.clone().text();
  j = await r.json();
  assert.equal(j.wie, EM);
  assert.deepEqual(j.accounts.map((a) => [a.email, a.status]), [[EM, "actief"]]);
  assert.equal(j.log[0].actie, "herstelmail aan een praktijk", "het scherm toont de nieuwste regel eerst");
  assert.equal(j.log.length, lg.length);
  assert.deepEqual([j.sleutelAan, j.mail, j.wwMin, j.startDagen], [true, true, 12, 7]);
  assert.doesNotMatch(overzichtTekst, /scrypt\$|"hash"|"totp"|"reserve"|"geheim"/, "geen hash, geheim of reservecode in het overzicht");
  assert.ok(!overzichtTekst.includes(G3));
  assert.equal((await get("/api/beheer/overzicht", K)).status, 200, "met de eigen sleutel van de server kan het overzicht ook");

  // ---- 11. een tweede beheerder, gemaakt door de eerste ----
  mails.length = 0;
  const bea = await nieuwAccount("bea@fysiplan.invalid", "Bea", B(C1));
  await wacht(100);
  assert.deepEqual(beheerMails().map((m) => m.to[0]).sort(), [EM, MELDADRES].sort(), "de beheerders en het meldadres horen het");
  assert.match(beheerMails()[0].text, /ahmed@fysiplan\.invalid heeft een beheeraccount gemaakt voor Bea \(bea@fysiplan\.invalid\)/);
  assert.ok(beheerMails().every((m) => !m.text.includes(bea.start)));
  lg = await logboek();
  assert.deepEqual(lg.slice(-2).map((x) => [x.wie, x.actie, x.doel]), [[EM, "beheeraccount gemaakt", "bea@fysiplan.invalid"], ["bea@fysiplan.invalid", "eerste keer ingelogd: eigen wachtwoord gekozen en tweede stap ingesteld", undefined]]);
  assert.equal(await dash(B(bea.cookie)), 200);
  r = await post("/api/beheer/accounts", { email: "bea@fysiplan.invalid", naam: "Bea" }, B(C1));
  assert.equal(r.status, 409, "een account in gebruik maak je niet zomaar opnieuw");
  assert.equal(await dash(B(bea.cookie)), 200);

  // ---- 12. het eigen wachtwoord wijzigen: huidig wachtwoord en een code ----
  const wijzig = (lijf, cookie) => post("/api/beheer/wachtwoord", lijf, B(cookie));
  const beaTwee = beheerCookie(await metReserve(bea)); // Bea is ook op een ander apparaat ingelogd
  assert.equal(await dash(B(beaTwee)), 200);
  assert.equal((await post("/api/beheer/wachtwoord", { huidig: bea.ww, nieuw: "een-nieuw-wachtwoord-bea", code: bea.reserve[0] }, K)).status, 403, "de sleutel heeft geen eigen wachtwoord");
  assert.equal((await wijzig({ huidig: "fout", nieuw: "een-nieuw-wachtwoord-bea", code: bea.reserve[0] }, bea.cookie)).status, 403);
  assert.equal((await wijzig({ huidig: bea.ww, nieuw: "kort", code: bea.reserve[0] }, bea.cookie)).status, 400);
  assert.equal((await wijzig({ huidig: bea.ww, nieuw: bea.ww, code: bea.reserve[0] }, bea.cookie)).status, 400, "hetzelfde wachtwoord is geen wijziging");
  assert.equal((await wijzig({ huidig: bea.ww, nieuw: "een-nieuw-wachtwoord-bea" }, bea.cookie)).status, 401, "zonder code geen nieuw wachtwoord");
  assert.equal((await login({ email: bea.email, wachtwoord: "een-nieuw-wachtwoord-bea", code: bea.reserve[0] })).status, 403, "er is nog niets veranderd");
  r = await wijzig({ huidig: bea.ww, nieuw: "een-nieuw-wachtwoord-bea", code: bea.reserve.shift() }, bea.cookie);
  assert.equal(r.status, 200, await r.clone().text());
  const beaNieuw = beheerCookie(r);
  assert.match(beaNieuw, /^fpbeheer=[a-f0-9]{48}; /);
  assert.equal(await dash(B(beaNieuw)), 200, "deze browser blijft ingelogd");
  assert.equal(await dash(B(bea.cookie)), 403, "de oude sessie vervalt");
  assert.equal(await dash(B(beaTwee)), 403, "ook die op het andere apparaat");
  assert.equal((await login({ email: bea.email, wachtwoord: bea.ww, code: bea.reserve[0] })).status, 403, "het oude wachtwoord werkt niet meer");
  bea.ww = "een-nieuw-wachtwoord-bea";
  assert.equal((await metReserve(bea)).status, 200);
  assert.equal(await dash(B(C1)), 200, "een andere beheerder merkt er niets van");
  assert.equal((await logboek()).filter((x) => x.actie === "eigen wachtwoord gewijzigd" && x.wie === bea.email).length, 1);

  // ---- 13. raden: de rem per adres, en het slot op de tweede stap ----
  const cor = await nieuwAccount("cor@fysiplan.invalid", "Cor", B(C1));
  for (let i = 0; i < 9; i++) assert.equal((await login({ email: cor.email, wachtwoord: "fout-" + i })).status, 403);
  assert.equal((await logboek()).filter((x) => /op slot/.test(x.actie)).length, 0);
  assert.equal((await login({ email: cor.email, wachtwoord: "fout-9" })).status, 403);
  // op slot: geen antwoord meer dat zegt of een wachtwoord klopt
  r = await login({ email: cor.email, wachtwoord: "fout-10" });
  assert.equal(r.status, 429, "na tien foute wachtwoorden zit dit adres een kwartier op slot");
  assert.equal(r.headers.get("retry-after"), "900");
  const slotLijf = await r.text();
  assert.deepEqual(Object.keys(JSON.parse(slotLijf)).sort(), ["adresOpSlot", "fout", "ok"]);
  assert.match(JSON.parse(slotLijf).fout, /alleen in met je wachtwoord én een code/, "het antwoord zegt hoe de eigenaar er nog in komt");
  r = await login({ email: cor.email, wachtwoord: cor.ww });
  assert.equal(r.status, 429, "op slot zegt het antwoord niet meer dat het wachtwoord klopt");
  assert.equal(await r.text(), slotLijf, "het goede wachtwoord krijgt precies hetzelfde antwoord als een fout");
  r = await login({ email: cor.email, wachtwoord: cor.ww, code: "000000" });
  assert.equal(r.status, 429);
  assert.equal(await r.text(), slotLijf, "ook met een foute code erbij");
  assert.equal((await accountsOpSchijf())[cor.email].totp.mis.n, 1, "die foute code telt wel mee bij de tweede stap");
  // wie het wachtwoord én een goede code heeft, komt binnen: wie alleen het adres kent, sluit de eigenaar zo niet buiten
  r = await login({ email: cor.email, wachtwoord: cor.ww, code: cor.reserve[0] });
  assert.equal(r.status, 200, "de eigenaar komt er met wachtwoord en code nog in: " + await r.clone().text());
  assert.equal(await dash(B(beheerCookie(r))), 200);
  assert.equal((await login({ email: cor.email, wachtwoord: "fout-11" })).status, 429, "het slot blijft staan: wie raadt, krijgt geen nieuwe pogingen");
  assert.equal((await login({ email: cor.email, wachtwoord: cor.ww })).status, 429);
  lg = await logboek();
  assert.deepEqual(lg.filter((x) => /op slot/.test(x.actie)).map((x) => [x.wie, x.actie]), [[cor.email, "inloggen op slot: tien keer een fout wachtwoord binnen een kwartier"]], "één regel, niet één per poging");
  assert.deepEqual(lg.slice(-2).map((x) => [x.wie, x.actie]), [[cor.email, "foute code na een goed wachtwoord"], [cor.email, "ingelogd met een reservecode"]]);
  assert.equal(await dash(B(cor.cookie)), 200, "wie al ingelogd is, werkt door");
  assert.equal((await metReserve(bea)).status, 200, "een ander adres merkt er niets van");
  const n13 = (await logboek()).length;
  for (let i = 0; i < 12; i++) assert.equal((await login({ email: "niemand-" + i + "@fysiplan.invalid", wachtwoord: "fout" })).status, 403);
  assert.equal((await logboek()).length, n13, "pogingen op adressen zonder account vullen het logboek niet");
  // de rem per verbinding: na twintig geweigerde pogingen komt vanaf dat adres ook een goede login niet binnen
  const VAST = { "x-forwarded-for": "10.99.0.1" };
  for (let i = 0; i < 20; i++) assert.equal((await login({ email: "raad-" + i + "@fysiplan.invalid", wachtwoord: "fout" }, VAST)).status, 403);
  assert.equal((await login({ email: "raad-20@fysiplan.invalid", wachtwoord: "fout" }, VAST)).status, 429);
  r = await login({ email: bea.email, wachtwoord: bea.ww, code: bea.reserve[0] }, VAST);
  assert.equal(r.status, 429, "een verbinding op de rem komt ook met het goede wachtwoord en een goede code niet binnen");
  assert.equal(beheerCookie(r), "");
  assert.equal((await metReserve(bea)).status, 200, "vanaf een andere verbinding werkt dezelfde code gewoon: hij was niet verbruikt");
  // drie foute codes na een goed wachtwoord (TOTP_MIS_PER_DAG=3 in deze test): de code-app werkt 24 uur niet
  const dia = await nieuwAccount("dia@fysiplan.invalid", "Dia", B(C1));
  mails.length = 0;
  assert.equal((await login({ email: dia.email, wachtwoord: dia.ww, code: "000000" })).status, 403);
  assert.equal((await login({ email: dia.email, wachtwoord: dia.ww, code: "000001" })).status, 403);
  assert.equal((await accountsOpSchijf())[dia.email].totp.mis.n, 2, "de teller staat op schijf: een herstart geeft geen nieuwe pogingen");
  assert.equal((await login({ email: dia.email, wachtwoord: dia.ww, code: "000002" })).status, 403);
  r = await login({ email: dia.email, wachtwoord: dia.ww, code: code(dia.geheim, 1) });
  assert.equal(r.status, 429, "daarna werkt ook de goede code niet");
  assert.equal((await r.json()).tweedeStap, true);
  await wacht(100);
  lg = await logboek();
  assert.deepEqual(lg.slice(-3).map((x) => [x.wie, x.actie]), [[dia.email, "foute code na een goed wachtwoord"], [dia.email, "foute code na een goed wachtwoord"],
    [dia.email, "tweede stap op slot: 3 foute codes na een goed wachtwoord"]]);
  assert.ok(beheerMails().some((m) => m.subject === "Fysiplan beheer: te veel foute codes bij " + dia.email && m.to[0] === dia.email), "de eigenaar krijgt bericht");
  assert.ok(beheerMails().some((m) => m.to[0] === EM), "en de andere beheerders ook");
  assert.equal((await metReserve(dia)).status, 200, "een reservecode werkt dan nog");

  // ---- 14. uitzetten: meteen geen sessie en geen login meer ----
  mails.length = 0;
  assert.equal(await dash(B(dia.cookie)), 200);
  assert.equal((await post("/api/beheer/accounts/uit", { email: dia.email }, { cookie: C1.split(";")[0] })).status, 403);
  assert.equal((await post("/api/beheer/accounts/uit", { email: "bestaat-niet@fysiplan.invalid" }, B(C1))).status, 404);
  r = await post("/api/beheer/accounts/uit", { email: dia.email }, B(C1));
  assert.equal(r.status, 200, await r.clone().text());
  j = await r.json();
  assert.deepEqual([j.account.status, j.account.uitDoor], ["uit", EM]);
  assert.equal(await dash(B(dia.cookie)), 403, "de sessie van een uitgezet account werkt meteen niet meer");
  r = await login({ email: dia.email, wachtwoord: dia.ww, code: dia.reserve[0] });
  assert.equal(r.status, 403, "inloggen kan niet meer");
  assert.equal((await r.json()).fout, FOUT, "met hetzelfde antwoord als een adres zonder account");
  schijf = (await accountsOpSchijf())[dia.email];
  assert.ok(!schijf.hash && !schijf.totp && schijf.uit, "wachtwoord en tweede stap zijn van schijf");
  await wacht(100);
  assert.deepEqual(beheerMails().map((m) => m.to[0]).sort(), [EM, bea.email, cor.email, dia.email, MELDADRES].sort(), "iedereen hoort het, ook wie is uitgezet");
  lg = await logboek();
  assert.deepEqual([lg.at(-1).wie, lg.at(-1).actie, lg.at(-1).doel, lg.at(-1).sessies], [EM, "beheeraccount uitgezet", dia.email, 2]);
  assert.equal((await (await post("/api/beheer/accounts/uit", { email: dia.email }, B(C1))).json()).al, true);
  // opnieuw maken: de eigenaar begint met een nieuw startwachtwoord en een nieuwe tweede stap
  const dia2 = await nieuwAccount("dia@fysiplan.invalid", "Dia", B(C1));
  assert.notEqual(dia2.geheim, dia.geheim);
  assert.equal(await dash(B(dia2.cookie)), 200);
  assert.equal(await dash(B(dia.cookie)), 403);
  assert.equal((await logboek()).filter((x) => x.actie === "beheeraccount opnieuw gemaakt" && x.doel === dia.email).length, 1);
  // een beheerder zet zichzelf uit
  assert.equal((await post("/api/beheer/accounts/uit", { email: dia.email }, B(dia2.cookie))).status, 200);
  assert.equal(await dash(B(dia2.cookie)), 403);

  // ---- 15. uitloggen ----
  r = await post("/api/beheer/logout", {}, B(C2, { "sec-fetch-site": "cross-site", origin: "https://elders.invalid" }));
  assert.equal(r.status, 403, "een andere website logt niemand uit");
  assert.equal(await dash(B(C2)), 200);
  r = await post("/api/beheer/logout", {}, B(C2));
  assert.equal(r.status, 200);
  assert.equal(beheerCookie(r), "fpbeheer=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0", "de cookie gaat leeg terug");
  assert.equal(await dash(B(C2)), 403, "de sessie bestaat niet meer");
  assert.equal(await dash(B(C1)), 200);
  lg = await logboek();
  assert.deepEqual([lg.at(-1).wie, lg.at(-1).actie], [EM, "uitgelogd"]);
  assert.equal((await post("/api/beheer/logout", {}, {})).status, 200, "uitloggen zonder sessie is geen fout");
  assert.equal((await logboek()).length, lg.length);

  // een startwachtwoord dat niemand ophaalt: voor na de herstart (een week later)
  r = await post("/api/beheer/accounts", { email: "eef@fysiplan.invalid", naam: "Eef" }, B(C1));
  const eefStart = (await r.json()).startwachtwoord;
  assert.equal((await login({ email: "eef@fysiplan.invalid", wachtwoord: eefStart })).status, 401);
  console.log("Beheeraccounts (server): startwachtwoord, eigen wachtwoord en tweede stap, de cookie telt alleen met de kop en niet vanaf een andere website, uitzetten trekt sessies in, en elke handeling staat met naam in het logboek.");

  // ---- 16. browser ----
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-beheer-accounts: geen Playwright, browserdeel overgeslagen (het serverdeel draaide wel)"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    browserKlaar = () => browser.close();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.88.0.1" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(e.message));
    const tekstVan = (sel) => page.locator(sel).innerText();
    const totRust = () => page.waitForLoadState("networkidle");
    // de eerste keer: met de sleutel naar binnen, een eigen account maken en meteen instellen
    await page.goto(origin + "/dashboard88");
    await page.waitForSelector("dialog.fpb[open] #fpbEmail");
    assert.equal(await page.locator("#inhoud").isVisible(), false, "zonder login geen dashboard");
    // het dashboard zet koppen in kleine hoofdletters; dat hoort het inlogvenster niet in te lekken
    assert.deepEqual(await page.evaluate(() => { const k = getComputedStyle(document.querySelector("dialog.fpb h2")); return [k.textTransform, k.fontSize]; }), ["none", "19px"],
      "het venster heeft zijn eigen stijl, wat de pagina ook met koppen doet");
    await page.fill("#fpbEmail", "fien@fysiplan.invalid");
    await page.fill("#fpbWw", "een-fout-wachtwoord");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForFunction(() => /klopt niet/.test(document.querySelector("dialog.fpb [role=status]").textContent));
    await page.click("#fpbNaarSleutel");
    await page.fill("#fpbSleutel", "niet-de-sleutel");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForFunction(() => /Geen toegang/.test(document.querySelector("dialog.fpb [role=status]").textContent));
    await page.fill("#fpbSleutel", SLEUTEL);
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbStrook");
    await page.waitForSelector("#inhoud", { state: "visible" });
    assert.match(await tekstVan("#fpbWie"), /gedeelde sleutel/);
    await page.click("#fpbOpenBeheer");
    await page.waitForSelector("dialog.fpb[open] #fpbMaak");
    assert.match(await tekstVan("#fpbAccounts"), /ahmed@fysiplan\.invalid/);
    assert.match(await tekstVan("#fpbLog"), /herstelmail aan een praktijk/);
    await page.fill("#fpbNaam", "Fien <b>");
    await page.fill("#fpbNieuwEmail", "fien@fysiplan.invalid");
    await page.click("#fpbMaak button[type=submit]");
    await page.waitForSelector("#fpbStartWw");
    const fienStart = (await tekstVan("#fpbStartWw")).trim();
    assert.match(fienStart, /^[a-z2-7]{4}(-[a-z2-7]{4}){4}$/);
    assert.match(await tekstVan("#fpbAccounts"), /Fien <b>/, "een naam met tekens verschijnt als tekst, niet als opmaak");
    assert.doesNotMatch(await tekstVan("dialog.fpb"), /\b(null|false|undefined)\b/, "geen lege waarden als tekst in het venster");
    await page.click("#fpbNuInstellen");
    await page.waitForSelector("dialog.fpb[open] #fpbQr svg", { timeout: 15000 });
    const fienGeheim = (await tekstVan("#fpbGeheim")).replace(/\s/g, "");
    assert.match(fienGeheim, /^[A-Z2-7]{32}$/);
    await page.fill("#fpbNieuw", "kort");
    await page.fill("#fpbHerhaal", "kort");
    await page.fill("#fpbEersteCode", "123456");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForFunction(() => /minstens 12 tekens/.test(document.querySelector("dialog.fpb [role=status]").textContent));
    const fienWw = "fien-haar-eigen-wachtwoord";
    await page.fill("#fpbNieuw", fienWw);
    await page.fill("#fpbHerhaal", fienWw + "x");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForFunction(() => /niet gelijk/.test(document.querySelector("dialog.fpb [role=status]").textContent));
    await page.fill("#fpbHerhaal", fienWw);
    await page.fill("#fpbEersteCode", "000000");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForFunction(() => /Die code klopt niet/.test(document.querySelector("dialog.fpb [role=status]").textContent));
    assert.equal((await tekstVan("#fpbGeheim")).replace(/\s/g, ""), fienGeheim, "na een foute code blijft dezelfde QR staan");
    await page.fill("#fpbEersteCode", code(fienGeheim));
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbReserve");
    const fienReserve = (await tekstVan("#fpbReserve")).trim().split("\n");
    assert.equal(fienReserve.length, 8);
    await Promise.all([page.waitForNavigation(), page.click("#fpbBewaard")]);
    await page.waitForSelector("#fpbStrook");
    await page.waitForSelector("#inhoud", { state: "visible" });
    assert.equal(await tekstVan("#fpbWie"), "Beheer: Fien <b>");
    // niets waar een script bij kan
    const opslag = await page.evaluate(() => ({ cookie: document.cookie, sessie: JSON.stringify(sessionStorage), lokaal: JSON.stringify(localStorage) }));
    assert.doesNotMatch(opslag.cookie, /fpbeheer/, "de cookie is niet te lezen door scripts");
    assert.ok(!opslag.sessie.includes(SLEUTEL) && !opslag.lokaal.includes(SLEUTEL), "de sleutel van de server staat niet meer in de browser");
    for (const geheim of [fienStart, fienWw, fienGeheim, fienReserve[0]]) assert.ok(!opslag.sessie.includes(geheim) && !opslag.lokaal.includes(geheim));
    const beheerCookies = (await ctx.cookies()).filter((c) => /fpbeheer/.test(c.name));
    assert.deepEqual(beheerCookies.map((c) => [c.name, c.httpOnly, c.sameSite, c.path]), [["fpbeheer", true, "Strict", "/"]]);
    // het overzicht met een account: accounts, logboek en het eigen wachtwoord
    await page.click("#fpbOpenBeheer");
    await page.waitForSelector("dialog.fpb[open] #fpbHuidig");
    assert.match(await tekstVan("#fpbAccounts"), /Fien <b>\s+fien@fysiplan\.invalid\s+actief/);
    assert.match(await tekstVan("#fpbLog"), /fien@fysiplan\.invalid\s+eerste keer ingelogd/);
    assert.doesNotMatch(await tekstVan("dialog.fpb"), /\b(null|false|undefined)\b/);
    await page.fill("#fpbHuidig", fienWw);
    await page.fill("#fpbWwNieuw", "fien-een-nieuw-wachtwoord");
    await page.fill("#fpbWwCode", fienReserve[0]);
    await page.click("dialog.fpb form:has(#fpbHuidig) button[type=submit]");
    await page.waitForFunction(() => /Je wachtwoord is gewijzigd/.test(document.querySelector("#fpbBeheerStatus").textContent));
    // de noodprocedure vanaf het scherm: een herstelmail met een reden, voor een praktijk die er niet meer in komt
    const P2 = "Fysio Aan De Vaart", REDEN2 = "Praktijk belde: de eigenaar is het wachtwoord kwijt";
    r = await formulier("/v2/proef", { email: "eigenaar@aandevaart.invalid", email_ok: "1", naam: "Ruud Smit", tel: "06 1234 5670", praktijk: P2, akkoord: "1", vwo: "1" });
    assert.equal(r.status, 303, "proef gestart: " + r.status);
    r = await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "wachtwoord-vaart", akkoord: true }, { cookie: (r.headers.get("set-cookie") || "").split(";")[0] });
    assert.equal(r.status, 200, await r.clone().text());
    const meldt = (re) => page.waitForFunction((bron) => new RegExp(bron).test(document.querySelector("#fpbBeheerStatus").textContent), re.source);
    await page.fill("#fpbHerstelPraktijk", "Bestaat Niet");
    await page.fill("#fpbHerstelReden", "kort");
    await page.click("#fpbHerstel button[type=submit]");
    await meldt(/Geen account voor deze praktijk/);
    await page.fill("#fpbHerstelPraktijk", P2);
    await page.click("#fpbHerstel button[type=submit]");
    await meldt(/minstens 10 tekens/);
    assert.ok(!mails.some((m) => m.to[0] === "eigenaar@aandevaart.invalid" && /^Herstelcode/.test(m.subject)), "zonder reden gaat er geen mail weg");
    await page.fill("#fpbHerstelReden", REDEN2);
    await page.click("#fpbHerstel button[type=submit]");
    await meldt(/De herstelmail is verstuurd naar e\*\*\*@aandevaart\.invalid/);
    const mail2 = mails.find((m) => m.to[0] === "eigenaar@aandevaart.invalid" && /^Herstelcode voor Fysiplan/.test(m.subject));
    assert.ok(mail2 && mail2.text.includes(REDEN2), "de praktijk krijgt de mail, met de reden erin");
    assert.match(await tekstVan("#fpbLog"), /fien@fysiplan\.invalid\s+herstelmail aan een praktijk\s+[^\n]*Fysio Aan De Vaart[^\n]*reden: Praktijk belde/, "en de regel staat meteen in het logboek op het scherm");
    assert.equal(await page.inputValue("#fpbHerstelReden"), "", "het formulier is weer leeg");
    assert.doesNotMatch(await tekstVan("dialog.fpb"), /\b(null|false|undefined)\b/);
    await page.keyboard.press("Escape");
    // de andere beheerpagina's werken met hetzelfde account, zonder opnieuw te vragen
    await page.goto(origin + "/content1000");
    await page.waitForSelector("#fpbStrook");
    await page.waitForFunction(() => /\d/.test(document.getElementById("total").textContent));
    await page.goto(origin + "/draft-review.html");
    await page.click("#login button");
    await page.waitForFunction(() => /ongepubliceerd concept|niet beschikbaar/.test(document.getElementById("status").textContent));
    assert.match(await tekstVan("#status"), /ongepubliceerd concept/, "de conceptcontrole werkt met een account");
    await page.goto(origin + "/admin88");
    await page.waitForSelector("#fpbStrook");
    assert.equal(await page.evaluate(() => fetch("/api/dashboard", { headers: { "x-admin-sleutel": "account" } }).then((x) => x.status)), 200);
    // de gewone app in dezelfde browser werkt niet stil als beheer
    await page.goto(origin + "/v2/app");
    await totRust();
    assert.equal(await page.locator("#fpbStrook").count(), 0);
    assert.equal(await page.evaluate(() => fetch("/api/dashboard").then((x) => x.status)), 403);
    assert.equal(await page.evaluate(() => fetch("/api/praktijken").then((x) => x.json()).then((x) => x.length)), 0);
    // uitloggen mislukt zonder verbinding: dat staat er, en je bent nog ingelogd
    await page.goto(origin + "/dashboard88");
    await page.waitForSelector("#fpbStrook");
    const geenVerbinding = (route) => route.abort();
    await page.route("**/api/beheer/logout", geenVerbinding);
    const melding = new Promise((klaar) => page.once("dialog", async (dlg) => { const t = dlg.message(); await dlg.accept(); klaar(t); }));
    await page.click("#fpbUit");
    assert.match(await melding, /Uitloggen lukte niet/);
    await page.unroute("**/api/beheer/logout", geenVerbinding);
    assert.equal(await page.evaluate(() => fetch("/api/dashboard", { headers: { "x-admin-sleutel": "account" } }).then((x) => x.status)), 200);
    // uitloggen, en opnieuw inloggen met wachtwoord en code
    await page.waitForFunction(() => !document.getElementById("fpbUit").disabled);
    await Promise.all([page.waitForNavigation(), page.click("#fpbUit")]);
    await page.waitForSelector("dialog.fpb[open] #fpbEmail");
    assert.equal((await ctx.cookies()).filter((c) => /fpbeheer/.test(c.name)).length, 0, "de cookie is weg");
    await page.fill("#fpbEmail", "fien@fysiplan.invalid");
    await page.fill("#fpbWw", "fien-een-nieuw-wachtwoord");
    assert.equal(await page.locator("#fpbCode").isVisible(), false, "de code komt pas na het wachtwoord");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbCode", { state: "visible" });
    await page.fill("#fpbCode", "000000");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForFunction(() => /Die code klopt niet/.test(document.querySelector("dialog.fpb [role=status]").textContent));
    await page.fill("#fpbCode", code(fienGeheim, 1));
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbStrook");
    await page.waitForSelector("#inhoud", { state: "visible" });
    assert.equal(await tekstVan("#fpbWie"), "Beheer: Fien <b>");
    // een volgende beheerder begint in het gewone inlogvenster met het startwachtwoord. Escape
    // sluit de reservecodes niet; gaat het venster toch dicht, dan werkt de pagina als ingelogd
    // (de sessie bestaat al)
    const gijsStart = await page.evaluate(() => fetch("/api/beheer/accounts", { method: "POST", headers: { "content-type": "application/json", "x-admin-sleutel": "account" },
      body: JSON.stringify({ email: "gijs@fysiplan.invalid", naam: "Gijs" }) }).then((x) => x.json()).then((x) => x.startwachtwoord));
    assert.match(String(gijsStart), /^[a-z2-7]{4}(-[a-z2-7]{4}){4}$/);
    await Promise.all([page.waitForNavigation(), page.click("#fpbUit")]);
    await page.waitForSelector("dialog.fpb[open] #fpbEmail");
    await page.fill("#fpbEmail", "gijs@fysiplan.invalid");
    await page.fill("#fpbWw", gijsStart);
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("dialog.fpb[open] #fpbQr svg", { timeout: 15000 });
    const gijsGeheim = (await tekstVan("#fpbGeheim")).replace(/\s/g, "");
    await page.fill("#fpbNieuw", "gijs-zijn-eigen-wachtwoord");
    await page.fill("#fpbHerhaal", "gijs-zijn-eigen-wachtwoord");
    await page.fill("#fpbEersteCode", code(gijsGeheim));
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbReserve");
    assert.equal(await page.locator("#inhoud").isVisible(), false, "het dashboard wacht tot het venster dicht is");
    await page.keyboard.press("Escape");
    await wacht(300);
    assert.equal(await page.locator("dialog.fpb[open] #fpbReserve").count(), 1, "Escape sluit de reservecodes niet");
    await page.evaluate(() => document.querySelector("dialog.fpb").close());
    await page.waitForSelector("#fpbStrook");
    await page.waitForSelector("#inhoud", { state: "visible" });
    assert.equal(await tekstVan("#fpbWie"), "Beheer: Gijs");
    // iemand raadt tien keer fout op het adres van Gijs: het inlogvenster vraagt dan meteen om de
    // code erbij, en met wachtwoord en code komt Gijs er nog in
    await Promise.all([page.waitForNavigation(), page.click("#fpbUit")]);
    await page.waitForSelector("dialog.fpb[open] #fpbEmail");
    for (let i = 0; i < 10; i++) assert.equal((await login({ email: "gijs@fysiplan.invalid", wachtwoord: "geraden-" + i })).status, 403);
    await page.fill("#fpbEmail", "gijs@fysiplan.invalid");
    await page.fill("#fpbWw", "gijs-zijn-eigen-wachtwoord");
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbCode", { state: "visible" });
    assert.match(await tekstVan("dialog.fpb [role=status]"), /Te veel inlogpogingen met dit e-mailadres.*wachtwoord én een code/);
    await page.fill("#fpbCode", code(gijsGeheim, 1));
    await page.click("dialog.fpb button[type=submit]");
    await page.waitForSelector("#fpbStrook");
    await page.waitForSelector("#inhoud", { state: "visible" });
    assert.equal(await tekstVan("#fpbWie"), "Beheer: Gijs");
    assert.deepEqual(fouten, [], "geen scriptfouten op de beheerpagina's");
    await ctx.close();
    console.log("Beheeraccounts (browser): eerste account met de sleutel, instellen met QR en reservecodes, niets leesbaar voor scripts, de herstelmail vanaf het scherm, alle beheerpagina's met één login, en de gewone app blijft gewoon.");
  }

  // ---- 17. na een herstart, een week later, zonder sleutel op de server ----
  const sessiePad = join(dataDir, "beheer-sessies.json");
  const sha = (cookie) => createHash("sha256").update(String(cookie).split(";")[0].split("=")[1]).digest("hex");
  assert.equal(await dash(B(beaNieuw)), 200);
  assert.equal(await dash(B(cor.cookie)), 200);
  await stop(app);
  const sessieTekst = await readFile(sessiePad, "utf8");
  const opSchijf = JSON.parse(sessieTekst);
  assert.deepEqual(opSchijf.sessies[sha(C1)].email, EM, "de sessie staat op schijf onder de SHA-256 van de sleutel");
  for (const c of [C1, C3, beaNieuw, cor.cookie]) assert.ok(!sessieTekst.includes(String(c).split(";")[0].split("=")[1]), "de sleutel zelf staat nergens op schijf");
  assert.doesNotMatch(sessieTekst, /scrypt|wachtwoord|geheim/i, "geen wachtwoord of geheim in het sessiebestand");
  assert.ok(!opSchijf.sessies[sha(C2)], "een uitgelogde sessie staat er niet meer");
  assert.ok(!Object.values(opSchijf.sessies).some((x) => x.email === dia.email), "en die van een uitgezet account ook niet");
  // terwijl de server uit staat: de sessie van Bea wordt dertien uur oud, en bij Cor staat een ander wachtwoord
  opSchijf.sessies[sha(beaNieuw)].t = Date.now() - 13 * 3600e3;
  await writeFile(sessiePad, JSON.stringify(opSchijf));
  const weekLater = await accountsOpSchijf();
  weekLater["eef@fysiplan.invalid"].gemaakt = new Date(Date.now() - 8 * 86400e3).toISOString();
  weekLater[cor.email].hash = weekLater[bea.email].hash;
  await writeFile(join(dataDir, "beheer-accounts.json"), JSON.stringify(weekLater, null, 2));
  const logVoorHerstart = await readFile(join(dataDir, "beheer-log.jsonl"), "utf8");
  app = await start({ ADMIN_KEY: undefined, NODE_ENV: "production" });
  assert.doesNotMatch(log, /Beheer staat dicht/, "met een werkend account staat beheer niet dicht");
  assert.equal(await dash(K), 403, "zonder ADMIN_KEY op de server werkt de sleutel niet meer");
  assert.equal(await dash({ "x-admin-sleutel": "admin88" }), 403);
  assert.equal(await dash(B(C1)), 200, "wie was ingelogd, werkt na een herstart verder");
  assert.equal(await dash({ cookie: String(C1).split(";")[0] }), 403, "nog steeds alleen met de kop erbij");
  assert.equal(await dash(B(C2)), 403, "uitgelogd blijft uitgelogd");
  assert.equal(await dash(B(beaNieuw)), 403, "een sessie van meer dan twaalf uur oud komt niet terug");
  assert.equal(await dash(B(cor.cookie)), 403, "en een sessie bij een ander wachtwoord ook niet");
  assert.equal(await dash(B(dia2.cookie)), 403);
  r = await login({ email: EM, wachtwoord: WW, code: RESERVE[2] });
  assert.equal(r.status, 200, "de accounts zelf staan er nog: " + await r.clone().text());
  const C9 = beheerCookie(r);
  assert.equal(await dash(B(C9)), 200);
  j = await (await get("/api/beheer/overzicht", B(C9))).json();
  assert.equal(j.sleutelAan, false);
  assert.ok(j.log.some((x) => x.actie === "herstelmail aan een praktijk" && x.wie === EM), "het logboek van vóór de herstart staat nog op het scherm");
  assert.ok((await readFile(join(dataDir, "beheer-log.jsonl"), "utf8")).startsWith(logVoorHerstart));
  assert.equal(j.accounts.find((a) => a.email === "eef@fysiplan.invalid").status, "verlopen");
  r = await login({ email: "eef@fysiplan.invalid", wachtwoord: eefStart });
  assert.equal(r.status, 403, "een startwachtwoord is een week geldig");
  assert.equal((await r.json()).verlopen, true);
  assert.equal((await login({ email: "eef@fysiplan.invalid", wachtwoord: "fout" })).status, 403);
  r = await post("/api/beheer/accounts", { email: "eef@fysiplan.invalid", naam: "Eef" }, B(C9));
  assert.equal(r.status, 200, "een beheerder geeft een nieuw startwachtwoord");
  assert.equal((await login({ email: "eef@fysiplan.invalid", wachtwoord: (await r.json()).startwachtwoord })).status, 401);
  // de reservekopie van de dag neemt de accounts en het logboek mee
  const dagen = await readdir(join(dataDir, "backups"));
  const kopie = await readdir(join(dataDir, "backups", dagen.sort().at(-1)));
  assert.ok(kopie.includes("beheer-accounts.json") && kopie.includes("beheer-log.jsonl"), "in de reservekopie: " + kopie.join(", "));
  assert.ok(!kopie.includes("beheer-sessies.json"), "sessies zijn tijdelijk en horen niet in de reservekopie");
  // het laatste werkende account kan niet uit zolang er geen sleutel op de server staat
  for (const a of [bea, cor]) assert.equal((await post("/api/beheer/accounts/uit", { email: a.email }, B(C9))).status, 200);
  const werkend = (await (await get("/api/beheer/overzicht", B(C9))).json()).accounts.filter((a) => a.status === "actief").map((a) => a.email);
  for (const adres of werkend) if (adres !== EM) assert.equal((await post("/api/beheer/accounts/uit", { email: adres }, B(C9))).status, 200);
  r = await post("/api/beheer/accounts/uit", { email: EM }, B(C9));
  assert.equal(r.status, 409, "anders is beheer voor iedereen dicht");
  assert.equal((await r.json()).laatste, true);
  assert.equal(await dash(B(C9)), 200);
  // hooguit twintig accounts; een adres dat er al is opnieuw maken kan dan nog wel
  let aantal = (await (await get("/api/beheer/overzicht", B(C9))).json()).accounts.length;
  assert.ok(aantal < 20, "de test begint onder de grens: " + aantal);
  for (; aantal < 20; aantal++) assert.equal((await post("/api/beheer/accounts", { email: "vul-" + aantal + "@fysiplan.invalid", naam: "Vul " + aantal }, B(C9))).status, 200);
  r = await post("/api/beheer/accounts", { email: "te-veel@fysiplan.invalid", naam: "Te Veel" }, B(C9));
  assert.equal(r.status, 409, "hooguit twintig beheeraccounts");
  assert.match((await r.json()).fout, /al 20 beheeraccounts/);
  assert.equal((await post("/api/beheer/accounts", { email: "vul-19@fysiplan.invalid", naam: "Vul 19" }, B(C9))).status, 200, "een adres dat er al is, krijgt nog wel een nieuw startwachtwoord");
  // met de sleutel terug op de server kan ook het laatste account uit: de sleutel is dan de weg naar binnen
  await stop(app);
  app = await start({ NODE_ENV: "production" });
  assert.equal(await dash(B(C9)), 200, "ook deze herstart overleeft de sessie");
  assert.equal((await post("/api/beheer/accounts/uit", { email: EM }, B(C9))).status, 200, "met een sleutel op de server mag het laatste account uit");
  assert.equal(await dash(B(C9)), 403);
  assert.equal(await dash(K), 200);
  await stop(app);

  // ---- 18. een lokale server met alleen de openbare standaardsleutel ----
  app = await start({ ADMIN_KEY: undefined }, join(tmp, "data-lokaal"));
  const STD = { "x-admin-sleutel": "admin88" };
  assert.equal(await dash(STD), 200, "lokaal werkt de standaardsleutel voor de bibliotheek");
  assert.deepEqual(await (await get("/api/beheer/ik", STD)).json(), { ok: true, wie: "beheersleutel", eigen: false });
  assert.equal((await post("/api/beheer/accounts", { email: "x@y.invalid", naam: "X" }, STD)).status, 403, "de openbare sleutel maakt geen beheeraccounts");
  assert.equal((await get("/api/beheer/overzicht", STD)).status, 403);
  assert.equal((await get(OUD, STD)).status, 401, "en leest geen gegevens van praktijken");
  console.log("Beheeraccounts (herstart): accounts, logboek en lopende sessies blijven; uitgelogd, verlopen of een ander wachtwoord niet; een startwachtwoord verloopt na een week, hooguit twintig accounts, en zonder sleutel blijft het laatste account staan.");
} finally {
  await browserKlaar().catch(() => {});
  await stop(app).catch(() => {});
  await new Promise((r) => mailApi.close(r));
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
console.log("test-beheer-accounts: ok");
