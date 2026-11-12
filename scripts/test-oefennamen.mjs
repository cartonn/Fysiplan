// Nederlandse namen op de standaardkaarten (platformreview 2026-11-11).
//
// De oefeningen uit de oude Engelstalige reeks die op een standaardkaart staan, tonen een
// Nederlandse naam. Het bestand met de oefeningen (public/oefeningen-v2.json) en de standaard-
// kaarten (public/sjablonen.json) blijven zoals ze zijn: de namen komen als laag eroverheen
// (content/oefennamen-nl.json, lib/oefennamen.js). Aan een oefennaam hangt veel; deze test legt
// vast dat niets daarvan losraakt:
// - de bibliotheek toont de Nederlandse naam en geeft de naam uit het bestand mee als `eerder`;
//   de volgorde van de lijst verandert niet (de app bewaart een open kaart als posities);
// - wat beheer zelf hernoemt gaat voor, en terug naar de Nederlandse naam kan ook;
// - een video van beheer die onder de naam uit het bestand staat, hoort nog bij de oefening;
// - een kaart die voor de wijziging is bewaard: de eigen video van de therapeut en de tellingen
//   van de patiënt verhuizen mee zodra de kaart onder de nieuwe naam wordt bewaard (zonder dat
//   ruimde de server de opname op), en de patiëntkaart vindt de oefening op haar oude naam;
// - elke standaardkaart vindt al haar oefeningen nog;
// - elke voorleesopname die bij haar oefening hoorde, hoort er nog bij.
// Het serverdeel en de schermcode in een VM draaien in CI; het browserdeel alleen waar Playwright staat.
// `npm run test:oefennamen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { normNaam, leesNamenLaag, kiesNamen, maakZoeker, sleutelVoor, verhuisNaamgebonden } from "../lib/oefennamen.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lees = async (pad) => JSON.parse(await readFile(join(root, pad), "utf8"));
const tussen = (bron, a, b) => { const i = bron.indexOf(a); assert.ok(i >= 0, "niet gevonden: " + a); const j = bron.indexOf(b, i + a.length); assert.ok(j > i, "niet gevonden: " + b); return bron.slice(i, j); };

