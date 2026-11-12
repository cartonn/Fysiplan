// De open kaart in het werkscherm van v2 (public/index.html).
//
// De kaart die de therapeut open heeft staan, wordt in de browser bewaard en na elke wijziging stil
// met de praktijk gedeeld. Tot 12 november 2026 stond ze daar als plekken in de oefeningenlijst, en
// bewaarde en deelde de editor ook als die lijst er (nog) niet volledig stond. Gemeten op die dag:
// een gedeelde kaart met een eigen oefening van de praktijk, de sessie verloopt, de pagina herlaadt,
// de therapeut logt weer in, en de eigen oefening is van de kaart van de patiënt af.
//
// Wat hier vastligt:
//   1. de open kaart wordt bewaard met vaste verwijzingen (vast id, anders de naam) en overleeft een
//      bibliotheek die verandert: een oefening erbij of eraf, een andere volgorde, een andere naam;
//   2. zolang de bibliotheek van de server er niet staat, of de eigen oefeningen van de praktijk die
//      op de kaart staan er niet zijn, bewaart en deelt de editor niets en zegt hij waarom;
//   3. na het inloggen, of na "Opnieuw proberen", staat de kaart er weer zoals ze was, ook haar
//      invulvelden; zolang ze wacht, komt er niets op de kaart en gaat er geen andere kaart open;
//   4. kan de bibliotheek bij het herladen even niet worden opgehaald, dan blijft de lijst staan die er stond;
//   5. de dosering van een eigen oefening staat in de vakjes als de kaart uit "Kaarten" wordt geopend.
//
// Deel 1 (de schermcode in een VM) draait overal. Deel 2 (browser) draait waar Playwright staat.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
const tussen = (bron, a, b) => { const i = bron.indexOf(a); assert.ok(i >= 0, "niet gevonden: " + a); const j = bron.indexOf(b, i + a.length); assert.ok(j > i, "niet gevonden: " + b); return bron.slice(i, j); };
// een functie uit de schermcode: op één regel, of tot de eerste regel met alleen de sluitaccolade
const functie = (naam) => {
  const kop = "\n  function " + naam + "(";
  const i = index.indexOf(kop);
  assert.ok(i >= 0, "functie niet gevonden in public/index.html: " + naam);
  assert.equal(index.indexOf(kop, i + 1), -1, "functie staat er meer dan één keer: " + naam);
  const rest = index.slice(i + 1);
  const regel = rest.slice(0, rest.indexOf("\n"));
  if (regel.endsWith("}")) return regel + "\n";
  const eind = rest.indexOf("\n  }\n");
  assert.ok(eind > 0, "einde niet gevonden: " + naam);
  return rest.slice(0, eind + 5);
};

// ---- 1. de schermcode in een VM ----
const FP = (n) => "fp_" + String(n).padStart(16, "0");
const PO = "po_0123456789ab";
const EIGEN = { naam: "Eigen plank", exerciseId: PO, imgs: ["p.jpg"], bron: "praktijk" };
// de bibliotheek toen de kaart werd bewaard
const BIB_A = [
  { naam: "Aap", exerciseId: FP(1), imgs: ["a.jpg"] },
  { naam: "Beer", exerciseId: FP(2), imgs: ["b.jpg", "b2.jpg"] },
  { naam: "Cavia", exerciseId: FP(3), imgs: ["c.jpg"] },
  { naam: "Dolfijn", imgs: ["d.jpg"] }, // zonder vast id: gaat op naam
  { naam: "Glute bridges", exerciseId: FP(5), imgs: ["e.jpg"] },
];
// en daarna: een oefening erbij vooraan, "Aap" weg, een andere volgorde, en één heet anders
const BIB_B = [
  { naam: "Aardvarken", exerciseId: FP(9), imgs: ["n.jpg"] },
  { naam: "Dolfijn", imgs: ["d.jpg"] },
  { naam: "Cavia", exerciseId: FP(3), imgs: ["c.jpg"] },
  { naam: "Bruggetje – ruglig", eerder: ["Glute bridges"], exerciseId: FP(5), imgs: ["e.jpg"] },
  { naam: "Beer", exerciseId: FP(2), imgs: ["b.jpg", "b2.jpg"] },
];
const INGEBED = [{ naam: "Ingebed een", imgs: ["x.jpg"] }, { naam: "Ingebed twee", imgs: ["y.jpg"] }];

