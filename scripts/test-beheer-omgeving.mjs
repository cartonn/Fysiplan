// De beheer- en finance-omgeving (/dashboard88/omgeving), opdracht van Ahmed 2026-11-12:
// per praktijk zien hoeveel therapeuten het platform gebruiken en hoe het gaat, agents die
// problemen signaleren en oplossen en kunnen mailen, en finance met facturen, btw en de
// jaarafsluiting; eerst met nepgegevens om de weergave en de agents te testen.
//
// Wat hier vastligt:
// - De rekenkern (lib/beheer-omgeving.js): signalen en health per praktijk, de support-agent,
//   omzet, btw per kwartaal, prognose, de controles van de accountant-agent en de exports.
// - De nepgegevens (lib/beheer-demo.js) bestaan alleen in het geheugen: elke keer dezelfde, elk
//   adres op .invalid, en niets ervan komt in de datamap of bij de mailprovider.
// - Naar echte adressen gaat pas mail als een beheerder die soort bericht heeft aangezet; alles
//   staat standaard uit. Elke stap staat in het beheerlogboek.
// - Beheer ziet tellingen, nooit de naam van een patiënt of de inhoud van een kaart.
// Nepmail-API op localhost; past in CI. `npm run test:beheeromgeving`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signalenVan, healthVan, praktijkOverzicht, supportRonde, storingOntvangers, mailTekst, MAIL_SOORTEN, financeOverzicht, financeInstellingen,
  splits, financeAgent, jaarControle, exportCsv, aangifteDeadline, kwartaalVan, maandVan, euroTekst } from "../lib/beheer-omgeving.js";
import { demoBron, demoInstellingen, DEMO_LEVERANCIER } from "../lib/beheer-demo.js";
import { beschikbaarheid } from "../lib/beheer-omgeving-routes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const DAG = 86400e3;
const NU = Date.parse("2026-11-12T13:00:00Z");

