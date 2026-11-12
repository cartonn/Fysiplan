// Sweep van buitenaf op de echte server (advies van Codex bij PR #260, 2026-11-12): vijf scenario's
// die de unit-test niet over HTTP en niet gelijktijdig raakt.
//   1. dubbele gelijktijdige acties: dezelfde sleutel twintig keer tegelijk, twintig voorstellen voor
//      hetzelfde contact tegelijk, dertig taakvoorstellen tegelijk tegen een grens van tien
//   2. afmelden na goedkeuring
//   3. een terugkerend contact onder een andere code
//   4. rechtenoverschrijding: andere rol, beheerroutes met de agentsleutel, padtrucs, rare acties
//   5. sleutel per rol (PR #260, vervolg): kruistoets met de sleutel van support, intrekken werkt
//      direct, de stopknop blokkeert alle vijf rollen (ook in de demo), geweigerde persoonsgegevens
//      niet in het auditlog, op schijf alleen afdrukken
// Start een eigen server op een lege datamap. `npm run sweep:agentgeheugen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4400 + Math.floor(Math.random() * 400), origin = "http://127.0.0.1:" + PORT, ADMIN = "sweep-" + Math.random().toString(36).slice(2) + "-sleutel";
const dataDir = await mkdtemp(join(tmpdir(), "fp-sweep-geheugen-"));
const server = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), ADMIN_KEY: ADMIN, RESEND_API_KEY: "", OMGEVING: "" }, stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
server.stderr.on("data", (c) => { stderr += c; });
const resultaten = [];
const meld = (scenario, uitkomst) => { resultaten.push([scenario, uitkomst]); console.log("✓ " + scenario + ": " + uitkomst); };

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  const beheer = async (pad, body) => {
    const r = await fetch(origin + "/api/beheer/omgeving/" + pad, { method: "POST", headers: { "x-admin-sleutel": ADMIN, "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const pagina = async () => (await (await fetch(origin + "/api/beheer/omgeving?bron=demo", { headers: { "x-admin-sleutel": ADMIN } })).json()).loket;
  // één sleutel per rol (punt 1 van Codex); een gedeelde sleutel maken kan niet meer
  assert.equal((await beheer("loket/sleutel", { bron: "echt" })).status, 400);
  const sleutels = {};
  for (const rol of ["support", "tech", "finance", "staf", "groei"]) sleutels[rol] = (await beheer("loket/sleutel", { bron: "echt", rol })).body.nieuweSleutel;
  assert.ok(Object.values(sleutels).every((k) => /^fpa_/.test(k)) && new Set(Object.values(sleutels)).size === 5);
  const sleutel = sleutels.groei;
  let ip = 0;
  const agent = async (pad, body, kop = {}, met = sleutels[pad.split("/")[0]] || sleutel) => {
    const r = await fetch(origin + "/api/agent/" + pad, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + met, "content-type": "application/json", "x-forwarded-for": "10.0.0." + (++ip % 250), ...kop }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  for (const rol of ["staf", "groei"]) assert.equal((await beheer("loket/agent", { bron: "echt", rol, stand: "proef" })).status, 200);
  const CONCEPT = { actie: "concept", soort: "bericht", titel: "Oefenkaart in één minuut", doel: "Therapeuten die nog op papier werken; doel: proefaanmeldingen.",
    tekst: "Met Fysiplan maak je een oefenkaart in een minuut en deel je hem met een QR-code. Jij kiest de oefeningen. Probeer het 14 dagen gratis op https://fysiplan.nl." };

  // ---- 1. gelijktijdig ----
  {
    const voor = (await pagina()).geheugen.groei.length;
    const rs = await Promise.all(Array.from({ length: 20 }, () => agent("groei/actie", { ...CONCEPT, sleutel: "zelfde-concept-1" })));
    const na = (await pagina()).geheugen.groei.length;
    assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)));
    assert.equal(new Set(rs.map((r) => r.body.concept)).size, 1, "twintig keer dezelfde sleutel geeft één concept-id");
    assert.deepEqual([na - voor, rs.filter((r) => r.body.herhaald).length], [1, 19]);
    meld("1a dezelfde sleutel 20× tegelijk", "1 concept gemaakt, 19× ‘herhaald’ met hetzelfde id");

    const werk = (await agent("groei/werk")).body.werk;
    const c = werk.contacten.find((x) => x.toestemming.mail && !x.openVoorstel && (x.dagenSindsContact == null || x.dagenSindsContact >= 30));
    const rs2 = await Promise.all(Array.from({ length: 20 }, (_, i) => agent("groei/actie", { actie: "contact-voorstel", sleutel: "tegelijk-contact-" + i, contact: c.contact, kanaal: "mail", reden: "Vroeg zelf om informatie via de site." })));
    const ok = rs2.filter((r) => r.status === 200);
    assert.equal(ok.length, 1, "twintig voorstellen tegelijk voor hetzelfde contact: precies één komt door");
    assert.ok(rs2.filter((r) => r.status !== 200).every((r) => r.status === 409 && r.body.reden === "al-voorgesteld"));
    meld("1b 20 contactvoorstellen tegelijk, zelfde contact", "1 door, 19× 409 al-voorgesteld");
    resultaten.contactTaak = ok[0].body.taak;
    resultaten.contact = c.contact;

    const rs3 = await Promise.all(Array.from({ length: 30 }, (_, i) => agent("staf/actie", { actie: "taak-voorstel", sleutel: "tegelijk-taak-" + i, titel: "Taak tegelijk " + i, uitleg: "Om de grens per dag onder gelijktijdige druk te testen." })));
    assert.deepEqual([rs3.filter((r) => r.status === 200).length, rs3.filter((r) => r.status === 429).length], [10, 20]);
    meld("1c 30 taakvoorstellen tegelijk, grens 10", "10 door, 20× 429");
  }

  // ---- 2. afmelden na goedkeuring ----
  {
    let r = await beheer("loket/taak", { bron: "demo", id: resultaten.contactTaak, besluit: "akkoord" });
    assert.equal(r.status, 200);
    assert.equal(r.body.loket.geheugen.taken.find((t) => t.id === resultaten.contactTaak).status, "goedgekeurd");
    r = await beheer("loket/afmelding", { bron: "demo", contact: resultaten.contact });
    assert.equal(r.body.loket.geheugen.taken.find((t) => t.id === resultaten.contactTaak).status, "vervallen");
    assert.equal((await beheer("loket/taak", { bron: "demo", id: resultaten.contactTaak, besluit: "klaar" })).status, 409, "een vervallen taak kan niet meer op klaar");
    r = await agent("groei/actie", { actie: "contact-voorstel", sleutel: "na-afmelding-1", contact: resultaten.contact, kanaal: "mail", reden: "Nog een poging na de afmelding." });
    assert.deepEqual([r.status, r.body.reden], [409, "afgemeld"]);
    assert.equal((await agent("groei/werk")).body.werk.contacten.some((x) => x.contact === resultaten.contact), false);
    meld("2 afmelden na goedkeuring", "goedgekeurde taak vervalt, ‘klaar’ kan niet meer, nieuw voorstel 409 afgemeld, contact uit het werk van de agent");
  }

  // ---- 3. terugkerend contact onder een andere code ----
  {
    const G = (await pagina()).geheugen;
    const terug = G.contacten.find((c) => /via beurs/.test(c.naam));
    assert.ok(terug && terug.afgemeld, "het teruggekomen contact staat als afgemeld");
    const werk = (await agent("groei/werk")).body.werk;
    assert.equal(werk.contacten.some((c) => c.contact === terug.code), false);
    const r = await agent("groei/actie", { actie: "contact-voorstel", sleutel: "terugkeer-1", contact: terug.code, kanaal: "bellen", reden: "Liet bij de beurs een nummer achter." });
    assert.deepEqual([r.status, r.body.reden], [409, "afgemeld"]);
    meld("3 terugkerend contact onder nieuwe code", "afgemeld via de afdruk van het adres, niet in het werk, voorstel 409");
  }

  // ---- 4. rechtenoverschrijding ----
  {
    const s = [];
    for (const [pad, body, verwacht] of [
      ["staf/actie", { ...CONCEPT, sleutel: "staf-concept-1" }, 403],
      ["staf/actie", { actie: "contact-voorstel", sleutel: "staf-contact-1", contact: "C-000000", kanaal: "mail", reden: "De chief of staff mag dit niet." }, 403],
      ["staf/actie", { actie: "eigen-mail", sleutel: "staf-mail-1", zaak: "z0000000000", onderwerp: "Hallo daar allemaal", tekst: "x".repeat(50) }, 403],
      ["groei/actie", { actie: "advies", sleutel: "groei-advies-1", taak: "T-00000000", tekst: "De groei-agent mag geen advies geven." }, 403],
      ["groei/actie", { actie: "eigen-mail", sleutel: "groei-mail-1" }, 403],
      ["groei/actie", { actie: "constructor", sleutel: "proto-1" }, 403],
      ["groei/actie", { actie: "__proto__", sleutel: "proto-2" }, 403],
      ["groei/actie", { ...CONCEPT, sleutel: "__proto__" }, 400],
      ["groei/actie", { ...CONCEPT, sleutel: ["lijst-als-sleutel"] }, 400]
    ]) { const r = await agent(pad, body); assert.equal(r.status, verwacht, pad + " " + JSON.stringify(body).slice(0, 60) + " → " + r.status); s.push(r.status); }
    // beheerroutes en padtrucs met de sleutel van de agents
    const met = (pad, init = {}) => fetch(origin + pad, { ...init, headers: { authorization: "Bearer " + sleutel, "x-agent-sleutel": sleutel, "content-type": "application/json", ...(init.headers || {}) } }).then((r) => r.status);
    for (const pad of ["/api/beheer/omgeving?bron=demo", "/api/beheer/omgeving/loket/taak", "/api/beheer/omgeving/loket/afmelding", "/api/beheer/omgeving/loket/agent"]) {
      const st = await met(pad, pad.includes("loket") ? { method: "POST", body: JSON.stringify({ bron: "demo", rol: "staf", stand: "aan", contact: "C-000000", id: "T-00000000", besluit: "akkoord" }) } : {});
      assert.notEqual(st, 200, pad + " met de agentsleutel");
    }
    for (const pad of ["/api/agent/staf/../groei/actie", "/api/agent/STAF/werk", "/api/agent/staf/werk/", "/api/agent/staf%2f..%2fgroei%2factie", "/api/agent//staf/werk", "/api/agent/baas/werk"]) assert.notEqual(await met(pad), 200, pad);
    // aan kan niet, ook niet via de beheerroute met volledig beheer
    assert.equal((await beheer("loket/agent", { bron: "echt", rol: "groei", stand: "aan" })).status, 409);
    meld("4 rechtenoverschrijding", "andere rol 403, rare acties 403/400, beheerroutes en 6 padtrucs met agentsleutel geweigerd, ‘aan’ 409");

    // wat de agent kan zien
    const alles = JSON.stringify([(await agent("staf/werk")).body, (await agent("groei/werk")).body]);
    assert.doesNotMatch(alles, /\(demo\)|\.invalid|@|Duinzicht|Molenwijk/, "geen namen of adressen");
    meld("4b geen namen naar agents", "staf- en groei-werk bevatten alleen codes");
  }

  // ---- 5. sleutel per rol: kruistoets, intrekken, stopknop ----
  {
    const pagEcht = async () => (await (await fetch(origin + "/api/beheer/omgeving", { headers: { "x-admin-sleutel": ADMIN } })).json()).loket;
    const logboek = async () => (await (await fetch(origin + "/api/beheer/overzicht", { headers: { "x-admin-sleutel": ADMIN } })).json()).log || [];
    for (const rol of ["support", "tech", "finance"]) assert.equal((await beheer("loket/agent", { bron: "echt", rol, stand: "proef" })).status, 200);
    // de sleutel van support op elk ander adres: 403 en vastgelegd
    const voor = (await pagEcht()).pogingen.length;
    const pogingen = [["finance/werk"], ["finance/actie", { actie: "notitie", periode: "2026-K3", tekst: "Dit mag support niet." }], ["tech/werk"], ["tech/actie", { actie: "verslag", tekst: "Dit mag support niet schrijven." }],
      ["staf/werk"], ["staf/actie", { actie: "advies", sleutel: "kruis-advies-1", taak: "T-00000000", tekst: "x" }], ["groei/werk"], ["groei/actie", { ...CONCEPT, sleutel: "kruis-concept-1" }]];
    for (const [pad, body] of pogingen) { const r = await agent(pad, body, {}, sleutels.support); assert.equal(r.status, 403, "support op " + pad + " → " + r.status); }
    const na = await pagEcht();
    assert.equal(na.pogingen.length - voor, pogingen.length, "elke poging staat op de pagina");
    assert.ok(na.pogingen.slice(0, pogingen.length).every((x) => x.sleutel === "support"));
    assert.ok((await logboek()).filter((x) => x.actie === "agents: poging tot rechtenoverschrijding").length >= pogingen.length, "en in het beheerlogboek");
    // beheer gaat niet open met de sleutel van support
    for (const pad of ["/api/beheer/omgeving", "/api/beheer/overzicht"]) assert.notEqual((await fetch(origin + pad, { headers: { authorization: "Bearer " + sleutels.support, "x-agent-sleutel": sleutels.support } })).status, 200, pad);
    assert.notEqual((await fetch(origin + "/api/beheer/omgeving/loket/sleutel", { method: "POST", headers: { authorization: "Bearer " + sleutels.support, "content-type": "application/json" }, body: JSON.stringify({ bron: "echt", rol: "support" }) })).status, 200);
    assert.equal((await agent("support/werk")).status, 200, "op zijn eigen adres werkt support gewoon");
    meld("5a kruistoets support", "finance, tech, staf, groei en beheer geweigerd (8× 403), allemaal vastgelegd op de pagina en in het beheerlogboek");

    // intrekken: meteen 401, de rest werkt door
    assert.equal((await beheer("loket/sleutel", { bron: "echt", rol: "groei", actie: "intrekken" })).status, 200);
    assert.equal((await agent("groei/werk")).status, 401, "ingetrokken sleutel direct geweigerd");
    assert.equal((await agent("groei/actie", { ...CONCEPT, sleutel: "na-intrekken-1" })).status, 401);
    for (const rol of ["support", "tech", "finance", "staf"]) assert.equal((await agent(rol + "/werk")).status, 200, rol + " werkt door");
    sleutels.groei = (await beheer("loket/sleutel", { bron: "echt", rol: "groei" })).body.nieuweSleutel;
    meld("5b intrekken", "ingetrokken sleutel direct 401 (werk en actie), de andere vier rollen bleven 200");

    // de stopknop blokkeert alle rollen
    assert.equal((await beheer("loket/pauze", { bron: "echt", aan: true })).status, 200);
    for (const rol of ["support", "tech", "finance", "staf", "groei"]) {
      const w = await agent(rol + "/werk");
      assert.deepEqual([w.status, w.body.gepauzeerd, "werk" in w.body], [200, true, false], rol);
      assert.equal((await agent(rol + "/actie", { actie: "verslag", tekst: "Tijdens de pauze komt dit verslag er niet in." })).status, 423, rol);
    }
    assert.equal((await agent("groei/actie", { ...CONCEPT, sleutel: "tijdens-pauze-1" })).status, 423);
    assert.equal((await beheer("loket/pauze", { bron: "echt", aan: false })).status, 200);
    assert.equal((await agent("staf/werk")).body.gepauzeerd, false);
    meld("5c stopknop", "alle vijf rollen kregen geen werk en 423 op elke actie; na opheffen weer werk");

    // de stopknop en intrekken in de demo blokkeren ook de agents op proef
    assert.equal((await beheer("loket/pauze", { bron: "demo", aan: true })).status, 200);
    for (const rol of ["support", "tech", "finance", "staf", "groei"]) {
      assert.equal((await agent(rol + "/werk")).body.gepauzeerd, true, rol);
      assert.equal((await agent(rol + "/actie", { actie: "verslag", tekst: "Tijdens de demopauze komt dit er niet in." })).status, 423, rol);
    }
    assert.equal((await beheer("loket/pauze", { bron: "demo", aan: false })).status, 200);
    assert.equal((await beheer("loket/sleutel", { bron: "demo", rol: "finance", actie: "intrekken" })).status, 200);
    assert.equal((await agent("finance/werk")).status, 401);
    assert.equal((await agent("support/werk")).status, 200);
    await beheer("loket/sleutel", { bron: "demo", rol: "finance" });
    assert.equal((await agent("finance/werk")).status, 200);
    meld("5e demo-stopknop en demo-intrekken", "op proef blokkeren ook de stopknop (5 rollen, werk leeg en 423) en een in de demo ingetrokken sleutel (401)");

    // geweigerde persoonsgegevens komen niet in het auditlog
    // eerst een verse demo: de daglimieten zijn na scenario 1 op
    assert.equal((await beheer("demo-opnieuw", {})).status, 200);
    const PII = "piet.pietersen@praktijk.example", TEL = "0612345678";
    assert.equal((await agent("groei/actie", { ...CONCEPT, sleutel: "pii-sweep-1", tekst: CONCEPT.tekst + " Mail " + PII + " of bel " + TEL + "." })).status, 400);
    assert.equal((await agent("staf/actie", { actie: "taak-voorstel", sleutel: "pii-sweep-2", titel: "Bel " + TEL + " terug", uitleg: "Of mail naar " + PII + " vandaag nog." })).status, 400);
    const spoor = JSON.stringify(await pagina()) + JSON.stringify(await logboek());
    assert.ok(!spoor.includes("pietersen") && !spoor.includes("12345678"), "geen geweigerde persoonsgegevens in audit, geheugen of beheerlogboek");
    meld("5f persoonsgegevens", "concept en taak met e-mailadres en telefoonnummer geweigerd (400); niets ervan in audit, geheugen of beheerlogboek");

    // op schijf alleen afdrukken
    const ruw = await readFile(join(dataDir, "beheer-loket.json"), "utf8");
    assert.ok(Object.values(sleutels).every((k) => !ruw.includes(k)) && Object.keys(JSON.parse(ruw).sleutels).length === 5, "alleen afdrukken op schijf");
    meld("5d afdruk", "vijf afdrukken in beheer-loket.json, geen enkele sleutel zelf");
  }

  // ---- op schijf: demo en echt apart ----
  // Het geheugen bestaat alleen in de demo. Sinds de demo een herstart overleeft, staat het in het
  // eigen bestand beheer-demo.json; in de echte bestanden mag er geen spoor van zijn.
  const GEHEUGEN = /contact-voorstel|Oefenkaart in één minuut|"geheugen"|tegelijk-taak/;
  const bestanden = (await readdir(dataDir)).filter((n) => n.endsWith(".json"));
  const echtInhoud = (await Promise.all(bestanden.filter((n) => !n.startsWith("beheer-demo")).map((n) => readFile(join(dataDir, n), "utf8").catch(() => "")))).join("\n");
  assert.doesNotMatch(echtInhoud, GEHEUGEN, "het geheugen staat niet in de echte bestanden");
  const demoInhoud = await readFile(join(dataDir, "beheer-demo.json"), "utf8");
  assert.match(demoInhoud, /"geheugen"/, "het geheugen staat in het demobestand");
  assert.ok(!demoInhoud.includes("pietersen") && !demoInhoud.includes("12345678"), "geen geweigerde persoonsgegevens in het demobestand");
  meld("datamap", "geheugen alleen in beheer-demo.json; geen spoor in de echte bestanden; geen geweigerde persoonsgegevens in het demobestand");
  console.log("sweep-agent-geheugen: ok (" + resultaten.length + " scenario's)");
} catch (e) {
  console.error(stderr.slice(-2000));
  throw e;
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