function scherm({ v2 = true, opslag = new Map() } = {}) {
  const elementen = new Map();
  const el = (id) => { if (!elementen.has(id)) elementen.set(id, { value: "", hidden: true, textContent: "" }); return elementen.get(id); };
  const zandbak = {
    window: v2 ? { FYSIPLAN_V2: true } : {},
    localStorage: { getItem: (k) => (opslag.has(k) ? opslag.get(k) : null), setItem: (k, v) => { opslag.set(k, String(v)); }, removeItem: (k) => { opslag.delete(k); } },
    document: { getElementById: el },
    encodeURIComponent,
  };
  const ctx = vm.createContext(zandbak);
  vm.runInContext([
    "var OEF=[],VIDS={},chosen=[],NOTES={},byNorm={},byStable={},GRID={rows:{},cells:{}},GROUPS=null;",
    "var IS_V2=!!window.FYSIPLAN_V2,SERVERLIB=false,KAART_ID='',KAART_TS=0,CLIENTKEYS=['c_naam','c_doel'];",
    "var SET={praktijk:'Fysio Open'},EIGEN_GROEP='Eigen oefeningen',__deel=0,__standaard=0,__antwoord=null,__bib='geen';",
    "var USE_V2_LIBRARY=IS_V2,IS_ADMIN=false,SIGNAAL_KAART=null,__meldingen=[],__render=0;",
    "function planAutoDeel(){__deel++;}",
    "function alert(t){__meldingen.push(String(t));}",
    // render() bewaart, zoals in de pagina; de rest van het scherm doet hier niets
    "function render(){__render++;saveState();}",
    "function epdVoorinvul(){}function toonSrvKaarten(){}function applySettings(){}function normalizePrintableTextFields(){}",
    "function PGET(){return {};}",
    "function renderChips(){}",
    // de ingebedde standaardlijst, zoals buildDefault haar neerzet
    "function buildDefault(){__standaard++;OEF=JSON.parse(__ingebed).map(function(o,i){o.id=i;return o;});SERVERLIB=false;rebuildLookup();}",
    // de server: __bib voor de bibliotheek en __antwoord voor de eigen oefeningen van de praktijk; elk een
    // status met een antwoord, of 'geen' voor geen verbinding
    "function fetch(url){var a=/oefeningen\\.json/.test(url)?__bib:(/categorieen/.test(url)?{status:200,body:'{\"categorieen\":[]}'}:__antwoord);" +
      "if(a==='geen')return Promise.reject(new Error('geen verbinding'));" +
      "return Promise.resolve({ok:a.status===200,status:a.status,json:function(){return Promise.resolve(JSON.parse(a.body));}});}",
    // de bibliotheek van de server neerzetten, zoals buildServerLibrary dat doet: de hele lijst vervangen
    "function buildServerLibrary(entries){OEF=entries.map(function(e,i){return {id:i,naam:e.naam,exerciseId:e.exerciseId,eerder:e.eerder||null,imgs:e.imgs||['a.jpg']};});SERVERLIB=true;rebuildLookup();}",
    index.match(/  function normEx\(s\)\{[^\n]*\n/)[0],
    tussen(index, "  function eerdereNamen(o)", "  // practice settings"),
    tussen(index, "  var BIB_KLAAR=!window.FYSIPLAN_V2;", "  // De kaart met vaste verwijzingen"),
    ...["vasteKaart", "vanVasteKaart", "saveState", "zetKaartId", "bewaardeKaartZonderPatient", "loadState", "vidsNaarNaamVanNu",
      "loadDefaultLibrary", "bibMislukt", "mistEigen", "bewaardeStaatMistEigen", "bewaardeKaartStond", "herstelOpenKaart", "kaartWachtNog",
      "startBib", "toonBibMelding", "currentCard", "openCard", "reloadLibraryKeepingCard"].map(functie),
    tussen(index, "  var EIGEN_STAND='uit',EIGEN_LAATST=[];", "  // Seintje van een patiënt beantwoorden"),
  ].join("\n"), ctx);
  ctx.__ingebed = JSON.stringify(INGEBED);
  const doe = (code) => vm.runInContext(code, ctx);
  const uit = (expr) => JSON.parse(vm.runInContext("JSON.stringify(" + expr + ")", ctx));
  const zet = (naam, waarde) => { ctx.__w = JSON.stringify(waarde); vm.runInContext(naam + "=JSON.parse(__w);", ctx); };
  // de bibliotheek neerzetten zoals buildServerLibrary en voegPraktijkOefToe dat doen
  const bib = (lijst, { eigen = false, server = true } = {}) => {
    zet("OEF", [...lijst, ...(eigen ? [EIGEN] : [])].map((o, i) => ({ id: i, ...o })));
    zet("SERVERLIB", server);
    doe("rebuildLookup();");
  };
  return { ctx, opslag, el, doe, uit, zet, bib, staat: () => opslag.get("fysiplan_state"), kaart: () => uit("{chosen:chosen,cells:GRID.cells,rows:GRID.rows,vids:VIDS}") };
}

// -- vaste verwijzingen heen en terug over een gewijzigde bibliotheek --
const VAST = {
  chosen: [{ n: "Beer", id: FP(2), i: 1 }, { n: "Dolfijn", id: "", i: 0 }, { n: "Eigen plank", id: PO, i: 0 }],
  cells: { ["x" + FP(2) + ".1|r0|S"]: "3", "ndolfijn.0|r0|H": "12", ["x" + PO + ".0|r1|W"]: "5", "x7|r0|V": "vrij" },
};
{
  const s = scherm();
  s.bib(BIB_A, { eigen: true });
  s.zet("chosen", [{ o: 1, i: 1 }, { o: 3, i: 0 }, { o: 5, i: 0 }]);
  s.zet("GRID", { rows: { r0: "12-11" }, cells: { "e1.1|r0|S": "3", "e3.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" } });
  assert.deepEqual(s.uit("vasteKaart()"), VAST, "de kaart met vaste verwijzingen: het vaste id waar dat er is, anders de naam; een vakje van een lege kolom blijft zoals het is");

  s.bib(BIB_B, { eigen: true });
  s.ctx.__k = JSON.stringify({ ...VAST, vids: {} });
  assert.deepEqual(s.uit("vanVasteKaart(JSON.parse(__k))"), {
    chosen: [{ o: 4, i: 1 }, { o: 1, i: 0 }, { o: 5, i: 0 }],
    cells: { "e4.1|r0|S": "3", "e1.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" }, vids: {}, missing: [],
  }, "in een bibliotheek met een andere volgorde staan dezelfde oefeningen op de kaart, met hun dosering; ook die van de eigen oefening (xpo_)");

  // niet meer in de bibliotheek, of een beeld dat er niet meer is: overgeslagen en genoemd
  s.bib(BIB_B, { eigen: false });
  s.ctx.__k = JSON.stringify({ chosen: [...VAST.chosen, { n: "Aap", id: FP(1), i: 0 }, { n: "Cavia", id: FP(3), i: 4 }], cells: { ...VAST.cells, ["x" + FP(1) + ".0|r0|S"]: "9" } });
  const zonder = s.uit("vanVasteKaart(JSON.parse(__k))");
  assert.deepEqual(zonder.chosen, [{ o: 4, i: 1 }, { o: 1, i: 0 }]);
  assert.deepEqual(zonder.missing, ["Eigen plank", "Aap", "Cavia"]);
  assert.deepEqual(zonder.cells, { "e4.1|r0|S": "3", "e1.0|r0|H": "12", "x7|r0|V": "vrij" }, "de vakjes van een oefening die er niet meer is, gaan niet naar een andere oefening");

  // een oefening die intussen anders heet: op haar eerdere naam, en de eigen video verhuist mee
  const oud = { chosen: [{ n: "Glute bridges", id: "", i: 0 }], cells: { "nglutebridges.0|r0|S": "2" }, vids: { glutebridges: "yt:AAAAAAAAAAA" } };
  s.ctx.__k = JSON.stringify(oud);
  assert.deepEqual(s.uit("vanVasteKaart(JSON.parse(__k))"), { chosen: [{ o: 3, i: 0 }], cells: { "e3.0|r0|S": "2" }, vids: { bruggetjeruglig: "yt:AAAAAAAAAAA" }, missing: [] });
  assert.deepEqual(JSON.parse(s.ctx.__k), oud, "de kaart zelf blijft zoals ze was");
}

// -- bewaren en herstellen in v2 --
let BEWAARD = "";
{
  const s = scherm();
  assert.equal(s.uit("BIB_KLAAR"), false, "v2 begint zonder herstelde kaart");
  s.bib(BIB_A, { eigen: true });
  s.zet("chosen", [{ o: 1, i: 1 }, { o: 3, i: 0 }, { o: 5, i: 0 }]);
  s.zet("GRID", { rows: { r0: "12-11" }, cells: { "e1.1|r0|S": "3", "e3.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" } });
  s.zet("VIDS", { beer: "yt:BBBBBBBBBBB" });
  s.zet("KAART_ID", "kaart123"); s.zet("KAART_TS", 77);
  s.el("c_naam").value = "Vera"; s.el("c_doel").value = "Traplopen";
  s.doe("saveState();");
  assert.equal(s.staat(), undefined, "zolang de open kaart niet is hersteld, bewaart v2 niets");
  assert.equal(s.uit("__deel"), 0, "en deelt het niets");
  s.doe("BIB_KLAAR=true;saveState();");
  BEWAARD = s.staat();
  assert.deepEqual(JSON.parse(BEWAARD), {
    chosen: [{ o: 1, i: 1 }, { o: 3, i: 0 }, { o: 5, i: 0 }], client: { c_naam: "Vera", c_doel: "Traplopen" },
    grid: { rows: { r0: "12-11" }, cells: { "e1.1|r0|S": "3", "e3.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" } },
    vids: { beer: "yt:BBBBBBBBBBB" }, kaartId: "kaart123", kaartTs: 77, vast: VAST,
  }, "v2 bewaart de open kaart ook met vaste verwijzingen");
  assert.equal(s.uit("__deel"), 1);
}
{
  // de pagina laadt opnieuw; de bibliotheek is intussen veranderd
  const s = scherm({ opslag: new Map([["fysiplan_state", BEWAARD]]) });
  s.bib(INGEBED, { server: false });
  s.doe("loadState();");
  assert.deepEqual(s.uit("[KAART_ID,KAART_TS]"), ["kaart123", 77]);
  assert.deepEqual([s.el("c_naam").value, s.el("c_doel").value], ["Vera", "Traplopen"], "de invulvelden staan er meteen");
  assert.deepEqual(s.kaart(), { chosen: [], cells: {}, rows: {}, vids: {} }, "de oefeningen wachten op de bibliotheek van de server: niets wordt tegen de ingebedde lijst gelegd");
  // de therapeut typt terwijl de bibliotheek laadt, en een onderdeel wil de kaart-id zetten
  s.el("c_naam").value = "Vera B.";
  s.doe("saveState();zetKaartId('andere',5);");
  assert.equal(s.staat(), BEWAARD, "wat er bewaard staat, blijft zoals het is");
  assert.equal(s.uit("__deel"), 0);

  s.bib(BIB_B, { eigen: true });
  s.doe("EIGEN_STAND='ok';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.deepEqual(s.uit("[BIB_KLAAR,BIB_REDEN,KAART_ID,KAART_TS]"), [true, "", "kaart123", 77]);
  assert.equal(s.el("bibBalk").hidden, true);
  assert.deepEqual(s.kaart(), {
    chosen: [{ o: 4, i: 1 }, { o: 1, i: 0 }, { o: 5, i: 0 }], rows: { r0: "12-11" },
    cells: { "e4.1|r0|S": "3", "e1.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" }, vids: { beer: "yt:BBBBBBBBBBB" },
  }, "dezelfde oefeningen en dosering, op hun plek in de bibliotheek van nu");
  assert.equal(s.el("c_naam").value, "Vera B.", "wat er intussen is getypt, blijft staan");
  s.doe("saveState();");
  const na = JSON.parse(s.staat());
  assert.deepEqual(na.vast, VAST, "de vaste verwijzingen zijn dezelfde gebleven");
  assert.deepEqual(na.chosen, [{ o: 4, i: 1 }, { o: 1, i: 0 }, { o: 5, i: 0 }]);
  assert.equal(na.client.c_naam, "Vera B.");
}
{
  // een open kaart die de vorige versie van de pagina bewaarde (zonder vaste verwijzingen): op plek
  const oud = { chosen: [{ o: 1, i: 0 }, { o: 99, i: 0 }, { o: 2, i: 7 }], client: {}, grid: { rows: {}, cells: { "e1.0|r0|S": "4" } }, vids: {}, kaartId: "", kaartTs: 0 };
  const s = scherm({ opslag: new Map([["fysiplan_state", JSON.stringify(oud)]]) });
  s.bib(BIB_A);
  s.doe("EIGEN_STAND='ok';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.deepEqual(s.kaart(), { chosen: [{ o: 1, i: 0 }], cells: { "e1.0|r0|S": "4" }, rows: {}, vids: {} });
}
{
  // v1 werkt zoals altijd: bewaart meteen, zonder vaste verwijzingen, en herstelt op plek
  const s = scherm({ v2: false });
  assert.equal(s.uit("BIB_KLAAR"), true);
  s.bib(BIB_A, { server: false });
  s.zet("chosen", [{ o: 2, i: 0 }]);
  s.doe("saveState();");
  assert.deepEqual(Object.keys(JSON.parse(s.staat())).sort(), ["chosen", "client", "grid", "kaartId", "kaartTs", "vids"], "v1 bewaart dezelfde velden als voorheen");
  const t = scherm({ v2: false, opslag: new Map([["fysiplan_state", BEWAARD]]) });
  t.bib(BIB_A, { server: false });
  t.doe("loadState();");
  assert.deepEqual(t.uit("chosen"), [{ o: 1, i: 1 }, { o: 3, i: 0 }], "v1 leest de plekken, ook als v2 in dezelfde browser vaste verwijzingen bewaarde");
  assert.equal(t.el("c_naam").value, "Vera");
}

// -- wanneer de open kaart wordt hersteld, en wanneer ze wacht --
{
  const nieuw = () => scherm({ opslag: new Map([["fysiplan_state", BEWAARD]]) });
  const melding = (s) => ({ zichtbaar: !s.el("bibBalk").hidden, kop: s.el("bib_kop").textContent, knop: s.el("bib_doe").textContent, leeg: !s.el("bib_leeg").hidden });
  const wacht = (s, reden, wat) => {
    assert.equal(s.uit("herstelOpenKaart()"), false, wat);
    assert.deepEqual(s.uit("[BIB_KLAAR,BIB_REDEN]"), [false, reden], wat);
    assert.deepEqual(s.kaart(), { chosen: [], cells: {}, rows: {}, vids: {} }, wat + ": de editor toont een lege kaart");
    s.doe("saveState();zetKaartId('',0);");
    assert.equal(s.staat(), BEWAARD, wat + ": de bewaarde kaart blijft heel");
    assert.equal(s.uit("__deel"), 0, wat + ": er wordt niets gedeeld");
  };
  // de bibliotheek van de server is er niet
  let s = nieuw();
  s.bib(INGEBED, { server: false });
  wacht(s, "bib", "geen bibliotheek");
  assert.deepEqual(melding(s), { zichtbaar: true, kop: "De oefeningen zijn niet geladen.", knop: "Opnieuw proberen", leeg: false });
  assert.equal(s.el("bib_tekst").textContent, "De kaart die hier open stond, is niet gewijzigd. Er wordt niets bewaard tot de oefeningen er staan.");
  // stond er geen kaart open, dan zegt de melding dat ook niet
  s = scherm();
  s.bib(INGEBED, { server: false });
  assert.equal(s.uit("herstelOpenKaart()"), false);
  assert.equal(s.el("bib_tekst").textContent, "Er wordt niets bewaard tot de oefeningen er staan.");

  // de bibliotheek staat er, maar niemand is ingelogd en op de kaart staat een eigen oefening
  s = nieuw();
  s.doe("loadState();"); // zoals de pagina bij de start: de invulvelden staan er meteen
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='uit';");
  wacht(s, "login", "niet ingelogd");
  assert.deepEqual(melding(s), { zichtbaar: true, kop: "Log in om je kaart te zien.", knop: "Inloggen", leeg: true });
  assert.match(s.el("bib_tekst").textContent, /eigen oefeningen van je praktijk/);
  // zolang ze wacht, komt er niets op de kaart: de therapeut hoort waarom
  assert.equal(s.uit("kaartWachtNog()"), true);
  assert.deepEqual(s.uit("__meldingen"), ["Dat kan nu niet: de kaart die hier open stond, wacht op het inloggen. Log in, of kies “Begin een lege kaart” in de melding bovenaan."]);
  // de therapeut typt intussen een andere naam, en een onderdeel zet toch iets in de editor
  s.el("c_naam").value = "Iemand anders"; s.el("c_doel").value = "";
  s.zet("chosen", [{ o: 0, i: 0 }]);
  s.zet("GRID", { rows: { r0: "vandaag" }, cells: { "e0.0|r0|S": "9" } });
  s.zet("VIDS", { aardvarken: "yt:CCCCCCCCCCC" });
  // na het inloggen: de eigen oefeningen staan er, de kaart komt terug en de melding verdwijnt
  s.bib(BIB_B, { eigen: true });
  s.doe("EIGEN_STAND='ok';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.equal(s.el("bibBalk").hidden, true);
  assert.deepEqual(s.kaart(), {
    chosen: [{ o: 4, i: 1 }, { o: 1, i: 0 }, { o: 5, i: 0 }], rows: { r0: "12-11" },
    cells: { "e4.1|r0|S": "3", "e1.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" }, vids: { beer: "yt:BBBBBBBBBBB" },
  }, "na het inloggen staat de kaart er weer zoals ze bewaard is, met de eigen oefening; wat er intussen in de editor stond, is weg");
  assert.deepEqual([s.el("c_naam").value, s.el("c_doel").value], ["Vera", "Traplopen"], "ook haar invulvelden: de naam die is getypt terwijl ze wachtte, staat er niet doorheen");
  assert.deepEqual(s.uit("[KAART_ID,KAART_TS]"), ["kaart123", 77]);
  assert.equal(s.uit("kaartWachtNog()"), false, "en er kan weer gewerkt worden");
  assert.equal(s.uit("__meldingen.length"), 1, "zonder melding");

  // de server gaf geen antwoord op de eigen oefeningen: geen reden om in te loggen, wel om te wachten
  s = nieuw();
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='storing';");
  wacht(s, "bib", "storing bij de eigen oefeningen");

  // ingelogd, en de eigen oefening bestaat niet meer (een collega haalde haar weg): de kaart komt zonder
  s = nieuw();
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='ok';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.deepEqual(s.uit("chosen"), [{ o: 4, i: 1 }, { o: 1, i: 0 }]);

  // geen eigen oefening op de kaart: inloggen is niet nodig
  const zonderEigen = JSON.parse(BEWAARD);
  zonderEigen.chosen.pop(); zonderEigen.vast.chosen.pop();
  s = scherm({ opslag: new Map([["fysiplan_state", JSON.stringify(zonderEigen)]]) });
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='uit';");
  assert.equal(s.uit("herstelOpenKaart()"), true, "een kaart zonder eigen oefeningen komt ook zonder login terug");
  assert.deepEqual(s.uit("chosen"), [{ o: 4, i: 1 }, { o: 1, i: 0 }]);

  // een kaart van de vorige versie van de pagina: de eigen oefeningen stonden achter de bibliotheek
  const oud = { chosen: [{ o: 1, i: 0 }, { o: BIB_B.length, i: 0 }], client: {}, grid: { rows: {}, cells: {} }, vids: {}, kaartId: "k", kaartTs: 1 };
  s = scherm({ opslag: new Map([["fysiplan_state", JSON.stringify(oud)]]) });
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='uit';");
  assert.equal(s.uit("herstelOpenKaart()"), false);
  assert.equal(s.uit("BIB_REDEN"), "login", "ook een open kaart in de oude vorm wacht op het inloggen als er een eigen oefening op staat");
  oud.chosen.pop();
  s = scherm({ opslag: new Map([["fysiplan_state", JSON.stringify(oud)]]) });
  s.bib(BIB_B);
  assert.equal(s.uit("herstelOpenKaart()"), true);

  // uitloggen terwijl de kaart wacht: de patiënt gaat uit de bewaarde kaart, de oefeningen blijven
  s = nieuw();
  s.doe("bewaardeKaartZonderPatient();");
  const na = JSON.parse(s.staat()), voor = JSON.parse(BEWAARD);
  assert.deepEqual([na.kaartId, na.kaartTs, na.client], ["", 0, {}]);
  assert.deepEqual([na.chosen, na.vast, na.grid, na.vids], [voor.chosen, voor.vast, voor.grid, voor.vids]);
  s = scherm();
  s.doe("bewaardeKaartZonderPatient();");
  assert.equal(s.staat(), undefined, "zonder bewaarde kaart ontstaat er geen");
  s = scherm({ opslag: new Map([["fysiplan_state", "{geen json"]]) });
  s.doe("bewaardeKaartZonderPatient();");
  assert.equal(s.staat(), "{geen json");
  // daarna inloggen: de oefeningen komen terug, zonder de patiënt; wat er na het uitloggen is getypt, blijft
  s = nieuw();
  s.doe("loadState();");
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='uit';");
  assert.equal(s.uit("herstelOpenKaart()"), false);
  s.doe("bewaardeKaartZonderPatient();KAART_ID='';KAART_TS=0;");
  s.el("c_naam").value = "Nieuwe patient"; s.el("c_doel").value = "";
  s.bib(BIB_B, { eigen: true });
  s.doe("EIGEN_STAND='ok';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.deepEqual([s.el("c_naam").value, s.el("c_doel").value, s.uit("KAART_ID"), s.uit("chosen.length")], ["Nieuwe patient", "", "", 3]);
}

// -- wat er in de editor komt te staan terwijl de kaart laadt of wacht, komt er niet doorheen --
{
  const LEEG = { chosen: [], cells: {}, rows: {}, vids: {} };
  const leeg = { chosen: [], client: { c_naam: "", c_doel: "" }, grid: { rows: {}, cells: {} }, vids: {}, kaartId: "", kaartTs: 0, vast: { chosen: [], cells: {} } };
  const met = (staat) => scherm({ opslag: new Map(staat ? [["fysiplan_state", JSON.stringify(staat)]] : []) });
  // staat er een kaart in de bewaarde staat?
  for (const [staat, verwacht] of [[null, false], [leeg, false], [{ ...leeg, client: { c_naam: "Vera" } }, false], [{ ...leeg, kaartId: "kaart123" }, true],
    [{ ...leeg, vast: { chosen: [{ n: "Beer", id: FP(2), i: 0 }], cells: {} } }, true], [{ chosen: [{ o: 1, i: 0 }] }, true], [JSON.parse(BEWAARD), true]])
    assert.equal(met(staat).uit("bewaardeKaartStond()"), verwacht, "bewaardeKaartStond: " + JSON.stringify(staat));
  assert.equal(scherm({ opslag: new Map([["fysiplan_state", "{geen json"]]) }).uit("bewaardeKaartStond()"), false);

  // een nieuwe browser, de bibliotheek laadt nog: er komt niets op de kaart
  let s = met(null);
  s.doe("loadState();");
  s.bib(INGEBED, { server: false });
  assert.equal(s.uit("kaartWachtNog()"), true);
  assert.deepEqual(s.uit("__meldingen"), ["De oefeningen worden nog geladen. Probeer het zo opnieuw."]);
  // en stond er toch iets in de editor (een plek in de ingebedde lijst), dan wordt dat geen andere oefening
  s.zet("chosen", [{ o: 1, i: 0 }]);
  s.zet("GRID", { rows: {}, cells: { "e1.0|r0|S": "9" } });
  s.el("c_naam").value = "Noor";
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='uit';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.deepEqual(s.kaart(), LEEG, "een plek in de ingebedde lijst wordt geen oefening uit de bibliotheek van de server");
  assert.equal(s.el("c_naam").value, "Noor", "wat er tijdens het laden is getypt, blijft staan");

  // de bibliotheek kwam niet en er stond geen kaart: wat er is getypt, blijft na "Opnieuw proberen" staan
  for (const staat of [null, leeg]) {
    s = met(staat);
    s.doe("loadState();");
    s.bib(INGEBED, { server: false });
    assert.equal(s.uit("herstelOpenKaart()"), false);
    assert.equal(s.el("bib_tekst").textContent, "Er wordt niets bewaard tot de oefeningen er staan.");
    assert.equal(s.uit("kaartWachtNog()"), true);
    assert.deepEqual(s.uit("__meldingen"), ["Dat kan nu niet: de oefeningen zijn niet geladen. Kies “Opnieuw proberen” in de melding bovenaan."]);
    s.zet("chosen", [{ o: 1, i: 0 }]);
    s.el("c_naam").value = "Noor";
    s.bib(BIB_B);
    s.doe("EIGEN_STAND='uit';");
    assert.equal(s.uit("herstelOpenKaart()"), true);
    assert.deepEqual(s.kaart(), LEEG);
    assert.equal(s.el("c_naam").value, "Noor", "er stond geen kaart, dus er is niets om terug te zetten: " + JSON.stringify(staat));
  }

  // een gedeelde kaart zonder oefeningen is ook een kaart: zij komt terug met haar eigen naam
  s = met({ ...leeg, client: { c_naam: "Vera", c_doel: "" }, kaartId: "kaart123", kaartTs: 77 });
  s.doe("loadState();");
  s.bib(INGEBED, { server: false });
  assert.equal(s.uit("herstelOpenKaart()"), false);
  assert.equal(s.el("bib_tekst").textContent, "De kaart die hier open stond, is niet gewijzigd. Er wordt niets bewaard tot de oefeningen er staan.");
  s.el("c_naam").value = "Iemand anders";
  s.bib(BIB_B);
  s.doe("EIGEN_STAND='uit';");
  assert.equal(s.uit("herstelOpenKaart()"), true);
  assert.deepEqual([s.el("c_naam").value, s.uit("KAART_ID"), s.uit("KAART_TS")], ["Vera", "kaart123", 77]);
}

// -- de bibliotheek kon niet worden opgehaald --
{
  let s = scherm();
  s.bib(BIB_B, { eigen: true });
  s.doe("bibMislukt();");
  assert.equal(s.uit("__standaard"), 0, "v2 houdt de bibliotheek die er al stond");
  assert.equal(s.uit("OEF.length"), BIB_B.length + 1);
  s = scherm();
  s.doe("bibMislukt();");
  assert.deepEqual(s.uit("[__standaard,SERVERLIB,OEF.length]"), [1, false, INGEBED.length], "stond er nog geen, dan komt de ingebedde lijst");
  s = scherm({ v2: false });
  s.bib(BIB_B);
  s.doe("bibMislukt();");
  assert.equal(s.uit("__standaard"), 1, "v1 valt terug op de ingebedde lijst, zoals altijd");
}

// -- de eigen oefeningen van de praktijk: geladen, niet ingelogd of een storing --
{
  const s = scherm();
  s.bib(BIB_B);
  const lijst = [{ id: PO, naam: "Eigen plank", img: "uploads/oef-0123456789ab.jpg", uitleg: "Span je buik aan." }];
  const haal = async (antwoord) => { s.zet("__antwoord", antwoord); await s.doe("voegPraktijkOefToe()"); return [s.uit("EIGEN_STAND"), s.uit("OEF.filter(function(o){return o.bron==='praktijk';}).map(function(o){return o.exerciseId;})"), s.uit("byStable")[PO] ?? null]; };
  assert.deepEqual(await haal({ status: 401, body: JSON.stringify({ ok: false, login: true }) }), ["uit", [], null], "niet ingelogd: er zijn geen eigen oefeningen");
  assert.deepEqual(await haal({ status: 200, body: JSON.stringify({ ok: true, oefeningen: lijst }) }), ["ok", [PO], BIB_B.length], "ingelogd: de eigen oefeningen staan achter de bibliotheek");
  assert.deepEqual(await haal({ status: 500, body: "{}" }), ["storing", [PO], BIB_B.length], "een storing haalt de eigen oefeningen die er al stonden niet weg");
  assert.deepEqual(await haal({ status: 429, body: "{}" }), ["storing", [PO], BIB_B.length]);
  assert.deepEqual(await haal("geen"), ["storing", [PO], BIB_B.length], "geen verbinding ook niet");
  assert.deepEqual(await haal({ status: 200, body: JSON.stringify({ ok: true, oefeningen: [] }) }), ["ok", [], null]);
  assert.deepEqual(await haal({ status: 401, body: "{}" }), ["uit", [], null], "na het verlopen van de sessie zijn ze weg");
  s.zet("SET", { praktijk: " " });
  s.zet("__antwoord", "geen");
  await s.doe("voegPraktijkOefToe()");
  assert.equal(s.uit("EIGEN_STAND"), "uit", "zonder praktijknaam wordt er niets opgevraagd");
}

// -- de bibliotheek ophalen: bij de start, en opnieuw terwijl er al een staat --
{
  const s = scherm();
  const laad = async (bib, eigen) => { s.zet("__bib", bib); s.zet("__antwoord", eigen); await s.doe("loadDefaultLibrary()");
    return { server: s.uit("SERVERLIB"), namen: s.uit("OEF.map(function(o){return o.naam;})"), eigen: s.uit("EIGEN_STAND"), standaard: s.uit("__standaard") }; };
  const GELUKT = { status: 200, body: JSON.stringify(BIB_B.map((o) => ({ naam: o.naam, exerciseId: o.exerciseId }))) };
  const INGELOGD = { status: 200, body: JSON.stringify({ ok: true, oefeningen: [{ id: PO, naam: "Eigen plank", img: "uploads/oef-0123456789ab.jpg" }] }) };
  const UIT = { status: 401, body: "{}" };
  const namenB = BIB_B.map((o) => o.naam);
  assert.deepEqual(await laad("geen", INGELOGD), { server: false, namen: INGEBED.map((o) => o.naam), eigen: "uit", standaard: 1 },
    "bij de start niet te halen: de ingebedde lijst (waarmee v2 niets bewaart), zonder eigen oefeningen");
  assert.deepEqual(await laad(GELUKT, UIT), { server: true, namen: namenB, eigen: "uit", standaard: 1 });
  // de therapeut logt in terwijl de bibliotheek even niet te halen is: de lijst blijft, de eigen oefeningen komen erbij
  for (const stuk of ["geen", { status: 503, body: "{}" }, { status: 200, body: "[]" }])
    assert.deepEqual(await laad(stuk, INGELOGD), { server: true, namen: [...namenB, "Eigen plank"], eigen: "ok", standaard: 1 }, "bibliotheek " + JSON.stringify(stuk));
  assert.deepEqual(await laad(GELUKT, INGELOGD), { server: true, namen: [...namenB, "Eigen plank"], eigen: "ok", standaard: 1 });
  // en de sessie verloopt terwijl de bibliotheek niet te halen is: de eigen oefeningen gaan weg, de lijst blijft
  assert.deepEqual(await laad("geen", UIT), { server: true, namen: namenB, eigen: "uit", standaard: 1 });
}

// -- de bibliotheek herladen terwijl er een kaart open staat: na het inloggen, of na een wijziging in de eigen oefeningen --
{
  const s = scherm({ opslag: new Map([["fysiplan_state", BEWAARD]]) });
  const BIB = (lijst) => ({ status: 200, body: JSON.stringify(lijst) });
  const INGELOGD = { status: 200, body: JSON.stringify({ ok: true, oefeningen: [{ id: PO, naam: "Eigen plank", img: "uploads/oef-0123456789ab.jpg" }] }) };
  const UIT = { status: 401, body: "{}" };
  const namen = () => s.uit("chosen.map(function(c){return OEF[c.o].naam+'/'+c.i;})");
  const DRIE = ["Beer/1", "Dolfijn/0", "Eigen plank/0"];
  s.doe("loadState();");
  // de start: de bibliotheek en de eigen oefeningen komen, de kaart wordt hersteld en bewaard
  s.zet("__bib", BIB(BIB_B)); s.zet("__antwoord", INGELOGD);
  await s.doe("startBib()");
  assert.deepEqual(s.uit("[BIB_KLAAR,BIB_REDEN]"), [true, ""]);
  assert.deepEqual(namen(), DRIE);
  assert.deepEqual(JSON.parse(s.staat()).vast, VAST, "na het herstellen bewaart de pagina dezelfde kaart");
  assert.deepEqual(JSON.parse(s.staat()).chosen, [{ o: 4, i: 1 }, { o: 1, i: 0 }, { o: 5, i: 0 }]);

  // herladen terwijl alles er staat, en de bibliotheek heeft intussen een andere volgorde: dezelfde kaart
  s.zet("__bib", BIB([...BIB_B].reverse()));
  await s.doe("reloadLibraryKeepingCard()");
  assert.deepEqual(s.uit("[BIB_KLAAR,BIB_REDEN]"), [true, ""]);
  assert.deepEqual(namen(), DRIE);
  assert.deepEqual(s.uit("GRID.cells"), { "e0.1|r0|S": "3", "e3.0|r0|H": "12", "e5.0|r1|W": "5", "x7|r0|V": "vrij" });
  assert.deepEqual(JSON.parse(s.staat()).vast, VAST);

  // een storing bij de eigen oefeningen: die er stonden, blijven staan, en de kaart dus ook
  s.zet("__antwoord", { status: 500, body: "{}" });
  await s.doe("reloadLibraryKeepingCard()");
  assert.deepEqual([s.uit("EIGEN_STAND"), s.uit("BIB_KLAAR"), namen()], ["storing", true, DRIE]);

  // de sessie is verlopen: bij het herladen vallen de eigen oefeningen weg terwijl er een op de kaart staat
  const voor = s.staat(), gedeeld = s.uit("__deel");
  s.zet("__antwoord", UIT);
  await s.doe("reloadLibraryKeepingCard()");
  assert.deepEqual(s.uit("[BIB_KLAAR,BIB_REDEN]"), [false, "login"], "de kaart wacht op het inloggen");
  assert.deepEqual(s.kaart(), { chosen: [], cells: {}, rows: {}, vids: {} });
  assert.equal(s.staat(), voor, "de bewaarde kaart blijft heel: er is geen kaart zonder de eigen oefening bewaard");
  assert.equal(s.uit("__deel"), gedeeld, "en er is niets gedeeld");
  assert.deepEqual(s.uit("__meldingen"), [], "geen melding dat de eigen oefening is overgeslagen");
  assert.equal(s.el("bibBalk").hidden, false);

  // de therapeut typt een andere naam en logt weer in: het herladen daarna is de herkansing
  s.el("c_naam").value = "Iemand anders";
  s.zet("__antwoord", INGELOGD);
  await s.doe("reloadLibraryKeepingCard()");
  assert.deepEqual(s.uit("[BIB_KLAAR,BIB_REDEN]"), [true, ""]);
  assert.deepEqual(namen(), DRIE, "na het inloggen staat de kaart er weer, met de eigen oefening");
  assert.equal(s.el("c_naam").value, "Vera", "met haar eigen naam");
  assert.equal(s.el("bibBalk").hidden, true);
  assert.deepEqual(JSON.parse(s.staat()).vast, VAST);
  assert.deepEqual(s.uit("[KAART_ID,KAART_TS]"), ["kaart123", 77]);

  // inloggen lukt, maar de bibliotheek is nooit gekomen: de kaart blijft wachten
  const t = scherm({ opslag: new Map([["fysiplan_state", BEWAARD]]) });
  t.doe("loadState();");
  t.zet("__bib", "geen"); t.zet("__antwoord", INGELOGD);
  await t.doe("startBib()");
  assert.deepEqual(t.uit("[BIB_KLAAR,BIB_REDEN,SERVERLIB]"), [false, "bib", false]);
  assert.equal(t.staat(), BEWAARD);
  await t.doe("reloadLibraryKeepingCard()");
  assert.deepEqual(t.uit("[BIB_KLAAR,BIB_REDEN]"), [false, "bib"], "herladen zonder bibliotheek opent geen kaart tegen de ingebedde lijst");
  assert.equal(t.staat(), BEWAARD);
  assert.deepEqual(t.uit("__meldingen"), []);
  t.zet("__bib", BIB(BIB_B));
  await t.doe("reloadLibraryKeepingCard()");
  assert.deepEqual([t.uit("BIB_KLAAR"), t.uit("chosen.length"), t.el("c_naam").value], [true, 3, "Vera"]);
}

// -- de plekken in de schermcode die hierop leunen --
for (const [wat, patroon] of [
  ["een oefening aanklikken", /  function toggleExercise\(id\)\{\n    if\(kaartWachtNog\(\)\)return;\n/],
  ["een standaardkaart kiezen", /  function pasSjabloonToe\(s,erbij\)\{\n    if\(!s\)return;\n    if\(kaartWachtNog\(\)\)return;\n/],
  ["de voorbeeldkaart van de proef (zonder melding)", /      if\(!BIB_KLAAR\|\|chosen\.length\|\|!Array\.isArray\(l\)\|\|!l\.length\)return;\n/],
  ["het voorstel van de zoekhulp", /    if\(e\.target\.id!=='ai_apply'\|\|!AI_VOORSTEL\)return;\n    if\(kaartWachtNog\(\)\)return;\n/],
  ["een kopie van een kaart van de praktijk", /    var kp=e\.target\.closest\('\[data-skopie\]'\);\n    if\(kp\)\{\n      if\(kaartWachtNog\(\)\)return;\n/],
  ["een kaart van de praktijk openen", /  function openSrvKaart\(id\)\{\n    if\(kaartWachtNog\(\)\)return;\n/],
  ["een kaart uit deze browser openen", /    if\(o\)\{\n      if\(kaartWachtNog\(\)\)return;\n      var c=lijst\[\+o\.dataset\.kopen\];/],
  ["de lege kaart in deze browser opslaan", /  document\.getElementById\('k_save'\)\.addEventListener\('click',function\(\)\{\n    if\(kaartWachtNog\(\)\)return;\n/],
  ["de nieuwste versie openen", /  function openNieuwsteVersie\(\)\{\n    if\(!KAART_ID\|\|kaartWachtNog\(\)\)return;\n/],
  ["een nieuwe eigen oefening (zonder melding)", /                  if\(BIB_KLAAR&&nieuw&&chosen\.length<12&&/],
]) assert.match(index, patroon, "zolang de open kaart wacht, komt er niets op de kaart: " + wat);
assert.match(index, /  function doeAutoDeel\(\)\{\n    if\(PROEF_VOORBIJ\)return;\n[^\n]*\n    if\(!BIB_KLAAR\)return;\n/, "stil delen wacht tot de open kaart is hersteld");
assert.match(index, /  function saveServerCard\(naam,cb,keuze\)\{\n[^\n]*\n    if\(!BIB_KLAAR\)\{\n      cb\(\{ok:false,fout:/, "delen en de QR-code ook, met een melding");
assert.match(index, /  function reloadLibraryKeepingCard\(\)\{\n(?:    \/\/[^\n]*\n)*    if\(IS_V2&&!BIB_KLAAR\)return startBib\(\);\n    var snap=currentCard\(''\);/, "na het inloggen is het herladen van de bibliotheek de herkansing");
assert.match(index, /if\(IS_V2&&EIGEN_STAND!=='ok'&&mistEigen\(snap\.chosen\)\)\{herstelOpenKaart\(\);render\(\);return;\}\n      openCard\(snap\);/, "vallen de eigen oefeningen bij het herladen weg, dan blijft de bewaarde kaart heel");
assert.match(index, /      if\(IS_V2\)\{herstelOpenKaart\(\);epdVoorinvul\(\);toonSrvKaarten\(\);\}\n      applySettings\(\);render\(\);/, "bij de start wordt de open kaart hersteld tegen de bibliotheek van de server");
assert.match(index, /    if\(!BIB_KLAAR\)bewaardeKaartZonderPatient\(\);\n    render\(\);\n  \}/, "uitloggen haalt de patiënt ook uit een kaart die nog wacht");
assert.match(index, /    var vast=vasteKaart\(\);\n/, "een kaart die naar de server gaat, gebruikt dezelfde vaste verwijzingen");
assert.match(index, /    var uit=vanVasteKaart\(c\);\n    chosen=uit\.chosen;\n/, "en een kaart die wordt geopend ook");
assert.match(index, /<div id="bibBalk" class="proefbalk no-print" role="alert" hidden>/, "de melding staat in de pagina en print niet mee");
console.log("Open kaart (schermcode): vaste verwijzingen overleven een gewijzigde bibliotheek; zonder bibliotheek of zonder de eigen oefeningen bewaart en deelt v2 niets; v1 is ongewijzigd.");

// ---- 2. browser ----
const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-open-kaart: geen Playwright, browserdeel overgeslagen (de schermcode in de VM draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-openkaart-"));
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const SLEUTEL = "een-testsleutel-voor-de-open-kaart";
  const PRAKTIJK = "Fysio Open Kaart", WW = "wachtwoord-open-kaart";
  const vrijePoort = async () => { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
  const port = await vrijePoort();
  // localhost: de browser ziet dat als veilige oorsprong
  const origin = `http://localhost:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "" };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|EIGEN_LOGIN|PROEF_)/.test(k) || k === "NODE_ENV") delete kind[k];
  let log = "";
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { log += c; });
  app.stderr.on("data", (c) => { log += c; });
  let ip = 1;
  const kop = (extra = {}) => ({ "x-forwarded-for": "10.96.0." + (ip++ % 250), ...extra });
  const BEHEER = { "x-admin-sleutel": SLEUTEL };
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop({ "content-type": "application/json", ...extra }), body: JSON.stringify(body) });
  const bibliotheek = async () => (await fetch(origin + "/v2/oefeningen.json", { headers: kop() })).json();
  const opSchijf = async (naam) => { try { return JSON.parse(await readFile(join(dataDir, naam), "utf8")); } catch { return null; } };
  // wachten tot iets waar is (de server schrijft zijn bestanden na het antwoord)
  const tot = async (fn, wat, ms = 12000) => { const begin = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - begin > ms) assert.fail("niet gebeurd binnen " + ms + " ms: " + wat); await wacht(100); } };
  const FOTO = "data:image/jpeg;base64," + (await readFile(join(root, "public/images/bovenste-extremiteit/anteflexie-armen.jpg"))).toString("base64");
  const releaseVersie = ((await readFile(join(root, "public/release-notes.js"), "utf8")).match(/var version='([^']+)'/) || [])[1] || "";

  let browser = null;
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    browser = await pw.chromium.launch();
    const lijst = await bibliotheek();
    assert.ok(lijst.length > 500, "testopzet: de bibliotheek is geladen (" + lijst.length + ")");

    // wat elk scherm nodig heeft: geen welkom, geen "Nieuw in Fysiplan", een praktijknaam
    const nieuwScherm = async (xff, begin) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": xff } });
      await ctx.addInitScript(([praktijk, versie, staat]) => {
        if (localStorage.getItem("fp_test_gezet")) return;
        localStorage.setItem("fp_test_gezet", "1");
        localStorage.setItem("fysiplan_welkom_gezien", "1");
        if (versie) localStorage.setItem("fysiplan_release_seen", versie);
        localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk }));
        if (staat) localStorage.setItem("fysiplan_state", staat);
      }, [PRAKTIJK, releaseVersie, begin || ""]);
      const page = await ctx.newPage();
      const s = { ctx, page, fouten: [], dialogen: [], gedeeld: [] };
      page.on("pageerror", (e) => s.fouten.push(e.message));
      page.on("dialog", (d) => { s.dialogen.push(d.message()); d.accept().catch(() => {}); });
      // elke kaart die de editor naar de server stuurt, met het antwoord
      page.on("request", (rq) => {
        if (rq.method() !== "POST" || new URL(rq.url()).pathname !== "/api/kaarten") return;
        let body = null; try { body = JSON.parse(rq.postData() || "null"); } catch {}
        s.gedeeld.push({ body, antwoord: rq.response().then((rs) => (rs ? rs.json() : null)).catch(() => null) });
      });
      return s;
    };
    const koppen = (page) => page.evaluate(() => [...document.querySelectorAll("#mon thead th.exh")].map((th) => th.textContent).filter(Boolean));
    const wachtOpKoppen = (page, namen) => page.waitForFunction((n) => JSON.stringify([...document.querySelectorAll("#mon thead th.exh")].map((th) => th.textContent).filter(Boolean)) === JSON.stringify(n), namen);
    const staat = (page) => page.evaluate(() => localStorage.getItem("fysiplan_state"));
    // de dosering in de eerste rij: kolom n, veld S, H of W
    const vakje = (page, n, veld) => page.locator("#mon tbody tr").first().locator("input[data-k]").nth(n * 3 + "SHW".indexOf(veld));
    // de naam van de patiënt invullen en het veld verlaten: zolang de cursor erin staat, deelt de editor niet
    const typNaam = async (page, naam) => { await page.fill("#c_naam", naam); await page.locator("#c_naam").blur(); };
    // wat de therapeut hoort als hij iets op de kaart wil zetten terwijl ze wacht
    const NIET_GELADEN = "Dat kan nu niet: de oefeningen zijn niet geladen. Kies “Opnieuw proberen” in de melding bovenaan.";
    const LOG_EERST = "Dat kan nu niet: de kaart die hier open stond, wacht op het inloggen. Log in, of kies “Begin een lege kaart” in de melding bovenaan.";
    const melding = (page) => page.evaluate(() => { const b = document.getElementById("bibBalk"); return b.hidden ? null : { kop: document.getElementById("bib_kop").textContent, knop: document.getElementById("bib_doe").textContent, leeg: !document.getElementById("bib_leeg").hidden }; });

    // -- 2a. de bibliotheek verandert terwijl een kaart open staat --
    let kaartNa = "";
    const drie = [lijst[40], lijst[41], lijst[300]];
    {
      const pos = (o) => lijst.findIndex((e) => e.exerciseId === o.exerciseId);
      assert.ok(drie.every((o) => o && o.exerciseId && o.naam) && new Set(drie.map((o) => o.naam)).size === 3, "testopzet: drie oefeningen met een vast id");
      // een open kaart zoals de vorige versie van de pagina haar bewaarde: als plekken in de lijst
      const oud = { chosen: drie.map((o) => ({ o: pos(o), i: 0 })), client: { c_doel: "Weer traplopen" },
        grid: { rows: { r0: "12-11" }, cells: { ["e" + pos(drie[0]) + ".0|r0|S"]: "3", ["e" + pos(drie[1]) + ".0|r0|H"]: "12", ["e" + pos(drie[2]) + ".0|r0|W"]: "5" } }, vids: {}, kaartId: "", kaartTs: 0 };
      const s = await nieuwScherm("10.96.1.1", JSON.stringify(oud));
      const { page } = s;
      await page.goto(origin + "/v2/app", { waitUntil: "domcontentloaded" });
      await wachtOpKoppen(page, drie.map((o) => o.naam));
      // de pagina bewaart de kaart nu met vaste verwijzingen
      await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("fysiplan_state")).vast.chosen.length === 3; } catch { return false; } });
      assert.deepEqual(JSON.parse(await staat(page)).vast.chosen, drie.map((o) => ({ n: o.naam, id: o.exerciseId, i: 0 })));

      // beheer haalt twee oefeningen weg die vóór de kaart in de lijst staan, en zet er een bij
      let r;
      for (const weg of [lijst[5], lijst[6]]) {
        r = await post("/api/oefeningen/verwijder", { naam: weg.naam }, BEHEER);
        assert.equal(r.status, 200, "testopzet: beheer verwijdert “" + weg.naam + "”");
      }
      r = await post("/api/oefeningen", { naam: "Aaa proefoefening", groep: lijst[0].groep, img: FOTO }, BEHEER);
      assert.equal(r.status, 200, "testopzet: beheer voegt een oefening toe");
      const nu = await bibliotheek();
      const posNu = (o) => nu.findIndex((e) => e.exerciseId === o.exerciseId);
      assert.ok(posNu(lijst[5]) < 0 && posNu(lijst[6]) < 0 && nu.some((e) => e.naam === "Aaa proefoefening"));
      assert.ok(drie.every((o) => posNu(o) >= 0 && posNu(o) !== pos(o)), "testopzet: de oefeningen van de kaart staan nu op een andere plek in de lijst");

      await page.reload({ waitUntil: "domcontentloaded" });
      await wachtOpKoppen(page, drie.map((o) => o.naam));
      assert.deepEqual(await koppen(page), drie.map((o) => o.naam), "na herladen staan dezelfde oefeningen op de open kaart");
      assert.deepEqual([await vakje(page, 0, "S").inputValue(), await vakje(page, 1, "H").inputValue(), await vakje(page, 2, "W").inputValue()], ["3", "12", "5"], "met hun eigen dosering");
      assert.equal(await page.locator("#c_doel").inputValue(), "Weer traplopen");
      assert.equal(await melding(page), null);
      // en de pagina bewaart de kaart op de plekken van de bibliotheek van nu
      await page.waitForFunction((plekken) => { try { return JSON.stringify(JSON.parse(localStorage.getItem("fysiplan_state")).chosen.map((c) => c.o)) === plekken; } catch { return false; } }, JSON.stringify(drie.map(posNu)));
      kaartNa = await staat(page);
      assert.deepEqual(JSON.parse(kaartNa).vast.chosen, drie.map((o) => ({ n: o.naam, id: o.exerciseId, i: 0 })), "de vaste verwijzingen zijn dezelfde gebleven");
      assert.deepEqual(s.fouten, [], "geen fouten op het werkscherm");
      assert.deepEqual(s.dialogen, [], "geen melding dat er een oefening is overgeslagen");
      await s.ctx.close();
    }

    // -- 2b. de bibliotheek komt niet, of laat op zich wachten --
    {
      const s = await nieuwScherm("10.96.1.2", kaartNa);
      const { page } = s;
      await page.route("**/v2/oefeningen.json", (route) => route.abort());
      await page.goto(origin + "/v2/app", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#bibBalk", { state: "visible" });
      assert.deepEqual(await melding(page), { kop: "De oefeningen zijn niet geladen.", knop: "Opnieuw proberen", leeg: false });
      assert.deepEqual(await koppen(page), [], "zonder bibliotheek staat er geen halve kaart");
      assert.equal(await page.locator("#c_doel").inputValue(), "Weer traplopen", "de invulvelden staan er wel");
      // een oefening uit de lijst die er nu staat (de ingebedde) komt niet op de kaart: de therapeut hoort waarom
      await page.locator("#list .row").first().click();
      await tot(() => s.dialogen.length > 0, "de melding dat de oefeningen niet geladen zijn");
      assert.deepEqual(s.dialogen, [NIET_GELADEN]);
      assert.deepEqual(await koppen(page), []);
      // typen, en langer wachten dan het stille delen op zich laat wachten (1,5 s)
      await typNaam(page, "Marja");
      await page.waitForTimeout(2200);
      assert.equal(await staat(page), kaartNa, "de bewaarde kaart is niet aangeraakt");
      assert.deepEqual(s.gedeeld, [], "en er is niets naar de server gegaan");

      await page.unroute("**/v2/oefeningen.json");
      await page.click("#bib_doe");
      await wachtOpKoppen(page, drie.map((o) => o.naam));
      assert.equal(await melding(page), null, "na “Opnieuw proberen” is de melding weg");
      assert.deepEqual([await vakje(page, 0, "S").inputValue(), await vakje(page, 1, "H").inputValue(), await vakje(page, 2, "W").inputValue()], ["3", "12", "5"]);
      assert.equal(await page.locator("#c_naam").inputValue(), "", "de kaart komt terug zoals ze bewaard is: wat er is getypt terwijl ze wachtte, staat er niet doorheen");
      assert.equal(await page.locator("#c_doel").inputValue(), "Weer traplopen");
      // vanaf nu wordt er weer bewaard
      await typNaam(page, "Marja");
      await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("fysiplan_state")).client.c_naam === "Marja"; } catch { return false; } });
      const metNaam = await staat(page);
      assert.deepEqual(JSON.parse(metNaam).vast, JSON.parse(kaartNa).vast, "vanaf nu wordt de hele kaart weer bewaard");

      // een trage bibliotheek: typen tijdens het laden kost geen oefeningen
      await page.route("**/v2/oefeningen.json", async (route) => { await wacht(2500); await route.continue().catch(() => {}); });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.fill("#c_doel", "Fietsen naar het werk");
      assert.equal(await staat(page), metNaam, "tijdens het laden wordt er niets bewaard");
      assert.deepEqual(await koppen(page), []);
      await wachtOpKoppen(page, drie.map((o) => o.naam));
      assert.equal(await page.locator("#c_doel").inputValue(), "Fietsen naar het werk");
      await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("fysiplan_state")).client.c_doel === "Fietsen naar het werk"; } catch { return false; } });
      assert.deepEqual(JSON.parse(await staat(page)).vast, JSON.parse(kaartNa).vast, "de kaart is daarna heel bewaard");
      assert.equal(await page.locator("#c_naam").inputValue(), "Marja");
      assert.deepEqual(s.fouten, [], "geen fouten op het werkscherm");
      assert.deepEqual(s.dialogen, [NIET_GELADEN], "verder geen meldingen");
      await s.ctx.close();
    }

    // -- 2c. een gedeelde kaart met een eigen oefening van de praktijk, en de sessie verloopt --
    {
      const s = await nieuwScherm("10.96.1.3");
      const { page, ctx } = s;
      const pk = PRAKTIJK.toLowerCase();
      const kaarten = async () => Object.values(((await opSchijf("kaarten.json")) || {})[pk] || {});
      const sluitLagen = () => page.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
      const login = async () => {
        await page.click("#kaartenBtn");
        await page.waitForSelector("#ps_ww", { state: "visible" });
        await page.fill("#ps_ww", WW);
        if (await page.isVisible("#ps_vwo")) await page.check("#ps_vwo");
        await page.click("#ps_do");
        await page.waitForSelector("#ps_uit", { state: "visible" });
        await sluitLagen();
      };
      // de sessie verloopt: de server kent haar niet meer en de cookie is weg; de pagina weet van niets
      const verloop = async () => { const r = await ctx.request.post(origin + "/api/praktijk/logout", { headers: { "content-type": "application/json", origin }, data: {} }); assert.equal(r.status(), 200, "testopzet: de sessie is beëindigd"); };
      // de plusknop van precies deze oefening (het label begint met haar naam)
      const zetOp = async (naam) => {
        await page.fill("#search", naam);
        await page.locator("#list [data-add][aria-label^=" + JSON.stringify(naam + ": ") + "]").first().click();
      };
      await page.goto(origin + "/v2/app", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelectorAll("#list .row").length > 100);
      await login();
      const r = await ctx.request.post(origin + "/api/praktijk/oefeningen", { headers: { "content-type": "application/json", origin }, data: { praktijk: PRAKTIJK, naam: "Eigen kniebuiging", uitleg: "Zak rustig door je knieën.", img: FOTO } });
      assert.equal(r.status(), 200, "testopzet: de praktijk heeft een eigen oefening");
      const eigenId = (await r.json()).oefeningen[0].id;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelectorAll("#list .row").length > 100);
      const gewoon = drie[2];
      const NAMEN = [gewoon.naam, "Eigen kniebuiging"];
      await zetOp(gewoon.naam);
      await zetOp("Eigen kniebuiging");
      await page.fill("#search", "");
      await wachtOpKoppen(page, NAMEN);
      await vakje(page, 0, "H").fill("10");
      await vakje(page, 1, "S").fill("7");
      await typNaam(page, "Vera");
      const opServer = (k) => k && k.chosen.map((x) => x.n).join(" | ") === NAMEN.join(" | ") && k.cells["x" + eigenId + ".0|r0|S"] === "7";
      const K = await tot(async () => { const k = (await kaarten())[0]; return opServer(k) ? k : null; }, "de kaart met de eigen oefening en haar dosering staat op de server");
      assert.deepEqual(K.chosen.map((x) => x.id), [gewoon.exerciseId, eigenId]);
      await page.waitForFunction((id) => { try { return JSON.parse(localStorage.getItem("fysiplan_state")).kaartId === id; } catch { return false; } }, K.id);
      const voor = await staat(page);
      assert.deepEqual(JSON.parse(voor).vast.chosen.map((x) => x.id), [gewoon.exerciseId, eigenId]);

      // de sessie verloopt en de pagina herlaadt
      await verloop();
      s.gedeeld.length = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#bibBalk", { state: "visible" });
      assert.deepEqual(await melding(page), { kop: "Log in om je kaart te zien.", knop: "Inloggen", leeg: true });
      assert.deepEqual(await koppen(page), [], "zonder login staat er geen kaart zonder de eigen oefening");
      assert.equal(await page.locator("#c_naam").inputValue(), "Vera");
      // zolang de kaart wacht, komt er niets op de lege kaart: de therapeut hoort waarom
      const voorKlik = s.dialogen.length;
      await zetOp(drie[0].naam);
      await tot(() => s.dialogen.length > voorKlik, "de melding dat er eerst ingelogd moet worden");
      assert.equal(s.dialogen[voorKlik], LOG_EERST);
      assert.deepEqual(await koppen(page), []);
      await page.fill("#search", "");
      // een andere naam typen kan. Die wordt niet bewaard en niet gedeeld: de koppeling met de kaart
      // van de patiënt staat er nog, dus delen zou die kaart leeg en onder een andere naam overschrijven.
      await typNaam(page, "Kees");
      // ook niet met de knop "In de praktijk"
      await page.click("#kaartenBtn");
      await page.waitForSelector("#k_save_srv", { state: "visible" });
      const voorKnop = s.dialogen.length;
      await page.click("#k_save_srv");
      await tot(() => s.dialogen.length > voorKnop, "de melding dat er niets is gedeeld");
      assert.match(s.dialogen[voorKnop], /^Log eerst in\. De kaart die hier open stond, komt daarna terug/);
      await sluitLagen();
      await page.waitForTimeout(2200);
      assert.equal(await staat(page), voor, "de bewaarde kaart is niet aangeraakt");
      assert.deepEqual(s.gedeeld, [], "en er is niets gedeeld");
      assert.ok(opServer((await kaarten())[0]), "de kaart van de patiënt is ongemoeid");

      // inloggen via de knop in de melding: de kaart staat er weer, met de eigen oefening
      await page.click("#bib_doe");
      await page.waitForSelector("#ps_ww", { state: "visible" });
      await page.fill("#ps_ww", WW);
      await page.click("#ps_do");
      await page.waitForSelector("#ps_uit", { state: "visible" });
      await sluitLagen();
      await wachtOpKoppen(page, NAMEN);
      assert.equal(await melding(page), null);
      assert.deepEqual([await vakje(page, 0, "H").inputValue(), await vakje(page, 1, "S").inputValue()], ["10", "7"]);
      assert.equal(await page.locator("#c_naam").inputValue(), "Vera", "de kaart komt heel terug: de naam die is getypt terwijl ze wachtte, staat er niet doorheen");
      // het stille delen na het inloggen stuurt dezelfde kaart, niet een kaart met een oefening minder
      await tot(() => s.gedeeld.length > 0, "de kaart is na het inloggen opnieuw gedeeld");
      const deel = s.gedeeld[0];
      assert.equal(deel.body.kaartId, K.id);
      assert.deepEqual([deel.body.naam, deel.body.client.c_naam], ["Vera", "Vera"], "onder de naam van de patiënt van wie de kaart is");
      assert.deepEqual(deel.body.chosen.map((x) => x.id), [gewoon.exerciseId, eigenId], "de kaart die na het inloggen naar de server gaat, heeft de eigen oefening nog");
      assert.equal(deel.body.cells["x" + eigenId + ".0|r0|S"], "7", "en haar dosering");
      const antwoord = await deel.antwoord;
      assert.ok(antwoord && antwoord.ok && antwoord.id === K.id && antwoord.ongewijzigd === true, "de server ziet geen verschil met de kaart die er stond: " + JSON.stringify(antwoord));
      assert.equal((await kaarten()).length, 1, "het is dezelfde kaart gebleven");
      assert.ok(opServer((await kaarten())[0]), "de kaart van de patiënt heeft na het inloggen nog beide oefeningen en de dosering");

      // nog een keer verlopen, en nu kiest de therapeut voor een lege kaart
      await page.waitForFunction((id) => { try { const st = JSON.parse(localStorage.getItem("fysiplan_state")); return st.kaartId === id && st.vast.chosen.length === 2; } catch { return false; } }, K.id);
      await verloop();
      s.gedeeld.length = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#bib_leeg", { state: "visible" });
      const vraag = s.dialogen.length;
      await page.click("#bib_leeg");
      await page.waitForFunction(() => { try { const st = JSON.parse(localStorage.getItem("fysiplan_state")); return st.kaartId === "" && st.chosen.length === 0 && st.vast.chosen.length === 0; } catch { return false; } });
      assert.match(s.dialogen[vraag] || "", /^Een lege kaart beginnen\?/, "eerst een vraag");
      assert.equal(await melding(page), null);
      assert.deepEqual(await koppen(page), []);
      assert.equal(await page.locator("#c_naam").inputValue(), "");
      await page.waitForTimeout(2200);
      assert.deepEqual(s.gedeeld, []);
      assert.ok(opServer((await kaarten())[0]), "een lege kaart beginnen laat de kaart van de patiënt staan");

      // -- 2d. inloggen terwijl de bibliotheek even niet te halen is: de kaart en de lijst blijven staan --
      await zetOp(gewoon.naam);
      await wachtOpKoppen(page, [gewoon.naam]);
      await page.route("**/v2/oefeningen.json", (route) => route.abort());
      await login();
      // het herladen na het inloggen is klaar als de eigen oefening van de praktijk in de lijst staat
      await page.fill("#search", "Eigen kniebuiging");
      await page.waitForSelector('#list [data-add][aria-label^="Eigen kniebuiging: "]');
      await page.unroute("**/v2/oefeningen.json");
      assert.deepEqual(await koppen(page), [gewoon.naam], "de open kaart staat er nog");
      await page.fill("#search", "");
      await page.waitForFunction(() => document.querySelectorAll("#list .row").length > 100);
      assert.equal(await melding(page), null);
      assert.ok(!s.dialogen.some((d) => /overgeslagen/.test(d)), "de bibliotheek is niet vervangen door de ingebedde lijst: " + JSON.stringify(s.dialogen));

      // -- 2e. de kaart uit "Kaarten": de dosering van de eigen oefening staat in de vakjes --
      await page.click("#kaartenBtn");
      await page.locator("#ovKaarten [data-sopen]").first().click();
      await wachtOpKoppen(page, NAMEN);
      assert.deepEqual([await vakje(page, 0, "H").inputValue(), await vakje(page, 1, "S").inputValue()], ["10", "7"], "ook de dosering van de eigen oefening staat er na het openen");
      await page.waitForFunction((id) => { try { const st = JSON.parse(localStorage.getItem("fysiplan_state")); return st.kaartId === id && st.client.c_naam === "Vera" && st.vast.chosen.length === 2; } catch { return false; } }, K.id);
      await sluitLagen();

      // -- 2f. de server geeft even geen antwoord op de eigen oefeningen: wachten, niet opnieuw inloggen --
      {
        const open = await staat(page);
        await page.route("**/api/praktijk/oefeningen?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
        s.gedeeld.length = 0;
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("#bibBalk", { state: "visible" });
        assert.deepEqual(await melding(page), { kop: "De oefeningen zijn niet geladen.", knop: "Opnieuw proberen", leeg: false }, "een storing is geen reden om in te loggen");
        assert.deepEqual(await koppen(page), []);
        // een kaart uit "Kaarten" gaat nu niet open: ze zou zonder de eigen oefening op het scherm komen
        const voorOpen = s.dialogen.length;
        await page.click("#kaartenBtn");
        await page.locator("#ovKaarten [data-sopen]").first().click();
        await tot(() => s.dialogen.length > voorOpen, "de melding dat de oefeningen niet geladen zijn");
        assert.equal(s.dialogen[voorOpen], NIET_GELADEN);
        await sluitLagen();
        assert.deepEqual(await koppen(page), []);
        await page.waitForTimeout(2200);
        assert.equal(await staat(page), open, "de bewaarde kaart is niet aangeraakt");
        assert.deepEqual(s.gedeeld, []);
        await page.unroute("**/api/praktijk/oefeningen?*");
        await page.click("#bib_doe");
        await wachtOpKoppen(page, NAMEN);
        assert.equal(await melding(page), null);
        assert.deepEqual([await vakje(page, 0, "H").inputValue(), await vakje(page, 1, "S").inputValue()], ["10", "7"]);
        await page.waitForFunction((id) => { try { const st = JSON.parse(localStorage.getItem("fysiplan_state")); return st.kaartId === id && st.client.c_naam === "Vera" && st.vast.chosen.length === 2; } catch { return false; } }, K.id);
      }

      // -- 2g. uitloggen terwijl de kaart wacht op de bibliotheek: de patiënt blijft niet achter --
      await page.route("**/v2/oefeningen.json", (route) => route.abort());
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#bibBalk", { state: "visible" });
      assert.equal((await melding(page)).kop, "De oefeningen zijn niet geladen.");
      await page.click("#kaartenBtn");
      await page.waitForSelector("#ps_uit", { state: "visible" });
      await page.click("#ps_uit");
      await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("fysiplan_state")).kaartId === ""; } catch { return false; } });
      const uitgelogd = JSON.parse(await staat(page));
      assert.deepEqual(uitgelogd.client, {}, "na het uitloggen staat de patiënt niet meer in de bewaarde kaart");
      assert.deepEqual(uitgelogd.vast.chosen.map((x) => x.id), [gewoon.exerciseId, eigenId], "de oefeningen wel");
      await page.unroute("**/v2/oefeningen.json");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#bibBalk", { state: "visible" });
      assert.equal((await melding(page)).kop, "Log in om je kaart te zien.");
      assert.equal(await page.locator("#c_naam").inputValue(), "", "en ook na herladen niet op het scherm");
      assert.ok(opServer((await kaarten())[0]), "de kaart van de patiënt staat nog op de server zoals ze was");

      assert.deepEqual(s.fouten, [], "geen fouten op het werkscherm");
      assert.ok(!s.dialogen.some((d) => /overgeslagen/.test(d)), "nergens is een oefening van de kaart overgeslagen: " + JSON.stringify(s.dialogen));
      await ctx.close();
    }
    console.log("Open kaart (browser): de kaart overleeft een gewijzigde bibliotheek, een bibliotheek die niet of laat komt en een verlopen sessie; de kaart van de patiënt houdt haar eigen oefening.");
  } catch (e) {
    if (log.trim()) console.error(log.split("\n").slice(-15).join("\n"));
    throw e;
  } finally {
    if (browser) await browser.close().catch(() => {});
    app.kill();
    await new Promise((r) => app.once("exit", r));
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
