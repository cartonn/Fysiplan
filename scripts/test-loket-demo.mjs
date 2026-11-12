// De reparaties uit de agentdemo-sweep van 12-11-2026 (Ahmed: "dubbele berichten tussen rollen",
// "persoonsgegevens in notities", "demo-knoppen doen niets", "een uitrol wist de demo").
//
// Wat hier vastligt, tegen een echte server met de agents op proef (dus op de demo):
// - Eén eigen bericht per praktijk, over alle zaken en rollen heen, ook als support en finance
//   tegelijk over dezelfde praktijk schrijven (automatisch én als concept).
// - Een notitie of verslag met persoonsgegevens wordt geweigerd en de tekst komt nergens terecht:
//   niet in het antwoord, niet in het beheerlogboek, niet in de bestanden.
// - De stand van een agent in de demo bepaalt wat hij in de demo doet; de echte stand blijft.
// - De demo overleeft een herstart (eigen bestand beheer-demo.json), blijft gescheiden van de echte
//   gegevens en staat niet in de reservekopie. "Demo opnieuw beginnen" wist hem wel. Een bestand dat
//   niet terug kan (onleesbaar of een andere vorm) gaat opzij, en de pagina zegt waarom.
// - Een bericht dat bij een herstart onderweg was, is daarna "onbekend": niet opnieuw te versturen;
//   beheer legt na controle vast of het wel of niet verstuurd is.
// - Een wijziging in de demo staat op schijf vóór het antwoord; lukt opslaan niet, dan 500.
// - Vaste telefoonnummers tellen als persoonsgegevens, net als 06-nummers.
// Nepmail-API op localhost; past in CI. `npm run test:loketdemo`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const DAG = 86400e3;

const tmp = await mkdtemp(join(tmpdir(), "fysiplan-loketdemo-"));
const dataDir = join(tmp, "data");
await mkdir(dataDir, { recursive: true });
const hashVan = (ww) => { const zout = randomBytes(16); return "scrypt$" + zout.toString("hex") + "$" + scryptSync(ww, zout, 32).toString("hex"); };
// één echte praktijk, zodat te zien is dat er niets van de echte kant in de demo komt (en andersom)
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({ "p-0123456789abcdef": { naam: "Fysio Echtelaan", hash: "scrypt$00$00", gedeeldUit: true, gemaakt: Date.now() - 40 * DAG, leden: [
  { id: "aaaaaaaaaaaa", naam: "Echte Ellen", email: "ellen@echtelaan.example", rol: "beheerder", hash: "scrypt$00$00", gemaakt: Date.now() - 40 * DAG, laatst: Date.now() - 3600e3, totp: { geheim: "JBSWY3DPEHPK3PXP", sinds: 1, stap: 1, reserve: ["x"] } }
] } }));
const WW = "vera-wachtwoord-" + randomBytes(6).toString("hex"), GEHEIM = "JBSWY3DPEHPK3PXP";
await writeFile(join(dataDir, "beheer-accounts.json"), JSON.stringify({ "vera@beheer.example": { email: "vera@beheer.example", naam: "Vera Volledig", hash: hashVan(WW), gemaakt: new Date(Date.now() - 5 * DAG).toISOString(), door: "test", totp: { geheim: GEHEIM, sinds: Date.now() - 5 * DAG, stap: 0, reserve: [] } } }));

const mails = [];
const mailApi = createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => { try { mails.push(JSON.parse(b)); } catch {} res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}'); });
});
await new Promise((r) => mailApi.listen(0, "127.0.0.1", r));
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ANTHROPIC_API_KEY: "", PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit",
  PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: `http://127.0.0.1:${mailApi.address().port}` };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_|ADMIN_)/.test(k) || k === "NODE_ENV") delete env[k];

let app = null, log = "";
async function start() {
  log = "";
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { log += c; });
  app.stderr.on("data", (c) => { log += c; });
  for (let i = 0; i < 300; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); }
  throw new Error("server start niet");
}
async function stop() {
  if (!app) return;
  const a = app; app = null;
  a.kill();
  await new Promise((r) => a.once("exit", r));
}