// ---- 0. de rekenkern ----
{
  // de nepgegevens: elke keer dezelfde, en geen adres dat kan bestaan
  const a = demoBron(NU), b = demoBron(NU);
  assert.deepEqual(a, b, "de demo is elke keer dezelfde");
  assert.equal(a.soort, "demo");
  assert.ok(a.praktijken.length >= 12 && a.facturen.length > 50 && a.kosten.length > 20);
  const adressen = a.praktijken.flatMap((p) => p.leden.map((l) => l.email));
  assert.ok(adressen.length > 40 && adressen.every((e) => /\.invalid$/.test(e)), "elk adres in de demo eindigt op .invalid");
  assert.equal(new Set(a.praktijken.flatMap((p) => p.leden.map((l) => l.naam))).size, adressen.length, "elke verzonnen persoon heeft een eigen naam");
  assert.ok(a.facturen.every((f) => f.datum <= NU && Number.isInteger(f.totaalCent) && f.totaalCent === f.aantal * 999), "facturen: 9,99 per therapeut, niet in de toekomst");
  assert.ok(a.praktijken.every((p) => !p.sinds || p.sinds <= NU), "geen praktijk die in de toekomst begon");
  const kern = await readFile(join(root, "lib/beheer-demo.js"), "utf8");
  assert.doesNotMatch(kern, /node:fs|writeFile|saveJson|fetch\(/, "lib/beheer-demo.js schrijft niets en belt niemand");
  const reken = await readFile(join(root, "lib/beheer-omgeving.js"), "utf8");
  assert.doesNotMatch(reken, /node:fs|writeFile|fetch\(|^import /m, "lib/beheer-omgeving.js is puur rekenwerk");

  // signalen per praktijk
  const lid = (o = {}) => ({ id: "l" + Math.random(), naam: "Test Lid", email: "lid@x.invalid", rol: "therapeut", actief: true, laatst: NU - DAG, tweedeStap: true, ...o });
  const pr = (o = {}) => ({ pk: "p1", naam: "Praktijk", status: "klant", plaatsen: 5, kaarten30: 4, leden: [lid({ rol: "beheerder" }), lid({ rol: "beheerder" })], ...o });
  const soorten = (p) => signalenVan(p, NU).map((s) => s.soort);
  assert.deepEqual(soorten(pr()), [], "een gezonde praktijk heeft geen signalen");
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid({ rol: "beheerder" }), lid({ stapSlot: true })] })), ["tweede-stap-slot"]);
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid({ rol: "beheerder" }), lid({ loginMis: 5 })] })), ["inloggen-mislukt"]);
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid({ rol: "beheerder" }), lid({ loginMis: 4 })] })), [], "vier missers is nog geen zaak");
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid({ rol: "beheerder" }), lid({ actief: false, uitnodigingVerloopt: NU - 1 })] })), ["uitnodiging-verlopen"]);
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid({ rol: "beheerder" }), lid({ actief: false, uitnodigingVerloopt: NU + DAG })] })), [], "een lopende uitnodiging is geen zaak");
  assert.deepEqual(soorten(pr({ incassoMislukt: true })), ["betaling-mislukt"]);
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid(), lid()] })), ["een-beheerder"]);
  assert.deepEqual(soorten(pr({ leden: [lid({ rol: "beheerder" }), lid()] })), [], "twee mensen met één beheerder: geen advies");
  assert.deepEqual(soorten(pr({ plaatsen: 1 })), ["meer-dan-betaald"]);
  assert.deepEqual(soorten(pr({ status: "proef", plaatsen: 0, proefTot: NU + 2 * DAG })), ["proef-loopt-af"]);
  assert.deepEqual(soorten(pr({ status: "proef", plaatsen: 0, proefTot: NU + 5 * DAG })), []);
  assert.deepEqual(soorten(pr({ kaarten30: 0, leden: [lid({ rol: "beheerder", laatst: NU - 20 * DAG }), lid({ rol: "beheerder", laatst: NU - 15 * DAG })] })), ["stil"]);
  assert.deepEqual(soorten(pr({ status: "v1", plaatsen: 0, kaarten30: 0, leden: [lid({ laatst: null }), lid({ laatst: null }), lid({ laatst: null })] })), [], "de V1-praktijk krijgt geen signalen");
  assert.deepEqual(healthVan([]), { score: 100, stand: "goed" });
  assert.deepEqual(healthVan([{ ernst: "aandacht" }]), { score: 90, stand: "aandacht" });
  assert.deepEqual(healthVan([{ ernst: "probleem" }, { ernst: "aandacht" }]), { score: 60, stand: "probleem" });
  assert.equal(healthVan(Array(5).fill({ ernst: "probleem" })).score, 0, "de score gaat niet onder nul");

  const o = praktijkOverzicht(a);
  assert.equal(o.totalen.praktijken, a.praktijken.length);
  assert.equal(o.totalen.goed + o.totalen.aandacht + o.totalen.probleem, o.totalen.praktijken);
  assert.equal(o.rijen[0].stand, "probleem", "problemen staan bovenaan");
  assert.ok(o.totalen.probleem >= 3 && o.totalen.aandacht >= 3 && o.totalen.goed >= 3, "de demo heeft van alles wat");
  assert.doesNotMatch(JSON.stringify(o), /hash|geheim|reserve|totp/, "geen wachtwoord of geheim in het overzicht");

  // de support-agent
  const uit = supportRonde(a);
  assert.ok(uit.length >= 8);
  assert.ok(uit.every((z) => !z.nu), "standaard verstuurt de agent niets");
  for (const soort of ["inloggen-mislukt", "tweede-stap-slot", "uitnodiging-verlopen", "een-beheerder", "stil", "betaling-mislukt", "meer-dan-betaald", "proef-loopt-af"]) assert.ok(uit.some((z) => z.soort === soort), "de demo heeft een zaak " + soort);
  assert.ok(uit.filter((z) => MAIL_SOORTEN[z.soort]).every((z) => z.mails.length > 0 && z.mailStand === "uit"));
  assert.ok(uit.filter((z) => !MAIL_SOORTEN[z.soort]).every((z) => z.taak && !z.mails.length), "een zaak zonder mail is een taak voor beheer");
  const auto = supportRonde(a, { stand: { "inloggen-mislukt": "automatisch", stil: "handmatig" } });
  assert.deepEqual([...new Set(auto.filter((z) => z.nu).map((z) => z.soort))], ["inloggen-mislukt"], "alleen de soort op automatisch gaat vanzelf");
  const eerste = auto.find((z) => z.nu);
  const later = supportRonde(a, { stand: { "inloggen-mislukt": "automatisch" }, verstuurd: { [eerste.sleutel]: NU - 6 * DAG } });
  assert.equal(later.find((z) => z.sleutel === eerste.sleutel).nu, false, "binnen een week niet nog een keer");
  const weekLater = supportRonde(a, { stand: { "inloggen-mislukt": "automatisch" }, verstuurd: { [eerste.sleutel]: NU - 7 * DAG } });
  assert.equal(weekLater.find((z) => z.sleutel === eerste.sleutel).nu, true, "na een week wel");
  const slot = uit.find((z) => z.soort === "tweede-stap-slot");
  assert.equal(slot.mails.length, 1, "de mail over het slot gaat alleen naar die ene login");
  const verlopen = uit.find((z) => z.soort === "uitnodiging-verlopen");
  assert.match(verlopen.mails[0].tekst, /Kim Verhoeven/);
  assert.notEqual(verlopen.mails[0].aan, "kim@praktijk-hoogland.invalid", "de verlopen uitnodiging gaat naar de beheerder, niet naar de collega");
  for (const soort of Object.keys(MAIL_SOORTEN).filter((s) => s !== "storing")) {
    const m = mailTekst(soort, { praktijk: "Fysio Test", naam: "Sanne de Vries", collega: "Kim" });
    assert.ok(m && m.onderwerp.length > 8 && m.tekst.startsWith("Hallo Sanne,"), soort);
    assert.doesNotMatch(m.onderwerp + m.tekst, /pati[eë]nt|kaart van|undefined|null/i, soort + ": geen patiënt in een mail van de agent");
  }
  assert.equal(mailTekst("betaling-mislukt", {}), null);
  const beheerders = storingOntvangers(a, { wie: "beheerders" }), iedereen = storingOntvangers(a, { wie: "iedereen" });
  assert.ok(beheerders.length > 10 && iedereen.length > beheerders.length);
  assert.equal(new Set(iedereen.map((x) => x.email)).size, iedereen.length, "elk adres één keer");
  assert.ok(!iedereen.some((x) => x.praktijk === "Fysio Oude Haven"), "een gestopte praktijk krijgt geen storingsbericht");

  // finance
  assert.deepEqual(splits(999, financeInstellingen({})), { excl: 826, btw: 173 }, "21% zit in het betaalde bedrag");
  assert.deepEqual(splits(999, financeInstellingen({ kor: "ja" })), { excl: 999, btw: 0 }, "met de KOR geen btw");
  assert.deepEqual(financeInstellingen({ prijsBtw: "gek", kor: 3, btwTarief: 99 }), { prijsBtw: "onbekend", kor: "onbekend", btwTarief: 21, prijsCent: 999, aangiftes: {}, afgesloten: {} });
  assert.equal(maandVan(Date.parse("2026-12-31T23:30:00Z")), "2027-01", "maanden in Nederlandse tijd");
  assert.equal(kwartaalVan(Date.parse("2026-03-31T12:00:00Z")), "2026-K1");
  assert.equal(aangifteDeadline("2026-K3"), "2026-10-31");
  assert.equal(aangifteDeadline("2026-K4"), "2027-01-31");
  assert.equal(aangifteDeadline("2026-K1"), "2026-04-30");
  assert.equal(euroTekst(-123456), "−€ 1.234,56");
  const inst = demoInstellingen(NU);
  const f = financeOverzicht(a, inst);
  assert.equal(f.signalen.length, 2, "de btw-keuze en de KOR zijn nog niet gekozen, en dat staat er");
  assert.equal(f.maanden.length, 12);
  assert.equal(f.prognose.length, 12);
  const totaal = a.facturen.reduce((t, x) => t + x.totaalCent, 0);
  assert.equal(f.facturen.reduce((t, x) => t + x.excl + x.btw, 0), totaal, "excl. plus btw is wat er betaald is, tot op de cent");
  assert.equal(f.jaren.reduce((t, j) => t + j.omzet + j.btw, 0), totaal, "de jaren tellen op tot alle facturen");
  assert.equal(f.kwartalen.reduce((t, j) => t + j.omzet, 0), f.jaren.reduce((t, j) => t + j.omzet, 0), "kwartalen en jaren kloppen met elkaar");
  assert.equal(f.kpi.betaald + f.kpi.open, f.kpi.facturen);
  assert.equal(f.kpi.open, 2);
  assert.equal(f.kpi.mrr, f.kpi.arr / 12);
  assert.ok(f.prognose.every((p) => p.laag <= p.verwacht && p.verwacht <= p.hoog), "de prognose ligt binnen haar bandbreedte");
  assert.ok(f.kpi.groeiPct >= 0 && f.kpi.groeiPct <= 25);
  const k4 = f.btw.find((b) => b.kwartaal === "2026-K4"), k3 = f.btw.find((b) => b.kwartaal === "2026-K3");
  assert.equal(k4.stand, "loopt");
  assert.equal(k3.stand, "ingediend");
  assert.equal(k3.teBetalen, k3.r1a.btw - k3.r5b);
  assert.equal(financeOverzicht(a, { ...inst, aangiftes: {} }).btw.find((b) => b.kwartaal === "2026-K3").stand, "te-laat", "na de uiterste datum is het te laat");
  const kor = financeOverzicht(a, { ...inst, kor: "ja" });
  assert.ok(kor.btw.every((b) => b.r1a.btw === 0 && b.r5b === 0 && (b.stand === "kor" || b.stand === "ingediend")), "met de KOR geen btw en geen aangifte");
  assert.equal(kor.signalen.length, 1);
  const excl = financeOverzicht(a, { ...inst, prijsBtw: "exclusief", kor: "nee" }), incl = financeOverzicht(a, { ...inst, prijsBtw: "inclusief", kor: "nee" });
  assert.ok(excl.prognose[0].verwacht > incl.prognose[0].verwacht, "exclusief btw: de prognose rekent met de hele 9,99");
  assert.deepEqual(excl.facturen.map((x) => x.excl), incl.facturen.map((x) => x.excl), "wat al betaald is, verandert niet door de keuze");
  const leeg = financeOverzicht({ soort: "echt", nu: NU, praktijken: [], facturen: [], kosten: [] }, {});
  assert.equal(leeg.kpi.mrr, 0);
  assert.equal(leeg.btw.length, 0);
  assert.ok(leeg.prognose.every((p) => p.verwacht === 0));

  // de finance-agent
  const fa = financeAgent(a, f);
  const titels = fa.map((p) => p.titel).join(" | ");
  assert.equal(fa[0].ernst, "probleem", "problemen eerst");
  for (const deel of ["Incasso mislukt bij Sportfysio Het Veld", "Fysio Centrum Oost gebruikt 9 logins en betaalt voor 7", "Fysio Kerkstraat heeft opgezegd", "Proef van Fysio Molenweg loopt bijna af", "1 betaling zonder factuurnummer", "Btw-keuze nog open", "KOR nog niet gekozen", "Boekjaar 2025 is nog niet afgesloten"]) {
    assert.ok(titels.includes(deel), "de finance-agent meldt: " + deel);
  }
  assert.match(fa.find((p) => p.titel.startsWith("Fysio Centrum Oost")).tekst, /€ 19,98 per maand/);
  assert.ok(fa.every((p) => ["btw", "facturen", "praktijken", "finance", "jaar"].includes(p.naar)));
  const laat = financeOverzicht(a, { ...inst, aangiftes: {} });
  assert.ok(financeAgent(a, laat).some((p) => p.ernst === "probleem" && p.titel === "Btw-aangifte 2026 K3 is te laat"));
  assert.deepEqual(financeAgent({ soort: "echt", nu: NU, praktijken: [], facturen: [], kosten: [] }, leeg).map((p) => p.titel), ["Btw-keuze nog open", "KOR nog niet gekozen"]);

  // de accountant-agent
  const j26 = jaarControle(a, inst, "2026", DEMO_LEVERANCIER), j25 = jaarControle(a, inst, "2025", DEMO_LEVERANCIER);
  const punt = (j, id) => j.controles.find((c) => c.id === id);
  assert.equal(punt(j26, "reeks").ok, false);
  assert.match(punt(j26, "reeks").tekst, /ontbreekt: FP-2026-0023/, "het gat in de nummerreeks van de demo wordt gevonden");
  assert.equal(punt(j26, "nummers").ok, false, "de betaling zonder nummer wordt gevonden");
  assert.equal(punt(j26, "debiteuren").ok, null, "open posten: nakijken, geen fout");
  assert.equal(j26.kanAfsluiten, false, "een lopend jaar kan niet dicht");
  assert.equal(punt(j25, "reeks").ok, true);
  assert.equal(punt(j25, "btw").ok, true, "alleen kwartalen met cijfers vragen een aangifte");
  assert.equal(punt(j25, "btwkeuze").ok, false);
  assert.equal(j25.kanAfsluiten, false, "zonder btw-keuze kan het jaar niet dicht");
  assert.equal(jaarControle(a, { ...inst, prijsBtw: "inclusief", kor: "nee" }, "2025", DEMO_LEVERANCIER).kanAfsluiten, true);
  assert.equal(punt(jaarControle(a, { ...inst, prijsBtw: "inclusief", kor: "nee" }, "2025", {}), "bedrijf").ok, false, "zonder bedrijfsgegevens zijn het geen facturen");
  const dubbel = { ...a, facturen: [...a.facturen, { ...a.facturen[0] }] };
  assert.match(punt(jaarControle(dubbel, inst, "2025", DEMO_LEVERANCIER), "reeks").tekst, /dubbel: FP-2025-0001/);

  // de exports
  const fac = exportCsv("facturen", f, "2026");
  assert.ok(fac.startsWith("\ufeffFactuurnummer;Datum;Praktijk;"), "met BOM en puntkomma, voor Excel in Nederland");
  assert.equal(fac.trim().split("\r\n").length - 1, a.facturen.filter((x) => maandVan(x.datum).startsWith("2026")).length);
  assert.match(exportCsv("btw", f, "2026"), /2026-K1;495,38;104,02;117,50;-13,48;2026-04-30;ingediend/, "een negatief bedrag blijft een getal");
  const vals = financeOverzicht({ ...a, facturen: [{ nr: "FP-2026-0001", datum: NU, pk: "x", praktijk: "=HYPERLINK(\"http://x\")", aantal: 1, totaalCent: 999, status: "betaald", betaaldOp: NU }] }, inst);
  assert.match(exportCsv("facturen", vals, ""), /;"'=HYPERLINK\(""http:\/\/x""\)";/, "een praktijknaam die op een formule lijkt, wordt tekst");
  for (const soort of ["debiteuren", "kosten", "jaaroverzicht"]) assert.ok(exportCsv(soort, f, "2026").split("\r\n").length > 2, soort);
  assert.equal(exportCsv("iets-anders", f, "2026"), null);

  // beschikbaarheid uit de hartslag van de server
  const dag = (d) => new Date(NU - d * DAG).toISOString().slice(0, 10);
  assert.deepEqual(beschikbaarheid({ eerste: 0, dagen: {} }, NU), []);
  const b3 = beschikbaarheid({ eerste: Date.parse(dag(2) + "T00:00:00Z"), dagen: { [dag(2)]: 1440, [dag(1)]: 1296, [dag(0)]: 13 * 60 } }, NU);
  assert.deepEqual(b3, [{ datum: dag(2), pct: 100 }, { datum: dag(1), pct: 90 }, { datum: dag(0), pct: 100 }]);
}

