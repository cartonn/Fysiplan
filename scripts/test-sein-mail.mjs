// Platformreview 2026-11-11: "‘Het doet te veel pijn’ kan nu dagen blijven liggen". Een seintje
// van een patiënt stond alleen in de app; wie de app niet opende, zag niets.
//
// Nu gaat er een korte mail naar de praktijk:
// - bij een nieuw open seintje ("Ik heb een vraag", "Het doet te veel pijn") of als een vraag
//   oploopt naar pijn; niet bij "Het gaat goed" en niet nog een keer voor hetzelfde seintje;
// - naar de behandelaar van de kaart (op naam), anders wie de kaart maakte, anders de beheerders
//   met een eigen login, anders de aanmelder van de proef;
// - zonder naam van de patiënt, zonder soort en zonder inhoud;
// - de patiënt krijgt zijn antwoord meteen, ook als de mailprovider traag is of faalt;
// - een seintje valt niet weg: wat door de rem per adres, een mailstoring, het plafond per
//   praktijk of een herstart nog niet gemaild is, blijft op schijf gemerkt en gaat alsnog;
// - een beheerder zet het uit onder Team.
// Nepmail-API op localhost; zonder browser, past in CI. `npm run test:seinmail`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-seinmail-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// wacht tot fn iets waars geeft (of de tijd om is) en geeft de laatste uitkomst terug
async function tot(fn, ms = 5000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await wacht(40); }
}

