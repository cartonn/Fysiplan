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
// - Wat de server zelf meet (laatst gezien, foute wachtwoorden, actieve therapeuten per dag), de
//   geschiedenis per praktijk, en dat een ingediende aangifte en een afgesloten jaar vastliggen.
// Nepmail-API op localhost; past in CI. `npm run test:beheeromgeving`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signalenVan, healthVan, praktijkOverzicht, supportRonde, storingOntvangers, mailTekst, MAIL_SOORTEN, financeOverzicht, financeInstellingen,
  splits, financeAgent, jaarControle, jaarCijfers, jaarStand, exportCsv, aangifteDeadline, kwartaalVan, maandVan, euroTekst, gebruikDaling, maakGebruik, dagVan } from "../lib/beheer-omgeving.js";
import { demoBron, demoInstellingen, demoAgent, DEMO_LEVERANCIER } from "../lib/beheer-demo.js";
import { beschikbaarheid, maakBeheerOmgeving, merkGezien, merkLoginMis } from "../lib/beheer-omgeving-routes.js";

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
  // opzeggen en dalend gebruik zijn signalen: zo'n praktijk stond eerst op 100
  assert.deepEqual(soorten(pr({ status: "opgezegd", betaaldTot: NU + 20 * DAG })), ["opgezegd"]);
  assert.match(signalenVan(pr({ status: "opgezegd", betaaldTot: Date.parse("2026-12-09T10:00:00Z") }), NU)[0].tekst, /loopt tot 9 december 2026/);
  assert.deepEqual(gebruikDaling([0, 0, 0, 0, 4, 4, 4, 4, 1, 1, 1, 0]), { nu: 3, voor: 16 });
  assert.equal(gebruikDaling([0, 0, 0, 0, 4, 4, 4, 4, 2, 2, 2, 2]), null, "precies de helft is nog geen daling");
  assert.equal(gebruikDaling([0, 0, 0, 0, 2, 2, 2, 1, 0, 0, 0, 0]), null, "bij minder dan acht kaarten is één rustige maand geen daling");
  assert.equal(gebruikDaling([1, 2, 3]), null);
  assert.deepEqual(soorten(pr({ weken: [5, 5, 5, 5, 5, 5, 5, 5, 1, 1, 1, 1] })), ["gebruik-daalt"]);
  assert.deepEqual(soorten(pr({ status: "gestopt", weken: [5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0] })), [], "een gestopte praktijk krijgt geen signaal over gebruik");
  assert.deepEqual(soorten(pr({ kaarten30: 0, weken: [5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0], leden: [lid({ rol: "beheerder", laatst: NU - 20 * DAG }), lid({ rol: "beheerder", laatst: NU - 15 * DAG })] })), ["stil"], "stil zegt het al: niet ook nog ‘gebruik daalt’");
  assert.deepEqual(healthVan([]), { score: 100, stand: "goed" });
  for (const status of ["gestopt", "v1"]) {
    assert.deepEqual(healthVan([{ ernst: "probleem" }], status), { score: null, stand: "nvt" }, status + ": geen health, er valt niets te bewaken");
    assert.deepEqual(soorten(pr({ status, incassoMislukt: true, leden: [lid({ rol: "beheerder" }), lid({ stapSlot: true }), lid({ loginMis: 9 })] })), [], status + ": geen signalen, dus ook geen mail van de agent");
  }
  assert.equal(healthVan([], "opgezegd").stand, "goed");
  assert.equal(healthVan([{ ernst: "probleem" }], "zonder-abonnement").stand, "probleem", "een praktijk zonder abonnement met werkende logins wordt wel bewaakt");
  assert.deepEqual(healthVan([{ ernst: "aandacht" }]), { score: 90, stand: "aandacht" });
  assert.deepEqual(healthVan([{ ernst: "probleem" }, { ernst: "aandacht" }]), { score: 60, stand: "probleem" });
  assert.equal(healthVan(Array(5).fill({ ernst: "probleem" })).score, 0, "de score gaat niet onder nul");

  const o = praktijkOverzicht(a);
  assert.equal(o.totalen.praktijken, a.praktijken.length);
  assert.equal(o.totalen.goed + o.totalen.aandacht + o.totalen.probleem + o.totalen.nvt, o.totalen.praktijken);
  assert.equal(o.rijen[0].stand, "probleem", "problemen staan bovenaan");
  const gestopt = o.rijen.find((r) => r.naam === "Fysio Oude Haven");
  assert.deepEqual([gestopt.stand, gestopt.score, o.rijen.at(-1).naam, o.totalen.nvt], ["nvt", null, "Fysio Oude Haven", 1], "de gestopte praktijk telt niet als gezond en staat onderaan");
  assert.deepEqual(o.rijen.find((r) => r.naam === "Fysio Kerkstraat").signalen.map((x) => x.soort), ["opgezegd", "gebruik-daalt"]);
  assert.ok(o.rijen.every((r) => r.weken.length === 12 && r.weken.every((n) => Number.isInteger(n) && n >= 0)), "twaalf weken per praktijk");
  assert.ok(o.rijen.every((r) => r.kaarten30 === r.weken.slice(-4).reduce((t, n) => t + n, 0)), "de 30 dagen zijn de laatste vier weken");
  assert.ok(o.rijen.every((r) => r.leden.reduce((t, l) => t + l.kaarten30, 0) === r.kaarten30), "de kaarten per login tellen op tot die van de praktijk");
  assert.ok(o.rijen.every((r) => r.actiefDagen.length === 30 && r.actiefDagen.every((d) => d.n <= r.therapeuten)), "per dag nooit meer actieve therapeuten dan logins");
  assert.ok(o.totalen.probleem >= 3 && o.totalen.aandacht >= 3 && o.totalen.goed >= 3, "de demo heeft van alles wat");
  assert.doesNotMatch(JSON.stringify(o), /hash|geheim|reserve|totp/, "geen wachtwoord of geheim in het overzicht");

  // de support-agent
  const uit = supportRonde(a);
  assert.ok(uit.length >= 8);
  assert.ok(uit.every((z) => !z.nu), "standaard verstuurt de agent niets");
  for (const soort of ["inloggen-mislukt", "tweede-stap-slot", "uitnodiging-verlopen", "een-beheerder", "stil", "betaling-mislukt", "meer-dan-betaald", "proef-loopt-af", "opgezegd", "gebruik-daalt"]) assert.ok(uit.some((z) => z.soort === soort), "de demo heeft een zaak " + soort);
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
  // een storingsbericht schrijft beheer en een eigen bericht schrijft een agent met taalmodel: die
  // twee hebben geen vaste tekst (het eigen bericht keurt de server, zie test-beheer-toegang.mjs)
  assert.equal(mailTekst("eigen-bericht", { praktijk: "Fysio Test", naam: "Sanne" }), null);
  for (const soort of Object.keys(MAIL_SOORTEN).filter((s) => s !== "storing" && s !== "eigen-bericht")) {
    const m = mailTekst(soort, { praktijk: "Fysio Test", naam: "Sanne de Vries", collega: "Kim" });
    assert.ok(m && m.onderwerp.length > 8 && m.tekst.startsWith("Hallo Sanne,"), soort);
    assert.doesNotMatch(m.onderwerp + m.tekst, /pati[eë]nt|kaart van|undefined|null/i, soort + ": geen patiënt in een mail van de agent");
  }
  assert.equal(mailTekst("betaling-mislukt", {}), null);
  const beheerders = storingOntvangers(a, { wie: "beheerders" }), iedereen = storingOntvangers(a, { wie: "iedereen" });
  assert.ok(beheerders.length > 10 && iedereen.length > beheerders.length);
  assert.equal(new Set(iedereen.map((x) => x.email)).size, iedereen.length, "elk adres één keer");
  assert.ok(!iedereen.some((x) => x.praktijk === "Fysio Oude Haven"), "een gestopte praktijk krijgt geen storingsbericht");

  // de agent van de demo heeft al een week gewerkt
  const da = demoAgent(a);
  assert.deepEqual(da.stand, { "inloggen-mislukt": "automatisch", "tweede-stap-slot": "automatisch", "uitnodiging-verlopen": "handmatig" });
  const metStand = supportRonde(a, { stand: da.stand, verstuurd: da.verstuurd });
  assert.deepEqual(Object.keys(da.open).sort(), metStand.map((z) => z.sleutel).sort(), "hij kent alle zaken van nu");
  assert.ok(metStand.every((z) => !z.nu), "wat op automatisch staat, is al gemaild: een nieuwe ronde stuurt niets dubbel");
  assert.equal(Object.keys(da.verstuurd).length, 3);
  assert.ok(Object.keys(da.verstuurd).every((k) => da.open[k] && /^(inloggen-mislukt|tweede-stap-slot)\|/.test(k)));
  assert.equal(metStand.find((z) => z.soort === "uitnodiging-verlopen").verstuurd, null, "handmatig wacht op een klik");
  for (const wat of ["start", "nieuw", "gemaild", "opgelost"]) assert.ok(da.logboek.some((x) => x.wat === wat), "in het logboek van de demo: " + wat);
  assert.deepEqual(da.logboek.map((x) => x.t), da.logboek.map((x) => x.t).sort().reverse(), "nieuwste boven");
  assert.ok(da.logboek.every((x) => Date.parse(x.t) <= NU && Date.parse(x.t) >= NU - 7 * DAG));
  assert.equal(da.rondes[0].zaken, metStand.length, "na de laatste ronde staan precies de zaken van nu open");
  assert.equal(da.rondes.reduce((t, r) => t + r.verstuurd, 0) + da.logboek.filter((x) => x.wat === "gemaild" && x.wie !== "agent").length, da.mails.length);
  assert.ok(da.mails.length >= 5 && da.mails.every((m) => /\.invalid$/.test(m.aan)), "ook het postvak van de demo heeft alleen adressen die niet kunnen bestaan");
  assert.deepEqual(demoAgent(a), da, "elke keer dezelfde");

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
  // terugkerende omzet: exclusief btw, alleen plaatsen die doorlopen (wie opzegde telt niet meer)
  assert.deepEqual([f.kpi.plaatsen, f.kpi.plaatsenDoorlopend, f.kpi.prijsExcl], [54, 52, 826]);
  assert.equal(f.kpi.mrr, 52 * 826);
  assert.deepEqual([f.kpi.proeven, f.kpi.proefPlaatsen, f.kpi.proefPerMaand], [2, 6, 6 * 826]);
  // prognose in plaatsen: elke maand evenveel erbij, niet een percentage dat zichzelf versterkt
  assert.equal(f.kpi.groeiPlaatsen, 4.2);
  const stapjes = f.prognose.slice(1).map((p, i) => Math.round((p.plaatsen - f.prognose[i].plaatsen) * 10) / 10);
  assert.ok(stapjes.every((x) => Math.abs(x - f.kpi.groeiPlaatsen) <= 0.11), "elke maand dezelfde stap: " + stapjes.join(" "));
  {
    // tien plaatsen nu, en de laatste zes hele maanden kwam er elke maand één plaats bij
    const maandGeleden = (m) => Date.UTC(2026, 10 - m, 15, 10);
    const groeier = { soort: "echt", nu: NU, kosten: [], praktijken: [{ pk: "g", naam: "Groeier", status: "klant", plaatsen: 10, leden: [] }],
      facturen: [1, 2, 3, 4, 5, 6, 7].map((m) => ({ nr: "FP-2026-000" + m, datum: maandGeleden(m), pk: "g", praktijk: "Groeier", aantal: 10 - m, totaalCent: (10 - m) * 999, status: "betaald", betaaldOp: maandGeleden(m) })) };
    const g = financeOverzicht(groeier, { prijsBtw: "inclusief", kor: "nee" });
    assert.equal(g.kpi.groeiPlaatsen, 1);
    assert.deepEqual(g.prognose.slice(0, 3).map((p) => p.plaatsen), [11, 12, 13]);
    assert.deepEqual([g.prognose[0].laag, g.prognose[0].verwacht, g.prognose[0].hoog], [Math.round(10.5 * 826), 11 * 826, Math.round(11.5 * 826)]);
    const krimper = financeOverzicht({ ...groeier, praktijken: [{ ...groeier.praktijken[0], plaatsen: 2 }], facturen: groeier.facturen.map((x, i) => ({ ...x, aantal: i + 3 })) }, { prijsBtw: "inclusief", kor: "nee" });
    assert.equal(krimper.kpi.groeiPlaatsen, -1);
    assert.ok(krimper.prognose.every((p) => p.plaatsen >= 0 && p.verwacht >= 0 && p.laag <= p.verwacht && p.verwacht <= p.hoog), "krimp gaat niet onder nul");
    assert.equal(krimper.prognose.at(-1).verwacht, 0);
  }
  const k4 = f.btw.find((b) => b.kwartaal === "2026-K4"), k3 = f.btw.find((b) => b.kwartaal === "2026-K3");
  assert.equal(k4.stand, "loopt");
  assert.equal(k3.stand, "ingediend");
  assert.equal(k3.teBetalen, k3.r1a.btw - k3.r5b);
  assert.equal(financeOverzicht(a, { ...inst, aangiftes: {} }).btw.find((b) => b.kwartaal === "2026-K3").stand, "te-laat", "na de uiterste datum is het te laat");
  // een ingediende aangifte ligt vast: wat er daarna in dat kwartaal verandert, is een verschil
  assert.ok(f.btw.every((b) => b.verschil === 0), "zonder vastgelegde bedragen is er geen verschil te melden");
  const vast = { ...inst, aangiftes: { ...inst.aangiftes, "2026-K3": { door: "x", op: "2026-10-21T10:00:00.000Z", bedragen: { omzet: k3.r1a.omzet, btw: k3.r1a.btw, voorbelasting: k3.r5b, teBetalen: k3.teBetalen } } } };
  assert.equal(financeOverzicht(a, vast).btw.find((b) => b.kwartaal === "2026-K3").verschil, 0);
  const metBon = { ...a, kosten: [...a.kosten, { id: "laat", datum: Date.parse("2026-08-10T10:00:00Z"), omschrijving: "Bon die later kwam", categorie: "Overig", bedragCent: 12100, btwCent: 2100 }] };
  const naBon = financeOverzicht(metBon, vast);
  assert.equal(naBon.btw.find((b) => b.kwartaal === "2026-K3").verschil, -2100, "een bon van 21 euro btw die na het indienen komt");
  const melding = financeAgent(metBon, naBon).find((p) => p.titel === "Btw 2026 K3 is veranderd na het indienen");
  assert.ok(melding && melding.naar === "btw" && melding.tekst.includes(euroTekst(k3.teBetalen)) && melding.tekst.includes(euroTekst(k3.teBetalen - 2100)));
  assert.ok(!financeAgent(a, financeOverzicht(a, vast)).some((p) => /veranderd na het indienen/.test(p.titel)));
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

  // een afgesloten jaar: de cijfers van het afsluiten liggen vast
  const c25 = jaarCijfers(f, "2025");
  assert.deepEqual(c25, { omzet: 10733, kosten: 52446, resultaat: -41713, btw: 2254, voorbelasting: 9290, facturen: 3, openCent: 0 });
  assert.deepEqual(jaarStand(f, "2025"), { cijfers: c25, vast: null, gewijzigd: false }, "een open jaar heeft niets vastgelegd");
  const dicht = { ...inst, afgesloten: { 2025: { door: "x", op: "2026-02-01T10:00:00.000Z", cijfers: c25 } } };
  assert.equal(jaarStand(financeOverzicht(a, dicht), "2025").gewijzigd, false);
  const laterBon = { ...a, kosten: [...a.kosten, { id: "laat25", datum: Date.parse("2025-12-20T10:00:00Z"), omschrijving: "Vergeten bon", categorie: "Overig", bedragCent: 12100, btwCent: 2100 }] };
  const gew = financeOverzicht(laterBon, dicht);
  assert.deepEqual([jaarStand(gew, "2025").gewijzigd, jaarStand(gew, "2025").vast.kosten, jaarStand(gew, "2025").cijfers.kosten], [true, 52446, 62446]);
  assert.ok(financeAgent(laterBon, gew).some((p) => p.titel === "Boekjaar 2025 is veranderd na het afsluiten" && p.naar === "jaar"));
  assert.equal(jaarStand(financeOverzicht(a, { ...inst, afgesloten: { 2025: { door: "x", op: "x", cijfers: { ...c25, openCent: 999 } } } }), "2025").gewijzigd, false, "een open post die later is betaald, verandert het jaar niet");
  assert.equal(jaarStand(financeOverzicht(a, { ...inst, afgesloten: { 2025: { door: "x", op: "x" } } }), "2025").gewijzigd, false, "een jaar dat dicht ging voordat de cijfers werden vastgelegd");

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