// ---- 1. de regels zelf (lib/oefennamen.js) ----
{
  assert.equal(normNaam("Bruggetje – ruglig"), "bruggetjeruglig");
  assert.equal(normNaam("Eénbenige  SQUAT!"), "eenbenigesquat");
  assert.equal(normNaam(null), "");

  // de laag lezen: wat geen bruikbare naam is, valt weg
  const gelezen = leesNamenLaag({ namen: { Lunges: "  Uitvalspas   voorwaarts ", Leeg: "  ", Getal: 7, Zelfde: "Zelfde", Lang: "x".repeat(81), Proto: "__proto__", Ok80: "y".repeat(80) } });
  assert.deepEqual([...gelezen], [["Lunges", "Uitvalspas voorwaarts"], ["Ok80", "y".repeat(80)]]);
  for (const kapot of [null, undefined, 3, "tekst", [], { namen: null }, { namen: [["a", "b"]] }, { namen: "x" }]) assert.equal(leesNamenLaag(kapot).size, 0);

  const L = (o) => new Map(Object.entries(o));
  const uit = (m) => Object.fromEntries([...m].map(([b, v]) => [b, v.eerder ? v.naam + " (eerder: " + v.eerder.join(",") + ")" : v.naam]));
  assert.deepEqual(uit(kiesNamen(["Lunges", "Plank"], {}, L({ Lunges: "Uitvalspas" }))), { Lunges: "Uitvalspas (eerder: Lunges)", Plank: "Plank" },
    "de Nederlandse naam, met de naam uit het bestand als eerdere naam");
  assert.deepEqual(uit(kiesNamen(["Lunges"], { Lunges: "Uitval van beheer" }, L({ Lunges: "Uitvalspas" }))), { Lunges: "Uitval van beheer (eerder: Lunges)" },
    "wat beheer hernoemt gaat voor");
  assert.deepEqual(uit(kiesNamen(["Lunges"], { Lunges: "Lunges" }, L({ Lunges: "Uitvalspas" }))), { Lunges: "Lunges" },
    "beheer kan de naam uit het bestand terugzetten");
  assert.deepEqual(uit(kiesNamen(["Lunges", "Lunge walk"], {}, L({ Lunges: "Uitvalspas", "Lunge walk": "uitvalspas!" }))), { Lunges: "Uitvalspas (eerder: Lunges)", "Lunge walk": "Lunge walk" },
    "twee oefeningen krijgen nooit dezelfde naam: de tweede houdt de naam uit het bestand");
  assert.deepEqual(uit(kiesNamen(["Squat", "Kniebuiging"], {}, L({ Squat: "Kniebuiging" }))), { Squat: "Squat", Kniebuiging: "Kniebuiging" },
    "een naam die een andere oefening al heeft, wordt niet toegepast");
  assert.deepEqual(uit(kiesNamen(["Squat"], {}, L({ Squat: "Kniebuiging" }), ["kniebuiging"])), { Squat: "Squat" },
    "ook niet als beheer zelf een oefening met die naam toevoegde");
  assert.deepEqual(uit(kiesNamen(["A-oefening", "B-oefening"], {}, L({ "A-oefening": "B-oefening", "B-oefening": "C-oefening" }))),
    { "A-oefening": "A-oefening", "B-oefening": "C-oefening (eerder: B-oefening)" },
    "en ook niet de naam uit het bestand van een oefening die zelf een Nederlandse naam krijgt");
  assert.deepEqual(uit(kiesNamen(["Alpha", "Beta"], { Alpha: "Gamma", Beta: "Alpha" })), { Alpha: "Gamma", Beta: "Alpha (eerder: Beta)" },
    "heet een andere oefening intussen zoals deze eerder heette, dan wijst die naam naar de andere");
  assert.deepEqual(uit(kiesNamen(["constructor", "Plank"], {}, new Map())), { constructor: "constructor", Plank: "Plank" }, "een sleutel uit het prototype is geen keuze van beheer");

  const bib = [
    { naam: "Uitvalspas", eerder: ["Lunges"], exerciseId: "fp_1" },
    { naam: "Lunges", exerciseId: "fp_2" },
    { naam: "Bruggetje – ruglig", eerder: ["Glute bridges"], exerciseId: "fp_3" },
    null, "rommel"
  ];
  const z = maakZoeker(bib);
  assert.equal(z.vind({ id: "fp_1", n: "wat dan ook" }).exerciseId, "fp_1", "eerst het vaste id");
  assert.equal(z.vind({ n: "LUNGES" }).exerciseId, "fp_2", "de naam van nu gaat voor een eerdere naam");
  assert.equal(z.vind({ n: "glute-bridges" }).exerciseId, "fp_3", "anders de eerdere naam");
  assert.equal(z.vind({ id: "fp_onbekend", n: "Glute bridges" }).exerciseId, "fp_3", "een onbekend id valt terug op de naam");
  assert.equal(z.vind({ n: "Bestaat niet" }), null);
  assert.equal(z.vind(null), null);
  assert.equal(z.isNaam("Glute bridges"), true);
  assert.equal(z.isNaam("glute bridges"), false, "alleen de letterlijke naam telt als naam uit de bibliotheek");
  assert.equal(z.isNaam("Bruggetje – ruglig"), true);
  assert.equal(z.isNaam("Verzonnen naam"), false);

  const brug = { naam: "Bruggetje – ruglig", eerder: ["Glute bridges"] };
  assert.equal(sleutelVoor({ "Glute bridges": { yt: "x" } }, brug), "Glute bridges", "wat onder de eerdere naam staat, blijft daar");
  assert.equal(sleutelVoor({ "Glute bridges": { yt: "x" }, "Bruggetje – ruglig": { yt: "y" } }, brug), "Bruggetje – ruglig", "de naam van nu gaat voor");
  assert.equal(sleutelVoor({}, brug), "Bruggetje – ruglig", "niets bewaard: de naam van nu");
  assert.equal(sleutelVoor({ "Glute bridges": null }, brug), "Bruggetje – ruglig");
  assert.equal(sleutelVoor({}, { naam: "constructor" }), "constructor", "geen sleutel uit het prototype");
  assert.equal(sleutelVoor({}, null), "");

  {
    const oud = [{ id: "fp_3", n: "Glute bridges" }, { id: "fp_9", n: "Plank" }];
    const nieuw = [{ id: "fp_3", n: "Bruggetje – ruglig" }, { id: "fp_9", n: "Plank" }];
    const vids = {}, trouw = { "Glute bridges": { n: 4, d: "2026-11-10" }, Plank: { n: 2, d: "2026-11-09" } }, zwaar = { "Glute bridges": { t: 1700 } };
    assert.equal(verhuisNaamgebonden(oud, nieuw, { glutebridges: "uploads/videos/v-aa.mp4", plank: "uploads/videos/v-bb.mp4" }, vids, [trouw, zwaar, null]), 1);
    assert.deepEqual(vids, { bruggetjeruglig: "uploads/videos/v-aa.mp4" }, "de video verhuist naar de naam van nu");
    assert.deepEqual(trouw, { Plank: { n: 2, d: "2026-11-09" }, "Bruggetje – ruglig": { n: 4, d: "2026-11-10" } });
    assert.deepEqual(zwaar, { "Bruggetje – ruglig": { t: 1700 } });
  }
  { // de editor stuurde zelf al een video onder de nieuwe naam mee: die blijft
    const vids = { bruggetjeruglig: "yt:AAAAAAAAAAA" };
    verhuisNaamgebonden([{ id: "fp_3", n: "Glute bridges" }], [{ id: "fp_3", n: "Bruggetje – ruglig" }], { glutebridges: "uploads/videos/v-aa.mp4" }, vids);
    assert.deepEqual(vids, { bruggetjeruglig: "yt:AAAAAAAAAAA" });
  }
  { // onder beide namen staat al een telling: optellen, de laatste dag en het laatste tijdstip houden
    const trouw = { "Glute bridges": { n: 4, d: "2026-11-10" }, "Bruggetje – ruglig": { n: 1, d: "2026-11-12" } };
    const zwaar = { "Glute bridges": { t: 50 }, "Bruggetje – ruglig": { t: 20 } };
    verhuisNaamgebonden([{ id: "fp_3", n: "Glute bridges" }], [{ id: "fp_3", n: "Bruggetje – ruglig" }], {}, {}, [trouw, zwaar]);
    assert.deepEqual(trouw, { "Bruggetje – ruglig": { n: 5, d: "2026-11-12" } });
    assert.deepEqual(zwaar, { "Bruggetje – ruglig": { t: 50 } });
  }
  { // de oude naam staat nog op de kaart, bij een andere oefening: wat eraan hangt hoort dan daarbij
    const vids = {}, trouw = { Lunges: { n: 3, d: "2026-11-10" } };
    assert.equal(verhuisNaamgebonden([{ id: "fp_1", n: "Lunges" }], [{ id: "fp_1", n: "Uitvalspas" }, { id: "fp_2", n: "Lunges" }], { lunges: "uploads/videos/v-cc.mp4" }, vids, [trouw]), 0);
    assert.deepEqual(vids, {});
    assert.deepEqual(trouw, { Lunges: { n: 3, d: "2026-11-10" } });
  }
  { // zonder vast id, of met een ander id, verhuist er niets
    const vids = {}, trouw = { "Glute bridges": { n: 1, d: "" } };
    assert.equal(verhuisNaamgebonden([{ id: "", n: "Glute bridges" }, { id: "fp_7", n: "Squat" }], [{ id: "", n: "Bruggetje – ruglig" }, { id: "fp_8", n: "Kniebuiging" }],
      { glutebridges: "uploads/videos/v-aa.mp4" }, vids, [trouw]), 0);
    assert.deepEqual(vids, {});
    assert.deepEqual(Object.keys(trouw), ["Glute bridges"]);
  }
  { // een naam die een sleutel van het prototype zou worden, wordt geen sleutel
    const trouw = { Gewoon: { n: 1, d: "" } };
    verhuisNaamgebonden([{ id: "fp_5", n: "Gewoon" }], [{ id: "fp_5", n: "__proto__" }], {}, {}, [trouw]);
    assert.deepEqual(trouw, { Gewoon: { n: 1, d: "" } });
    assert.equal(Object.getPrototypeOf(trouw), Object.prototype);
  }
  assert.equal(verhuisNaamgebonden(null, undefined, null, {}), 0);
}