try {
  await start();
  let ip = 1;
  const xff = () => "10.77.0." + (ip++ & 255);
  async function login() {
    const r = await fetch(origin + "/api/beheer/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff() },
      body: JSON.stringify({ email: "vera@beheer.example", wachtwoord: WW, code: codeVoor(GEHEIM, stapVan(Date.now())) }) });
    assert.equal(r.status, 200, "inloggen: " + (await r.clone().text()));
    return (r.headers.get("set-cookie") || "").split(";")[0];
  }
  let cookie = await login();
  const kop = () => ({ "content-type": "application/json", "x-forwarded-for": xff(), "x-admin-sleutel": "account", cookie });
  const om = (pad, body, bron = "echt") => fetch(origin + "/api/beheer/omgeving/" + pad, { method: "POST", headers: kop(), body: JSON.stringify({ bron, ...body }) });
  const stand = async (bron = "echt") => (await fetch(origin + "/api/beheer/omgeving?bron=" + bron, { headers: kop() })).json();
  const logboek = async () => readFile(join(dataDir, "beheer-log.jsonl"), "utf8").catch(() => "");
  const bestand = (naam) => readFile(join(dataDir, naam), "utf8");

  // sleutels per rol (echt) en de echte stand op proef: dan werken support en finance op de demo
  const sleutels = {};
  for (const rol of ["support", "tech", "finance"]) sleutels[rol] = (await (await om("loket/sleutel", { rol })).json()).nieuweSleutel;
  for (const rol of ["support", "tech", "finance"]) assert.equal((await om("loket/agent", { rol, stand: "proef" })).status, 200);
  const agent = (rol, wat, body) => fetch(origin + "/api/agent/" + rol + "/" + wat, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + sleutels[rol], "content-type": "application/json", "x-forwarded-for": xff() }, body: body ? JSON.stringify(body) : undefined });
  const werk = async (rol) => (await agent(rol, "werk")).json();
  const tekst = (n) => ({ onderwerp: "Je betaling bij Fysiplan (" + n + ")", tekst: "We zagen dat de laatste betaling voor {praktijk} niet is gelukt. Antwoord gerust op deze mail, dan spreken we samen iets af." });

  // ---- 1. dubbele berichten tussen support en finance, tegelijk ----
  {
    let s = await werk("support"), f = await werk("finance");
    assert.deepEqual([s.modus, f.modus], ["proef", "proef"]);
    const fz = f.werk.zaken.find((z) => z.soort === "incasso-mislukt");
    const sz = s.werk.zaken.find((z) => z.soort === "betaling-mislukt" && z.praktijk === fz.praktijk);
    assert.ok(fz && sz, "de demo heeft één praktijk met een mislukte betaling, bij support én bij finance");
    // de demo begint met een concept van finance over die betaling: support mag er dan niet nog een maken
    assert.deepEqual([fz.eigenBericht.reden, sz.eigenBericht.reden], ["concept-wacht-op-akkoord", "praktijk-heeft-al-een-bericht-dat-wacht"]);
    let r = await agent("support", "actie", { actie: "eigen-mail", zaak: sz.id, ...tekst(1) });
    assert.deepEqual([r.status, (await r.json()).reden], [409, "praktijk-heeft-al-een-bericht-dat-wacht"]);
    // beheer wijst dat concept af; daarna mag er weer precies één bericht aan deze praktijk
    const seed = (await stand("demo")).loket.concepten.find((c) => c.rol === "finance" && c.stand === "wacht");
    assert.equal((await om("loket/concept", { id: seed.id, besluit: "afwijzen", reden: "test" }, "demo")).status, 200);
    // automatisch: beide versturen meteen. Tegelijk: precies één gaat weg.
    assert.equal((await om("mailstand", { soort: "eigen-bericht", stand: "automatisch" }, "demo")).status, 200);
    const postvakVoor = (await stand("demo")).agent.mails.length;
    const uit = await Promise.all([agent("support", "actie", { actie: "eigen-mail", zaak: sz.id, ...tekst(2) }), agent("finance", "actie", { actie: "eigen-mail", zaak: fz.id, ...tekst(3) })]);
    const antw = await Promise.all(uit.map((x) => x.json()));
    assert.deepEqual(uit.map((x) => x.status).sort(), [200, 409], JSON.stringify(antw));
    assert.equal(antw.find((x) => x.ok).resultaat, "direct-verstuurd");
    assert.match(antw.find((x) => !x.ok).reden, /^praktijk-/);
    const v = await stand("demo");
    assert.equal(v.agent.mails.length - postvakVoor, antw.find((x) => x.ok).ontvangers, "in het demopostvak staat één bericht, niet twee");
    assert.equal(v.loket.concepten.filter((c) => c.stand === "verstuurd" && c.praktijk === seed.praktijk && Date.parse(c.op) > Date.now() - 60e3).length, 1);
    // ook daarna: dezelfde praktijk krijgt deze week geen tweede eigen bericht, van geen enkele rol
    s = await werk("support"); f = await werk("finance");
    for (const z of [...s.werk.zaken, ...f.werk.zaken].filter((x) => x.praktijk === sz.praktijk)) assert.equal(z.eigenBericht.kan, false, z.soort);

    // als concept (handmatig): twee zaken bij één praktijk, tegelijk: één concept
    assert.equal((await om("mailstand", { soort: "eigen-bericht", stand: "handmatig" }, "demo")).status, 200);
    const perPraktijk = {};
    for (const z of s.werk.zaken.filter((x) => x.eigenBericht.kan)) (perPraktijk[z.praktijk] ||= []).push(z);
    const twee = Object.values(perPraktijk).find((l) => l.length >= 2);
    assert.ok(twee, "de demo heeft een praktijk met twee zaken waarvoor een bericht kan");
    const dubbel = await Promise.all(twee.slice(0, 2).map((z, i) => agent("support", "actie", { actie: "eigen-mail", zaak: z.id, ...tekst(10 + i) })));
    assert.deepEqual(dubbel.map((x) => x.status).sort(), [200, 409]);
    // dubbelklik op Verstuur bij hetzelfde concept: één mail
    const klik = (await stand("demo")).loket.concepten.find((x) => x.stand === "wacht" && x.rol === "support" && x.onderwerp.startsWith("Je betaling bij Fysiplan (1"));
    assert.ok(klik, "het nieuwe concept wacht op akkoord");
    const voor = (await stand("demo")).agent.mails.length;
    const kliks = await Promise.all([om("loket/concept", { id: klik.id, besluit: "verstuur" }, "demo"), om("loket/concept", { id: klik.id, besluit: "verstuur" }, "demo")]);
    assert.deepEqual(kliks.map((x) => x.status).sort(), [200, 404], "de tweede klik vindt het concept niet meer als wachtend");
    assert.equal((await stand("demo")).agent.mails.length - voor, klik.aan);
    assert.equal(mails.length, 0, "in de demo gaat er niets naar de mailprovider");
  }

  // ---- 2. persoonsgegevens: geweigerd en nergens bewaard ----
  {
    const geheim = "Mail ellen.geheim@voorbeeld.invalid of bel 06-98765432 over de patiënt die Piet Geheim heet.";
    let r = await agent("finance", "actie", { actie: "notitie", periode: "2026", tekst: geheim });
    const j = await r.json();
    assert.equal(r.status, 400);
    assert.ok(!JSON.stringify(j).includes("Geheim") && !JSON.stringify(j).includes("98765432"), "het antwoord herhaalt de tekst niet");
    r = await agent("support", "actie", { actie: "verslag", tekst: "Ronde gedaan, niets bijzonders.", punten: [{ soort: "let-op", tekst: geheim }] });
    assert.equal(r.status, 400);
    await wacht(200);
    for (const [naam, inhoud] of [["beheer-log.jsonl", await logboek()], ["beheer-loket.json", await bestand("beheer-loket.json")], ["beheer-demo.json", await bestand("beheer-demo.json")]]) {
      assert.ok(!/Piet Geheim|ellen\.geheim|98765432/.test(inhoud), "geweigerde tekst staat niet in " + naam);
    }
    assert.equal((await agent("finance", "actie", { actie: "notitie", periode: "2026-K4", tekst: "Bewaar mij: notitie voor de herstart-test." })).status, 200);
  }

  // ---- 3. de stand in de demo telt; de echte stand blijft ----
  {
    assert.equal((await om("loket/agent", { rol: "support", stand: "uit" }, "demo")).status, 200);
    assert.equal((await werk("support")).uit, true, "in de demo uit is ook echt uit");
    assert.equal((await agent("support", "actie", { actie: "verslag", tekst: "Dit verslag hoort er niet te komen." })).status, 423);
    assert.equal((await stand("echt")).loket.agents.support.stand, "proef", "de demo-knop verandert niets aan de echte agent");
    assert.equal((await om("loket/agent", { rol: "support", stand: "aan" }, "demo")).status, 200);
    const w = await werk("support");
    assert.deepEqual([w.ok, w.modus], [true, "proef"], "op Aan in de demo werkt hij nog steeds alleen op de demo");
    // de stopknop van echt zet ook de demo stil
    assert.equal((await om("loket/pauze", { aan: true })).status, 200);
    assert.equal((await werk("finance")).gepauzeerd, true);
    assert.equal((await om("loket/pauze", { aan: false })).status, 200);
  }

  // ---- 4. herstart: de demo blijft, gescheiden van echt ----
  {
    const voorS = await werk("support"), voorF = await werk("finance"), voorV = await stand("demo");
    await stop();
    await start();
    // de sessie van beheer overleeft de herstart; zo niet, dan opnieuw inloggen met de volgende code
    if ((await fetch(origin + "/api/beheer/omgeving?bron=demo", { headers: kop() })).status !== 200) { await wacht(31e3 - (Date.now() % 30e3)); cookie = await login(); }
    const naS = await werk("support"), naF = await werk("finance"), naV = await stand("demo");
    assert.deepEqual(naS.werk.zaken.map((z) => z.id), voorS.werk.zaken.map((z) => z.id), "dezelfde zaakcodes na een herstart");
    assert.deepEqual(naF.vorige.notities.map((n) => n.tekst), voorF.vorige.notities.map((n) => n.tekst));
    assert.equal(naF.vorige.notities[0].tekst, "Bewaar mij: notitie voor de herstart-test.");
    assert.deepEqual(naV.loket.concepten.map((c) => [c.id, c.stand]), voorV.loket.concepten.map((c) => [c.id, c.stand]), "concepten en besluiten blijven");
    assert.equal(naV.agent.mails.length, voorV.agent.mails.length, "het demopostvak blijft");
    assert.equal(naV.loket.agents.support.stand, "aan");

    const demoBestand = await bestand("beheer-demo.json"), echtLoket = await bestand("beheer-loket.json");
    assert.ok(!/Echtelaan|echtelaan|Ellen|0123456789abcdef/.test(demoBestand), "niets van de echte praktijk in de demo");
    for (const adres of demoBestand.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) assert.ok(/\.invalid$/.test(adres) || adres === "vera@beheer.example", "elk adres in de demo is .invalid (of de beheerder die klikte): " + adres);
    assert.ok(!echtLoket.includes("Bewaar mij") && !echtLoket.includes("Je betaling bij Fysiplan"), "niets van de demo in het echte loket");
    const server = await readFile(join(root, "server.js"), "utf8");
    assert.ok(!/beheer-demo\.json/.test(server), "de demo staat niet in de reservekopie");

    // Demo opnieuw beginnen wist wel: nieuwe codes, notitie weg, ook na een herstart
    assert.equal((await om("demo-opnieuw", {}, "demo")).status, 200);
    const nieuw = await werk("finance");
    assert.ok(!nieuw.vorige.notities.some((n) => n.tekst.startsWith("Bewaar mij")));
    assert.notDeepEqual((await werk("support")).werk.zaken.map((z) => z.id), naS.werk.zaken.map((z) => z.id));
    // een bewaarde demo van een andere vorm wordt niet teruggezet
    const o = JSON.parse(await bestand("beheer-demo.json"));
    await stop();
    await writeFile(join(dataDir, "beheer-demo.json"), JSON.stringify({ ...o, versie: 999 }));
    await start();
    assert.equal((await werk("support")).ok, true, "een onbekende vorm: de demo begint opnieuw in plaats van te breken");
    assert.equal(JSON.parse(await bestand("beheer-demo.json")).versie, o.versie);
  }

  // na een herstart opnieuw inloggen als de sessie weg is
  async function herstart(tussendoor) {
    await stop();
    if (tussendoor) await tussendoor();
    await start();
    if ((await fetch(origin + "/api/beheer/omgeving?bron=demo", { headers: kop() })).status !== 200) { await wacht(31e3 - (Date.now() % 30e3)); cookie = await login(); }
  }

  // ---- 5. een demobestand dat niet terug kan: opzij, niet weg, en de reden op de pagina ----
  {
    const opzij = async (voor) => (await readdir(dataDir)).filter((n) => n.startsWith("beheer-demo." + voor + "-"));
    const [versieBestand] = await opzij("versie-999");
    assert.ok(versieBestand, "het bestand van de andere vorm staat apart");
    assert.equal(JSON.parse(await bestand(versieBestand)).versie, 999, "met de oude inhoud");
    let v = await stand("demo");
    assert.match(v.demoReset.reden, /andere vorm \(versie 999, nu 1\)/);
    assert.equal(v.demoReset.bestand, versieBestand);
    assert.equal((await stand("echt")).demoReset, undefined, "de reden staat alleen bij de demo");
    // de reden blijft na nog een herstart; "Demo opnieuw beginnen" haalt haar weg
    await herstart();
    assert.equal((await stand("demo")).demoReset.bestand, versieBestand);
    // onleesbaar: ook opzij, met de inhoud zoals ze was
    await herstart(() => writeFile(join(dataDir, "beheer-demo.json"), "{kapot"));
    const [kapot] = await opzij("onleesbaar");
    assert.equal(await bestand(kapot), "{kapot");
    v = await stand("demo");
    assert.match(v.demoReset.reden, /niet te lezen/);
    assert.equal((await om("demo-opnieuw", {}, "demo")).status, 200);
    assert.equal((await stand("demo")).demoReset, undefined);
  }

  // ---- 6. een bericht dat bij een herstart onderweg was: uitkomst onbekend, een mens beslist ----
  {
    let gekozen = null;
    await herstart(async () => {
      const o = JSON.parse(await bestand("beheer-demo.json"));
      gekozen = o.loket.concepten.find((c) => c.stand === "wacht") || o.loket.concepten[0];
      Object.assign(gekozen, { stand: "bezig" });
      o.loket.concepten = o.loket.concepten.map((c) => (c.id === gekozen.id ? gekozen : c));
      await writeFile(join(dataDir, "beheer-demo.json"), JSON.stringify(o));
    });
    let c = (await stand("demo")).loket.concepten.find((x) => x.id === gekozen.id);
    assert.equal(c.stand, "onbekend", "bezig wordt na een herstart onbekend, niet opnieuw verstuurbaar");
    // niet opnieuw te versturen of af te wijzen, en de praktijk krijgt intussen niets nieuws
    assert.equal((await om("loket/concept", { id: c.id, besluit: "verstuur" }, "demo")).status, 404);
    for (const rol of ["support", "finance"]) for (const z of (await werk(rol)).werk.zaken.filter((x) => x.praktijk === c.praktijk)) assert.equal(z.eigenBericht.kan, false, rol + " " + z.soort);
    assert.equal((await om("loket/concept", { id: c.id, besluit: "nagekeken", uitkomst: "misschien" }, "demo")).status, 400);
    const voor = (await stand("demo")).agent.mails.length;
    assert.equal((await om("loket/concept", { id: c.id, besluit: "nagekeken", uitkomst: "verstuurd" }, "demo")).status, 200);
    const na = await stand("demo");
    c = na.loket.concepten.find((x) => x.id === gekozen.id);
    assert.equal(c.stand, "verstuurd");
    assert.equal(na.agent.mails.length, voor, "nakijken verstuurt zelf niets");
    assert.equal((await om("loket/concept", { id: c.id, besluit: "nagekeken", uitkomst: "verstuurd" }, "demo")).status, 404, "maar één keer");
  }

  // ---- 7. opslaan vóór het antwoord: lukt het niet, dan geen succes ----
  {
    // foutinjectie: op de plek van beheer-demo.json staat een map, dus vervangen lukt niet
    await rm(join(dataDir, "beheer-demo.json"));
    await mkdir(join(dataDir, "beheer-demo.json", "blok"), { recursive: true });
    let r = await om("mailstand", { soort: "eigen-bericht", stand: "uit" }, "demo");
    let j = await r.json();
    assert.deepEqual([r.status, j.opslagFout], [500, true], "beheer krijgt een fout, geen 200");
    r = await agent("finance", "actie", { actie: "notitie", periode: "2026-K4", tekst: "Na de opslagfout." });
    assert.deepEqual([r.status, (await r.json()).opslagFout], [500, true], "de agent ook");
    // een weigering blijft een weigering (geen 500 die de echte reden verbergt)
    assert.equal((await agent("finance", "actie", { actie: "notitie", periode: "2026", tekst: "Bel 010-1234567." })).status, 400);
    // de echte kant merkt niets van een kapotte demo
    assert.equal((await om("loket/agent", { rol: "tech", stand: "proef" })).status, 200);
    await rm(join(dataDir, "beheer-demo.json"), { recursive: true });
    r = await agent("finance", "actie", { actie: "notitie", periode: "2026-K4", tekst: "Na het herstel." });
    assert.equal(r.status, 200);
    const demoNu = await bestand("beheer-demo.json");
    assert.ok(demoNu.includes("Na het herstel.") && demoNu.includes("Na de opslagfout."), "na herstel staat alles op schijf");
  }

  // ---- 8. vaste telefoonnummers blijven gevoelig, niet alleen 06 ----
  for (const nr of ["010-1234567", "0201234567", "+31 20 123 4567", "06-12345678"]) {
    const r = await agent("finance", "actie", { actie: "notitie", periode: "2026", tekst: "Bel " + nr + " terug." });
    assert.equal(r.status, 400, nr);
  }
  assert.equal((await agent("finance", "actie", { actie: "notitie", periode: "2026", tekst: "Weekcijfers 0 14 10 13 10 10 15, factuur FP-2026-0089." })).status, 200, "cijferreeksen zonder telefoonnummer mogen");
  // ---- 9. browser: afwijzen met een formulier in de kaart, met het toetsenbord ----
  // (prompt() toonde in een ingebouwde browser niets.) Alleen als Playwright er is; de CI heeft het niet.
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-loket-demo: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.88.0.9" } });
      const [naam, waarde] = cookie.split("=");
      await ctx.addCookies([{ name: naam, value: waarde, url: origin }]);
      const page = await ctx.newPage();
      const fouten = [], dialogen = [];
      page.on("pageerror", (e) => fouten.push(e.message));
      page.on("dialog", (dl) => { dialogen.push(dl.type()); dl.dismiss(); });
      // een vers concept van de support-agent om af te wijzen
      assert.equal((await om("mailstand", { soort: "eigen-bericht", stand: "handmatig" }, "demo")).status, 200);
      const z = (await werk("support")).werk.zaken.find((x) => x.eigenBericht.kan);
      assert.ok(z, "er is een zaak waarvoor een bericht kan");
      assert.equal((await agent("support", "actie", { actie: "eigen-mail", zaak: z.id, ...tekst(40) })).status, 200);
      const c = (await stand("demo")).loket.concepten.find((x) => x.stand === "wacht" && x.onderwerp.endsWith("(40)"));
      await page.goto(origin + "/dashboard88/omgeving?bron=demo#agents");
      const knop = page.locator('[data-afwijzen="' + c.id + '"]');
      await knop.waitFor();
      // met het toetsenbord openen: focus op het reden-veld
      await knop.focus();
      await page.keyboard.press("Enter");
      await page.locator(".redenvorm textarea").waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.tagName), "TEXTAREA", "de focus staat in het reden-veld");
      assert.equal(await knop.getAttribute("aria-expanded"), "true");
      await page.keyboard.type("Nog even niet");
      // Esc annuleert: formulier weg, focus terug op Afwijzen, het concept wacht nog
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".redenvorm").count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.afwijzen), c.id, "de focus is terug op de knop");
      assert.equal((await stand("demo")).loket.concepten.find((x) => x.id === c.id).stand, "wacht", "annuleren verandert niets");
      // de knop Annuleren doet hetzelfde
      await page.keyboard.press("Enter");
      await page.locator(".redenvorm").waitFor();
      await page.locator("[data-reden-annuleer]").click();
      assert.equal(await page.locator(".redenvorm").count(), 0);
      assert.equal((await stand("demo")).loket.concepten.find((x) => x.id === c.id).stand, "wacht");
      // Shift+Enter is een nieuwe regel, Enter bevestigt
      await knop.focus();
      await page.keyboard.press("Enter");
      await page.locator(".redenvorm textarea").waitFor();
      await page.keyboard.type("Toon is te streng");
      await page.keyboard.press("Shift+Enter");
      assert.equal(await page.locator(".redenvorm").count(), 1, "Shift+Enter verstuurt niet");
      await page.keyboard.type("en te lang");
      await page.keyboard.press("Enter");
      await page.locator("#melding:not([hidden])").waitFor();
      for (let i = 0; i < 50 && (await stand("demo")).loket.concepten.find((x) => x.id === c.id).stand === "wacht"; i++) await wacht(100);
      const na = (await stand("demo")).loket.concepten.find((x) => x.id === c.id);
      assert.equal(na.stand, "afgewezen");
      assert.match(na.reden, /^Toon is te streng\s+en te lang$/, "de hele reden komt aan (de server maakt van de nieuwe regel een spatie)");
      assert.equal(await page.locator('[data-afwijzen="' + c.id + '"]').count(), 0, "het concept staat niet meer bij wachtend");
      // een taak van de chief of staff afwijzen gaat net zo (gedeeld geheugen, alleen demo)
      // een taak van de chief of staff en een concept van de groei-agent gaan net zo (alleen demo)
      for (const [attr, lijst, veld] of [["data-taak", "taken", "status"], ["data-groei", "groei", "stand"]]) {
        const k = page.locator("[" + attr + '][data-besluit="afwijzen"]').first();
        assert.equal(await k.count(), 1, attr + ": de demo heeft er een om af te wijzen");
        const id = await k.getAttribute(attr);
        await k.click();
        await page.keyboard.type("bewaar mij");
        await page.keyboard.press("Escape");
        assert.equal((await stand("demo")).loket.geheugen[lijst].find((x) => x.id === id)[veld] === "afgewezen", false, attr + ": annuleren wijst niet af");
        await k.click();
        await page.locator(".redenvorm textarea").fill("Geen tijd deze week");
        await page.keyboard.press("Enter");
        await page.locator("[" + attr + '="' + id + '"][data-besluit="afwijzen"]').waitFor({ state: "detached" });
        assert.equal((await stand("demo")).loket.geheugen[lijst].find((x) => x.id === id)[veld], "afgewezen", attr);
      }
      assert.deepEqual(dialogen, [], "geen prompt() of confirm() nodig");
      assert.deepEqual(fouten, []);
      await ctx.close();
    } finally { await browser.close(); }
  }
  console.log("test-loket-demo: ok");
} catch (err) {
  console.error(log.slice(-2000));
  throw err;
} finally {
  await stop();
  mailApi.close();
  await wacht(100);
  await rm(tmp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