// ---- 0b. wat de server over gebruik meet ----
{
  const g = maakGebruik(), t0 = Date.parse("2026-11-12T09:00:00Z"); // 10:00 in Nederland
  assert.deepEqual([g.sinds(), g.laatst("p", "l1"), g.dagen("p", t0)], [0, 0, []], "zonder meting geen cijfers");
  assert.equal(g.gezien("p", "l1", t0), true);
  assert.equal(g.gezien("p", "l1", t0 + 4 * 60e3), false, "dezelfde login hooguit eens per vijf minuten");
  assert.equal(g.gezien("p", "l1", t0 + 5 * 60e3), true);
  g.gezien("p", "l2", t0 + 60e3);
  g.gezien("q", "l9", t0 + 60e3);
  assert.deepEqual([g.laatst("p", "l1"), g.laatst("p", "l2"), g.laatst("p", "l3")], [t0 + 5 * 60e3, t0 + 60e3, 0]);
  assert.deepEqual(g.dagen("p", t0 + 3600e3), [{ datum: "2026-11-12", n: 2 }], "twee therapeuten vandaag; dagen van voor de meting doen niet mee");
  assert.equal(dagVan(Date.parse("2026-11-12T23:30:00Z")), "2026-11-13", "dagen in Nederlandse tijd");
  g.gezien("p", "l1", t0 + DAG);
  assert.deepEqual(g.dagen("p", t0 + 2 * DAG), [{ datum: "2026-11-12", n: 2 }, { datum: "2026-11-13", n: 1 }, { datum: "2026-11-14", n: 0 }]);
  // foute wachtwoorden: 24 uur, en alleen na de laatste gelukte login
  for (let i = 0; i < 6; i++) g.loginMis("a@x.invalid", t0 + i * 1000);
  assert.equal(g.misSinds("a@x.invalid", 0, t0 + 3600e3), 6);
  assert.equal(g.misSinds("a@x.invalid", t0 + 3500, t0 + 3600e3), 2, "na een gelukte login tellen alleen de fouten daarna");
  assert.equal(g.misSinds("a@x.invalid", 0, t0 + DAG + 3000), 2, "na 24 uur telt een fout niet meer");
  assert.equal(g.misSinds("niemand@x.invalid", 0, t0), 0);
  for (let i = 0; i < 50; i++) g.loginMis("veel@x.invalid", t0 + i);
  assert.equal(g.misSinds("veel@x.invalid", 0, t0 + 100), 30, "per adres worden hooguit dertig tijden bewaard");
  // bewaren en weer inlezen; wat er per eerdere dag staat is alleen een aantal
  assert.equal(g.vuil(), true);
  const bewaard = JSON.parse(JSON.stringify(g.uit()));
  assert.equal(g.vuil(), false);
  assert.deepEqual(bewaard.dagen, { "2026-11-12": { p: 2, q: 1 } }, "van een dag die voorbij is, blijft alleen het aantal per praktijk");
  const h = maakGebruik();
  h.laad(bewaard);
  assert.deepEqual(h.dagen("p", t0 + 2 * DAG), g.dagen("p", t0 + 2 * DAG));
  assert.equal(h.laatst("p", "l2"), t0 + 60e3);
  h.laad({ gezien: "kapot", mis: { "a@x.invalid": "geen lijst" }, dagen: { onzin: { p: 1 } }, vandaag: 7 });
  assert.deepEqual([h.sinds(), h.dagen("p", t0), h.misSinds("a@x.invalid", 0, t0)], [0, [], 0], "een kapot bestand geeft een lege meting, geen fout");
  // opruimen: een gewiste praktijk of login verdwijnt ook hier
  g.snoei((pk, lid) => pk === "p" && (lid == null || lid === "l1"), t0 + 2 * DAG);
  const na = JSON.parse(JSON.stringify(g.uit()));
  assert.deepEqual(Object.keys(na.gezien), ["p|l1"]);
  assert.deepEqual(na.dagen, { "2026-11-12": { p: 2 } });
  assert.deepEqual(na.mis, {}, "foute wachtwoorden van langer dan een dag geleden zijn weg");
  // een login uit het team: meteen weg, niet pas bij de snoei van morgen (/privacy#support)
  g.gezien("p", "l1", t0 + 2 * DAG + 1); g.gezien("p", "l5", t0 + 2 * DAG + 2); g.loginMis("l1@x.invalid", t0 + 2 * DAG);
  assert.equal(g.wisLid("p", "l1", "l1@x.invalid"), 3, "laatst gezien, vandaag en foute wachtwoorden");
  assert.deepEqual([g.laatst("p", "l1"), g.misSinds("l1@x.invalid", 0, t0 + 2 * DAG + 5)], [0, 0]);
  assert.equal(g.laatst("p", "l5"), t0 + 2 * DAG + 2, "een collega blijft staan");
  assert.equal(g.dagen("p", t0 + 2 * DAG + 9).at(-1).n, 2, "het aantal actieve therapeuten vandaag blijft kloppen");
  const naLid = JSON.stringify(g.uit());
  assert.ok(!naLid.includes("l1"), "nergens nog het login-id of adres: " + naLid);
  assert.equal(g.wisLid("p", "l1", "l1@x.invalid"), 0);
  // een praktijkcode is hier een sleutel en raakt nooit iets anders
  g.gezien("__proto__", "vies", t0 + 3 * DAG);
  assert.equal({}.vies, undefined);
}
{
  // de routes zelf, met een nagemaakte server eromheen: de meting komt over de bron heen, en de
  // agent houdt bij wat er nieuw is en wat is opgelost
  const lidA = { id: "l1", naam: "Anna Test", email: "anna@x.invalid", rol: "beheerder", actief: true, laatst: Date.now() - 3 * DAG, tweedeStap: true, loginMis: 0, kaarten30: 2 };
  const lidB = { ...lidA, id: "l2", naam: "Bas Test", email: "bas@x.invalid", kaarten30: 1 };
  const opgeslagen = {}, gemaild = [];
  const o = maakBeheerOmgeving({
    dataDir: "/nergens", publicDir: "/nergens", leverancier: () => ({}),
    bronEcht: () => ({ soort: "echt", nu: Date.now(), facturen: [], kosten: [], systeem: { checks: [] },
      praktijken: [{ pk: "p-test", naam: "Testpraktijk", status: "klant", plaatsen: 2, kaarten30: 3, weken: Array(12).fill(1), leden: [{ ...lidA }, { ...lidB }] }] }),
    beheerEigen: () => true, sendJson: async (res, status, body) => { res.status = status; res.body = body; },
    saveJson: async (pad, v) => { opgeslagen[pad.split("/").pop()] = JSON.parse(JSON.stringify(v)); },
    beheerLog: { schrijf: async () => {} }, mailIngesteld: () => true, mailOpSlot: () => false, maskeerEmail: (e) => e,
    stuurMail: async (aan) => { gemaild.push(aan); }, lidBekend: (e) => e === lidA.email || e === lidB.email
  });
  try {
    const vraag = async () => { const res = {}; await o.afhandelen({ method: "GET", url: "/api/beheer/omgeving", headers: {} }, res, "/api/beheer/omgeving"); assert.equal(res.status, 200); return res.body; };
    let b = await vraag();
    assert.deepEqual([b.zaken.length, b.agent.logboek.length, b.agent.laatsteRonde, b.agent.elke], [0, 0, null, 10]);
    for (let i = 0; i < 5; i++) merkLoginMis("bas@x.invalid");
    for (let i = 0; i < 9; i++) merkLoginMis("vreemde@elders.invalid");
    merkGezien("p-test", "l1");
    b = await vraag();
    assert.deepEqual(b.zaken.map((z) => z.tekst), ["Bas Test: 5 keer een fout wachtwoord in 24 uur"], "vijf foute wachtwoorden zijn een zaak, ook na een kwartier");
    const rij = b.overzicht.rijen[0];
    assert.ok(rij.laatst > Date.now() - 60e3 && rij.leden[0].laatst > Date.now() - 60e3, "laatst actief is wanneer de app open was, niet de login van drie dagen terug");
    assert.equal(rij.leden[1].laatst, lidB.laatst);
    assert.deepEqual(rij.actiefDagen, [{ datum: dagVan(Date.now()), n: 1 }]);
    assert.ok(b.systeem.gebruikSinds > Date.now() - 60e3);
    // eerste ronde: het begin; daarna logt Bas goed in en is de zaak weg
    let r = await o.ronde("echt");
    assert.deepEqual([r.ronde.zaken, r.ronde.nieuw, r.ronde.opgelost, r.ronde.verstuurd], [1, 0, 0, 0]);
    lidB.laatst = Date.now();
    r = await o.ronde("echt");
    assert.deepEqual([r.ronde.zaken, r.ronde.nieuw, r.ronde.opgelost], [0, 0, 1]);
    await o.ronde("echt");
    b = await vraag();
    assert.deepEqual(b.agent.logboek.map((x) => x.wat), ["opgelost", "start"]);
    assert.deepEqual([b.agent.logboek[0].praktijk, b.agent.logboek[0].gemaild, b.agent.logboek[0].dagen], ["Testpraktijk", false, 0]);
    assert.equal(b.agent.rondes.length, 2, "een ronde van de klok waarin niets gebeurde, komt niet in de lijst");
    assert.ok(b.agent.laatsteRonde >= b.agent.rondes[0].t, "maar wel in ‘laatste ronde’");
    assert.deepEqual(opgeslagen["beheer-agent.json"].open, {});
    assert.equal(gemaild.length, 0, "alles staat uit: er ging niets weg");
    // op schijf: alleen het adres van een bestaande login, en per login wanneer hij voor het laatst gezien is
    o.tik();
    const meting = opgeslagen["beheer-gebruik.json"];
    assert.deepEqual(Object.keys(meting.mis), ["bas@x.invalid"], "een willekeurig ingetikt adres wordt niet bewaard");
    assert.deepEqual(Object.keys(meting.gezien), ["p-test|l1"]);
    assert.doesNotMatch(JSON.stringify(opgeslagen), /vreemde@elders/);
  } finally { o.stop(); }
}

