// Opslaan van de demo (lib/beheer-omgeving-routes.js), met een nagemaakte server eromheen.
//
// Wat hier vastligt (review Ahmed 2026-11-12):
// - Een verzoek dat de demo wijzigt, antwoordt pas als een save mét zijn eigen wijziging klaar is,
//   ook als saves traag zijn en beheer veel wijzigingen tegelijk doet. (Eerder kon een ander verzoek
//   de vlag "vuil" al wissen met een momentopname van vóór deze wijziging.)
// - Lukt opslaan niet, dan 500 voor wie de demo wijzigde; een weigering blijft een weigering.
// - Een demobestand dat niet terug kan, gaat opzij. Lukt verplaatsen en kopiëren niet, of is het
//   bestand niet te lezen, dan wordt het origineel nooit overschreven.
// `npm run test:demoopslag`
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALLE_RECHTEN } from "../lib/beheer-toegang.js";
import { maakBeheerOmgeving } from "../lib/beheer-omgeving-routes.js";

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = await mkdtemp(join(tmpdir(), "fysiplan-demoopslag-"));

function maak(dataDir, extra = {}) {
  const st = { klaar: null, saves: 0, faal: false, vertraging: () => 0, schendingen: [] };
  const opties = {
    dataDir, publicDir: "/nergens", leverancier: () => ({}),
    bronEcht: () => ({ soort: "echt", nu: Date.now(), facturen: [], kosten: [], systeem: { checks: [], versie: "abc1234" }, praktijken: [] }),
    beheerEigen: (req) => { req.beheerWie = "een@x.example"; return true; }, beheerRechten: () => new Set(ALLE_RECHTEN),
    // bij elk antwoord: staat wat dit verzoek veranderde al in de laatst voltooide save?
    sendJson: async (res, status, body) => {
      res.status = status; res.body = JSON.parse(JSON.stringify(body));
      if (status === 200 && res.verwacht && !(st.klaar || "").includes(res.verwacht)) st.schendingen.push(res.verwacht);
    },
    readBody: async (req) => { await wacht(Math.random() * 15); return JSON.stringify(req.body || {}); },
    kruisSite: () => false, beheerIp: () => "1.2.3.x", denied: async (req, res) => { res.status = 403; },
    saveJson: async (pad, v) => {
      const tekst = JSON.stringify(v);
      if (!pad.endsWith("beheer-demo.json")) return;
      await wacht(st.vertraging());
      if (st.faal) throw new Error("schijf vol (nagebootst)");
      st.klaar = tekst; st.saves++;
      await writeFile(pad, tekst);
    },
    beheerLog: { schrijf: async () => { await wacht(Math.random() * 10); } }, mailIngesteld: () => false, mailOpSlot: () => false, maskeerEmail: (e) => e,
    stuurMail: async () => {}, accounts: () => ({}), bewaarAccounts: async () => {}, sleutelAan: () => false, ideeenWacht: () => 0,
    ...extra
  };
  const om = maakBeheerOmgeving(opties);
  const roep = async (pad, body, verwacht) => {
    const res = { setHeader() {}, verwacht };
    await om.afhandelen({ method: "POST", url: pad, headers: {}, body }, res, pad);
    return res;
  };
  const kosten = (omschrijving) => roep("/api/beheer/omgeving/kosten", { bron: "demo", datum: "2026-11-02", omschrijving, bedrag: "12,10", btw: "2,10" }, omschrijving);
  return { om, st, roep, kosten };
}

