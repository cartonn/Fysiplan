// End-to-endtest van de gratis proef (/v2/proef): validatie, aanmelden, de app in
// proefstand, verlopen, "ik wil doorgaan", wissen en het beheeroverzicht.
// Draait tegen een eigen server met een lege datamap en een nagebootste
// maildienst; er gaat geen echte mail de deur uit. `npm run test:proef`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { valideerAanmelding, normaliseerTelefoon, telefoonWeergave, emailSuggestie } from "../lib/proef.js";

// ---- losse controles ----
assert.equal(normaliseerTelefoon("06-12 34 56 79"), "+31612345679");
assert.equal(normaliseerTelefoon("+31 (0)6 1234 5679"), "+31612345679");
assert.equal(normaliseerTelefoon("0031612345679"), "+31612345679");
assert.equal(normaliseerTelefoon("020 123 4567"), "+31201234567");
assert.equal(normaliseerTelefoon("+32 470 12 34 56"), "+32470123456");
assert.equal(normaliseerTelefoon("0612345"), "");
assert.equal(normaliseerTelefoon("0611111111"), "");
assert.equal(normaliseerTelefoon("06 1234 5678"), "");
assert.equal(normaliseerTelefoon("abc"), "");
// Sweep 2026-11-07 (Sanne, iPhone SE): het voorbeeld in placeholder en foutmelding mag zelf
// niet geweigerd worden, anders komt wie het voorbeeld overneemt nooit verder
{
  const proefHtml = await readFile(new URL("../public/proef.html", import.meta.url), "utf8");
  const ph = (proefHtml.match(/id="tel"[^>]*placeholder="([^"]*)"/) || [])[1] || "";
  const melding = valideerAanmelding({ email: "a@b.nl", naam: "Sanne", tel: "0612", akkoord: true, vwo: true }).fouten?.tel || "";
  for (const voorbeeld of [ph, melding]) for (const nr of voorbeeld.match(/(?:\+?\d[\d ]{8,}\d)/g) || [])
    assert.notEqual(normaliseerTelefoon(nr), "", "voorbeeldnummer wordt zelf geweigerd: " + nr);
  assert.ok(melding, "foutmelding bij een kapot nummer");
}
assert.equal(telefoonWeergave("+31612345679"), "06 1234 5679");
assert.equal(telefoonWeergave("+31201234567"), "020 123 4567");
assert.equal(telefoonWeergave("+31341123456"), "0341 123 456");
assert.equal(emailSuggestie("sanne@gmial.com"), "sanne@gmail.com");
assert.equal(emailSuggestie("sanne@praktijk.con"), "sanne@praktijk.com");
assert.equal(emailSuggestie("sanne@praktijk.nl"), "");
{
  const leeg = valideerAanmelding({});
  assert.equal(leeg.ok, false);
  assert.deepEqual(Object.keys(leeg.fouten).sort(), ["akkoord", "email", "naam", "tel", "vwo"]);
  const wegwerp = valideerAanmelding({ email: "x@yopmail.com", naam: "Sanne", tel: "0612345679", akkoord: "1" });
  assert.match(wegwerp.fouten.email, /tijdelijke/);
  // zonder akkoord op de verwerkersovereenkomst geen proef (AVG art. 28)
  const zonderVwo = valideerAanmelding({ email: "sanne@praktijk.nl", naam: "Sanne de Vries", tel: "06 1234 5679", akkoord: "1" });
  assert.equal(zonderVwo.ok, false);
  assert.match(zonderVwo.fouten.vwo, /verwerkersovereenkomst/);
  const goed = valideerAanmelding({ email: " Sanne@Praktijk.NL ", naam: "  Sanne   de Vries ", tel: "06 1234 5679", akkoord: "1", vwo: "1" });
  assert.equal(goed.ok, true);
  assert.deepEqual([goed.waarden.email, goed.waarden.naam, goed.waarden.tel], ["sanne@praktijk.nl", "Sanne de Vries", "+31612345679"]);
}