// ---- nepmail en de server ----
const tmp = await mkdtemp(join(tmpdir(), "fysiplan-beheeromgeving-"));
const dataDir = join(tmp, "data");
await mkdir(dataDir, { recursive: true });
const PK = "p-0123456789abcdef";
const PATIENT = "Uniekepatient Zandstra";
// een praktijk met drie logins: één beheerder, en één login met de tweede stap op slot. Iris heeft
// een echt wachtwoord, zodat hieronder ook een gelukte login en een open app te meten zijn.
const IRIS_WW = "iris-wachtwoord-" + Math.random().toString(16).slice(2);
const hashVan = (ww) => { const zout = randomBytes(16); return "scrypt$" + zout.toString("hex") + "$" + scryptSync(ww, zout, 32).toString("hex"); };
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({ [PK]: { naam: "Fysio Testlaan", hash: "scrypt$00$00", gedeeldUit: true, gemaakt: Date.now() - 40 * DAG, leden: [
  { id: "aaaaaaaaaaaa", naam: "Bea Beheer", email: "bea@testlaan.example", rol: "beheerder", hash: "scrypt$00$00", gemaakt: Date.now() - 40 * DAG, laatst: Date.now() - 3600e3, totp: { geheim: "JBSWY3DPEHPK3PXP", sinds: 1, stap: 1, reserve: ["x"] } },
  { id: "bbbbbbbbbbbb", naam: "Tom Therapeut", email: "tom@testlaan.example", rol: "therapeut", hash: "scrypt$00$00", gemaakt: Date.now() - 30 * DAG, laatst: Date.now() - DAG, totp: { geheim: "JBSWY3DPEHPK3PXP", sinds: 1, stap: 1, reserve: [], mis: { start: Date.now() - 3600e3, n: 3 } } },
  { id: "cccccccccccc", naam: "Iris Invaller", email: "iris@testlaan.example", rol: "therapeut", hash: hashVan(IRIS_WW), gemaakt: Date.now() - 30 * DAG, laatst: Date.now() - 2 * DAG }
] } }));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ [PK]: { "uniekepatient zandstra": { id: "abcdef012345", praktijk: "Fysio Testlaan", naam: PATIENT, ts: Date.now() - DAG, maker: "lid:bbbbbbbbbbbb", client: { naam: PATIENT }, chosen: [], rows: [], cells: {}, vids: {} },
  "oude kaart": { id: "fedcba987654", praktijk: "Fysio Testlaan", naam: "Oude Kaart", ts: Date.now() - 40 * DAG, maker: "lid:bbbbbbbbbbbb", client: { naam: "Oude Kaart" }, chosen: [], rows: [], cells: {}, vids: {} } } }));