// ---- 2. het bestand met de Nederlandse namen, tegen de bibliotheek en de standaardkaarten ----
const basis = await lees("public/oefeningen-v2.json");
const ruw = await lees("content/oefennamen-nl.json");
const laag = leesNamenLaag(ruw);
const sjablonen = await lees("public/sjablonen.json");
const sjabNaam = (o) => (typeof o === "string" ? o : (o && o.n) || "");
{
  assert.equal(laag.size, Object.keys(ruw.namen).length, "elke regel in het bestand is bruikbaar (niet leeg, niet te lang, niet gelijk aan de naam uit het bestand)");
  assert.ok(laag.size >= 100, "testopzet: het bestand heeft namen (" + laag.size + ")");
  const basisNamen = new Set(basis.map((e) => e.naam));
  for (const [oud, nieuw] of laag) {
    assert.ok(basisNamen.has(oud), oud + ": staat in public/oefeningen-v2.json");
    assert.equal(nieuw, nieuw.trim().replace(/\s+/g, " "), nieuw + ": geen dubbele of losse spaties");
    assert.ok(!/[<>"]/.test(nieuw), nieuw + ": geen tekens die in HTML iets betekenen");
  }
  const uniek = [...new Set(basis.map((e) => e.naam))];
  const gekozen = kiesNamen(uniek, {}, laag);
  assert.deepEqual([...laag].filter(([oud, nieuw]) => gekozen.get(oud).naam !== nieuw).map(([oud]) => oud), [],
    "elke Nederlandse naam is vrij: geen andere oefening heet zo, nu of in het bestand");
  const alle = [...gekozen.values()].map((v) => normNaam(v.naam));
  assert.equal(alle.length - new Set(alle).size, uniek.length - new Set(uniek.map(normNaam)).size, "er komt geen dubbele naam bij");
  for (const [oud, v] of gekozen) if (laag.has(oud)) assert.deepEqual(v.eerder, [oud], oud + ": de naam uit het bestand gaat mee als eerdere naam");

  // elke oefening van een standaardkaart blijft dezelfde oefening, onder haar naam van nu
  const zoeker = maakZoeker(uniek.map((n) => { const v = gekozen.get(n); return { naam: v.naam, ...(v.eerder ? { eerder: v.eerder } : {}), basis: n }; }));
  let opKaart = 0;
  const hernoemdOpKaart = new Set();
  for (const s of sjablonen) for (const o of s.oefeningen || []) {
    const n = sjabNaam(o), gevonden = zoeker.vind({ n });
    assert.ok(gevonden, s.naam + ": " + n + " staat nog in de bibliotheek");
    assert.equal(normNaam(gevonden.basis), normNaam(n), s.naam + ": " + n + " wijst nog naar dezelfde oefening");
    opKaart++;
    if (laag.has(gevonden.basis)) hernoemdOpKaart.add(gevonden.basis);
  }
  assert.ok(opKaart > 1000, "testopzet: de standaardkaarten zijn nagelopen (" + opKaart + " regels)");
  assert.deepEqual([...laag.keys()].filter((n) => !hernoemdOpKaart.has(n)), [], "het bestand bevat alleen oefeningen die op een standaardkaart staan");
}

// ---- 3. de schermcode van de therapeut (public/index.html), in een VM ----
const index = await readFile(join(root, "public/index.html"), "utf8");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
{
  const normEx = index.match(/  function normEx\(s\)\{[^\n]*\n/)[0];
  const ctx = vm.createContext({});
  vm.runInContext("var OEF=[],VIDS={},chosen=[],NOTES={},byNorm={},byStable={};\n" + normEx +
    tussen(index, "  function eerdereNamen(o)", "  // practice settings") + tussen(index, "  function vidsNaarNaamVanNu(){", "  // Opm. en Casus"), ctx);
  const OEF = [{ naam: "Uitvalspas", eerder: ["Lunges"], exerciseId: "fp_1" }, { naam: "Lunges", exerciseId: "fp_2" },
    { naam: "Bruggetje – ruglig", eerder: ["Glute bridges"], exerciseId: "fp_3" }, { naam: "Plank" }].map((o, i) => ({ id: i, ...o }));
  ctx.__oef = JSON.stringify(OEF);
  vm.runInContext("OEF=JSON.parse(__oef);rebuildLookup();", ctx);
  const tabel = JSON.parse(vm.runInContext("JSON.stringify({byNorm:byNorm,byStable:byStable})", ctx));
  assert.deepEqual(tabel.byNorm, { uitvalspas: 0, lunges: 1, bruggetjeruglig: 2, plank: 3, glutebridges: 2 },
    "de editor vindt een oefening op haar eerdere naam; een oefening die nu zo heet gaat voor");
  assert.deepEqual(tabel.byStable, { fp_1: 0, fp_2: 1, fp_3: 2 });
  const verhuis = (gekozen, vids) => { ctx.__c = JSON.stringify(gekozen.map((o) => ({ o, i: 0 }))); ctx.__v = JSON.stringify(vids);
    return JSON.parse(vm.runInContext("chosen=JSON.parse(__c);VIDS=JSON.parse(__v);vidsNaarNaamVanNu();JSON.stringify(VIDS)", ctx)); };
  assert.deepEqual(verhuis([2, 3], { glutebridges: "yt:AAAAAAAAAAA", plank: "yt:BBBBBBBBBBB" }), { bruggetjeruglig: "yt:AAAAAAAAAAA", plank: "yt:BBBBBBBBBBB" },
    "de eigen video van een open kaart verhuist naar de naam van nu");
  assert.deepEqual(verhuis([2], { glutebridges: "yt:AAAAAAAAAAA", bruggetjeruglig: "yt:CCCCCCCCCCC" }), { glutebridges: "yt:AAAAAAAAAAA", bruggetjeruglig: "yt:CCCCCCCCCCC" },
    "een video die al onder de naam van nu staat, blijft");
  assert.deepEqual(verhuis([0], { lunges: "yt:DDDDDDDDDDD" }), { uitvalspas: "yt:DDDDDDDDDDD" });
  assert.deepEqual(verhuis([0, 1], { lunges: "yt:DDDDDDDDDDD" }), { lunges: "yt:DDDDDDDDDDD" }, "een naam waaronder een andere oefening op de kaart nu staat, is van die oefening");
  ctx.__n = JSON.stringify({ "Glute bridges": { s: "ruglig", u: "", o: "" }, Plank: { s: "", u: "span je buik aan", o: "" } });
  assert.deepEqual(JSON.parse(vm.runInContext("NOTES=JSON.parse(__n);JSON.stringify([notitieVan(OEF[2]),notitieVan(OEF[3]),notitieVan(OEF[0])])", ctx)),
    [{ s: "ruglig", u: "", o: "" }, { s: "", u: "span je buik aan", o: "" }, null], "een eigen notitie onder de eerdere naam hoort nog bij de oefening");

  // de plekken waar de editor de eerdere naam gebruikt
  assert.match(index, /eerder:Array\.isArray\(e\.eerder\)\?e\.eerder:null,/, "de bibliotheek van de server neemt de eerdere naam mee");
  assert.match(index, /if\(st\.vids&&typeof st\.vids==='object'\)VIDS=st\.vids;\n      vidsNaarNaamVanNu\(\);/, "een herstelde open kaart zet eigen video's op de naam van nu");
  assert.match(index, /var was=normEx\(x\.n\),nu=normEx\(OEF\[id\]\.naam\);\n        if\(was!==nu&&vids\[was\]&&!vids\[nu\]\)\{vids\[nu\]=vids\[was\];delete vids\[was\];\}/,
    "een geopende kaart zet eigen video's op de naam van nu");
  assert.match(index, /o\.naam=d\.naam;o\.eerder=Array\.isArray\(d\.eerder\)\?d\.eerder:null;rebuildLookup\(\);/, "hernoemen in beheer neemt de eerdere naam uit het antwoord over");
}

// ---- 4. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefennamen-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const SLEUTEL = "een-testsleutel-voor-de-oefennamen";
// de oefening waar de test omheen draait: staat in het bestand, met een video van beheer onder de naam uit het bestand
const BASIS = "Glute bridges", NL = laag.get(BASIS);
assert.ok(NL, "testopzet: " + BASIS + " heeft een Nederlandse naam");
await writeFile(join(dataDir, "videolinks.json"), JSON.stringify({ [BASIS]: { yt: "dQw4w9WgXcQ" } }));

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
// localhost: de browser hieronder ziet dat als veilige oorsprong
const origin = `http://localhost:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|EIGEN_LOGIN|PROEF_)/.test(k) || k === "NODE_ENV") delete kind[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
let ip = 1;
const kop = (extra = {}) => ({ "x-forwarded-for": "10.91." + Math.floor(ip / 250) + "." + (ip++ % 250), ...extra });
const haal = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop({ "content-type": "application/json", ...extra }), body: JSON.stringify(body) });
const BEHEER = { "x-admin-sleutel": SLEUTEL };
const opSchijf = async (naam) => JSON.parse(await readFile(join(dataDir, naam), "utf8"));
const bestaat = (pad) => access(join(dataDir, pad)).then(() => true, () => false);
const bibliotheek = async () => (await haal("/v2/oefeningen.json")).json();
const vanBasis = (lijst, naam) => lijst.find((e) => (e.eerder || []).includes(naam)) || lijst.find((e) => e.naam === naam);

let browserKlaar = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await haal("/health")).ok) break; } catch {} await wacht(50); }

  // -- de bibliotheek toont de Nederlandse namen --
  let lijst = await bibliotheek();
  assert.ok(lijst.length > 500, "testopzet: de bibliotheek is geladen (" + lijst.length + ")");
  const brug = lijst.find((e) => e.naam === NL);
  assert.ok(brug, NL + " staat in de bibliotheek");
  assert.deepEqual(brug.eerder, [BASIS], "de naam uit het bestand gaat mee");
  assert.ok(brug.searchAliases.includes(BASIS), "zoeken op de naam uit het bestand vindt de oefening nog");
  assert.ok(!lijst.some((e) => e.naam === BASIS), "geen oefening heet nog " + BASIS);
  let zichtbaar = 0;
  for (const [oud, nieuw] of laag) {
    const e = lijst.find((x) => (x.eerder || []).includes(oud));
    if (!e) { assert.ok(!lijst.some((x) => x.naam === oud), oud + ": staat niet onder de oude naam in de bibliotheek"); continue; }
    zichtbaar++;
    assert.equal(e.naam, nieuw, oud);
    assert.deepEqual(e.eerder, [oud]);
  }
  assert.ok(zichtbaar >= laag.size - 5, "bijna elke oefening uit het bestand is zichtbaar (" + zichtbaar + " van " + laag.size + ")");
  const genormd = lijst.map((e) => normNaam(e.naam));
  assert.equal(new Set(genormd).size, genormd.length, "geen twee oefeningen met dezelfde naam");
  // de volgorde blijft die van de namen uit het bestand: per categorie oplopend op die naam
  const volgNaam = (e) => (laag.get((e.eerder || [])[0]) === e.naam ? e.eerder[0] : e.naam);
  for (let i = 1; i < lijst.length; i++) if (lijst[i].groep === lijst[i - 1].groep) {
    assert.ok(volgNaam(lijst[i - 1]).localeCompare(volgNaam(lijst[i]), "nl") <= 0, "volgorde: " + lijst[i - 1].naam + " voor " + lijst[i].naam);
  }
  assert.ok(lijst.some((e, i) => i && lijst[i - 1].groep === e.groep && lijst[i - 1].naam.localeCompare(e.naam, "nl") > 0),
    "testopzet: op de getoonde naam zou de lijst anders staan");
  let health = await (await haal("/health")).json();
  assert.equal(health.nederlandseNamen, zichtbaar + [...laag.keys()].filter((n) => !vanBasis(lijst, n)).length, "/health telt de oefeningen met een Nederlandse naam");
  assert.equal(health.nederlandseNamen, laag.size);
  // de video van beheer stond onder de naam uit het bestand en hoort nog bij de oefening
  assert.equal(brug.video && brug.video.yt, "dQw4w9WgXcQ", "de video onder de naam uit het bestand hoort nog bij de oefening");

  // -- video's van beheer: één plek per oefening, onder welke naam beheer haar ook noemt --
  let r = await post("/api/oefeningen/video", { naam: NL, yt: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }, BEHEER);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).video.yt, "aaaaaaaaaaa");
  assert.deepEqual(await opSchijf("videolinks.json"), { [BASIS]: { yt: "aaaaaaaaaaa" } }, "de video blijft op de plek waar hij stond, er komt geen tweede bij");
  r = await post("/api/oefeningen/video", { naam: BASIS, yt: "" }, BEHEER);
  assert.equal(r.status, 200, "beheer mag de oefening nog bij haar naam uit het bestand noemen");
  assert.deepEqual(await opSchijf("videolinks.json"), {});
  assert.ok(!((vanBasis(await bibliotheek(), BASIS).video || {}).yt), "de video is weg bij de oefening");
  r = await post("/api/oefeningen/video", { naam: NL, yt: "bbbbbbbbbbb" }, BEHEER);
  assert.equal(r.status, 200);
  assert.deepEqual(await opSchijf("videolinks.json"), { [NL]: { yt: "bbbbbbbbbbb" } }, "een nieuwe video komt onder de naam van nu");
  assert.equal((await post("/api/oefeningen/video", { naam: "Bestaat niet", yt: "bbbbbbbbbbb" }, BEHEER)).status, 404);

  // -- hernoemen door beheer gaat voor, en terug kan --
  r = await post("/api/hernoem", { van: NL, naar: "Brug van beheer" }, BEHEER);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, naam: "Brug van beheer", eerder: [BASIS] });
  lijst = await bibliotheek();
  assert.deepEqual([vanBasis(lijst, BASIS).naam, vanBasis(lijst, BASIS).eerder], ["Brug van beheer", [BASIS]]);
  assert.equal(vanBasis(lijst, BASIS).exerciseId, brug.exerciseId, "het vaste id verandert niet");
  assert.deepEqual(await opSchijf("naam-wijzigingen.json"), { [BASIS]: "Brug van beheer" });
  assert.deepEqual(await opSchijf("videolinks.json"), { "Brug van beheer": { yt: "bbbbbbbbbbb" } }, "de video verhuist mee");
  assert.equal((await (await haal("/health")).json()).nederlandseNamen, laag.size - 1);
  // een andere oefening mag de naam uit het bestand of de Nederlandse naam van een ander niet krijgen
  const ander = lijst.find((e) => e.eerder && e.exerciseId !== brug.exerciseId);
  for (const bezet of [ander.naam, ander.eerder[0], ander.eerder[0].toUpperCase()]) {
    r = await post("/api/hernoem", { van: "Brug van beheer", naar: bezet }, BEHEER);
    assert.equal(r.status, 409, bezet + " is al van een andere oefening");
  }
  // een nieuwe oefening van beheer mag ook geen eerdere naam innemen (kaarten wijzen daar nog naar)
  assert.equal((await post("/api/oefeningen", { naam: BASIS, groep: "Core", img: "x" }, BEHEER)).status, 409, "een nieuwe oefening kan de eerdere naam van een andere niet krijgen");
  // terug naar de Nederlandse naam, aangeroepen met de naam uit het bestand: de eigen keuze van beheer vervalt
  r = await post("/api/hernoem", { van: BASIS, naar: NL }, BEHEER);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, naam: NL, eerder: [BASIS] });
  assert.deepEqual(await opSchijf("naam-wijzigingen.json"), {}, "terug naar de Nederlandse naam is geen eigen keuze meer");
  assert.deepEqual(await opSchijf("videolinks.json"), { [NL]: { yt: "bbbbbbbbbbb" } });
  // de naam uit het bestand terugzetten is wel een keuze, en blijft staan
  r = await post("/api/hernoem", { van: NL, naar: BASIS }, BEHEER);
  assert.deepEqual(await r.json(), { ok: true, naam: BASIS });
  lijst = await bibliotheek();
  assert.ok(lijst.some((e) => e.naam === BASIS && !e.eerder && e.exerciseId === brug.exerciseId), "beheer kan de naam uit het bestand terugzetten");
  assert.deepEqual(await opSchijf("naam-wijzigingen.json"), { [BASIS]: BASIS });
  assert.equal((await post("/api/hernoem", { van: BASIS, naar: NL }, BEHEER)).status, 200);
  assert.deepEqual(await opSchijf("naam-wijzigingen.json"), {});
  assert.equal((await post("/api/hernoem", { van: NL, naar: "Zonder sleutel" })).status, 403, "hernoemen blijft van beheer");
  await post("/api/oefeningen/video", { naam: NL, yt: "" }, BEHEER);
  lijst = await bibliotheek();
  assert.deepEqual(lijst.map((e) => e.exerciseId), (await bibliotheekVolgorde()), "na alle wijzigingen staat de lijst weer in de volgorde van het begin");

  // -- een kaart van voor de naamswijziging --
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Namen", wachtwoord: "wachtwoord-namen-test", akkoord: true });
  assert.equal(claim.status, 200);
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const opname = async () => {
    const { token } = await (await post("/api/opname/start", { doel: "kaart" }, S)).json();
    const video = Buffer.alloc(12 * 1024); video.write("ftypisom", 4, "latin1");
    const up = await fetch(origin + "/api/opname/upload?token=" + token, { method: "POST", headers: kop({ "content-type": "video/mp4" }), body: video });
    assert.equal(up.status, 200);
    return (await up.json()).video;
  };
  const plank = lijst.find((e) => !e.eerder && e.uitleg && e.kaartImg);
  const kaart = (naam, extra) => post("/api/kaarten", { praktijk: "Fysio Namen", naam, client: { c_naam: naam }, rows: {}, cells: {}, ...extra }, S);
  const kaartOpSchijf = async (id) => Object.values((await opSchijf("kaarten.json"))["fysio namen"] || {}).find((k) => k.id === id);

  // 1. bewaard onder de oude naam, met een eigen opname; de patiënt vinkt af en meldt te zwaar
  const padA = await opname();
  r = await kaart("Anna", { kaartId: "", chosen: [{ n: BASIS, id: brug.exerciseId, i: 0 }, { n: plank.naam, id: plank.exerciseId, i: 0 }], vids: { [normNaam(BASIS)]: padA } });
  assert.equal(r.status, 200);
  const A = await r.json();
  assert.equal((await post("/api/kaart/oefening", { id: A.id, oef: 0 })).status, 200);
  assert.equal((await post("/api/kaart/oefzwaar", { id: A.id, oef: 0 })).status, 200);
  assert.equal((await post("/api/kaart/oefening", { id: A.id, oef: 1 })).status, 200);
  let k = await kaartOpSchijf(A.id);
  assert.deepEqual([Object.keys(k.oefTrouw).sort(), Object.keys(k.oefZwaar)], [[BASIS, plank.naam].sort(), [BASIS]], "testopzet: de tellingen staan op de naam van de kaart");
  // de patiëntkaart vindt de oefening op haar oude naam, met het vaste id
  let pub = await (await haal("/api/kaart?id=" + A.id)).json();
  assert.deepEqual(pub.lib.map((o) => o.exerciseId).sort(), [brug.exerciseId, plank.exerciseId].sort());
  // 2. de therapeut opent de kaart in de nieuwe app: die bewaart de naam van nu, met de video op de naam van nu
  await wacht(5);
  r = await kaart("Anna", { kaartId: A.id, basisTs: A.ts, chosen: [{ n: NL, id: brug.exerciseId, i: 0 }, { n: plank.naam, id: plank.exerciseId, i: 0 }], vids: { [normNaam(NL)]: padA } });
  assert.equal(r.status, 200);
  k = await kaartOpSchijf(A.id);
  assert.deepEqual(k.vids, { [normNaam(NL)]: padA });
  assert.ok(await bestaat(padA), "de opname staat nog op schijf");
  assert.deepEqual(Object.keys(k.oefTrouw).sort(), [NL, plank.naam].sort(), "de afvinkdagen verhuizen mee naar de naam van nu");
  assert.equal(k.oefTrouw[NL].n, 1);
  assert.deepEqual(Object.keys(k.oefZwaar), [NL], "de melding te zwaar verhuist mee");

  // 3. een editor die de video niet onder de nieuwe naam meestuurt (de situatie zonder deze wijziging in de app):
  //    de server houdt de opname bij de oefening in plaats van hem op te ruimen
  const padB = await opname();
  r = await kaart("Bram", { kaartId: "", chosen: [{ n: BASIS, id: brug.exerciseId, i: 0 }], vids: { [normNaam(BASIS)]: padB } });
  const B = await r.json();
  await wacht(5);
  r = await kaart("Bram", { kaartId: B.id, basisTs: B.ts, chosen: [{ n: NL, id: brug.exerciseId, i: 0 }], vids: {} });
  assert.equal(r.status, 200);
  k = await kaartOpSchijf(B.id);
  assert.deepEqual(k.vids, { [normNaam(NL)]: padB }, "de eigen video blijft bij de oefening die anders is gaan heten");
  assert.ok(await bestaat(padB), "en de opname is niet opgeruimd");
  // haalt de therapeut de video daarna bewust weg, dan verdwijnt hij wel
  await wacht(5);
  r = await kaart("Bram", { kaartId: B.id, basisTs: (await r.json()).ts, chosen: [{ n: NL, id: brug.exerciseId, i: 0 }], vids: {}, client: { c_naam: "Bram", c_doel: "x" } });
  assert.equal(r.status, 200);
  assert.deepEqual((await kaartOpSchijf(B.id)).vids, {});
  for (let i = 0; i < 40 && await bestaat(padB); i++) await wacht(50);
  assert.equal(await bestaat(padB), false, "een video die de therapeut zelf weghaalt, wordt opgeruimd zoals altijd");

  // 4. een kaart zonder vast id bij de oefening (heel oud): de patiëntkaart vindt haar op de oude naam
  r = await kaart("Carla", { kaartId: "", chosen: [{ n: BASIS, id: "", i: 0 }], vids: {} });
  const C = await r.json();
  pub = await (await haal("/api/kaart?id=" + C.id)).json();
  assert.deepEqual(pub.lib.map((o) => o.naam), [NL], "de kaart krijgt de oefening mee, gevonden op haar eerdere naam");

  // -- de gebruiksranglijst telt onder de naam van nu --
  const gebruik = await (await haal("/api/oefeningen/gebruik", BEHEER)).json();
  const rij = gebruik.oefeningen.find((x) => x.naam === NL);
  assert.ok(rij && rij.aantal >= 5 && rij.id === brug.exerciseId && rij.eerder[0] === BASIS, "bewaard onder de oude of de nieuwe naam: één regel (" + JSON.stringify(rij) + ")");
  assert.ok(!gebruik.oefeningen.some((x) => x.naam === BASIS), "geen losse regel voor de naam uit het bestand");

  // -- de voorleesstem: de echte code van de kaart en van de stem, met het echte stemmanifest --
  const stemManifest = await lees("public/audio/noor/manifest.json");
  const houds = (await lees("public/mobile-narration-review.json")).holds.filter((h) => h.status === "hold");
  const afgekeurd = new Set((await lees("public/mobile-media-review.json")).entries.filter((e) => e.status === "rejected").map((e) => e.exerciseId));
  lijst = await bibliotheek();
  const zandbak = { setTimeout, clearTimeout, Promise, Error, AbortController, Audio: function () {},
    fetch: async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(stemManifest)) }) };
  zandbak.window = zandbak;
  const kctx = vm.createContext(zandbak);
  vm.runInContext(await readFile(join(root, "public/noor-audio.js"), "utf8"), kctx);
  await vm.runInContext("NoorAudio.load()", kctx);
  vm.runInContext("var K=null;\n" + kaartHtml.match(/  function normEx\(s\)\{[^\n]*\n/)[0] + tussen(kaartHtml, "  var mediaReviewReady=false,", "  function geldigeUitsnede(") +
    tussen(kaartHtml, "  function metEigen(", "  function cellPrefix(") + tussen(kaartHtml, "  function noorItem(o,x){", "  // De AI-zin bij de stem"), kctx);
  const clipNaam = (item) => { kctx.__item = JSON.stringify(item); return vm.runInContext("noorClipNaam(JSON.parse(__item))", kctx); };
  let metOpname = 0, hernoemdMetOpname = [];
  for (const c of stemManifest.clips) {
    const o = vanBasis(lijst, c.name);
    // een opname zonder oefening, of bij een oudere tekst, hoorde er al niet bij
    if (!o || c.text !== c.name + ". " + (o.uitleg || "")) continue;
    metOpname++;
    assert.equal(clipNaam({ name: o.naam, text: o.uitleg, eerder: o.eerder }), c.name, o.naam + ": de opname onder “" + c.name + "” hoort er nog bij");
    if (o.naam !== c.name) hernoemdMetOpname.push(o);
  }
  assert.ok(metOpname >= 20 && hernoemdMetOpname.length >= 10, "testopzet: opnames nagelopen (" + metOpname + ", waarvan " + hernoemdMetOpname.length + " bij een oefening met een Nederlandse naam)");
  assert.equal(clipNaam({ name: "Bestaat niet", text: "x", eerder: ["Ook niet"] }), "");
  assert.equal(clipNaam({ name: hernoemdMetOpname[0].naam, text: hernoemdMetOpname[0].uitleg + " en meer", eerder: hernoemdMetOpname[0].eerder }), "", "een andere tekst is een andere opname");
  assert.equal((kaartHtml.match(/NoorAudio\.match\(/g) || []).length, 2, "de kaart zoekt een opname alleen nog via noorClipNaam (naam van nu, dan de eerdere naam)");
  // de opzoekregel van de kaart en de keuring: ook op de eerdere naam
  kctx.__lib = JSON.stringify(lijst.filter((e) => [brug.exerciseId, plank.exerciseId].includes(e.exerciseId)));
  const opKaart = (x, eigenOef = []) => { kctx.__x = JSON.stringify(x); kctx.__eigen = JSON.stringify(eigenOef);
    return JSON.parse(vm.runInContext("(function(){var o=zoekOefening(oefeningIndex(JSON.parse(__lib),{eigenOef:JSON.parse(__eigen)}),JSON.parse(__x));return JSON.stringify(o?o.exerciseId:null);})()", kctx)); };
  assert.equal(opKaart({ n: BASIS, id: "" }), brug.exerciseId, "de patiëntkaart vindt de oefening op haar eerdere naam");
  assert.equal(opKaart({ n: NL, id: "" }), brug.exerciseId);
  assert.equal(opKaart({ n: BASIS, id: "" }, [{ id: "po_0123456789ab", naam: BASIS, img: "uploads/x.jpg", uitleg: "eigen" }]), "po_0123456789ab", "een eigen oefening van de praktijk die nu zo heet gaat voor");
  kctx.__houd = JSON.stringify([{ status: "hold", name: BASIS }]);
  const gehouden = JSON.parse(vm.runInContext(`(function(){mediaReviewReady=true;explanationHolds=JSON.parse(__houd);
    var lib=JSON.parse(__lib),o=zoekOefening(oefeningIndex(lib,{}),{n:${JSON.stringify(NL)},id:''}),p=lib.filter(function(e){return !e.eerder;})[0];
    var uit=[explanationWithheld(o),uitlegGehouden(noorItem(o,{n:o.naam})),explanationWithheld(p),uitlegGehouden(noorItem(p,{n:p.naam}))];
    explanationHolds=[];return JSON.stringify(uit);})()`, kctx));
  assert.deepEqual(gehouden, [true, true, false, false], "een houd op de naam uit het bestand geldt ook voor de oefening die intussen anders heet");
  console.log(`Oefennamen (server): ${laag.size} oefeningen tonen hun Nederlandse naam, de lijst staat in dezelfde volgorde; video's, tellingen en ${hernoemdMetOpname.length} voorleesopnames blijven bij hun oefening.`);

  // ---- 5. browser ----
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-oefennamen: geen Playwright, browserdeel overgeslagen (het serverdeel en de schermcode in de VM draaiden wel)"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    browserKlaar = () => browser.close();
    const idx = (o) => lijst.findIndex((e) => e.exerciseId === o.exerciseId);
    // een tweede oefening met een Nederlandse naam, een eigen opname van Noor en niets wat de kaart tegenhoudt
    const metStem = hernoemdMetOpname.filter((o) => o.kaartImg && !afgekeurd.has(o.exerciseId) && o.exerciseId !== brug.exerciseId &&
      !houds.some((h) => h.exerciseId === o.exerciseId || h.name === o.naam || (o.eerder || []).includes(h.name)));
    assert.ok(metStem.length >= 2, "testopzet: oefeningen met een Nederlandse naam en een opname");
    const [stemA, stemB] = metStem;

    // -- het werkscherm van de therapeut --
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.92.0.1" } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(e.message));
      page.on("dialog", (d) => d.accept());
      // een open kaart zoals de vorige versie van de app hem bewaarde: als posities in de lijst,
      // met de eigen video op de naam die de oefening toen had. En een kaart in "Kaarten" van toen.
      const staat = { chosen: [{ o: idx(brug), i: 0 }, { o: idx(plank), i: 0 }], client: {}, grid: { rows: {}, cells: { ["e" + idx(brug) + ".0|r0|S"]: "3" } },
        vids: { [normNaam(BASIS)]: "yt:AAAAAAAAAAA" }, kaartId: "", kaartTs: 0 };
      const lokaal = [{ naam: "Kaart van vroeger", ts: Date.now() - 864e5, client: {}, rows: {},
        chosen: [{ n: stemA.eerder[0], id: stemA.exerciseId, i: 0 }, { n: stemB.eerder[0], id: "", i: 0 }],
        cells: { ["x" + stemA.exerciseId + ".0|r0|S"]: "4", ["n" + normNaam(stemB.eerder[0]) + ".0|r0|H"]: "12" },
        vids: { [normNaam(stemA.eerder[0])]: "yt:BBBBBBBBBBB", [normNaam(stemB.eerder[0])]: "yt:CCCCCCCCCCC" } }];
      await page.addInitScript(([s, l]) => {
        if (localStorage.getItem("fp_test_gezet")) return;
        localStorage.setItem("fp_test_gezet", "1");
        localStorage.setItem("fysiplan_welkom_gezien", "1");
        localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Namen" }));
        localStorage.setItem("fysiplan_state", s);
        localStorage.setItem("fysiplan_kaarten", l);
      }, [JSON.stringify(staat), JSON.stringify(lokaal)]);
      await page.goto(origin + "/v2/app", { waitUntil: "domcontentloaded" });
      const koppen = () => page.evaluate(() => [...document.querySelectorAll("#mon thead th.exh")].map((th) => th.textContent).filter(Boolean));
      await page.waitForFunction((n) => [...document.querySelectorAll("#mon thead th.exh")].some((th) => th.textContent === n), NL);
      assert.deepEqual(await koppen(), [NL, plank.naam], "de open kaart van voor de wijziging staat er met dezelfde oefeningen, onder de naam van nu");
      assert.equal(await page.locator("#mon .vid.aan").count(), 1, "de eigen video hoort nog bij de oefening");
      assert.equal(await page.locator(`#mon input[data-k="e${idx(brug)}.0|r0|S"]`).inputValue(), "3", "de dosering staat er nog");
      await page.waitForFunction((k) => { try { return !!JSON.parse(localStorage.getItem("fysiplan_state")).vids[k]; } catch { return false; } }, normNaam(NL));
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("fysiplan_state")).vids), { [normNaam(NL)]: "yt:AAAAAAAAAAA" }, "de eigen video staat nu op de naam van nu");

      // zoeken: op de naam uit het bestand en op de Nederlandse naam
      const eerste = async (term) => { await page.fill("#search", term); return page.evaluate(() => { const n = document.querySelector("#list .row .nm"); return n ? n.firstChild.textContent : ""; }); };
      assert.equal(await eerste(BASIS), NL, "zoeken op de naam uit het bestand vindt de oefening");
      assert.equal(await eerste(NL), NL);
      assert.equal(await page.evaluate((n) => [...document.querySelectorAll("#list .row .nm")].some((el) => el.firstChild.textContent === n), BASIS), false, "de oude naam staat niet meer in de lijst");
      await page.fill("#search", "");

      // een standaardkaart: het voorbeeld en de kaart tonen de Nederlandse namen
      const sj = sjablonen.map((s) => ({ s, n: (s.oefeningen || []).filter((o) => laag.has(sjabNaam(o))).length })).sort((a, b) => b.n - a.n)[0].s;
      const verwacht = sj.oefeningen.map((o) => vanBasis(lijst, sjabNaam(o)).naam);
      await page.click("#sjabBtn");
      await page.fill("#sj_zoek", sj.naam);
      await page.locator("#sj_lijst .sjb-rij", { hasText: sj.naam }).first().click();
      const voorbeeld = () => page.evaluate(() => [...document.querySelectorAll("#sj_voorbeeld .sjb-vb-oef li b")].map((b) => b.textContent));
      assert.deepEqual(await voorbeeld(), verwacht, "het voorbeeld van “" + sj.naam + "” toont de namen van nu");
      assert.ok(verwacht.filter((n) => [...laag.values()].includes(n)).length >= 5 && !verwacht.some((n) => laag.has(n)), "testopzet: een kaart met Nederlandse namen");
      assert.equal(await page.locator("#sj_voorbeeld .sjb-vb-noot", { hasText: "niet meer in de bibliotheek" }).count(), 0, "geen oefening raakt zoek");
      // zoeken in de behandelkaarten op een Nederlandse oefennaam vindt de kaart ook
      const nlOpKaart = verwacht.find((n) => [...laag.values()].includes(n));
      await page.fill("#sj_zoek", nlOpKaart);
      assert.ok(await page.locator("#sj_lijst .sjb-rij", { hasText: sj.naam }).count() >= 1, "zoeken op “" + nlOpKaart + "” vindt de behandelkaart");
      await page.locator("#sj_lijst .sjb-rij", { hasText: sj.naam }).first().click();
      await page.click("#sj_voorbeeld [data-sjdo='gebruik']");
      await page.waitForFunction((n) => { const th = document.querySelector("#mon thead th.exh"); return th && th.textContent === n; }, verwacht[0]);
      assert.deepEqual(await koppen(), verwacht.slice(0, 12), "en op de kaart staan dezelfde namen");

      // een kaart uit "Kaarten" van voor de wijziging: zelfde oefeningen, video's en dosering
      await page.click("#kaartenBtn");
      await page.click("#k_lijst [data-kopen='0']");
      await page.waitForFunction((n) => { const th = document.querySelector("#mon thead th.exh"); return th && th.textContent === n; }, stemA.naam);
      assert.deepEqual(await koppen(), [stemA.naam, stemB.naam], "een oude kaart opent met de namen van nu (op vast id en op de oude naam)");
      assert.equal(await page.locator("#mon .vid.aan").count(), 2, "beide eigen video's horen nog bij hun oefening");
      assert.equal(await page.locator(`#mon input[data-k="e${idx(stemA)}.0|r0|S"]`).inputValue(), "4");
      assert.equal(await page.locator(`#mon input[data-k="e${idx(stemB)}.0|r0|H"]`).inputValue(), "12", "ook de dosering die op de oude naam was bewaard");
      await page.waitForFunction((k) => { try { return !!JSON.parse(localStorage.getItem("fysiplan_state")).vids[k]; } catch { return false; } }, normNaam(stemB.naam));
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("fysiplan_state")).vids),
        { [normNaam(stemA.naam)]: "yt:BBBBBBBBBBB", [normNaam(stemB.naam)]: "yt:CCCCCCCCCCC" });
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("fysiplan_kaarten"))[0].vids),
        { [normNaam(stemA.eerder[0])]: "yt:BBBBBBBBBBB", [normNaam(stemB.eerder[0])]: "yt:CCCCCCCCCCC" }, "de bewaarde kaart zelf is niet aangeraakt");
      assert.deepEqual(fouten, [], "geen fouten op het werkscherm");
      await ctx.close();
    }

    // -- de patiëntkaart: beeld, uitleg en de stem bij een oefening die anders is gaan heten --
    {
      r = await kaart("Dirk", { kaartId: "", chosen: [{ n: stemA.naam, id: stemA.exerciseId, i: 0 }, { n: stemB.eerder[0], id: "", i: 0 }], vids: {} });
      assert.equal(r.status, 200);
      const D = await r.json();
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.92.0.2" } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(e.message));
      // het afspelen zelf telt hier niet: vastleggen welk bestand de kaart wil laten horen
      await page.addInitScript(() => {
        window.__gespeeld = [];
        const Echt = window.Audio;
        window.Audio = function () { const a = new Echt(); a.play = function () { window.__gespeeld.push(a.getAttribute("src")); return Promise.resolve(); }; return a; };
      });
      await page.goto(origin + "/k/" + D.id, { waitUntil: "networkidle" });
      await page.waitForSelector("#wrap", { state: "visible" });
      await page.waitForFunction(() => document.querySelectorAll("#oefs .oef[data-oidx]").length === 2);
      await page.waitForSelector("#oefs [data-noor='1']", { state: "attached" });
      const scherm = await page.evaluate(() => [...document.querySelectorAll("#oefs .oef[data-oidx]")].map((o) => ({
        naam: o.querySelector(".naam").textContent, beeld: !!o.querySelector(".fotoknop img"), stem: !!o.querySelector("[data-noor]") })));
      assert.deepEqual(scherm, [{ naam: stemA.naam, beeld: true, stem: true }, { naam: stemB.eerder[0], beeld: true, stem: true }],
        "beeld en luisterknop bij de naam van nu, en bij een kaart die de oefening nog onder haar oude naam heeft");
      // tik op de luisterknop: de opname die onder de eerdere naam staat
      for (const [i, o] of [[0, stemA], [1, stemB]]) {
        const clip = stemManifest.clips.find((c) => c.name === o.eerder[0] && c.text === c.name + ". " + o.uitleg);
        await page.evaluate((n) => { window.__gespeeld.length = 0; document.querySelector("#oefs [data-noor='" + n + "']").click(); }, i);
        await page.waitForFunction(() => window.__gespeeld.length > 0);
        assert.deepEqual(await page.evaluate(() => window.__gespeeld), [clip.src], o.naam + ": de kaart speelt de opname van deze oefening");
        await page.evaluate((n) => { document.querySelector("#oefs [data-noor='" + n + "']").click(); }, i);
      }
      assert.deepEqual(fouten, [], "geen fouten op de patiëntkaart");
      await ctx.close();
    }
    console.log("Oefennamen (browser): een open kaart, een bewaarde kaart en een standaardkaart tonen de Nederlandse namen met dezelfde oefeningen, video's en dosering; de patiëntkaart toont beeld en speelt de opname.");
  }
} catch (e) {
  if (log.trim()) console.error(log.split("\n").slice(-15).join("\n"));
  throw e;
} finally {
  if (browserKlaar) await browserKlaar().catch(() => {});
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// De volgorde waarin de server de lijst zonder enige wijziging van beheer levert: per categorie
// in de vaste volgorde van de server, daarbinnen op de naam uit het bestand. Hier opnieuw
// uitgerekend uit wat de server levert, zodat de test geen kopie van de categorielijst nodig heeft.
async function bibliotheekVolgorde() {
  const nu = await bibliotheek();
  const groepen = [];
  for (const e of nu) if (!groepen.includes(e.groep)) groepen.push(e.groep);
  const volg = (e) => (laag.get((e.eerder || [])[0]) === e.naam ? e.eerder[0] : e.naam);
  return [...nu].sort((a, b) => groepen.indexOf(a.groep) - groepen.indexOf(b.groep) || volg(a).localeCompare(volg(b), "nl")).map((e) => e.exerciseId);
}
