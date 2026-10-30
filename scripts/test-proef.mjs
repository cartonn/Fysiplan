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
assert.equal(telefoonWeergave("+31612345679"), "06 1234 5679");
assert.equal(telefoonWeergave("+31201234567"), "020 123 4567");
assert.equal(telefoonWeergave("+31341123456"), "0341 123 456");
assert.equal(emailSuggestie("sanne@gmial.com"), "sanne@gmail.com");
assert.equal(emailSuggestie("sanne@praktijk.con"), "sanne@praktijk.com");
assert.equal(emailSuggestie("sanne@praktijk.nl"), "");
{
  const leeg = valideerAanmelding({});
  assert.equal(leeg.ok, false);
  assert.deepEqual(Object.keys(leeg.fouten).sort(), ["akkoord", "email", "naam", "tel"]);
  const wegwerp = valideerAanmelding({ email: "x@yopmail.com", naam: "Sanne", tel: "0612345679", akkoord: "1" });
  assert.match(wegwerp.fouten.email, /tijdelijke/);
  const goed = valideerAanmelding({ email: " Sanne@Praktijk.NL ", naam: "  Sanne   de Vries ", tel: "06 1234 5679", akkoord: "1" });
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
  const tik = await formulier({ email: "sanne@gmial.com", naam: "Sanne de Vries", tel: "06 1234 5679", akkoord: "1" });
  assert.equal(tik.status, 422);
  const tikHtml = await tik.text();
  assert.match(tikHtml, /Bedoel je <b>sanne@gmail.com<\/b>/);
  assert.match(tikHtml, /name="email_ok"/);

  // honingpot: lijkt gelukt, maar er wordt niets bewaard
  const robot = await formulier({ email: "robot@praktijk.nl", naam: "Robot", tel: "0612345679", akkoord: "1", website: "spam" });
  assert.equal(robot.status, 303);
  assert.equal(robot.headers.get("set-cookie"), null);

  // echte aanmelding
  const ok = await formulier({ email: "sanne@gmail.com", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: "Fysio Zuid", akkoord: "1" });
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

  // nog een keer aanmelden met hetzelfde adres: dezelfde proef, geen nieuwe melding
  const mails = mail.length;
  const opnieuw = await formulier({ email: "sanne@gmail.com", naam: "Sanne de Vries", tel: "0612345679", akkoord: "1" });
  assert.equal(opnieuw.status, 303);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(mail.length, mails);

  // landing -> proef: met een lopende proef meteen door naar de app
  const door = await fetch(origin + "/v2/proef", { headers: { cookie }, redirect: "manual" });
  assert.equal(door.status, 303);
  const mijn = await (await fetch(origin + "/v2/proef?mijn=1", { headers: { cookie } })).text();
  assert.match(mijn, /Hoi Sanne, je proef loopt nog 14 dagen/);

  // kaart opslaan voor de QR werkt en telt mee
  const kaart = await fetch(origin + "/api/kaarten", { method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ praktijk: "Fysio Zuid", naam: "Voorbeeldpatiënt", chosen: [{ n: "Squat" }] }) });
  assert.equal(kaart.status, 200);
  const kaartId = (await kaart.json()).id;

  // persoonlijke maillink op een tweede apparaat
  const terug = await fetch(origin + terugLink, { redirect: "manual" });
  assert.equal(terug.status, 303);
  assert.match(cookieUit(terug), /^fpproef=[a-f0-9]{48}$/);
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
