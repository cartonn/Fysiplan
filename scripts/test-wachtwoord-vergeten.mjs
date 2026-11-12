// Wachtwoord vergeten met een eigen login: een link naar het adres van die login.
// Met de eigen login voor iedereen (EIGEN_LOGIN_VERPLICHT) is er geen praktijkwachtwoord en geen
// herstelcode op papier meer. Een enige beheerder die het wachtwoord vergat, kwam er alleen nog in
// met een herstelmail van Fysiplan-beheer. Nu: POST /api/praktijk/wachtwoord-vergeten.
// - Het antwoord is altijd hetzelfde: het verraadt niet of het adres bij een login van de praktijk
//   hoort, ook niet bij een mailstoring.
// - De link gaat alleen naar het adres van een actieve login, is een uur geldig en werkt één keer.
//   Tot gebruik verandert er niets; een nieuwe aanvraag maakt de vorige link ongeldig.
// - De tweede stap blijft staan: met alleen de mailbox is er bij zo'n login nog geen sessie.
// - De pagina achter de link vraagt alleen een nieuw wachtwoord: de naam en het akkoord op de
//   werkregels van de login blijven zoals ze zijn.
// - Remmen: drie mails per uur per adres, zes aanvragen per uur per verbinding.
// - Een lopende herstelmail van beheer wordt niet overschreven; een uitnodiging die nog niet is
//   aangenomen is geen login.
// Nepmail-API op localhost; zonder browser, past in CI. `npm run test:wachtwoordvergeten`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. de app: het formulier achter "Wachtwoord vergeten?" ----
{
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  assert.match(idx, /id='ps_vergeet'[\s\S]*?id='ps_vmail'[\s\S]*?id='ps_vdo'/, "het formulier met het e-mailadres staat in het slot");
  assert.match(idx, /fetch\('api\/praktijk\/wachtwoord-vergeten'/, "en vraagt de link aan bij de server");
  assert.match(idx, /if\(PRAKSLOT\.perEmail\)\{\s*f\.style\.display='none';\s*psVergeetToon\(/, "een praktijk met alleen eigen logins krijgt meteen dat formulier");
  assert.doesNotMatch(idx, /antwoord dan op een mail van Fysiplan/, "de omweg via een mail aan Fysiplan staat er niet meer");
  assert.match(idx, /'wachtwoord-vergeten-mail':'link voor een nieuw wachtwoord gemaild'/, "Activiteit kent de regel");
}

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vergeten-"));
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const A = { "x-admin-sleutel": SLEUTEL };
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");

// nepmail: bewaart wat de server verstuurt; mailStuk laat de mail-API falen
const mails = [];
let mailStuk = false;
const mailApi = createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => {
    if (mailStuk) { res.writeHead(500, { "content-type": "application/json" }); res.end('{"fout":"stuk"}'); return; }
    try { mails.push(JSON.parse(b)); } catch {}
    res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}');
  });
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
let origin = "", log = "";
async function start(extra = {}) {
  const port = await vrijePoort();
  origin = `http://127.0.0.1:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", FYSIPLAN_CONTACT: "hulp@fysiplan.invalid",
    MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: mailUrl };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV" || k === "EIGEN_LOGIN_VERPLICHT") delete kind[k];
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
const adres = () => "10.91." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const lidVan = async (email) => Object.values(await accounts()).flatMap((a) => a.leden || []).filter((l) => l.email === email);
const login = (lijf) => post("/api/praktijk/login", lijf);
const kaarten = (praktijk, S) => get("/api/kaarten?praktijk=" + encodeURIComponent(praktijk), S);
const activiteit = async (naam, S) => (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(naam), S)).json()).activiteit;
const vergeten = (praktijk, email, extra) => post("/api/praktijk/wachtwoord-vergeten", { praktijk, email }, extra);
const UNIFORM = { ok: true, gestuurd: true };
// de mail gaat na het antwoord de deur uit: wacht tot hij er is
const wachtOpMails = async (n) => { for (let i = 0; i < 120 && mails.length < n; i++) await wacht(25); assert.equal(mails.length, n, "aantal mails: " + mails.map((m) => m.to + " " + m.subject).join(" | ")); };
// en als er geen hoort te komen: lang genoeg wachten dat hij er anders was geweest
const geenMailErbij = async (n, wat) => { await wacht(350); assert.equal(mails.length, n, wat); };
const tokenUit = (m) => (String(m.text).match(/\/v2\/uitnodiging\?t=([a-f0-9]{48})/) || [])[1];
const pagina = (t) => fetch(origin + "/v2/uitnodiging?t=" + t, { headers: { "x-forwarded-for": adres() } });
// de pagina achter de eigen aanvraag stuurt alleen het token en het nieuwe wachtwoord
const kiesWachtwoord = (t, wachtwoord, erbij = {}) => formulier("/v2/uitnodiging", { t, wachtwoord, ...erbij });
// een praktijk met een gedeeld wachtwoord en één beheerder met een eigen login
async function praktijkMet(naam, email, wie, wachtwoord, extra = {}) {
  let r = await post("/api/praktijk/claim", { praktijk: naam, wachtwoord: "gedeeld-" + wachtwoord, akkoord: true, ...extra });
  assert.equal(r.status, 200, await r.clone().text());
  const G = ses(await r.json());
  r = await post("/api/praktijk/team/eigen-login", { naam: wie, email, wachtwoord, regels: true }, G);
  assert.equal(r.status, 200, await r.clone().text());
  return { G, S: ses(await r.json()) };
}
// een verse code voor dit geheim: nooit twee keer dezelfde tijdstap (een code werkt één keer)
const laatst = new Map();
function vers(geheim) {
  const s = Math.max(stapVan(Date.now()), (laatst.get(geheim) || 0) + 1);
  laatst.set(geheim, s);
  return codeVoor(geheim, s);
}

let app = await start();
try {
  // ---- 2a. invoer en herkomst ----
  const P = "Fysio Vergeet", KARIN = "karin@vergeet.invalid";
  const { G, S: K } = await praktijkMet(P, KARIN, "Karin Beheer", "karin-wachtwoord");
  let r = await vergeten("", KARIN);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).veld, "praktijk");
  r = await vergeten(P, "geen-adres");
  assert.equal(r.status, 400);
  assert.equal((await r.json()).veld, "email");
  r = await vergeten(P, KARIN, { "sec-fetch-site": "cross-site" });
  assert.equal(r.status, 403, "een andere website kan geen link laten sturen");
  await geenMailErbij(0, "nog geen mail verstuurd");

  // ---- 2b. geen login met dit adres: zelfde antwoord, geen mail ----
  r = await vergeten(P, "vreemd@elders.invalid");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), UNIFORM);
  r = await vergeten("Fysio Bestaat Niet", KARIN);
  assert.equal(r.status, 200, "een andere praktijknaam met een bestaand adres");
  assert.deepEqual(await r.json(), UNIFORM);
  // een uitnodiging die nog niet is aangenomen is geen login: de uitnodiging blijft zoals hij was
  const TOM = "tom@vergeet.invalid";
  r = await post("/api/praktijk/team/uitnodigen", { email: TOM, naam: "Tom", rol: "therapeut" }, K);
  assert.equal(r.status, 200, await r.clone().text());
  await wacht(200);
  let n = mails.length; // de uitnodiging zelf is een mail
  const tomVoor = (await lidVan(TOM))[0].uitnodiging;
  r = await vergeten(P, TOM);
  assert.deepEqual(await r.json(), UNIFORM);
  await geenMailErbij(n, "geen link voor wie nog geen login heeft");
  assert.deepEqual((await lidVan(TOM))[0].uitnodiging, tomVoor, "de uitnodiging is niet aangeraakt");
  assert.equal((await lidVan(KARIN))[0].uitnodiging, undefined, "en bij Karin is niets klaargezet");

  // ---- 2c. een login met dit adres: zelfde antwoord, één mail met een link van een uur ----
  r = await vergeten(P, "Karin@Vergeet.invalid ");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), UNIFORM, "het antwoord is hetzelfde als bij een onbekend adres");
  await wachtOpMails(n + 1);
  const m1 = mails[n];
  assert.deepEqual(m1.to, [KARIN]);
  assert.equal(m1.subject, "Nieuw wachtwoord kiezen voor Fysiplan (" + P + ")");
  assert.match(m1.text, /^Hallo Karin,/);
  assert.match(m1.text, /een uur geldig en werkt één keer/);
  assert.match(m1.text, /Heb je dit niet aangevraagd\? Dan hoef je niets te doen/);
  assert.match(m1.text, /hulp@fysiplan\.invalid/, "met het contactadres");
  assert.doesNotMatch(m1.text, /tweede stap/, "deze login heeft geen tweede stap en de praktijk vraagt er geen");
  const t1 = tokenUit(m1);
  assert.ok(t1, "de mail bevat de link");
  let u = (await lidVan(KARIN))[0].uitnodiging;
  assert.equal(u.hash, sha(t1), "op schijf staat alleen de hash");
  assert.equal(u.herstel, true);
  assert.equal(u.zelf, true);
  assert.ok(u.verloopt > Date.now() + 58 * 60000 && u.verloopt <= Date.now() + 60 * 60000, "een uur geldig");
  assert.doesNotMatch(JSON.stringify(await accounts()), new RegExp(t1), "het token zelf staat nergens");
  // tot gebruik verandert er niets
  assert.equal((await login({ praktijk: P, email: KARIN, wachtwoord: "karin-wachtwoord" })).status, 200, "het oude wachtwoord werkt nog");
  assert.equal((await kaarten(P, K)).status, 200, "en de sessie ook");
  let act = await activiteit(P, K);
  assert.ok(act.some((a) => a.actie === "wachtwoord-vergeten-mail" && a.wie === "Karin Beheer"), "de aanvraag staat in Activiteit, bij de login waar het om gaat");
  // de pagina achter de link
  r = await pagina(t1);
  assert.equal(r.status, 200);
  let html = await r.text();
  assert.match(html, /Kies een nieuw wachtwoord\./);
  assert.match(html, /is een nieuw wachtwoord aangevraagd/);
  assert.match(html, /karin@vergeet\.invalid/);
  assert.doesNotMatch(html, /Fysiplan-beheer heeft je deze link gestuurd/, "geen tekst van de herstelmail van beheer");
  assert.doesNotMatch(html, /tweede stap/);
  // alleen een nieuw wachtwoord: geen naamveld en geen werkregels opnieuw
  assert.match(html, /name="wachtwoord" type="password"[^>]*autocomplete="new-password"/);
  assert.doesNotMatch(html, /name="naam"|name="regels"|Werkregels/, "de pagina vraagt de naam en de werkregels niet opnieuw");
  assert.match(html, /<input type="email" value="karin@vergeet\.invalid" autocomplete="username" readonly hidden\/>/, "een wachtwoordmanager ziet bij welk adres het nieuwe wachtwoord hoort");

  // ---- 2d. een nieuwe aanvraag maakt de vorige link ongeldig ----
  r = await vergeten(P, KARIN);
  assert.deepEqual(await r.json(), UNIFORM);
  await wachtOpMails(n + 2);
  const t2 = tokenUit(mails[n + 1]);
  assert.notEqual(t2, t1);
  r = await pagina(t1);
  assert.equal(r.status, 404, "de eerste link werkt niet meer");
  assert.match(await r.text(), /Deze link werkt niet meer\./);
  r = await kiesWachtwoord(t1, "via-de-oude-link");
  assert.equal(r.status, 404);
  assert.equal((await login({ praktijk: P, email: KARIN, wachtwoord: "via-de-oude-link" })).status, 403);

  // ---- 2e. de link gebruiken: nieuw wachtwoord, oude sessies van deze login weg, één keer ----
  const karinVoor = (await lidVan(KARIN))[0];
  assert.equal(karinVoor.naam, "Karin Beheer");
  assert.ok(karinVoor.regels && karinVoor.regels.t, "Karin ging bij het maken van haar login akkoord met de werkregels");
  r = await kiesWachtwoord(t2, "kort");
  assert.equal(r.status, 400, "een te kort wachtwoord wordt geweigerd en de link blijft bruikbaar");
  html = await r.text();
  assert.match(html, /Kies een wachtwoord van minstens 8 tekens\./);
  assert.doesNotMatch(html, /name="naam"|name="regels"/, "ook met de melding erbij blijft het de korte pagina");
  // alleen het token en het wachtwoord; een meegestuurde naam telt niet
  r = await kiesWachtwoord(t2, "karin-nieuw-wachtwoord", { naam: "Iemand Anders" });
  assert.equal(r.status, 200, await r.clone().text());
  assert.match(await r.text(), /Je nieuwe wachtwoord staat klaar\./);
  const karinNa = (await lidVan(KARIN))[0];
  assert.equal(karinNa.naam, "Karin Beheer", "de naam van de login is niet veranderd");
  assert.deepEqual(karinNa.regels, karinVoor.regels, "het akkoord op de werkregels staat er nog, met de datum van toen");
  assert.notEqual(karinNa.hash, karinVoor.hash);
  assert.equal((await login({ praktijk: P, email: KARIN, wachtwoord: "karin-wachtwoord" })).status, 403, "het oude wachtwoord werkt niet meer");
  r = await login({ praktijk: P, email: KARIN, wachtwoord: "karin-nieuw-wachtwoord" });
  assert.equal(r.status, 200, "het nieuwe wel");
  const K2 = ses(await r.json());
  assert.equal((await kaarten(P, K)).status, 401, "wie nog met het oude wachtwoord was ingelogd, is uitgelogd");
  assert.equal((await kaarten(P, G)).status, 200, "een andere sessie van de praktijk niet");
  assert.equal((await pagina(t2)).status, 404, "de link werkt één keer");
  assert.equal((await lidVan(KARIN))[0].uitnodiging, undefined);
  act = await activiteit(P, K2);
  assert.ok(act.some((a) => a.actie === "wachtwoord-hersteld-per-mail" && a.wie === "Karin Beheer"), "het nieuwe wachtwoord staat in Activiteit");

  // ---- 2f. op slot na te veel foute wachtwoorden: de link haalt de rem van dit adres weg ----
  for (let i = 0; i < 10; i++) assert.equal((await login({ praktijk: P, email: KARIN, wachtwoord: "fout-" + i })).status, 403);
  assert.equal((await login({ praktijk: P, email: KARIN, wachtwoord: "karin-nieuw-wachtwoord" })).status, 429, "op slot, ook met het goede wachtwoord");
  r = await vergeten(P, KARIN);
  assert.deepEqual(await r.json(), UNIFORM);
  await wachtOpMails(n + 3);
  r = await kiesWachtwoord(tokenUit(mails[n + 2]), "karin-derde-wachtwoord");
  assert.equal(r.status, 200);
  assert.equal((await login({ praktijk: P, email: KARIN, wachtwoord: "karin-derde-wachtwoord" })).status, 200, "na de link meteen weer inloggen");

  // ---- 2g. rem per adres: de vierde aanvraag binnen het uur stuurt niets, het antwoord blijft gelijk ----
  r = await vergeten(P, KARIN);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), UNIFORM);
  await geenMailErbij(n + 3, "hooguit drie mails per uur naar één adres");
  assert.equal((await lidVan(KARIN))[0].uitnodiging, undefined, "en er staat geen link klaar die niemand kreeg");
  n = mails.length;

  // ---- 2h. een lopende herstelmail van beheer blijft geldig en wordt niet overschreven ----
  const PB = "Fysio Beheerlink", BAS = "bas@beheerlink.invalid";
  await praktijkMet(PB, BAS, "Bas Beheer", "bas-wachtwoord");
  r = await post("/api/beheer/praktijk-herstel", { praktijk: PB, reden: "Praktijk belde: wachtwoord en telefoon kwijt", tweedeStap: true }, A);
  assert.equal(r.status, 200, await r.clone().text());
  await wachtOpMails(n + 1);
  const tBeheer = tokenUit(mails[n]);
  const vanBeheer = (await lidVan(BAS))[0].uitnodiging;
  assert.equal(vanBeheer.zelf, undefined);
  r = await vergeten(PB, BAS);
  assert.deepEqual(await r.json(), UNIFORM);
  await geenMailErbij(n + 1, "geen tweede link naast die van beheer");
  assert.deepEqual((await lidVan(BAS))[0].uitnodiging, vanBeheer, "de link van beheer staat er nog");
  r = await pagina(tBeheer);
  assert.equal(r.status, 200, "en werkt nog");
  html = await r.text();
  assert.match(html, /Fysiplan-beheer heeft je deze link gestuurd/);
  assert.match(html, /name="naam"[\s\S]*name="regels"/, "de pagina van beheer is niet veranderd: naam en werkregels");
  r = await formulier("/v2/uitnodiging", { t: tBeheer, wachtwoord: "bas-zonder-naam", regels: "1" });
  assert.equal(r.status, 400, "zonder naam slaat hij niets op");
  r = await formulier("/v2/uitnodiging", { t: tBeheer, naam: "Bas Beheer", wachtwoord: "bas-zonder-regels" });
  assert.equal(r.status, 400, "en zonder de werkregels ook niet");
  assert.equal((await login({ praktijk: PB, email: BAS, wachtwoord: "bas-zonder-regels" })).status, 403);
  assert.equal((await login({ praktijk: PB, email: BAS, wachtwoord: "bas-wachtwoord" })).status, 200, "het oude wachtwoord van Bas werkt nog");
  n = mails.length;

  // ---- 2i. twee praktijken met dezelfde naam en hetzelfde adres: elk een eigen link ----
  const PD = "Fysio Dubbel", DUB = "dubbel@dubbel.invalid";
  await praktijkMet(PD, DUB, "Dana Dubbel", "dubbel-wachtwoord-een");
  await praktijkMet(PD, DUB, "Dana Dubbel", "dubbel-wachtwoord-twee", { nieuw: true });
  r = await vergeten(PD, DUB);
  assert.deepEqual(await r.json(), UNIFORM);
  await wachtOpMails(n + 2);
  const [d1, d2] = [tokenUit(mails[n]), tokenUit(mails[n + 1])];
  assert.notEqual(d1, d2);
  assert.deepEqual((await lidVan(DUB)).map((l) => l.uitnodiging.hash).sort(), [sha(d1), sha(d2)].sort(), "elke login zijn eigen link");
  n = mails.length;

  // ---- 2j. mailstoring: zelfde antwoord, en er blijft geen link achter die niemand kreeg ----
  const PS = "Fysio Storing", STO = "sanne@storing.invalid";
  const { S: SA } = await praktijkMet(PS, STO, "Sanne Storing", "sanne-wachtwoord");
  mailStuk = true;
  r = await vergeten(PS, STO);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), UNIFORM, "een storing bij de mail verandert het antwoord niet");
  await wacht(400);
  mailStuk = false;
  assert.equal(mails.length, n);
  // iets anders bewaart daarna de accounts (een uitnodiging): ook dan staat er geen link bij Sanne
  r = await post("/api/praktijk/team/uitnodigen", { email: "collega@storing.invalid", naam: "Cas", rol: "therapeut" }, SA);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await lidVan(STO))[0].uitnodiging, undefined, "de link die niemand kreeg is teruggedraaid");
  assert.equal((await login({ praktijk: PS, email: STO, wachtwoord: "sanne-wachtwoord" })).status, 200);
  await wacht(200);
  n = mails.length; // de uitnodiging aan de collega is ook een mail

  // ---- 2k. rem per verbinding: de zevende aanvraag binnen het uur krijgt 429 ----
  const vast = { "x-forwarded-for": "10.92.0.7" };
  for (let i = 0; i < 6; i++) assert.equal((await vergeten(P, "niemand-" + i + "@elders.invalid", vast)).status, 200);
  r = await vergeten(P, "niemand-7@elders.invalid", vast);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.equal((await vergeten(P, "niemand-8@elders.invalid")).status, 200, "een andere verbinding merkt er niets van");

  // ---- 3. een verlopen link: uitleg waar een nieuwe vandaan komt, en er verandert niets ----
  r = await vergeten(PS, STO);
  assert.deepEqual(await r.json(), UNIFORM);
  await wachtOpMails(n + 1);
  const tOud = tokenUit(mails[n]);
  n = mails.length;
  await wacht(150); // de server bewaart het account na het versturen
  await stop(app);
  const alle = await accounts();
  for (const a of Object.values(alle)) for (const l of a.leden || []) if (l.email === STO) { assert.equal(l.uitnodiging.zelf, true); l.uitnodiging.verloopt = Date.now() - 1000; }
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(alle));

  // ---- 4. met de eigen login voor iedereen: de tweede stap blijft staan ----
  app = await start({ EIGEN_LOGIN_VERPLICHT: "aan" });
  r = await pagina(tOud);
  assert.equal(r.status, 404);
  html = await r.text();
  assert.match(html, /De link was een uur geldig\./);
  assert.match(html, /Wachtwoord vergeten\?/, "en zegt waar je een nieuwe aanvraagt");
  assert.equal((await kiesWachtwoord(tOud, "via-verlopen-link")).status, 404);

  const PN = "Fysio Stap", LOT = "lot@stap.invalid";
  r = await post("/api/praktijk/claim", { praktijk: PN, naam: "Lot Visser", email: LOT, wachtwoord: "lot-wachtwoord", akkoord: true, regels: true });
  assert.equal(r.status, 200, await r.clone().text());
  const inst = await r.json();
  assert.equal(inst.stapInstellen, true);
  r = await login({ praktijk: PN, email: LOT, wachtwoord: "lot-wachtwoord", geheim: inst.geheim, code: vers(inst.geheim) });
  assert.equal(r.status, 200, await r.clone().text());
  const L = ses(await r.json());
  const totpVoor = (await lidVan(LOT))[0].totp;
  assert.ok(totpVoor && totpVoor.geheim, "Lot heeft een tweede stap");
  // een collega die de uitnodiging aannam maar de tweede stap nog niet instelde: de link geeft
  // een nieuw wachtwoord, en het instellen hoort daarna nog steeds bij het inloggen
  const MIA = "mia@stap.invalid";
  r = await post("/api/praktijk/team/uitnodigen", { email: MIA, naam: "Mia Nieuw", rol: "therapeut" }, L);
  assert.equal(r.status, 200, await r.clone().text());
  await wachtOpMails(n + 1);
  r = await formulier("/v2/uitnodiging", { t: tokenUit(mails[n]), naam: "Mia Nieuw", wachtwoord: "mia-wachtwoord", regels: "1" });
  assert.equal(r.status, 200, await r.clone().text());
  n = mails.length;
  r = await vergeten(PN, MIA);
  assert.deepEqual(await r.json(), UNIFORM);
  await wachtOpMails(n + 1);
  assert.match(mails[n].text, /stel je daarna je tweede stap in \(een code-app op je telefoon\)/);
  assert.doesNotMatch(mails[n].text, /blijft zoals hij is/, "er is nog geen tweede stap om te laten staan");
  const tMia = tokenUit(mails[n]);
  html = await (await pagina(tMia)).text();
  assert.match(html, /Bij het inloggen stel je daarna je tweede stap in/);
  assert.doesNotMatch(html, /blijft zoals hij is/);
  r = await kiesWachtwoord(tMia, "mia-nieuw-wachtwoord");
  assert.equal(r.status, 200, await r.clone().text());
  r = await login({ praktijk: PN, email: MIA, wachtwoord: "mia-nieuw-wachtwoord" });
  assert.equal(r.status, 401, "geen sessie zonder tweede stap, ook niet na de link");
  assert.equal((await r.json()).stapInstellen, true, "het instellen hoort nog bij het inloggen");
  assert.equal((await lidVan(MIA))[0].totp, undefined);
  n = mails.length;
  r = await vergeten(PN, LOT);
  assert.deepEqual(await r.json(), UNIFORM);
  await wachtOpMails(n + 1);
  assert.match(mails[n].text, /Je tweede stap \(de code uit je code-app\) blijft zoals hij is/);
  const tLot = tokenUit(mails[n]);
  assert.match(await (await pagina(tLot)).text(), /Je tweede stap \(de code uit je code-app\) blijft zoals hij is\./);
  r = await kiesWachtwoord(tLot, "lot-nieuw-wachtwoord");
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await kaarten(PN, L)).status, 401, "de oude sessie is weg");
  assert.deepEqual((await lidVan(LOT))[0].totp, totpVoor, "de tweede stap is niet aangeraakt");
  r = await login({ praktijk: PN, email: LOT, wachtwoord: "lot-nieuw-wachtwoord" });
  assert.equal(r.status, 401, "met alleen het nieuwe wachtwoord is er geen sessie");
  assert.equal((await r.json()).tweedeStap, true);
  r = await login({ praktijk: PN, email: LOT, wachtwoord: "lot-nieuw-wachtwoord", code: vers(inst.geheim) });
  assert.equal(r.status, 200, "met de code uit de code-app wel: " + await r.clone().text());
  await stop(app);

  // ---- 5. zonder mail op de server: eerlijk zeggen dat het niet kan ----
  app = await start({ MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" });
  r = await vergeten(P, KARIN);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).geenMail, true);

  assert.doesNotMatch(log, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-wachtwoord-vergeten: ok (zelfde antwoord voor elk adres, link van een uur naar het eigen adres, één keer te gebruiken, tweede stap blijft, remmen per adres en per verbinding, link van beheer blijft)");
} catch (e) {
  console.error(log.slice(-2500));
  throw e;
} finally {
  app.kill();
  mailApi.close();
  await wacht(200);
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