// ---- server ----
const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-"));
const mail = [];
const mailServer = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (request.method === "POST" && request.url === "/emails") {
    mail.push(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" }).end("{}");
    return;
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => mailServer.listen(0, "127.0.0.1", resolve));
const mailPort = mailServer.address().port;

// vooraf: één proef die gisteren afliep, en een beheerdersaccount voor /aanmeldingen
const sha = (t) => createHash("sha256").update(t).digest("hex");
const verlopenToken = randomBytes(24).toString("hex");
const dag = 86400000;
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000001: { id: "oud0000000000001", email: "oud@praktijk.nl", naam: "Piet Oud", tel: "+31612340000",
    praktijk: "Fysio Oud", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(verlopenToken)] }
}));
// de praktijk achter de verlopen proef: beveiligd, met een kaart waarop een patiënt
// na het verlopen nog "het doet te veel pijn" tikte, en een kaart zonder seintje
const pSalt = randomBytes(16);
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio oud": { hash: "scrypt$" + pSalt.toString("hex") + "$" + scryptSync("oud-wachtwoord-1", pSalt, 32).toString("hex"), gemaakt: Date.now() - 15 * dag }
}));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio oud": {
    "<b>truus</b>": { id: "0ad0ad0ad0a1", praktijk: "Fysio Oud", naam: "<b>Truus</b>", ts: Date.now() - 5 * dag, chosen: [{ n: "Squat", id: "", i: 0 }],
      rows: {}, cells: {}, vids: {}, metingen: [{ t: Date.now() - 3600000, s: 8 }], ervaring: [{ t: Date.now() - 3600000, s: -1 }],
      seintje: { t: Date.now() - 3600000, soort: "pijn" } },
    "jan": { id: "0ad0ad0ad0a2", praktijk: "Fysio Oud", naam: "Jan", ts: Date.now() - 2 * dag, chosen: [{ n: "Squat", id: "", i: 0 }],
      rows: {}, cells: {}, vids: {} }
  }
}));
const salt = randomBytes(16);
await writeFile(join(dataDir, "v1-accounts.json"), JSON.stringify({
  "beheerder@example.nl": { email: "beheerder@example.nl", praktijk: "FysioTotaal", gemaakt: Date.now(),
    hash: "scrypt$" + salt.toString("hex") + "$" + scryptSync("geheim-wachtwoord", salt, 32).toString("hex") }
}));

const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const appPort = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${appPort}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort), DATA_DIR: dataDir,
    ACCOUNT_BEHEER_EMAILS: "beheerder@example.nl", PROEF_MELDING_AAN: "ahmed@example.nl",
    MAIL_API_SLEUTEL: "test", MAIL_AFZENDER: "Fysiplan <proef@fysiplan.nl>", MAIL_API_BASIS: `http://127.0.0.1:${mailPort}` },
  stdio: ["ignore", "pipe", "pipe"]
});
let appOutput = "";
app.stdout.on("data", (c) => { appOutput += c; });
app.stderr.on("data", (c) => { appOutput += c; });

