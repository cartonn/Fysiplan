// Gebruikers-sweep 2026-11-23 10u.
// 1. Sanne (desktop): een kaart in de prullenbak en dan "Test de QR" gaf eerst een venster "OK = opnieuw
//    delen" en daarna een tweede venster van de server (409) dat het weigerde. Nu weet de editor dat de
//    kaart in de prullenbak staat en zegt hij meteen de echte weg (Herstellen), zonder venster.
// 2. Truus (iPhone SE, "A A"): de afspeelknop op het beeld van een oefening mét video hield de rij hoog,
//    dus pasOefBeeld kon het beeld verkleinen zonder dat de dosering boven de onderbalk kwam.
// Broncontroles (CI heeft geen browser); de persona's hertestten het gedrag in Chromium.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = await readFile(join(root, "public/index.html"), "utf8");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");

// --- 1. prullenbak ---
const save = app.slice(app.indexOf("function saveServerCard("), app.indexOf("function saveServerCard(") + 1200);
const iPrul = save.indexOf("if(kaartInPrullenbak()){cb({ok:false,verwijderd:true,fout:PRUL_ZIN});return;}");
assert.ok(iPrul > 0, "saveServerCard stopt bij een kaart in de prullenbak");
assert.ok(iPrul < save.indexOf("confirm("), "en dat gebeurt vóór de vraag 'OK = opnieuw delen'");
assert.match(app, /function kaartInPrullenbak\(\)\{return kaartIsWeg\(\)&&KAART_PRUL;\}/);
assert.match(app, /markeerKaartWeg\(x\.dataset\.sdelid,true\)/, "× naar de prullenbak zet de prullenbakstand");
assert.match(app, /markeerKaartWeg\(d0\.dataset\.pruldef\)/, "Definitief verwijderen niet: dan mag opnieuw delen wel");
assert.match(app, /fp_kaartweg_prul/, "bewaard over herladen heen");
// het zinnetje noemt de weg die echt werkt
assert.match(app, /var PRUL_ZIN='[^']*Kaarten \\u2192 Prullenbak \\u2192 Herstellen[^']*';/);
// Test de QR: geen native alert bij een kaart in de prullenbak
const tq = app.slice(app.indexOf("saveServerCard(cn.value.trim(),function(d){"), app.indexOf("saveServerCard(cn.value.trim(),function(d){") + 900);
assert.ok(tq.indexOf("if(d.verwijderd){toonQrHint(") > 0 && tq.indexOf("if(d.verwijderd){toonQrHint(") < tq.indexOf("alert("), "Test de QR: melding in beeld, geen alert");
// kaartenpaneel "In de praktijk": zin in het paneel, geen alert
assert.match(app, /if\(d\.bestaat\|\|d\.verwijderd\)\{var kr=document\.getElementById\('k_result'\)/);
// functioneel: de hulpfuncties in isolatie
const fn = new Function("localStorage", app.slice(app.indexOf("var KAART_WEG='',KAART_PRUL=false"), app.indexOf("var PRUL_ZIN=")) +
  "return {zet:zetKaartWeg,prul:kaartInPrullenbak,weg:kaartIsWeg,id:function(i){KAART_ID=i;}};");
const opslag = {}; const ls = { getItem: (k) => opslag[k] ?? null, setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } };
globalThis.KAART_ID = "abc"; globalThis.laatsteDeel = ""; globalThis.toonKaartWegHint = () => {};
const h = fn(ls);
h.zet("abc", true);
assert.equal(h.prul(), true, "× : in de prullenbak");
assert.equal(opslag.fp_kaartweg_prul, "1");
h.zet("abc");
assert.equal(h.prul(), false, "definitief: niet meer in de prullenbak");
assert.equal(h.weg(), true, "maar wel weg");
h.zet("");
assert.equal(h.weg(), false); assert.equal(opslag.fp_kaartweg_prul, undefined, "herstellen wist beide");

// --- 2. afspeelknop in de rij ---
const pas = kaart.slice(kaart.indexOf("function pasOefBeeld(){"), kaart.indexOf("function volgSessiebalk("));
assert.match(pas, /var rij=vb\?Math\.max\(h,vb\.getBoundingClientRect\(\)\.height\):h;/, "pasOefBeeld rekent met de hoogte van de afspeelknop");
assert.match(pas, /if\(rij-teVeel<64\)\{/, "dosboven op de rijhoogte");
assert.match(pas, /vb\.style\.maxHeight=\(nieuw\/zoom\)/, "de afspeelknop krimpt mee met het beeld");
assert.match(pas, /oef\.classList\.add\('vbklein'\)/, "past het label niet, dan alleen de driehoek");
assert.match(pas, /oef\.classList\.remove\('vbklein'\)/);
assert.match(kaart, /\.oef\.actief\.vbklein>\.vbtn:not\(\[data-noor\]\)\[aria-expanded="false"\] \.vlab\{position:absolute;width:1px;height:1px/, "label blijft voor de schermlezer");
assert.match(kaart, /\.oef\.actief\.vbklein>\.vbtn:not\(\[data-noor\]\)\[aria-expanded="false"\] \.driehoek\{width:52px;height:52px/, "driehoek blijft ≥ 44 px");
console.log("test-sweep-prullenbak-videorij: prullenbak zonder tegenstrijdige vensters, dosering naast de afspeelknop");