// nepmail: bewaart wat de server verstuurt; mailStuk laat de mail-API falen, mailTraag laat
// haar pas na zoveel milliseconden antwoorden
const mails = [];
let mailStuk = false, mailTraag = 0;
const mailApi = createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => {
    const klaar = () => {
      if (mailStuk) { res.writeHead(500, { "content-type": "application/json" }); res.end('{"fout":"stuk"}'); return; }
      try { mails.push(JSON.parse(b)); } catch {}
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}');
    };
    if (mailTraag) setTimeout(klaar, mailTraag); else klaar();
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
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", FYSIPLAN_CONTACT: "hulp@fysiplan.invalid",
    MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: mailUrl,
    SEIN_MAIL_RONDE_S: "0.2", ...env };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV") delete kind[k];
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.87." + ((ip >> 8) & 255) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.88." + ((ip >> 8) & 255) + "." + (ip++ & 255), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const seinMails = () => mails.filter((m) => /seintje/i.test(m.subject || ""));
const naar = (adres) => seinMails().filter((m) => m.to[0] === adres);
const kaart = async (praktijk, S, naam) => {
  const r = await post("/api/kaarten", { praktijk, naam, client: { c_naam: naam },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S);
  const j = await r.json();
  assert.ok(j.id, "kaart gedeeld: " + JSON.stringify(j));
  return j.id;
};
const sein = async (id, soort) => {
  const r = await post("/api/kaart/seintje", { id, soort });
  assert.equal(r.status, 200, "de patiënt krijgt altijd antwoord op een seintje: " + r.status);
  assert.deepEqual(await r.json(), { ok: true });
};
const afgehandeld = async (praktijk, id, S) => assert.equal((await post("/api/praktijk/inbox/afgehandeld", { praktijk, id }, S)).status, 200);
// de kaart zoals hij op schijf staat
const opSchijf = async (id) => {
  const alle = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  for (const map of Object.values(alle)) for (const k of Object.values(map)) if (k.id === id) return k;
  return null;
};
const gemerkt = async (id) => { const k = await opSchijf(id); return !!(k && k.seintje && k.seintje.meld); };
const login = async (email, wachtwoord) => {
  const r = await post("/api/praktijk/login", { email, wachtwoord });
  assert.equal(r.status, 200, "inloggen " + email + ": " + r.status);
  return ses(await r.json());
};
// een praktijk met een eigen login voor de eigenaar; geeft de sessie van die beheerder
const praktijkMetLogin = async (praktijk, naam, email) => {
  let r = await post("/api/praktijk/claim", { praktijk, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  r = await post("/api/praktijk/team/eigen-login", { naam, email, wachtwoord: "eigen-wachtwoord", regels: true }, ses(await r.json()));
  assert.equal(r.status, 200, await r.clone().text());
  return ses(await r.json());
};
const nodigUit = async (S, email, naam, rol) => {
  const u = await (await post("/api/praktijk/team/uitnodigen", { email, naam, rol }, S)).json();
  assert.ok(u.link, "uitnodiging: " + JSON.stringify(u));
  const t = new URL(u.link).searchParams.get("t");
  const aan = await formulier("/v2/uitnodiging", { t, naam, wachtwoord: "eigen-wachtwoord", regels: "1" });
  assert.ok(aan.status < 400, "uitnodiging aannemen: " + aan.status);
  return login(email, "eigen-wachtwoord");
};

const P1 = "Fysio Sein";
let kaartLot = "";
let app = await start();
try {
  // ---- 1. een seintje op de kaart van een therapeut met een eigen login ----
  const K = await praktijkMetLogin(P1, "Karin Jansen", "karin@sein.invalid");
  const M = await nodigUit(K, "mark@sein.invalid", "Mark Visser", "beheerder");
  const L = await nodigUit(K, "lot@sein.invalid", "Lot Smit", "therapeut");
  kaartLot = await kaart(P1, L, "Truus B.");

  await sein(kaartLot, "goed");
  await wacht(700);
  assert.equal(seinMails().length, 0, "“Het gaat goed” geeft geen mail");
  assert.equal(await gemerkt(kaartLot), false);

  await sein(kaartLot, "vraag");
  assert.ok(await tot(() => naar("lot@sein.invalid").length === 1), "een vraag geeft een mail aan wie de kaart maakte: " + JSON.stringify(seinMails()));
  assert.equal(seinMails().length, 1, "één mail, alleen aan de behandelaar (niet aan de beheerders)");
  const m1 = seinMails()[0];
  assert.equal(m1.subject, "Nieuw seintje van een patiënt (Fysio Sein)");
  assert.match(m1.text, /^Hallo Lot,\n/);
  assert.ok(m1.text.includes("https://fysiplan.nl/v2/app?praktijk=Fysio%20Sein"), "met de link naar de app, praktijknaam al ingevuld: " + m1.text);
  assert.doesNotMatch(m1.subject + m1.text, /Truus|vraag|pijn|Bruggen/i, "geen naam van de patiënt, geen soort seintje en geen oefening in de mail");
  assert.match(m1.text, /geen alarmknop: spoed loopt via de telefoon/);
  assert.match(m1.text, /Een beheerder van je praktijk zet dit uit/);
  assert.match(m1.text, /hulp@fysiplan\.invalid/, "wie Fysiplan niet kent, kan het melden");
  assert.ok(await tot(async () => !(await gemerkt(kaartLot))), "na de mail is het merkteken van schijf");
  assert.equal((await opSchijf(kaartLot)).seintje.soort, "vraag", "het seintje zelf staat er nog");

  // de app en de patiëntkaart krijgen het merkteken niet te zien
  let r = await get("/api/kaarten?praktijk=" + encodeURIComponent(P1), L);
  assert.equal(r.status, 200);
  assert.doesNotMatch(await r.text(), /"meld"/, "het merkteken gaat niet mee naar de app");

  // nog een keer dezelfde vraag: geen nieuwe mail, het seintje stond al open
  await sein(kaartLot, "vraag");
  await wacht(700);
  assert.equal(seinMails().length, 1, "hetzelfde seintje nog een keer mailt niet opnieuw");
  assert.equal(await gemerkt(kaartLot), false);

  // de vraag loopt op naar pijn: dat is een nieuwe melding. Lot kreeg net een mail (rem van een
  // kwartier per adres), dus deze wacht: gemerkt op schijf, nog niet gemaild
  await sein(kaartLot, "pijn");
  assert.ok(await tot(() => gemerkt(kaartLot)), "pijn na een vraag wordt gemerkt voor een mail");
  await wacht(700);
  assert.equal(naar("lot@sein.invalid").length, 1, "binnen een kwartier geen tweede mail naar hetzelfde adres");
  assert.equal(await gemerkt(kaartLot), true, "maar de melding blijft staan tot ze gemaild is");

  // ---- 2. de behandelaar op de kaart gaat voor wie de kaart maakte ----
  const kaartKarin = await kaart(P1, K, "Henk D.");
  assert.equal((await post("/api/kaart/behandelaar", { praktijk: P1, id: kaartKarin, naam: "mark visser" }, K)).status, 200);
  await sein(kaartKarin, "pijn");
  assert.ok(await tot(() => naar("mark@sein.invalid").length === 1), "de mail gaat naar de behandelaar die op de kaart staat");
  assert.match(naar("mark@sein.invalid")[0].text, /^Hallo Mark,\n/);
  assert.equal(naar("karin@sein.invalid").length, 0, "en niet naar wie de kaart maakte");

  // ---- 3. praktijkwachtwoord zonder eigen logins: de aanmelder van de proef ----
  const P2 = "Fysio Met Proef";
  r = await formulier("/v2/proef", { email: "Eigenaar@MetProef.invalid", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: P2, akkoord: "1", vwo: "1" });
  assert.equal(r.status, 303, "proef gestart: " + r.status);
  const proefCookie = (r.headers.get("set-cookie") || "").split(";")[0];
  r = await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "wachtwoord-twee", akkoord: true }, { cookie: proefCookie });
  assert.equal(r.status, 200, await r.clone().text());
  const S2 = ses(await r.json());
  const kaartProef = await kaart(P2, S2, "Karel V.");
  let team = await (await get("/api/praktijk/team", S2)).json();
  assert.deepEqual(team.seinMail, { aan: true, kan: true, naar: ["e***@metproef.invalid"] }, "Team toont waar de mail heen gaat, gemaskeerd");
  await sein(kaartProef, "vraag");
  assert.ok(await tot(() => naar("eigenaar@metproef.invalid").length === 1), "zonder eigen logins gaat de mail naar de aanmelder van de proef");
  assert.match(naar("eigenaar@metproef.invalid")[0].text, /^Hallo Sanne,\n\nEen patiënt van Fysio Met Proef heeft/);

  // ---- 4. geen eigen adres van de praktijk bekend: geen mail, en niets blijft hangen ----
  const P3 = "Fysio Zonder Adres";
  r = await post("/api/praktijk/claim", { praktijk: P3, wachtwoord: "wachtwoord-drie", akkoord: true });
  const S3 = ses(await r.json());
  const kaartZonder = await kaart(P3, S3, "Piet J.");
  assert.deepEqual((await (await get("/api/praktijk/team", S3)).json()).seinMail, { aan: true, kan: true, naar: [] });
  const voor4 = seinMails().length;
  await sein(kaartZonder, "pijn");
  await wacht(700);
  assert.equal(seinMails().length, voor4, "zonder adres geen mail");
  assert.equal(await gemerkt(kaartZonder), false, "en geen merkteken dat blijft wachten");
  assert.equal((await opSchijf(kaartZonder)).seintje.soort, "pijn", "het seintje staat gewoon in de app");

  // ---- 5. uitzetten onder Team: alleen een beheerder ----
  const P4 = "Fysio Schakelaar";
  const E = await praktijkMetLogin(P4, "Eva Bos", "eva@schakelaar.invalid");
  const T = await nodigUit(E, "tim@schakelaar.invalid", "Tim Smit", "therapeut");
  r = await post("/api/praktijk/team/sein-mail", { aan: false }, T);
  assert.equal(r.status, 403, "een therapeut zet de mail niet uit voor de hele praktijk");
  assert.equal((await post("/api/praktijk/team/sein-mail", { aan: false }, {})).status, 401, "zonder login al helemaal niet");
  r = await post("/api/praktijk/team/sein-mail", { aan: false }, E);
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await r.json()).seinMail, { aan: false });
  team = await (await get("/api/praktijk/team", T)).json();
  assert.equal(team.seinMail.aan, false, "ook de therapeut ziet dat het uit staat");
  const kaartEva = await kaart(P4, E, "Anna S.");
  await sein(kaartEva, "pijn");
  await wacht(700);
  assert.equal(naar("eva@schakelaar.invalid").length, 0, "uitgezet: geen mail");
  assert.equal(await gemerkt(kaartEva), false);
  r = await post("/api/praktijk/team/sein-mail", { aan: true }, E);
  assert.deepEqual((await r.json()).seinMail, { aan: true });
  const act = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P4), E)).json()).activiteit;
  assert.ok(act.some((a) => a.actie === "sein-mail-uit" && a.wie === "Eva Bos") && act.some((a) => a.actie === "sein-mail-aan"), "aan en uit staan in het logboek van de praktijk: " + JSON.stringify(act));
  const kaartTim = await kaart(P4, T, "Bram K.");
  await sein(kaartTim, "vraag");
  assert.ok(await tot(() => naar("tim@schakelaar.invalid").length === 1), "weer aan: de therapeut krijgt de mail voor zijn kaart");
  assert.equal(naar("eva@schakelaar.invalid").length, 0, "het oude seintje van toen het uit stond wordt niet alsnog gemaild");

  // ---- 6. de voorbeeldkaart mailt nooit ----
  const voor6 = seinMails().length;
  await sein("demo", "pijn");
  await wacht(500);
  assert.equal(seinMails().length, voor6, "de voorbeeldkaart geeft geen mail");
} finally {
  await stop(app);
}