const formulier = (velden, cookie) => fetch(origin + "/v2/proef", {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
  body: new URLSearchParams(velden).toString()
});
const cookieUit = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const wachtMail = async (n) => { for (let i = 0; i < 100 && mail.length < n; i++) await new Promise((r) => setTimeout(r, 30)); };

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // formulier
  const pagina = await fetch(origin + "/v2/proef");
  assert.equal(pagina.status, 200);
  const paginaHtml = await pagina.text();
  assert.match(paginaHtml, /Start mijn gratis proef/);
  assert.match(paginaHtml, /form-action 'self'|<form method="post"/);
  assert.match(pagina.headers.get("content-security-policy"), /form-action 'self'/);
  assert.doesNotMatch(paginaHtml, /__[A-Z_]+__/, "geen open placeholders");
  assert.match(paginaHtml, /<svg/, "demo-QR staat erop");
  assert.match(paginaHtml, /name="vwo"/, "vinkje voor de verwerkersovereenkomst");
  assert.match(paginaHtml, /href="\/verwerkersovereenkomst"/);
  assert.match(paginaHtml, /href="\/privacy"/);

  // fouten komen per veld terug, met de ingevulde waarden
  const fout = await formulier({ email: "sanne@", naam: "S", tel: "123", praktijk: "<b>x</b>" });
  assert.equal(fout.status, 422);
  const foutHtml = await fout.text();
  assert.match(foutHtml, /Dit e-mailadres klopt niet/);
  assert.match(foutHtml, /Vul een echte naam in/);
  assert.match(foutHtml, /Dit nummer klopt niet/);
  assert.match(foutHtml, /Vink aan/);
  assert.match(foutHtml, /value="sanne@"/);
  assert.doesNotMatch(foutHtml, /<b>x<\/b>/, "invoer wordt ge-escaped");

  // tikfout in het domein: eerst een vraag, daarna geaccepteerd
  const tik = await formulier({ email: "sanne@gmial.com", naam: "Sanne de Vries", tel: "06 1234 5679", akkoord: "1", vwo: "1" });
  assert.equal(tik.status, 422);
  const tikHtml = await tik.text();
  assert.match(tikHtml, /Bedoel je <b>sanne@gmail.com<\/b>/);
  assert.match(tikHtml, /name="email_ok"/);
  assert.match(tikHtml, /name="vwo" value="1" checked/, "het vinkje blijft staan bij een tweede poging");

  // honingpot: lijkt gelukt, maar er wordt niets bewaard
  const robot = await formulier({ email: "robot@praktijk.nl", naam: "Robot", tel: "0612345679", akkoord: "1", vwo: "1", website: "spam" });
  assert.equal(robot.status, 303);
  assert.equal(robot.headers.get("set-cookie"), null);

  // echte aanmelding
  // zonder het tweede vinkje: terug naar het formulier met een melding
  const geenVwo = await formulier({ email: "sanne@gmail.com", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: "Fysio Zuid", akkoord: "1" });
  assert.equal(geenVwo.status, 422);
  assert.match(await geenVwo.text(), /akkoord gaat met de algemene voorwaarden en de verwerkersovereenkomst/);
  const ok = await formulier({ email: "sanne@gmail.com", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: "Fysio Zuid", akkoord: "1", vwo: "1" });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), "/v2/app");
  const cookie = cookieUit(ok);
  assert.match(cookie, /^fpproef=[a-f0-9]{48}$/);
  assert.match(ok.headers.get("set-cookie"), /HttpOnly/);
  await wachtMail(2);
  const aanAhmed = mail.find((m) => m.to[0] === "ahmed@example.nl");
  assert.ok(aanAhmed, "Ahmed krijgt een melding");
  assert.match(aanAhmed.subject, /Nieuwe proefaanmelding: Fysio Zuid/);
  assert.match(aanAhmed.text, /06 1234 5679/);
  const welkom = mail.find((m) => m.to[0] === "sanne@gmail.com");
  assert.ok(welkom, "welkomstmail");
  const terugLink = welkom.text.match(/\/v2\/proef\/terug\?code=[a-f0-9]{48}/)[0];

  // de app in proefstand; contactgegevens gaan niet mee de pagina in
  const appHtml = await (await fetch(origin + "/v2/app", { headers: { cookie } })).text();
  assert.match(appHtml, /window\.FYSIPLAN_PROEF=\{"naam":"Sanne","praktijk":"Fysio Zuid","dagenOver":14/);
  assert.doesNotMatch(appHtml, /sanne@gmail\.com|1234 5679/);
  const zonder = await (await fetch(origin + "/v2/app")).text();
  assert.doesNotMatch(zonder, /FYSIPLAN_PROEF=/);

  // nog een keer aanmelden met hetzelfde adres vanaf hetzelfde apparaat: dezelfde proef, geen nieuwe melding
  const mails = mail.length;
  const opnieuw = await formulier({ email: "sanne@gmail.com", naam: "Sanne de Vries", tel: "0612345679", akkoord: "1", vwo: "1" }, cookie);
  assert.equal(opnieuw.status, 303);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(mail.length, mails);

  // security: iemand anders kent alleen het e-mailadres. Geen cookie, niets overschreven,
  // wel een eenmalige link naar het echte adres
  const kaper = await formulier({ email: "sanne@gmail.com", naam: "Kees Kaper", tel: "0687654321", akkoord: "1", vwo: "1" });
  assert.equal(kaper.status, 200, "geen doorsturen naar de app");
  assert.equal(kaper.headers.get("set-cookie"), null, "geen proefcookie voor wie alleen het adres kent");
  const kaperHtml = await kaper.text();
  assert.match(kaperHtml, /loopt al een proef/);
  assert.doesNotMatch(kaperHtml, /Fysio Zuid|Sanne/, "praktijknaam en naam lekken niet");
  const kaperOpSchijf = Object.values(JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"))).find((p) => p.email === "sanne@gmail.com");
  assert.equal(kaperOpSchijf.naam, "Sanne de Vries", "naam niet overschreven");
  assert.equal(kaperOpSchijf.tel, "+31612345679", "telefoon niet overschreven");
  await wachtMail(mails + 1);
  const linkMail = mail.slice(mails).find((m) => m.to[0] === "sanne@gmail.com");
  assert.ok(linkMail, "eenmalige link naar het echte adres");
  assert.doesNotMatch(linkMail.text, /Kees|0687654321/);
  const eenmalig = linkMail.text.match(/\/v2\/proef\/terug\?code=[a-f0-9]{48}/)[0];
  // security: een linkscanner (GET zonder Sec-Fetch-Site) verbruikt de eenmalige link niet
  const scanner = await fetch(origin + eenmalig, { redirect: "manual" });
  assert.equal(scanner.status, 200, "GET zonder Sec-Fetch-Site toont alleen een knop");
  assert.equal(scanner.headers.get("set-cookie"), null, "geen cookie op een GET van buiten");
  assert.match(await scanner.text(), /<form method="post" action="\/v2\/proef\/terug">/);
  const eenmaligCode = eenmalig.split("code=")[1];
  const terugPost = (code, extra = {}) => fetch(origin + "/v2/proef/terug", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...extra }, body: "code=" + code });
  const eerste = await terugPost(eenmaligCode);
  assert.equal(eerste.status, 303);
  assert.match(eerste.headers.get("set-cookie") || "", /fpproef=[a-f0-9]{48}/);
  const tweede = await terugPost(eenmaligCode);
  assert.equal(tweede.status, 404, "de link werkt maar één keer");

  // landing -> proef: met een lopende proef meteen door naar de app
  const door = await fetch(origin + "/v2/proef", { headers: { cookie }, redirect: "manual" });
  assert.equal(door.status, 303);
  const mijn = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie } })).text();
  assert.match(mijn, /Hoi Sanne, je proef loopt nog 14 dagen/);

  // kaart delen kan pas als de praktijk een wachtwoord heeft (wachtwoordplicht)
  const onbeveiligd = await fetch(origin + "/api/kaarten", { method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ praktijk: "Fysio Zuid", naam: "Voorbeeldpatiënt", chosen: [{ n: "Squat" }] }) });
  assert.equal(onbeveiligd.status, 401);
  assert.equal((await onbeveiligd.json()).beveilig, true);
  const claim = await fetch(origin + "/api/praktijk/claim", { method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ praktijk: "Fysio Zuid", wachtwoord: "proef-wachtwoord-1", akkoord: true }) });
  assert.equal(claim.status, 200);
  const sessie = (await claim.json()).sessie;
  // kaart opslaan voor de QR werkt en telt mee
  const kaart = await fetch(origin + "/api/kaarten", { method: "POST", headers: { "content-type": "application/json", cookie, "x-praktijk-sessie": sessie },
    body: JSON.stringify({ praktijk: "Fysio Zuid", naam: "Voorbeeldpatiënt", chosen: [{ n: "Squat" }] }) });
  assert.equal(kaart.status, 200);
  const kaartId = (await kaart.json()).id;
  // security: een verkeerd type voor t wist de afspraak niet (was: Number("abc")||0 = weghalen)
  const afspraak = (t) => fetch(origin + "/api/kaart/afspraak", { method: "POST", headers: { "content-type": "application/json", cookie, "x-praktijk-sessie": sessie },
    body: JSON.stringify({ praktijk: "Fysio Zuid", id: kaartId, t }) });
  const moment = Date.now() + 3 * 864e5;
  assert.equal((await afspraak(moment)).status, 200);
  for (const fout of ["abc", {}, [1], "123"]) assert.equal((await afspraak(fout)).status, 400, "afspraak t=" + JSON.stringify(fout));
  const kaartNu = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio zuid"];
  assert.equal(Object.values(kaartNu).find((k) => k.id === kaartId).afspraak.t, Math.round(moment), "afspraak blijft staan");
  const weg = await afspraak(0);
  assert.equal(weg.status, 200);
  assert.equal((await weg.json()).afspraak, null, "0 haalt de afspraak weg");
  // de proef bewaart welke versie van de verwerkersovereenkomst is geaccepteerd
  const proefOpSchijf = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
  assert.match(Object.values(proefOpSchijf).find((p) => p.email === "sanne@gmail.com").vwo.versie, /^\d{4}-\d{2}-\d{2}(-\d+)?$/);

  // persoonlijke maillink op een tweede apparaat
  // security (login-CSRF): een andere website die naar de link navigeert, zet geen proefcookie
  const kruisGet = await fetch(origin + terugLink, { redirect: "manual", headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(kruisGet.status, 200);
  assert.equal(kruisGet.headers.get("set-cookie"), null, "cross-site GET zet geen proefcookie");
  const kruisPost = await terugPost(terugLink.split("code=")[1], { "sec-fetch-site": "cross-site" });
  assert.equal(kruisPost.status, 403, "cross-site POST geweigerd");
  assert.equal(kruisPost.headers.get("set-cookie"), null);
  const vreemdeOrigin = await terugPost(terugLink.split("code=")[1], { "sec-fetch-site": "", origin: "https://kwaad.example" });
  assert.equal(vreemdeOrigin.status, 403, "POST met andere Origin geweigerd");
  // zelf geopend vanuit een mail-app (Sec-Fetch-Site: none): meteen door, zoals voorheen
  const terug = await fetch(origin + terugLink, { redirect: "manual", headers: { "sec-fetch-site": "none" } });
  assert.equal(terug.status, 303);
  assert.match(cookieUit(terug), /^fpproef=[a-f0-9]{48}$/);
  // de knop op de bevestigingspagina werkt ook
  const knop = await terugPost(terugLink.split("code=")[1]);
  assert.equal(knop.status, 303);
  assert.match(cookieUit(knop), /^fpproef=[a-f0-9]{48}$/);
  assert.equal((await fetch(origin + "/v2/proef/terug?code=" + "0".repeat(48))).status, 404);

  // verlopen proef: melding in plaats van de app, geen nieuwe kaarten
  const oud = "fpproef=" + verlopenToken;
  const verlopenApp = await fetch(origin + "/v2/app", { headers: { cookie: oud } });
  const verlopenHtml = await verlopenApp.text();
  assert.match(verlopenHtml, /Je 14 gratis dagen zitten erop/);
  assert.match(verlopenHtml, /Ja, ik wil doorgaan/);
  const geweigerd = await fetch(origin + "/api/kaarten", { method: "POST", headers: { "content-type": "application/json", cookie: oud },
    body: JSON.stringify({ praktijk: "Fysio Oud", naam: "Nieuw", chosen: [{ n: "Squat" }] }) });
  assert.equal(geweigerd.status, 403);
  assert.equal((await geweigerd.json()).proefVerlopen, true);
  // de patiëntkaart van de lopende proef blijft gewoon open
  assert.equal((await fetch(origin + "/api/kaart?id=" + kaartId)).status, 200);

  // na verloop blijven seintjes en scores zichtbaar: alleen lezen, met het praktijkwachtwoord
  assert.match(verlopenHtml, /Seintjes van je pati&euml;nten/);
  assert.match(verlopenHtml, /action="\/v2\/proef\/overzicht"/);
  assert.match(verlopenHtml, /name="praktijk"[^>]*value="Fysio Oud"/, "praktijknaam staat al ingevuld");
  const overzicht = (velden, cookie = oud, kop = {}) => fetch(origin + "/v2/proef/overzicht", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.4.4.4", ...(cookie ? { cookie } : {}), ...kop },
    body: new URLSearchParams(velden).toString() });
  const ovFout = await overzicht({ praktijk: "Fysio Oud", wachtwoord: "fout" });
  assert.equal(ovFout.status, 403);
  const ovFoutHtml = await ovFout.text();
  assert.match(ovFoutHtml, /horen niet bij elkaar/);
  assert.doesNotMatch(ovFoutHtml, /Truus/, "fout wachtwoord: geen kaarten");
  const zonderProef = await overzicht({ praktijk: "Fysio Oud", wachtwoord: "oud-wachtwoord-1" }, "");
  assert.equal(zonderProef.status, 303, "zonder proefcookie geen overzicht");
  assert.equal((await overzicht({ praktijk: "Fysio Oud", wachtwoord: "oud-wachtwoord-1" }, oud, { "sec-fetch-site": "cross-site" })).status, 403, "cross-site geweigerd");
  const goed = await overzicht({ praktijk: "Fysio Oud", wachtwoord: "oud-wachtwoord-1" });
  assert.equal(goed.status, 200);
  assert.match(goed.headers.get("content-security-policy") || "", /default-src 'none'/);
  const goedHtml = await goed.text();
  assert.match(goedHtml, /2 actieve kaarten, 1 seintje/);
  assert.match(goedHtml, /&lt;b&gt;Truus&lt;\/b&gt;/, "kaartnaam ge-escaped");
  assert.match(goedHtml, /meldt te veel pijn/);
  assert.match(goedHtml, /pijn 8/);
  assert.match(goedHtml, /herstel: iets slechter/);
  assert.ok(goedHtml.indexOf("Truus") < goedHtml.indexOf(">Jan<"), "kaart met seintje bovenaan");
  assert.doesNotMatch(goedHtml, /<form[^>]*action="\/api\//, "alleen lezen: geen schrijfformulier");
  // nog lopende proef: gewoon naar de app
  assert.equal((await overzicht({ praktijk: "Fysio Oud", wachtwoord: "oud-wachtwoord-1" }, cookie)).status, 303);

  // "ik wil doorgaan" -> seintje aan Ahmed
  const voor = mail.length;
  const doorgaan = await fetch(origin + "/v2/proef/doorgaan", { method: "POST", headers: { cookie: oud, "content-type": "application/x-www-form-urlencoded" }, body: "" });
  assert.match(await doorgaan.text(), /We bellen je binnen een werkdag/);
  await wachtMail(voor + 1);
  assert.match(mail[mail.length - 1].subject, /Wil doorgaan: Fysio Oud/);

  // beheeroverzicht: niet met admin88, wel met een beheerdersaccount
  assert.equal((await fetch(origin + "/api/aanmeldingen", { headers: { "x-admin-sleutel": "admin88" } })).status, 403);
  const login = await fetch(origin + "/api/v1/login", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "beheerder@example.nl", wachtwoord: "geheim-wachtwoord" }) });
  const beheer = cookieUit(login);
  const lijst = await (await fetch(origin + "/api/aanmeldingen", { headers: { cookie: beheer } })).json();
  assert.equal(lijst.aanmeldingen.length, 2);
  const sanne = lijst.aanmeldingen.find((a) => a.email === "sanne@gmail.com");
  assert.deepEqual([sanne.status, sanne.kaarten, sanne.tel], ["actief", 1, "06 1234 5679"]);
  assert.equal(lijst.aanmeldingen.find((a) => a.email === "oud@praktijk.nl").doorgaan, true);
  const csv = await (await fetch(origin + "/api/aanmeldingen?csv=1", { headers: { cookie: beheer } })).text();
  assert.match(csv, /Contactpersoon;Praktijk;E-mail/);
  assert.match(csv, /"Sanne de Vries";"Fysio Zuid";"sanne@gmail.com"/);
  // omzetten naar klant: de oude proef werkt dan weer
  const klant = await fetch(origin + "/api/aanmeldingen", { method: "POST", headers: { "content-type": "application/json", cookie: beheer },
    body: JSON.stringify({ id: "oud0000000000001", actie: "klant" }) });
  assert.equal(klant.status, 200);
  assert.doesNotMatch(await (await fetch(origin + "/v2/app", { headers: { cookie: oud } })).text(), /zitten erop/);
  const dash = await (await fetch(origin + "/api/dashboard", { headers: { "x-admin-sleutel": "admin88" } })).json();
  assert.deepEqual([dash.proef.totaal, dash.proef.actief, dash.proef.klant], [2, 1, 1]);

  // zelf wissen: gegevens weg, cookie weg
  const wis = await fetch(origin + "/v2/proef/wissen", { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: "zeker=1" });
  assert.match(await wis.text(), /Je gegevens zijn gewist/);
  assert.match(wis.headers.get("set-cookie"), /Max-Age=0/);
  const opSchijf = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
  assert.equal(Object.values(opSchijf).some((p) => p.email === "sanne@gmail.com"), false);

  // de landing verwijst naar de proef en noemt de 14 dagen
  const landing = await (await fetch(origin + "/v2")).text();
  assert.match(landing, /href="\/v2\/proef">Probeer gratis/);
  assert.match(landing, /14 dagen gratis proberen/);
  assert.doesNotMatch(landing, /Online afrekenen kan nog niet/);

  console.log("Proefperiode: alle controles geslaagd.");
} catch (err) {
  console.error(appOutput);
  throw err;
} finally {
  app.kill();
  mailServer.close();
  await rm(dataDir, { recursive: true, force: true });
}