// ---- nepmail en de server ----
const tmp = await mkdtemp(join(tmpdir(), "fysiplan-beheeromgeving-"));
const dataDir = join(tmp, "data");
await mkdir(dataDir, { recursive: true });
const PK = "p-0123456789abcdef";
const PATIENT = "Uniekepatient Zandstra";
// een praktijk met drie logins: één beheerder, en één login met de tweede stap op slot
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({ [PK]: { naam: "Fysio Testlaan", hash: "scrypt$00$00", gedeeldUit: true, gemaakt: Date.now() - 40 * DAG, leden: [
  { id: "aaaaaaaaaaaa", naam: "Bea Beheer", email: "bea@testlaan.example", rol: "beheerder", hash: "scrypt$00$00", gemaakt: Date.now() - 40 * DAG, laatst: Date.now() - 3600e3, totp: { geheim: "JBSWY3DPEHPK3PXP", sinds: 1, stap: 1, reserve: ["x"] } },
  { id: "bbbbbbbbbbbb", naam: "Tom Therapeut", email: "tom@testlaan.example", rol: "therapeut", hash: "scrypt$00$00", gemaakt: Date.now() - 30 * DAG, laatst: Date.now() - DAG, totp: { geheim: "JBSWY3DPEHPK3PXP", sinds: 1, stap: 1, reserve: [], mis: { start: Date.now() - 3600e3, n: 3 } } },
  { id: "cccccccccccc", naam: "Iris Invaller", email: "iris@testlaan.example", rol: "therapeut", hash: "scrypt$00$00", gemaakt: Date.now() - 30 * DAG, laatst: Date.now() - 2 * DAG }
] } }));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ [PK]: { "uniekepatient zandstra": { id: "abcdef012345", praktijk: "Fysio Testlaan", naam: PATIENT, ts: Date.now() - DAG, client: { naam: PATIENT }, chosen: [], rows: [], cells: {}, vids: {} } } }));

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
const SLEUTEL = "test-sleutel-" + Math.random().toString(16).slice(2);
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
let log = "";
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit",
  PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", TOTP_MIS_PER_DAG: "3", MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: `http://127.0.0.1:${mailApi.address().port}` };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_)/.test(k) || k === "NODE_ENV") delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.86.0." + (ip++ & 255), "x-admin-sleutel": SLEUTEL, ...extra });
  const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
  const post = (pad, body, extra) => fetch(origin + "/api/beheer/omgeving/" + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
  const stand = async (bron) => (await get("/api/beheer/omgeving?bron=" + bron)).json();
  const logboek = async () => (await readFile(join(dataDir, "beheer-log.jsonl"), "utf8").catch(() => "")).split("\n").filter(Boolean).map((r) => JSON.parse(r));
  const bestanden = async () => (await readdir(dataDir)).filter((n) => /^(finance-|beheer-agent)/.test(n)).sort();

  // ---- 1. de pagina en de toegang ----
  {
    const r = await fetch(origin + "/dashboard88/omgeving");
    assert.equal(r.status, 200);
    const csp = r.headers.get("content-security-policy");
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self';/, "geen inline script op de pagina");
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(r.headers.get("cache-control"), /no-store/);
    const html = await r.text();
    assert.match(html, /<script type="module" src="\/beheer-omgeving\.js"><\/script>/);
    const los = await fetch(origin + "/beheer.html", { redirect: "manual" });
    assert.deepEqual([los.status, los.headers.get("location")], [302, "/dashboard88/omgeving"], "het bestand zelf stuurt door naar het adres met de koppen");
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>|on(click|load)=|style="/, "geen inline script of stijl in de pagina");
    assert.equal((await fetch(origin + "/dashboard88")).status, 200, "het oude dashboard staat er nog");
    for (const pad of ["/api/beheer/omgeving", "/api/beheer/omgeving?bron=demo", "/api/beheer/omgeving/export?soort=facturen"]) {
      assert.ok([401, 403].includes((await fetch(origin + pad)).status), pad + " zonder login");
      assert.ok([401, 403].includes((await fetch(origin + pad, { headers: { "x-admin-sleutel": "admin88" } })).status), pad + " met de standaardsleutel");
    }
    assert.ok([401, 403].includes((await fetch(origin + "/api/beheer/omgeving/ronde", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status));
    assert.equal((await post("ronde", { bron: "demo" }, { "sec-fetch-site": "cross-site" })).status, 403, "niet vanaf een andere website");
    assert.equal((await fetch(origin + "/api/beheer/omgeving/ronde", { method: "POST", headers: kop(), body: "[1]" })).status, 400);
  }

  // ---- 2. demo: alles werkt, niets komt op schijf en er gaat geen mail weg ----
  {
    const d = await stand("demo");
    assert.equal(d.bron, "demo");
    assert.equal(d.overzicht.totalen.praktijken, 15);
    assert.ok(d.zaken.length >= 8 && d.finance.kpi.facturen > 50 && d.jaren.length >= 2);
    assert.ok(d.zaken.every((z) => z.mails.every((m) => /\.invalid$/.test(m.aan))));
    let r = await post("mailstand", { bron: "demo", soort: "inloggen-mislukt", stand: "automatisch" });
    assert.equal(r.status, 200);
    assert.equal((await post("mailstand", { bron: "demo", soort: "storing", stand: "automatisch" })).status, 400, "een storingsbericht gaat nooit automatisch");
    assert.equal((await post("mailstand", { bron: "demo", soort: "bestaat-niet", stand: "handmatig" })).status, 400);
    r = await (await post("ronde", { bron: "demo" })).json();
    assert.equal(r.agent.rondes[0].verstuurd, 2, "de twee zaken ‘inloggen lukt niet’ gaan in demo naar het postvak");
    assert.equal(r.agent.mails.length, 2);
    assert.equal((await (await post("ronde", { bron: "demo" })).json()).agent.rondes[0].verstuurd, 0, "een tweede ronde stuurt niet opnieuw");
    const zaak = r.zaken.find((z) => z.soort === "tweede-stap-slot");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: zaak.sleutel })).status, 200, "in demo kan versturen ook met de soort op uit");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: zaak.sleutel })).status, 409, "maar niet twee keer in een week");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: "bestaat|niet|" })).status, 404);
    const tekst = "Hallo,\n\nFysiplan werkt op dit moment niet goed. We werken eraan.\n\nGroet,\nFysiplan-support";
    assert.equal((await post("storing", { bron: "demo", wie: "beheerders", onderwerp: "Storing bij Fysiplan", tekst, bevestig: 1 })).status, 409, "het aantal ontvangers moet kloppen");
    assert.equal((await post("storing", { bron: "demo", wie: "beheerders", onderwerp: "Storing bij Fysiplan", tekst: tekst.replace("niet goed", "niet goed: [wat er mis is]"), bevestig: d.ontvangers.beheerders })).status, 400, "een invulplek mag niet mee");
    assert.equal((await post("storing", { bron: "demo", wie: "beheerders", onderwerp: "Storing bij Fysiplan", tekst, bevestig: d.ontvangers.beheerders })).status, 200);
    r = await (await post("finance", { bron: "demo", prijsBtw: "inclusief", kor: "nee", btwTarief: 21 })).json();
    assert.equal(r.finance.signalen.length, 0);
    assert.equal((await post("afsluiten", { bron: "demo", jaar: "2026" })).status, 409, "het lopende jaar kan niet dicht");
    r = await (await post("afsluiten", { bron: "demo", jaar: "2025" })).json();
    assert.equal(r.jaren.find((j) => j.jaar === "2025").afgesloten.door, "beheersleutel");
    r = await (await post("kosten", { bron: "demo", datum: "2026-11-01", omschrijving: "Testkosten", categorie: "Overig", bedrag: "121,00", btw: "21" })).json();
    const post1 = r.finance.kosten.find((k) => k.omschrijving === "Testkosten");
    assert.deepEqual([post1.bedragCent, post1.btwCent, post1.exclCent], [12100, 2100, 10000]);
    assert.equal((await post("kosten", { bron: "demo", datum: "2026-11-01", omschrijving: "Fout", bedrag: "10", btw: "11" })).status, 400, "meer btw dan het bedrag kan niet");
    assert.equal((await post("kosten", { bron: "demo", actie: "weg", id: post1.id })).status, 200);
    r = await (await post("aangifte", { bron: "demo", kwartaal: "2026-K3", ingediend: false })).json();
    assert.equal(r.finance.btw.find((b) => b.kwartaal === "2026-K3").stand, "te-laat");
    assert.equal((await post("aangifte", { bron: "demo", kwartaal: "2026-13", ingediend: true })).status, 400);
    const csv = await get("/api/beheer/omgeving/export?bron=demo&soort=facturen&jaar=2026");
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /fysiplan-DEMO-facturen-2026\.csv/, "een demo-export heet ook zo");
    const bytes = Buffer.from(await csv.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "de BOM staat erin, zodat Excel de tekens goed leest");
    assert.ok(bytes.subarray(3).toString("utf8").startsWith("Factuurnummer;"));
    assert.equal((await get("/api/beheer/omgeving/export?bron=demo&soort=onzin")).status, 404);

    await wacht(300);
    assert.equal(mails.length, 0, "in demo gaat er geen enkele mail naar de mailprovider");
    assert.deepEqual(await bestanden(), [], "demo schrijft niets in de datamap");
    assert.deepEqual((await logboek()).filter((x) => /finance|support-agent|storing/.test(x.actie)), [], "en niets in het beheerlogboek");
    // echt is niet geraakt door wat er in demo is ingesteld
    const e = await stand("echt");
    assert.deepEqual(e.agent.stand, {});
    assert.equal(e.finance.instellingen.prijsBtw, "onbekend");
    r = await (await post("demo-opnieuw", { bron: "demo" })).json();
    assert.deepEqual(r.agent.stand, {});
    assert.equal(r.agent.mails.length, 0);
    assert.equal(r.finance.instellingen.prijsBtw, "onbekend", "de demo begint weer bij het begin");
  }

  // ---- 3. echt: tellingen, geen patiëntgegevens ----
  let e = await stand("echt");
  {
    assert.equal(e.bron, "echt");
    assert.equal(e.overzicht.totalen.praktijken, 1);
    const p = e.overzicht.rijen[0];
    assert.equal(p.naam, "Fysio Testlaan");
    assert.equal(p.therapeuten, 3);
    assert.equal(p.kaartenTotaal, 1);
    assert.equal(p.kaarten30, 1);
    assert.equal(p.tweedeStap, 2);
    assert.deepEqual(p.signalen.map((s) => s.soort).sort(), ["een-beheerder", "tweede-stap-slot"]);
    assert.equal(p.stand, "probleem");
    const ruw = JSON.stringify(e);
    assert.doesNotMatch(ruw, /Uniekepatient|Zandstra|abcdef012345/, "geen patiënt en geen kaart-id in wat beheer ophaalt");
    assert.doesNotMatch(ruw, /scrypt\$|JBSWY3DPEHPK3PXP|"reserve"|"hash"/, "geen wachtwoord, geheim of reservecode");
    assert.equal(e.finance.kpi.facturen, 0, "zonder Mollie nog geen facturen");
    assert.equal(e.mail, true);
    assert.ok(e.systeem.checks.some((c) => c.naam === "Betalingen" && c.ok === false));
    assert.ok(Array.isArray(e.systeem.beschikbaarheid));
    const hart = JSON.parse(await readFile(join(dataDir, "beheer-hartslag.json"), "utf8"));
    assert.ok(hart.eerste > 0 && Object.values(hart.dagen)[0] === 1, "de server telt vanaf de start de minuten dat hij draait");
  }

  // ---- 4. echt: mailen kan pas nadat een beheerder de soort aanzet ----
  {
    const slot = e.zaken.find((z) => z.soort === "tweede-stap-slot"), een = e.zaken.find((z) => z.soort === "een-beheerder");
    assert.deepEqual(slot.mails.map((m) => m.aan), ["tom@testlaan.example"]);
    assert.deepEqual(een.mails.map((m) => m.aan), ["bea@testlaan.example"]);
    assert.equal((await post("verstuur", { sleutel: slot.sleutel })).status, 409, "de soort staat uit: er gaat niets weg");
    let r = await (await post("ronde", {})).json();
    assert.equal(r.agent.rondes[0].verstuurd, 0, "een ronde met alles op uit verstuurt niets");
    await wacht(200);
    assert.equal(mails.length, 0);

    assert.equal((await post("mailstand", { soort: "tweede-stap-slot", stand: "handmatig" })).status, 200);
    r = await (await post("ronde", {})).json();
    assert.equal(r.agent.rondes[0].verstuurd, 0, "handmatig: de agent wacht op een klik");
    assert.equal((await post("verstuur", { sleutel: slot.sleutel })).status, 200);
    assert.equal(mails.length, 1);
    assert.deepEqual(mails[0].to, ["tom@testlaan.example"]);
    assert.match(mails[0].subject, /tweede stap/);
    assert.match(mails[0].text, /^Hallo Tom,/);
    assert.match(mails[0].text, /Fysio Testlaan/);
    assert.doesNotMatch(mails[0].text, /Uniekepatient|pati[eë]nt/i);
    assert.equal((await post("verstuur", { sleutel: slot.sleutel })).status, 409, "dezelfde zaak niet twee keer in een week");
    assert.equal((await post("verstuur", { sleutel: een.sleutel })).status, 409, "een andere soort staat nog uit");

    assert.equal((await post("mailstand", { soort: "een-beheerder", stand: "automatisch" })).status, 200);
    r = await (await post("ronde", {})).json();
    assert.equal(r.agent.rondes[0].verstuurd, 1, "automatisch: de ronde verstuurt zelf");
    assert.equal(mails.length, 2);
    assert.deepEqual(mails[1].to, ["bea@testlaan.example"]);
    r = await (await post("ronde", {})).json();
    assert.equal(r.agent.rondes[0].verstuurd, 0);
    assert.equal(mails.length, 2, "en daarna een week niet meer");
    assert.ok(r.zaken.every((z) => z.verstuurd), "bij elke zaak staat dat er gemaild is");

    // storingsbericht: eerst aanzetten, dan het aantal bevestigen
    const tekst = "Hallo,\n\nVanavond tussen 22:00 en 22:30 doen we onderhoud aan Fysiplan.\n\nGroet,\nFysiplan-support";
    assert.equal((await post("storing", { wie: "iedereen", onderwerp: "Gepland onderhoud", tekst, bevestig: 3 })).status, 409, "storingsberichten staan uit");
    assert.equal((await post("mailstand", { soort: "storing", stand: "handmatig" })).status, 200);
    assert.equal((await post("storing", { wie: "iedereen", onderwerp: "Gepland onderhoud", tekst, bevestig: 2 })).status, 409);
    assert.equal((await post("storing", { wie: "beheerders", onderwerp: "Gepland onderhoud", tekst, bevestig: 1 })).status, 200);
    for (let i = 0; i < 40 && mails.length < 3; i++) await wacht(50);
    assert.equal(mails.length, 3);
    assert.deepEqual(mails[2].to, ["bea@testlaan.example"]);
    assert.equal(mails[2].text, tekst);

    const agent = JSON.parse(await readFile(join(dataDir, "beheer-agent.json"), "utf8"));
    assert.deepEqual(agent.stand, { "tweede-stap-slot": "handmatig", "een-beheerder": "automatisch", storing: "handmatig" });
    assert.equal(Object.keys(agent.verstuurd).length, 2);
    const acties = (await logboek()).map((x) => x.actie);
    for (const deel of ["mails ‘Tweede stap op slot’ op handmatig", "support-agent mailde een praktijk", "mails ‘Maar één beheerder’ op automatisch", "storingsbericht verstuurd", "ronde met de hand gestart"]) {
      assert.ok(acties.some((x) => x.includes(deel)), "in het beheerlogboek: " + deel);
    }
    const regel = (await logboek()).find((x) => x.actie === "support-agent mailde een praktijk");
    assert.equal(regel.praktijk, PK);
    assert.match(regel.naar, /^t\*\*\*@testlaan\.example$/, "het adres staat gemaskeerd in het logboek");
  }

  // ---- 5. echt: finance-instellingen, kosten en aangiftes blijven bewaard ----
  {
    let r = await (await post("finance", { prijsBtw: "exclusief", kor: "ja", btwTarief: 21 })).json();
    assert.equal(r.finance.instellingen.kor, "ja");
    assert.equal((await post("kosten", { datum: "2026-10-05", omschrijving: "Hosting oktober", categorie: "Hosting", bedrag: "24.20", btw: "4,20" })).status, 200);
    assert.equal((await post("aangifte", { kwartaal: "2026-K3", ingediend: true, kenmerk: "TEST-1" })).status, 200);
    assert.equal((await post("afsluiten", { jaar: "2026" })).status, 409);
    assert.deepEqual(await bestanden(), ["beheer-agent.json", "finance-instellingen.json", "finance-kosten.json"]);
    const inst = JSON.parse(await readFile(join(dataDir, "finance-instellingen.json"), "utf8"));
    assert.equal(inst.prijsBtw, "exclusief");
    assert.equal(inst.aangiftes["2026-K3"].kenmerk, "TEST-1");
    assert.equal(inst.aangiftes["2026-K3"].door, "beheersleutel");
    const kosten = JSON.parse(await readFile(join(dataDir, "finance-kosten.json"), "utf8")).kosten;
    assert.deepEqual([kosten.length, kosten[0].bedragCent, kosten[0].btwCent], [1, 2420, 420]);
    const csv = await get("/api/beheer/omgeving/export?soort=kosten&jaar=2026");
    assert.match(csv.headers.get("content-disposition"), /fysiplan-kosten-2026\.csv/);
    assert.match(await csv.text(), /2026-10-05;Hosting oktober;Hosting;24,20;0,00;24,20/, "met de KOR telt de btw op kosten niet als voorbelasting");
    const acties = (await logboek()).map((x) => x.actie);
    for (const deel of ["finance: btw-instelling gewijzigd", "finance: kostenpost toegevoegd", "finance: btw-aangifte 2026-K3 als ingediend gemarkeerd", "finance-export gedownload"]) {
      assert.ok(acties.some((x) => x.includes(deel)), "in het beheerlogboek: " + deel);
    }
    // de demo is niet geraakt door wat er echt is ingesteld
    const d = await stand("demo");
    assert.equal(d.finance.instellingen.kor, "onbekend");
    assert.ok(!d.finance.kosten.some((k) => k.omschrijving === "Hosting oktober"));
  }

  // ---- 6. de bestanden van de pagina ----
  {
    const js = await readFile(join(root, "public/beheer-omgeving.js"), "utf8");
    assert.doesNotMatch(js, /\beval\(|new Function\(|document\.write/);
    assert.match(js, /import \{ vraagBeheersleutel \} from '\/beheersleutel\.js'/, "inloggen gaat via dezelfde weg als de andere beheerpagina's");
    const server = await readFile(join(root, "server.js"), "utf8");
    assert.match(server, /join\(dataDir, "finance-instellingen\.json"\), join\(dataDir, "finance-kosten\.json"\), join\(dataDir, "beheer-agent\.json"\)\];/, "de financebestanden gaan mee in de reservekopie");
    const routes = await readFile(join(root, "lib/beheer-omgeving-routes.js"), "utf8");
    assert.match(routes, /if \(!d\.beheerEigen\(req\)\) \{ await d\.denied\(req, res, urlPath\); return true; \}/, "elke route vraagt een eigen login van beheer");
  }
  console.log("test-beheer-omgeving: ok");
} catch (err) {
  console.error(log.slice(-2000));
  throw err;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  mailApi.close();
  await wacht(100);
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