// ---- 7. na een herstart komt wat nog wachtte alsnog; daarna de rem per adres en het bundelen ----
// (de rem per adres staat hier op 3 seconden in plaats van een kwartier)
app = await start({ SEIN_MAIL_TUSSEN_S: "3" });
try {
  assert.ok(await tot(() => naar("lot@sein.invalid").length === 2), "de pijnmelding die op de rem wachtte, is na de herstart alsnog gemaild");
  assert.ok(await tot(async () => !(await gemerkt(kaartLot))), "en het merkteken is van schijf");
  assert.equal(naar("lot@sein.invalid")[1].subject, "Nieuw seintje van een patiënt (Fysio Sein)");

  // twee andere patiënten van Lot melden zich binnen de rem: samen één mail
  const L = await login("lot@sein.invalid", "eigen-wachtwoord");
  const k2 = await kaart(P1, L, "Ans W."), k3 = await kaart(P1, L, "Cor Z."), k4 = await kaart(P1, L, "Dirk M.");
  await sein(k2, "vraag");
  await sein(k3, "pijn");
  await sein(k4, "vraag");
  // de derde handelt Lot af voordat de mail vertrekt: die hoort er dan niet meer bij
  await afgehandeld(P1, k4, L);
  assert.equal(naar("lot@sein.invalid").length, 2, "binnen de rem nog geen nieuwe mail");
  assert.ok(await tot(() => naar("lot@sein.invalid").length === 3, 9000), "na de rem volgt één mail voor wat er nog open staat");
  const m3 = naar("lot@sein.invalid")[2];
  assert.equal(m3.subject, "Nieuwe seintjes van patiënten (Fysio Sein)");
  assert.match(m3.text, /\n\n2 patiënten van Fysio Sein hebben via de oefenkaart een seintje gegeven/, m3.text);
  assert.doesNotMatch(m3.text, /Ans|Cor|Dirk/);
  // daarna is er niets meer gemerkt, dus dezelfde seintjes worden niet nog een keer gemaild
  assert.ok(await tot(async () => !(await gemerkt(k2)) && !(await gemerkt(k3)) && !(await gemerkt(k4))), "na de mail is niets meer gemerkt");

  // ---- 8. de mailprovider is traag of stuk: de patiënt merkt er niets van, de mail komt later ----
  const K = await login("karin@sein.invalid", "eigen-wachtwoord");
  const k5 = await kaart(P1, K, "Els R.");
  mailTraag = 1500;
  const voor8 = naar("karin@sein.invalid").length;
  await sein(k5, "pijn"); // sein() eist het antwoord 200 { ok: true }
  assert.equal(naar("karin@sein.invalid").length, voor8, "het antwoord aan de patiënt wachtte niet op de mailprovider");
  assert.ok(await tot(() => naar("karin@sein.invalid").length === voor8 + 1), "de trage mail komt daarna gewoon aan");
  mailTraag = 0;

  const M = await login("mark@sein.invalid", "eigen-wachtwoord");
  const k6 = await kaart(P1, M, "Fenna T.");
  mailStuk = true;
  const voorStuk = naar("mark@sein.invalid").length;
  await sein(k6, "vraag");
  await wacht(600);
  assert.equal(naar("mark@sein.invalid").length, voorStuk, "de mailprovider weigert: nog geen mail");
  assert.equal(await gemerkt(k6), true, "de melding blijft gemerkt op schijf");
  mailStuk = false;
  assert.ok(await tot(() => naar("mark@sein.invalid").length === voorStuk + 1, 9000), "zodra de mailprovider het weer doet, gaat de mail alsnog");
  assert.ok(await tot(async () => !(await gemerkt(k6))));
} finally {
  mailStuk = false; mailTraag = 0;
  await stop(app);
}