// de praktijk die V1 gebruikt: twee logins met een e-mailadres
await writeFile(join(dataDir, "v1-accounts.json"), JSON.stringify({
  "anna@v1.example": { email: "anna@v1.example", hash: "scrypt$00$00", praktijk: "FysioTotaal", gemaakt: Date.now() - 60 * DAG },
  "bob@v1.example": { email: "bob@v1.example", hash: "scrypt$00$00", praktijk: "FysioTotaal", gemaakt: Date.now() - 50 * DAG }
}));

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
    // de demo begint met een agent die al een week werkt: twee soorten automatisch, één handmatig;
    // eigen berichten van de agents met taalmodel wachten er op akkoord (handmatig)
    const beginStand = { "inloggen-mislukt": "automatisch", "tweede-stap-slot": "automatisch", "uitnodiging-verlopen": "handmatig", "eigen-bericht": "handmatig" };
    assert.deepEqual(d.agent.stand, beginStand);
    assert.ok(d.agent.logboek.length >= 10 && d.agent.mails.length >= 5 && d.agent.laatsteRonde);
    assert.equal(d.zaken.filter((z) => z.verstuurd).length, 3, "wat op automatisch staat, is al gemaild");
    assert.equal(d.overzicht.totalen.nvt, 1);
    assert.equal(d.finance.btw.filter((b) => b.stand === "ingediend" && b.ingediend.bedragen).length, 4, "van elke ingediende aangifte liggen de bedragen vast");
    assert.deepEqual(d.finance.btw.filter((b) => b.verschil).map((b) => [b.kwartaal, b.verschil]), [["2026-K2", -2100]], "bij één kwartaal kwam er na het indienen nog een bon");
    assert.ok(d.financeAgent.some((p) => p.titel === "Btw 2026 K2 is veranderd na het indienen"));
    const mailsBegin = d.agent.mails.length;
    let r = await (await post("ronde", { bron: "demo" })).json();
    assert.deepEqual([r.agent.rondes[0].verstuurd, r.agent.rondes[0].nieuw, r.agent.rondes[0].opgelost, r.agent.mails.length], [0, 0, 0, mailsBegin], "een ronde stuurt niet opnieuw wat al gemaild is");
    assert.equal((await post("mailstand", { bron: "demo", soort: "een-beheerder", stand: "automatisch" })).status, 200);
    assert.equal((await post("mailstand", { bron: "demo", soort: "storing", stand: "automatisch" })).status, 400, "een storingsbericht gaat nooit automatisch");
    assert.equal((await post("mailstand", { bron: "demo", soort: "bestaat-niet", stand: "handmatig" })).status, 400);
    r = await (await post("ronde", { bron: "demo" })).json();
    assert.equal(r.agent.rondes[0].verstuurd, 3, "de drie zaken ‘maar één beheerder’ gaan in demo naar het postvak");
    assert.equal(r.agent.mails.length, mailsBegin + 3);
    assert.deepEqual(r.agent.logboek.slice(0, 3).map((x) => [x.wat, x.wie]), Array(3).fill(["gemaild", "beheersleutel"]), "in het logboek van de agent staat wie de ronde startte");
    assert.equal((await (await post("ronde", { bron: "demo" })).json()).agent.rondes[0].verstuurd, 0, "een tweede ronde stuurt niet opnieuw");
    const zaak = r.zaken.find((z) => z.soort === "stil");
    assert.equal(zaak.mailStand, "uit");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: zaak.sleutel })).status, 200, "in demo kan versturen ook met de soort op uit");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: zaak.sleutel })).status, 409, "maar niet twee keer in een week");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: d.zaken.find((z) => z.soort === "tweede-stap-slot").sleutel })).status, 409, "en niet als de agent deze week al mailde");
    assert.equal((await post("verstuur", { bron: "demo", sleutel: "bestaat|niet|" })).status, 404);
    const tekst = "Hallo,\n\nFysiplan werkt op dit moment niet goed. We werken eraan.\n\nGroet,\nFysiplan-support";
    assert.equal((await post("storing", { bron: "demo", wie: "beheerders", onderwerp: "Storing bij Fysiplan", tekst, bevestig: 1 })).status, 409, "het aantal ontvangers moet kloppen");
    assert.equal((await post("storing", { bron: "demo", wie: "beheerders", onderwerp: "Storing bij Fysiplan", tekst: tekst.replace("niet goed", "niet goed: [wat er mis is]"), bevestig: d.ontvangers.beheerders })).status, 400, "een invulplek mag niet mee");
    assert.equal((await post("storing", { bron: "demo", wie: "beheerders", onderwerp: "Storing bij Fysiplan", tekst, bevestig: d.ontvangers.beheerders })).status, 200);
    r = await (await post("finance", { bron: "demo", prijsBtw: "inclusief", kor: "nee", btwTarief: 21 })).json();
    assert.equal(r.finance.signalen.length, 0);
    assert.equal((await post("afsluiten", { bron: "demo", jaar: "2026" })).status, 409, "het lopende jaar kan niet dicht");
    r = await (await post("afsluiten", { bron: "demo", jaar: "2025" })).json();
    const j25 = r.jaren.find((j) => j.jaar === "2025");
    assert.equal(j25.afgesloten.door, "beheersleutel");
    assert.deepEqual([j25.vast, j25.gewijzigd], [j25.cijfers, false], "bij het afsluiten liggen de cijfers van dat moment vast");
    assert.equal(j25.vast.omzet, r.finance.jaren.find((j) => j.periode === "2025").omzet);
    // een afgesloten jaar zit op slot: geen kosten erbij en geen aangifte open, tot het heropend is
    let dicht = await post("kosten", { bron: "demo", datum: "2025-12-20", omschrijving: "Vergeten bon", categorie: "Overig", bedrag: "121,00", btw: "21" });
    assert.equal(dicht.status, 409);
    assert.match((await dicht.json()).fout, /Boekjaar 2025 is afgesloten/);
    dicht = await post("aangifte", { bron: "demo", kwartaal: "2025-K4", ingediend: false });
    assert.equal(dicht.status, 409, "ook een aangifte uit dat jaar blijft staan");
    assert.equal((await post("afsluiten", { bron: "demo", jaar: "2025", heropen: true })).status, 200);
    r = await (await post("kosten", { bron: "demo", datum: "2025-12-20", omschrijving: "Vergeten bon", categorie: "Overig", bedrag: "121,00", btw: "21" })).json();
    const vergeten = r.finance.kosten.find((k) => k.omschrijving === "Vergeten bon");
    assert.ok(vergeten, "na heropenen kan het weer");
    assert.equal(r.finance.btw.find((b) => b.kwartaal === "2025-K4").verschil, -2100, "en de aangifte van dat kwartaal laat het verschil zien");
    r = await (await post("afsluiten", { bron: "demo", jaar: "2025" })).json();
    assert.equal(r.jaren.find((j) => j.jaar === "2025").vast.kosten, j25.vast.kosten + 10000, "opnieuw afsluiten legt de nieuwe cijfers vast");
    assert.equal((await post("kosten", { bron: "demo", actie: "weg", id: vergeten.id })).status, 409, "weghalen uit een afgesloten jaar kan ook niet");
    r = await (await post("kosten", { bron: "demo", datum: "2026-11-01", omschrijving: "Testkosten", categorie: "Overig", bedrag: "121,00", btw: "21" })).json();
    const post1 = r.finance.kosten.find((k) => k.omschrijving === "Testkosten");
    assert.deepEqual([post1.bedragCent, post1.btwCent, post1.exclCent], [12100, 2100, 10000]);
    assert.equal((await post("kosten", { bron: "demo", datum: "2026-11-01", omschrijving: "Fout", bedrag: "10", btw: "11" })).status, 400, "meer btw dan het bedrag kan niet");
    assert.equal((await post("kosten", { bron: "demo", actie: "weg", id: post1.id })).status, 200);
    r = await (await post("aangifte", { bron: "demo", kwartaal: "2026-K3", ingediend: false })).json();
    assert.equal(r.finance.btw.find((b) => b.kwartaal === "2026-K3").stand, "te-laat");
    assert.equal((await post("aangifte", { bron: "demo", kwartaal: "2026-13", ingediend: true })).status, 400);
    assert.equal((await post("aangifte", { bron: "demo", kwartaal: "2026-K4", ingediend: true })).status, 409, "een kwartaal dat nog loopt, kan niet als ingediend");
    assert.equal((await post("aangifte", { bron: "demo", kwartaal: "2024-K1", ingediend: true })).status, 409, "een kwartaal zonder cijfers ook niet");
    r = await (await post("aangifte", { bron: "demo", kwartaal: "2026-K3", ingediend: true, kenmerk: "DEMO-3" })).json();
    const k3 = r.finance.btw.find((b) => b.kwartaal === "2026-K3");
    assert.deepEqual([k3.stand, k3.verschil, k3.ingediend.bedragen], ["ingediend", 0, { omzet: k3.r1a.omzet, btw: k3.r1a.btw, voorbelasting: k3.r5b, teBetalen: k3.teBetalen }], "bij het markeren liggen de bedragen vast");
    r = await (await post("kosten", { bron: "demo", datum: "2026-08-10", omschrijving: "Bon na de aangifte", categorie: "Overig", bedrag: "60,50", btw: "10,50" })).json();
    assert.deepEqual([r.finance.btw.find((b) => b.kwartaal === "2026-K3").verschil, r.finance.btw.find((b) => b.kwartaal === "2026-K3").ingediend.bedragen.teBetalen], [-1050, k3.teBetalen], "een bon die daarna komt, is een verschil; wat is ingediend blijft staan");
    assert.ok(r.financeAgent.some((p) => p.titel === "Btw 2026 K3 is veranderd na het indienen"));
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
    assert.deepEqual(r.agent.stand, beginStand);
    assert.equal(r.agent.mails.length, mailsBegin);
    assert.deepEqual(r.jaren.map((j) => j.afgesloten), [null, null]);
    assert.ok(!r.finance.kosten.some((k) => k.door));
    assert.equal(r.finance.instellingen.prijsBtw, "onbekend", "de demo begint weer bij het begin");
  }

  // ---- 3. echt: tellingen, geen patiëntgegevens ----
  let e = await stand("echt");
  {
    assert.equal(e.bron, "echt");
    assert.equal(e.overzicht.totalen.praktijken, 2);
    const v1 = e.overzicht.rijen.find((r) => r.status === "v1");
    assert.deepEqual([v1.naam, v1.therapeuten, v1.signalen.length, v1.stand, v1.score], ["FysioTotaal (V1)", 2, 0, "nvt", null], "de V1-praktijk telt mee, zonder signalen en zonder health");
    assert.deepEqual(e.ontvangers, { beheerders: 1, iedereen: 5 }, "een storingsbericht aan iedereen gaat ook naar de logins van V1");
    assert.equal(e.overzicht.totalen.klanten, 0);
    const p = e.overzicht.rijen.find((r) => r.pk === PK);
    assert.equal(p.naam, "Fysio Testlaan");
    assert.equal(p.therapeuten, 3);
    assert.equal(p.kaartenTotaal, 2);
    assert.equal(p.kaarten30, 1);
    assert.deepEqual(p.weken, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], "kaarten per week: één van gisteren en één van veertig dagen terug");
    assert.deepEqual(p.leden.map((l) => [l.naam, l.kaarten30]), [["Bea Beheer", 0], ["Tom Therapeut", 1], ["Iris Invaller", 0]], "per login de kaarten van de laatste 30 dagen");
    assert.deepEqual([p.actiefDagen, e.systeem.gebruikSinds], [[], null], "nog niemand had de app open: er is nog geen meting");
    assert.deepEqual([e.agent.stand, e.agent.logboek, e.agent.laatsteRonde], [{}, [], null], "in echt begint de agent leeg, met alles uit");
    assert.equal(p.tweedeStap, 2);
    assert.deepEqual(p.signalen.map((s) => s.soort).sort(), ["een-beheerder", "tweede-stap-slot"]);
    assert.equal(p.stand, "probleem");
    const ruw = JSON.stringify(e);
    assert.doesNotMatch(ruw, /Uniekepatient|Zandstra|abcdef012345|Oude Kaart|fedcba987654|lid:bbbb/, "geen patiënt en geen kaart-id in wat beheer ophaalt");
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
    assert.equal((await post("aangifte", { kwartaal: "2026-K3", ingediend: true, kenmerk: "TEST-1" })).status, 409, "een kwartaal zonder cijfers valt niet in te dienen");
    assert.equal((await post("kosten", { datum: "2026-08-05", omschrijving: "Hosting augustus", categorie: "Hosting", bedrag: "24.20", btw: "4,20" })).status, 200);
    assert.equal((await post("aangifte", { kwartaal: "2026-K3", ingediend: true, kenmerk: "TEST-1" })).status, 200);
    assert.equal((await post("afsluiten", { jaar: "2026" })).status, 409);
    assert.deepEqual(await bestanden(), ["beheer-agent.json", "finance-instellingen.json", "finance-kosten.json"]);
    const inst = JSON.parse(await readFile(join(dataDir, "finance-instellingen.json"), "utf8"));
    assert.equal(inst.prijsBtw, "exclusief");
    assert.equal(inst.aangiftes["2026-K3"].kenmerk, "TEST-1");
    assert.equal(inst.aangiftes["2026-K3"].door, "beheersleutel");
    assert.deepEqual(inst.aangiftes["2026-K3"].bedragen, { omzet: 0, btw: 0, voorbelasting: 0, teBetalen: 0 }, "de bedragen van de aangifte staan op schijf (met de KOR: nul)");
    const kosten = JSON.parse(await readFile(join(dataDir, "finance-kosten.json"), "utf8")).kosten;
    assert.deepEqual([kosten.length, kosten[0].bedragCent, kosten[0].btwCent], [2, 2420, 420]);
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

  // ---- 6. echt: de server meet zelf wie de app gebruikt en waar inloggen misgaat ----
  {
    const login = (body) => fetch(origin + "/api/praktijk/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.87.0." + (ip++ & 255) }, body: JSON.stringify(body) });
    for (let i = 0; i < 5; i++) assert.equal((await login({ praktijk: "Fysio Testlaan", email: "iris@testlaan.example", wachtwoord: "fout-" + i })).status, 403);
    for (let i = 0; i < 6; i++) await login({ praktijk: "Fysio Testlaan", email: "niemand@elders.example", wachtwoord: "fout-" + i });
    e = await stand("echt");
    const mis = e.zaken.find((z) => z.soort === "inloggen-mislukt");
    assert.deepEqual([mis.tekst, mis.mails.map((m) => m.aan), e.zaken.filter((z) => z.soort === "inloggen-mislukt").length], ["Iris Invaller: 5 keer een fout wachtwoord in 24 uur", ["iris@testlaan.example"], 1], "vijf foute wachtwoorden bij een bestaande login zijn een zaak; een onbekend adres niet");
    let r = await (await post("ronde", {})).json();
    assert.deepEqual([r.agent.rondes[0].nieuw, r.agent.logboek[0].wat, r.agent.logboek[0].tekst], [1, "nieuw", mis.tekst], "de agent schrijft op wat er nieuw is");
    // Iris logt goed in: de fouten van daarvoor tellen niet meer, en de agent ziet de zaak verdwijnen
    const goed = await login({ praktijk: "Fysio Testlaan", email: "iris@testlaan.example", wachtwoord: IRIS_WW });
    assert.equal(goed.status, 200);
    const sessie = (await goed.json()).sessie;
    assert.ok(sessie && sessie.length > 20);
    r = await (await post("ronde", {})).json();
    assert.ok(!r.zaken.some((z) => z.soort === "inloggen-mislukt"));
    assert.deepEqual([r.agent.rondes[0].opgelost, r.agent.logboek[0].wat, r.agent.logboek[0].tekst, r.agent.logboek[0].gemaild], [1, "opgelost", mis.tekst, false]);
    // de app is open met haar sessie: Iris is nu gezien, en vandaag telt één actieve therapeut
    assert.deepEqual((await r.overzicht.rijen.find((x) => x.pk === PK)).actiefDagen, []);
    const status = await fetch(origin + "/api/praktijk/status?praktijk=Fysio%20Testlaan", { headers: { "x-praktijk-sessie": sessie, "x-forwarded-for": "10.87.1.1" } });
    assert.equal((await status.json()).ingelogd, true);
    e = await stand("echt");
    const rij = e.overzicht.rijen.find((x) => x.pk === PK);
    assert.deepEqual(rij.actiefDagen, [{ datum: dagVan(Date.now()), n: 1 }]);
    assert.ok(rij.leden.find((l) => l.naam === "Iris Invaller").laatst > Date.now() - 60e3 && e.systeem.gebruikSinds > Date.now() - 60e3);
    assert.equal(rij.leden.find((l) => l.naam === "Tom Therapeut").laatst < Date.now() - DAG + 60e3, true, "wie de app niet open had, houdt zijn oude tijd");
    assert.doesNotMatch(JSON.stringify(e), new RegExp(sessie.slice(0, 16)), "de sessie zelf staat nergens in wat beheer ophaalt");
  }

  // ---- 7. de bestanden van de pagina ----
  {
    const js = await readFile(join(root, "public/beheer-omgeving.js"), "utf8");
    assert.doesNotMatch(js, /\beval\(|new Function\(|document\.write/);
    assert.match(js, /import \{ vraagBeheersleutel \} from '\/beheersleutel\.js'/, "inloggen gaat via dezelfde weg als de andere beheerpagina's");
    const server = await readFile(join(root, "server.js"), "utf8");
    assert.match(server, /^backupBestanden\.push\(join\(dataDir, "finance-instellingen\.json"\), join\(dataDir, "finance-kosten\.json"\), join\(dataDir, "beheer-agent\.json"\), join\(dataDir, "beheer-gebruik\.json"\), join\(dataDir, "beheer-loket\.json"\)\);$/m, "de financebestanden, de meting en de instellingen van de agents gaan mee in de reservekopie");
    assert.match(server, /if \(s\.lid\) merkGezien\(s\.pk, s\.lid\);/, "elke geldige eigen sessie telt als gezien");
    assert.match(server, /trekSessiesIn\(pk, doel\.id\);[\s\S]{0,120}vergeetLid\(pk, doel\.id, doel\.email\);/, "uit het team halen wist ook de meting van die login");
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
