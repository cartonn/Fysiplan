// Platformreview 2026-11-11, "één beheersleutel met een omweg naar patiëntgegevens".
// Gemeten: met de beheersleutel gaf kaarten opvragen van een beveiligde praktijk 401, maar na
// POST /api/praktijk/reset (account van de praktijk gewist) gaf hetzelfde verzoek 200 met alle
// kaarten, en de praktijk zelf kon niet meer inloggen. Er bleef één logregel achter.
//
// Nu:
// - /api/praktijk/reset wist niets meer (410). Een praktijk met gegevens wordt nooit onbeveiligd,
//   dus de beheersleutel komt ook daarna niet bij haar kaarten.
// - Hulp aan een praktijk die er niet meer in komt gaat via POST /api/beheer/praktijk-herstel:
//   een herstelmail naar een adres dat de praktijk zelf opgaf (beheerders met een eigen login,
//   anders de aanmelder van de proef), met een verplichte reden die in de mail en in het logboek
//   van de praktijk staat. De link of code komt nooit terug in het antwoord aan beheer.
// - Tot de praktijk de mail gebruikt verandert er niets: wachtwoorden en sessies blijven werken.
// - Zonder eigen adres van de praktijk, zonder mail of bij een mislukte verzending: geen herstel
//   en geen wijziging.
// Nepmail-API op localhost; zonder browser, past in CI. `npm run test:beheerherstel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-beheerherstel-"));
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const A = { "x-admin-sleutel": SLEUTEL };
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function start(env = {}) {
  const port = await vrijePoort();
  origin = `http://127.0.0.1:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", FYSIPLAN_CONTACT: "hulp@fysiplan.invalid",
    MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: mailUrl, ...env };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY)/.test(k) || k === "NODE_ENV") delete kind[k];
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.83." + ((ip >> 8) & 255) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.84.0." + (ip++ & 255), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const kaartenVan = (praktijk, extra) => get("/api/kaarten?praktijk=" + encodeURIComponent(praktijk), extra);
const herstelMails = () => mails.filter((m) => /Herstelcode voor Fysiplan|Nieuw wachtwoord kiezen/.test(m.subject || ""));
const kaart = (praktijk, S, naam) => post("/api/kaarten", { praktijk, naam, client: { c_naam: naam },
  chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S);
const herstel = (praktijk, reden, extra = A) => post("/api/beheer/praktijk-herstel", { praktijk, ...(reden === undefined ? {} : { reden }) }, extra);
const REDEN = "Praktijk belde: wachtwoord en herstelcode kwijt";

let app = await start();
try {
  // ---- 1. de omweg uit de review is dicht ----
  const P1 = "Fysio Zonder Adres";
  let r = await post("/api/praktijk/claim", { praktijk: P1, wachtwoord: "wachtwoord-een", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const S1 = ses(await r.json());
  assert.ok((await (await kaart(P1, S1, "Truus B.")).json()).id, "de praktijk deelt een kaart");

  assert.equal((await kaartenVan(P1, A)).status, 401, "de beheersleutel leest de kaarten van een beveiligde praktijk niet");
  const voor1 = await readFile(join(dataDir, "praktijk-accounts.json"), "utf8");
  r = await post("/api/praktijk/reset", { praktijk: P1 }, A);
  assert.equal(r.status, 410, "het account van een praktijk wissen met de beheersleutel bestaat niet meer (was 200)");
  assert.match((await r.json()).fout, /praktijk-herstel/, "het antwoord wijst naar de herstelmail");
  assert.equal(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"), voor1, "het account staat er nog precies zo");
  r = await kaartenVan(P1, A);
  assert.equal(r.status, 401, "ook na de oude reset komt de beheersleutel niet bij de kaarten (was 200 met alle kaarten)");
  assert.doesNotMatch(await r.text(), /Truus/, "geen kaartgegevens in het antwoord");
  assert.equal((await post("/api/praktijk/login", { praktijk: P1, wachtwoord: "wachtwoord-een" })).status, 200, "de praktijk logt nog gewoon in (was 403)");
  r = await kaartenVan(P1, S1);
  assert.equal(r.status, 200, "de sessie van de praktijk werkt nog");
  assert.equal((await r.json()).length, 1);
  r = await post("/api/praktijk/claim", { praktijk: P1, wachtwoord: "van-een-ander", akkoord: true });
  assert.equal(r.status, 409, "niemand beveiligt de naam opnieuw en krijgt de kaarten erbij");

  // zonder of met een foute sleutel: beide routes dicht
  assert.equal((await post("/api/praktijk/reset", { praktijk: P1 })).status, 403);
  assert.equal((await herstel(P1, REDEN, {})).status, 403, "herstel aanvragen kan alleen beheer");
  assert.equal((await herstel(P1, REDEN, { "x-admin-sleutel": "fout" })).status, 403);
  assert.equal((await herstel(P1, REDEN, S1)).status, 403, "ook de praktijk zelf niet via deze route");

  // ---- 2. herstel vraagt een reden, een bestaande praktijk en een eigen adres van de praktijk ----
  r = await herstel(P1);
  assert.equal(r.status, 400, "zonder reden geen herstel");
  assert.equal((await r.json()).reden, true);
  assert.equal((await herstel(P1, "te kort")).status, 400, "een reden van een paar tekens is geen reden");
  assert.equal((await herstel("Bestaat Niet", REDEN)).status, 404);
  r = await herstel(P1, REDEN);
  assert.equal(r.status, 409, "geen beheerder met eigen login en geen proefaanmelding: geen herstel via deze weg");
  assert.equal((await r.json()).geenAdres, true);
  assert.equal(herstelMails().length, 0, "er is niets gemaild");
  assert.equal(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"), voor1, "en niets veranderd");

  // ---- 3. praktijkwachtwoord, adres uit de proefaanmelding: herstelcode per mail ----
  const P2 = "Fysio Met Proef";
  r = await formulier("/v2/proef", { email: "eigenaar@metproef.invalid", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: P2, akkoord: "1", vwo: "1" });
  assert.equal(r.status, 303, "proef gestart: " + r.status);
  const proefCookie = (r.headers.get("set-cookie") || "").split(";")[0];
  assert.match(proefCookie, /^fpproef=[a-f0-9]{48}$/);
  r = await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "wachtwoord-twee", akkoord: true }, { cookie: proefCookie });
  assert.equal(r.status, 200, await r.clone().text());
  const claim2 = await r.json();
  const S2 = ses(claim2), papierCode = claim2.herstelcode;
  assert.ok((await (await kaart(P2, S2, "Karel V.")).json()).id);

  r = await herstel(P2, REDEN);
  const tekst2 = await r.clone().text();
  assert.equal(r.status, 200, tekst2);
  let j = await r.json();
  assert.equal(j.soort, "herstelcode");
  assert.equal(j.verstuurd, 1);
  assert.deepEqual(j.naar, ["e***@metproef.invalid"], "beheer ziet waar de mail heen ging, niet het hele adres");
  assert.doesNotMatch(tekst2, /FP-[0-9a-f]{5}/i, "de herstelcode staat niet in het antwoord aan beheer");
  assert.ok(Date.parse(j.geldigTot) - Date.now() > 47 * 3600e3 && Date.parse(j.geldigTot) - Date.now() <= 48 * 3600e3, "48 uur geldig");
  assert.equal(herstelMails().length, 1);
  const m2 = herstelMails()[0];
  assert.deepEqual(m2.to, ["eigenaar@metproef.invalid"], "de mail gaat naar het adres dat de praktijk zelf opgaf");
  assert.match(m2.subject, /^Herstelcode voor Fysiplan \(Fysio Met Proef\)$/);
  assert.ok(m2.text.includes(REDEN), "de reden van beheer staat in de mail");
  assert.match(m2.text, /Hallo Sanne,/);
  assert.match(m2.text, /niet om gevraagd\? Dan hoef je niets te doen/);
  assert.match(m2.text, /hulp@fysiplan\.invalid/, "met het adres waar de praktijk het kan melden");
  const mailCode = (m2.text.match(/FP-[0-9a-f]{5}(?:-[0-9a-f]{5}){3}/) || [])[0];
  assert.ok(mailCode, "de mail bevat een herstelcode");
  assert.notEqual(mailCode, papierCode);
  const acc2 = Object.values(await accounts()).find((a) => a.naam === P2);
  assert.ok(acc2.herstelMail && /^scrypt\$/.test(acc2.herstelMail.hash), "de code staat alleen als hash op schijf");
  assert.ok(!JSON.stringify(acc2).includes(mailCode));

  // er is verder niets veranderd: wachtwoord, sessie en het slot voor beheer
  assert.equal((await post("/api/praktijk/login", { praktijk: P2, wachtwoord: "wachtwoord-twee" })).status, 200, "het oude wachtwoord werkt nog");
  assert.equal((await kaartenVan(P2, S2)).status, 200, "de sessie van de praktijk werkt nog");
  assert.equal((await kaartenVan(P2, A)).status, 401, "beheer komt nog steeds niet bij de kaarten");

  // de praktijk ziet het in haar eigen logboek, met de reden
  let act = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P2), S2)).json()).activiteit;
  const regel = act.find((a) => a.actie === "herstel-door-beheer");
  assert.ok(regel && regel.wie.includes("Fysiplan-beheer") && regel.wie.includes(REDEN), "logboek van de praktijk: " + JSON.stringify(act));

  // met de code uit de mail kiest de praktijk een nieuw wachtwoord
  assert.equal((await post("/api/praktijk/herstel", { praktijk: P2, herstelcode: "FP-00000-00000-00000-00000", nieuw: "wachtwoord-nieuw" })).status, 403, "een verzonnen code werkt niet");
  r = await post("/api/praktijk/herstel", { praktijk: P2, herstelcode: mailCode.toLowerCase().replace(/-/g, " "), nieuw: "wachtwoord-nieuw" });
  assert.equal(r.status, 200, await r.clone().text());
  j = await r.json();
  assert.ok(j.sessie && /^FP-/.test(j.herstelcode), "nieuwe sessie en een nieuwe eigen herstelcode");
  const S2b = ses(j);
  assert.equal((await kaartenVan(P2, S2b)).status, 200);
  assert.equal((await kaartenVan(P2, S2)).status, 401, "de oude sessie met het praktijkwachtwoord is vervallen");
  assert.equal((await post("/api/praktijk/login", { praktijk: P2, wachtwoord: "wachtwoord-twee" })).status, 403, "het oude wachtwoord werkt niet meer");
  assert.equal((await post("/api/praktijk/login", { praktijk: P2, wachtwoord: "wachtwoord-nieuw" })).status, 200);
  assert.equal((await post("/api/praktijk/herstel", { praktijk: P2, herstelcode: mailCode, nieuw: "wachtwoord-derde" })).status, 403, "de code uit de mail werkt één keer");
  assert.equal(Object.values(await accounts()).find((a) => a.naam === P2).herstelMail, undefined, "en is van schijf");
  act = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P2), S2b)).json()).activiteit;
  assert.ok(act.some((a) => a.actie === "wachtwoord-hersteld-per-mail"), "het logboek toont dat de herstelmail gebruikt is");

  // de eigen (papieren) code van de praktijk blijft naast een herstelmail werken, en wie het
  // wachtwoord daarna zelf wijzigt, maakt de code uit de mail ongeldig
  const P3 = "Fysio Papier";
  r = await formulier("/v2/proef", { email: "eigenaar@papier.invalid", email_ok: "1", naam: "Joost Bakker", tel: "06 1234 5670", praktijk: P3, akkoord: "1", vwo: "1" });
  const cookie3 = (r.headers.get("set-cookie") || "").split(";")[0];
  r = await post("/api/praktijk/claim", { praktijk: P3, wachtwoord: "wachtwoord-drie", akkoord: true }, { cookie: cookie3 });
  const claim3 = await r.json();
  assert.equal((await herstel(P3, REDEN)).status, 200);
  const code3 = (herstelMails().at(-1).text.match(/FP-[0-9a-f]{5}(?:-[0-9a-f]{5}){3}/) || [])[0];
  r = await post("/api/praktijk/wachtwoord", { praktijk: P3, huidig: "wachtwoord-drie", nieuw: "wachtwoord-drie-b" }, ses(claim3));
  assert.equal(r.status, 200, "de praktijk wijzigt zelf het wachtwoord");
  assert.equal((await post("/api/praktijk/herstel", { praktijk: P3, herstelcode: code3, nieuw: "wachtwoord-kaper" })).status, 403, "de code uit de mail is daarna ongeldig");
  r = await post("/api/praktijk/herstel", { praktijk: P3, herstelcode: claim3.herstelcode, nieuw: "wachtwoord-drie-c" });
  assert.equal(r.status, 200, "de eigen herstelcode van de praktijk werkt nog");

  // ---- 4. beheerders met een eigen login: een link om een nieuw wachtwoord te kiezen ----
  const P4 = "Fysio Eigen Login";
  r = await post("/api/praktijk/claim", { praktijk: P4, wachtwoord: "wachtwoord-vier", akkoord: true });
  const G4 = ses(await r.json());
  r = await post("/api/praktijk/team/eigen-login", { naam: "Karin Jansen", email: "karin@eigenlogin.invalid", wachtwoord: "karin-wachtwoord", regels: true }, G4);
  assert.equal(r.status, 200, await r.clone().text());
  const ej = await r.json();
  const K4 = ses(ej), karinId = ej.ik.id;
  // een tweede beheerder en een therapeut via een gewone uitnodiging
  const nodigUit = async (email, naam, rol) => {
    const u = await (await post("/api/praktijk/team/uitnodigen", { email, naam, rol }, K4)).json();
    const t = new URL(u.link).searchParams.get("t");
    const pagina = await (await fetch(origin + "/v2/uitnodiging?t=" + t, { headers: { "x-forwarded-for": "10.85.0." + (ip++ & 255) } })).text();
    assert.match(pagina, /Kies je eigen wachtwoord\./, "een gewone uitnodiging houdt haar eigen tekst");
    assert.doesNotMatch(pagina, /__[A-Z_]+__/, "geen open plekken in de pagina");
    const aan = await formulier("/v2/uitnodiging", { t, naam, wachtwoord: naam.toLowerCase().split(" ")[0] + "-wachtwoord", regels: "1" });
    assert.ok(aan.status < 400, "uitnodiging aannemen: " + aan.status);
    return u.lid.id;
  };
  await nodigUit("mark@eigenlogin.invalid", "Mark Visser", "beheerder");
  await nodigUit("lot@eigenlogin.invalid", "Lot Smit", "therapeut");
  assert.equal((await post("/api/praktijk/team/gedeeld-uit", { uit: true }, K4)).status, 200, "het praktijkwachtwoord gaat uit");
  assert.ok((await (await kaart(P4, K4, "Henk D.")).json()).id);

  const mailsVoor = mails.length;
  r = await herstel(P4, REDEN);
  const tekst4 = await r.clone().text();
  assert.equal(r.status, 200, tekst4);
  j = await r.json();
  assert.equal(j.soort, "eigen-login");
  assert.equal(j.verstuurd, 2, "elke beheerder met een eigen login krijgt de mail, de therapeut niet");
  assert.deepEqual([...j.naar].sort(), ["k***@eigenlogin.invalid", "m***@eigenlogin.invalid"]);
  assert.doesNotMatch(tekst4, /[a-f0-9]{48}/, "de link staat niet in het antwoord aan beheer");
  const nieuw4 = mails.slice(mailsVoor);
  assert.deepEqual(nieuw4.map((m) => m.to[0]).sort(), ["karin@eigenlogin.invalid", "mark@eigenlogin.invalid"]);
  const mKarin = nieuw4.find((m) => m.to[0] === "karin@eigenlogin.invalid");
  assert.match(mKarin.subject, /^Nieuw wachtwoord kiezen voor Fysiplan \(Fysio Eigen Login\)$/);
  assert.match(mKarin.text, /Hallo Karin,/);
  assert.ok(mKarin.text.includes(REDEN));
  const link4 = (mKarin.text.match(/http:\/\/[^\s]+\/v2\/uitnodiging\?t=[a-f0-9]{48}/) || [])[0];
  assert.ok(link4, "de mail bevat de link: " + mKarin.text);
  const t4 = new URL(link4).searchParams.get("t");
  assert.ok(!JSON.stringify(await accounts()).includes(t4), "de link staat alleen als hash op schijf");

  // tot de link gebruikt is, verandert er niets
  assert.equal((await post("/api/praktijk/login", { email: "karin@eigenlogin.invalid", wachtwoord: "karin-wachtwoord" })).status, 200, "Karins oude wachtwoord werkt nog");
  assert.equal((await kaartenVan(P4, K4)).status, 200, "Karins sessie werkt nog");
  assert.equal((await kaartenVan(P4, A)).status, 401, "beheer komt niet bij de kaarten");
  let team = await (await get("/api/praktijk/team", K4)).json();
  assert.equal(team.leden.find((l) => l.id === karinId).status, "actief", "Karin blijft een actief lid");

  // de pagina achter de link, en een nieuw wachtwoord kiezen
  const pagina4 = await (await fetch(origin + "/v2/uitnodiging?t=" + t4, { headers: { "x-forwarded-for": "10.85.1.1" } })).text();
  assert.match(pagina4, /Kies een nieuw wachtwoord\./);
  assert.match(pagina4, /karin@eigenlogin\.invalid/);
  assert.match(pagina4, /value="Karin Jansen"/, "de naam staat al ingevuld");
  assert.doesNotMatch(pagina4, /__[A-Z_]+__/, "geen open plekken in de pagina");
  r = await formulier("/v2/uitnodiging", { t: t4, naam: "Karin Jansen", wachtwoord: "kort", regels: "1" });
  assert.equal(r.status, 400, "een te kort wachtwoord wordt geweigerd");
  r = await formulier("/v2/uitnodiging", { t: t4, naam: "Karin Jansen", wachtwoord: "karin-nieuw-wachtwoord", regels: "1" });
  assert.equal(r.status, 200, "nieuw wachtwoord gekozen: " + r.status);
  assert.match(await r.text(), /Je nieuwe wachtwoord staat klaar\./);
  assert.equal((await kaartenVan(P4, K4)).status, 401, "de sessie met het oude wachtwoord is vervallen");
  assert.equal((await post("/api/praktijk/login", { email: "karin@eigenlogin.invalid", wachtwoord: "karin-wachtwoord" })).status, 403, "het oude wachtwoord werkt niet meer");
  r = await post("/api/praktijk/login", { email: "karin@eigenlogin.invalid", wachtwoord: "karin-nieuw-wachtwoord" });
  assert.equal(r.status, 200, "inloggen met het nieuwe wachtwoord");
  const K4b = ses(await r.json());
  team = await (await get("/api/praktijk/team", K4b)).json();
  const karin = team.leden.find((l) => l.id === karinId);
  assert.ok(karin && karin.rol === "beheerder" && karin.status === "actief", "zelfde lid, nog steeds beheerder");
  assert.equal((await fetch(origin + "/v2/uitnodiging?t=" + t4, { headers: { "x-forwarded-for": "10.85.1.2" } })).status, 404, "de link werkt één keer");
  act = (await (await get("/api/praktijk/activiteit", K4b)).json()).activiteit;
  assert.ok(act.some((a) => a.actie === "herstel-door-beheer" && (a.wie || "").includes(REDEN)));
  assert.ok(act.some((a) => a.actie === "wachtwoord-hersteld-per-mail" && a.wie === "Karin Jansen"));
  // Mark gebruikte zijn link niet: zijn wachtwoord werkt gewoon door
  assert.equal((await post("/api/praktijk/login", { email: "mark@eigenlogin.invalid", wachtwoord: "mark-wachtwoord" })).status, 200);

  // ---- 5. rem: hooguit drie herstelmails per praktijk per dag ----
  // (Karin kreeg er al één; het adres zelf krijgt hooguit drie mails per uur)
  assert.equal((await herstel(P4, REDEN)).status, 200);
  const t4b = new URL(mails.filter((m) => m.to[0] === "karin@eigenlogin.invalid").at(-1).text.match(/http:\/\/[^\s]+\/v2\/uitnodiging\?t=[a-f0-9]{48}/)[0]).searchParams.get("t");
  assert.equal((await herstel(P4, REDEN)).status, 200);
  assert.equal((await fetch(origin + "/v2/uitnodiging?t=" + t4b, { headers: { "x-forwarded-for": "10.85.1.3" } })).status, 404, "een nieuwere herstelmail maakt de vorige link ongeldig");
  const mailsVoorRem = mails.length;
  r = await herstel(P4, REDEN);
  assert.equal(r.status, 429, "de vierde aanvraag op één dag wordt geweigerd");
  assert.ok(r.headers.get("retry-after"));
  assert.equal(mails.length, mailsVoorRem, "en mailt niets");

  // ---- 6. de mail vertrekt niet: geen herstel en geen wijziging ----
  const P5 = "Fysio Mail Stuk";
  r = await formulier("/v2/proef", { email: "eigenaar@mailstuk.invalid", email_ok: "1", naam: "Bram Mol", tel: "06 1234 5671", praktijk: P5, akkoord: "1", vwo: "1" });
  const cookie5 = (r.headers.get("set-cookie") || "").split(";")[0];
  r = await post("/api/praktijk/claim", { praktijk: P5, wachtwoord: "wachtwoord-vijf", akkoord: true }, { cookie: cookie5 });
  assert.equal(r.status, 200);
  const voor5 = JSON.stringify(Object.values(await accounts()).find((a) => a.naam === P5));
  mailStuk = true;
  r = await herstel(P5, REDEN);
  mailStuk = false;
  assert.equal(r.status, 502, "mislukte verzending: " + r.status);
  assert.equal(JSON.stringify(Object.values(await accounts()).find((a) => a.naam === P5)), voor5, "het account is niet veranderd");

  // ---- 7. een verlopen code uit een herstelmail werkt niet (na een herstart, van schijf gelezen) ----
  assert.equal((await herstel(P5, REDEN)).status, 200);
  const code5 = (herstelMails().at(-1).text.match(/FP-[0-9a-f]{5}(?:-[0-9a-f]{5}){3}/) || [])[0];
  await stop(app);
  const alle = await accounts();
  const sleutel5 = Object.keys(alle).find((k) => alle[k].naam === P5);
  assert.ok(alle[sleutel5].herstelMail, "de openstaande code overleeft een herstart");
  alle[sleutel5].herstelMail.verloopt = Date.now() - 1000;
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(alle));
  app = await start();
  assert.equal((await post("/api/praktijk/herstel", { praktijk: P5, herstelcode: code5, nieuw: "wachtwoord-te-laat" })).status, 403, "na 48 uur werkt de code uit de mail niet meer");
  assert.equal((await post("/api/praktijk/login", { praktijk: P5, wachtwoord: "wachtwoord-vijf" })).status, 200, "het eigen wachtwoord van de praktijk werkt gewoon");

  // ---- 8. zonder mail op de server: geen herstel via deze weg ----
  await stop(app);
  app = await start({ MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" });
  r = await herstel(P5, REDEN);
  assert.equal(r.status, 503, "zonder mail: " + r.status);
  assert.equal((await kaartenVan(P1, A)).status, 401, "en de beheersleutel blijft buiten de kaarten");

  assert.doesNotMatch(log, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  console.log("test-beheer-herstel: ok (reset wist niets meer, herstel alleen per mail aan de praktijk zelf)");
} catch (e) {
  console.error(log.slice(-2500));
  throw e;
} finally {
  try { await stop(app); } catch {}
  mailApi.close();
  await rm(dataDir, { recursive: true, force: true });
}