// ---- 9. plafond per praktijk (hier 3 per dag, zonder rem per adres) ----
app = await start({ SEIN_MAIL_TUSSEN_S: "0", SEIN_MAILS_PER_DAG: "3" });
try {
  const P5 = "Fysio Plafond";
  const N = await praktijkMetLogin(P5, "Noor Vos", "noor@plafond.invalid");
  const kn = await kaart(P5, N, "Gijs L.");
  for (let i = 1; i <= 3; i++) {
    await sein(kn, i % 2 ? "vraag" : "pijn");
    assert.ok(await tot(() => naar("noor@plafond.invalid").length === i), "mail " + i + ": afgehandeld en daarna een nieuw seintje geeft opnieuw een mail");
    await afgehandeld(P5, kn, N);
  }
  await sein(kn, "pijn");
  await wacht(900);
  assert.equal(naar("noor@plafond.invalid").length, 3, "boven het plafond van de praktijk vertrekt er geen mail meer");
  assert.equal(await gemerkt(kn), true, "de melding blijft wachten tot er weer ruimte is");
  // het plafond geldt per praktijk: een andere praktijk krijgt haar mail gewoon
  const voor9 = naar("eva@schakelaar.invalid").length;
  const E = await login("eva@schakelaar.invalid", "eigen-wachtwoord");
  const ke = await kaart("Fysio Schakelaar", E, "Hanna P.");
  await sein(ke, "vraag");
  assert.ok(await tot(() => naar("eva@schakelaar.invalid").length === voor9 + 1), "een andere praktijk heeft haar eigen plafond");
} finally {
  await stop(app);
}

// ---- 10. zonder mail op de server: geen merkteken, geen mail, Team toont de schakelaar niet ----
app = await start({ MAIL_API_SLEUTEL: "" });
try {
  const N = await login("noor@plafond.invalid", "eigen-wachtwoord");
  assert.equal((await (await get("/api/praktijk/team", N)).json()).seinMail.kan, false);
  const k = await kaart("Fysio Plafond", N, "Ivo Q.");
  const voor10 = mails.length;
  await sein(k, "pijn");
  await wacht(600);
  assert.equal(mails.length, voor10, "zonder mailinstelling vertrekt er niets");
  assert.equal(await gemerkt(k), false, "en er blijft niets wachten");
} finally {
  await stop(app);
  mailApi.close();
  await rm(dataDir, { recursive: true, force: true });
}
assert.doesNotMatch(log, /seintjesmail:|TypeError|ReferenceError/, "geen fouten in het serverlog: " + log.slice(-800));
console.log("test-sein-mail: ok (mail bij een nieuw seintje, zonder patiëntgegevens; niets valt weg door rem, storing of herstart)");
