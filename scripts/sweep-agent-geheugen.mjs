// Sweep van buitenaf op de echte server (advies van Codex bij PR #260, 2026-11-12): vier scenario's
// die de unit-test niet over HTTP en niet gelijktijdig raakt.
//   1. dubbele gelijktijdige acties: dezelfde sleutel twintig keer tegelijk, twintig voorstellen voor
//      hetzelfde contact tegelijk, dertig taakvoorstellen tegelijk tegen een grens van tien
//   2. afmelden na goedkeuring
//   3. een terugkerend contact onder een andere code
//   4. rechtenoverschrijding: andere rol, beheerroutes met de agentsleutel, padtrucs, rare acties
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
  const sleutel = (await beheer("loket/sleutel", { bron: "echt" })).body.nieuweSleutel;
  assert.match(sleutel, /^fpa_/);
  let ip = 0;
  const agent = async (pad, body, kop = {}) => {
    const r = await fetch(origin + "/api/agent/" + pad, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + sleutel, "content-type": "application/json", "x-forwarded-for": "10.0.0." + (++ip % 250), ...kop }, body: body ? JSON.stringify(body) : undefined });
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

  // ---- niets op schijf ----
  const bestanden = await readdir(dataDir);
  const inhoud = (await Promise.all(bestanden.filter((n) => n.endsWith(".json")).map((n) => readFile(join(dataDir, n), "utf8").catch(() => "")))).join("\n");
  assert.doesNotMatch(inhoud, /contact-voorstel|Oefenkaart in één minuut|"geheugen"|tegelijk-taak/, "het geheugen staat niet in de datamap");
  meld("datamap", "geen spoor van het geheugen op schijf");
  console.log("sweep-agent-geheugen: ok (" + resultaten.length + " scenario's)");
} catch (e) {
  console.error(stderr.slice(-2000));
  throw e;
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