try {
  // ---- 1. trage saves, veel wijzigingen tegelijk ----
  {
    const dir = join(tmp, "a"); await mkdir(dir);
    const { om, st, roep, kosten } = maak(dir);
    await om.laad();
    st.vertraging = () => Math.random() * 40;
    const lijst = [];
    for (let i = 0; i < 30; i++) {
      lijst.push(kosten("Kostenpost-" + i));
      if (i % 5 === 0) lijst.push(roep("/api/beheer/omgeving/loket/agent", { bron: "demo", rol: ["support", "tech", "finance"][i % 3], stand: i % 2 ? "aan" : "uit" }));
    }
    const uit = await Promise.all(lijst);
    assert.ok(uit.every((r) => r.status === 200), JSON.stringify(uit.map((r) => [r.status, r.body.fout])));
    assert.deepEqual(st.schendingen, [], "elk antwoord kwam pas na een save met zijn eigen wijziging");
    await wacht(80);
    const opSchijf = await readFile(join(dir, "beheer-demo.json"), "utf8");
    for (let i = 0; i < 30; i++) assert.ok(opSchijf.includes("Kostenpost-" + i), "op schijf staat post " + i);
    // de rij houdt de volgorde: de laatste save is de nieuwste stand
    assert.equal(st.klaar, opSchijf);

    // ---- 2. save mislukt: 500 voor wie de demo wijzigde ----
    st.faal = true;
    let r = await kosten("Tijdens de storing");
    assert.deepEqual([r.status, r.body.opslagFout], [500, true]);
    r = await roep("/api/beheer/omgeving/kosten", { bron: "demo", datum: "", omschrijving: "", bedrag: "" });
    assert.equal(r.status, 400, "een weigering blijft een weigering");
    r = await roep("/api/beheer/omgeving/loket/agent", { bron: "echt", rol: "support", stand: "proef" });
    assert.equal(r.status, 200, "de echte kant merkt niets van een kapotte demo-opslag");
    st.faal = false;
    r = await kosten("Na de storing");
    assert.equal(r.status, 200);
    const na = await readFile(join(dir, "beheer-demo.json"), "utf8");
    assert.ok(na.includes("Tijdens de storing") && na.includes("Na de storing"), "na herstel staat ook de eerdere wijziging op schijf");
    om.stop();
  }

  // ---- 3. verplaatsen en kopiëren lukken niet: het origineel blijft ----
  {
    const dir = join(tmp, "b"); await mkdir(dir);
    const origineel = JSON.stringify({ versie: 999, iets: "oude demo die niet weg mag" });
    await writeFile(join(dir, "beheer-demo.json"), origineel);
    const nee = async () => { throw Object.assign(new Error("nagebootst"), { code: "EPERM" }); };
    const { om, st, kosten } = maak(dir, { demoFs: { rename: nee, copyFile: nee } });
    await om.laad();
    assert.equal(await readFile(join(dir, "beheer-demo.json"), "utf8"), origineel, "het origineel is niet overschreven bij het starten");
    const r = await kosten("Mag niet over het origineel");
    assert.deepEqual([r.status, r.body.opslagFout], [500, true], "een wijziging zegt eerlijk dat ze niet bewaard is");
    assert.match(r.body.fout, /niet worden opgeslagen/);
    assert.equal(await readFile(join(dir, "beheer-demo.json"), "utf8"), origineel, "ook niet na een wijziging");
    assert.equal(st.saves, 0);
    // de pagina noemt de reden
    const res = { setHeader() {} };
    await om.afhandelen({ method: "GET", url: "/api/beheer/omgeving?bron=demo", headers: {} }, res, "/api/beheer/omgeving");
    assert.match(res.body.demoReset.reden, /andere vorm.*kon niet apart worden gezet/s);
    assert.equal(res.body.demoReset.bestand, null);
    om.stop();
  }

  // ---- 4. verplaatsen lukt niet, kopiëren wel: kopie opzij, daarna gewoon verder ----
  {
    const dir = join(tmp, "c"); await mkdir(dir);
    await writeFile(join(dir, "beheer-demo.json"), "{kapot");
    const { om, kosten } = maak(dir, { demoFs: { rename: async () => { throw new Error("nagebootst"); } } });
    await om.laad();
    const opzij = (await readdir(dir)).filter((n) => n.startsWith("beheer-demo.onleesbaar-"));
    assert.equal(opzij.length, 1);
    assert.equal(await readFile(join(dir, opzij[0]), "utf8"), "{kapot", "de kopie heeft de oude inhoud");
    assert.equal((await kosten("Gewoon verder")).status, 200);
    om.stop();
  }

  // ---- 5. niet te lezen (geen ENOENT): nooit overschrijven ----
  {
    const dir = join(tmp, "d"); await mkdir(dir);
    await mkdir(join(dir, "beheer-demo.json", "binnen"), { recursive: true }); // lezen geeft EISDIR
    const { om, st, kosten } = maak(dir);
    await om.laad();
    assert.equal((await kosten("Niet bewaren")).status, 500);
    assert.equal(st.saves, 0, "geen save over een bestand dat niet te lezen was");
    assert.deepEqual(await readdir(join(dir, "beheer-demo.json")), ["binnen"]);
    om.stop();
  }
  console.log("test-demo-opslag: ok");
} finally {
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
