// Patiëntkaart op de telefoon (mobiele doorloop 2026-11-10, iPhone SE en Pixel 7).
// - uitleg staat bij de oefening zelf ("Zo doe je het"), in negen talen, nooit bij een
//   tegengehouden beeld of tegengehouden uitleg
// - alleen de avatar (kaartImg), nooit de lijntekening (img)
// - de zin over de stemopname staat één keer boven de lijst, niet bij elke oefening
// - "30 sec" krijgt geen "herhalingen" erachter
// - de beginscherm-uitnodiging komt pas na een eerste afvinken of score
// `npm run test:patientmobiel`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile("public/kaart.html", "utf8");
const TALEN = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
const zo = vm.runInNewContext("(" + html.match(/var ZO_DOE=(\{[^\n]*?\});/)[1] + ")");
for (const t of TALEN) assert.ok(zo[t], "Zo doe je het: " + t);

// het uitlegblok, los uitgevoerd
const blok = html.slice(html.indexOf("  var UITLEG_OPEN={};"), html.indexOf("  // De stemopname vertelt"));
const ctx = vm.createContext({ TAAL: "nl", ZO_DOE: zo, NIET_VERTAALD: { en: "nog niet vertaald" },
  esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  vt: (s) => s, uitlegNietVertaald: () => false });
vm.runInContext(blok, ctx);
const o = { uitleg: "Sta rechtop <en> zak door je knieën." };
const uit = ctx.oefUitlegBlok(o, 0, false);
assert.match(uit, /<details class="oefuitleg" data-uidx="0"><summary>Zo doe je het<\/summary>/);
assert.ok(uit.includes("Sta rechtop &lt;en&gt;"), "uitleg ge-escaped");
assert.equal(ctx.oefUitlegBlok(o, 0, true), "", "tegengehouden: geen uitleg");
assert.equal(ctx.oefUitlegBlok({}, 0, false), "", "zonder uitleg geen blok");
ctx.UITLEG_OPEN[2] = true;
assert.match(ctx.oefUitlegBlok(o, 2, false), / open>/, "open blijft open na hertekenen");
assert.ok(html.includes("oefUitlegBlok(o,idx,hideMedia||holdExplanation)"), "tekenKaart geeft de controlestatus mee");

// alleen avatars
assert.ok(html.includes("var beeldpad=o&&o.kaartImg?o.kaartImg:'';"));
assert.ok(!/beeldpad=[^;]*o\.img/.test(html), "geen lijntekening als terugval");

// stemzin één keer
assert.equal((html.match(/De stem legt de algemene uitvoering uit/g) || []).length, 1, "stemzin één keer");
assert.ok(html.includes('id="noornoot" hidden'));
assert.ok(html.includes("var NOOR_LABEL='Luister naar deze oefening';") && !html.includes("'Luister naar Noor'"), "knop zegt wat hij doet");

// tijd is geen aantal herhalingen
const re = /\^\\s\*\\d\+\(\[-–\]\\d\+\)\?\\s\*x\?\\s\*\$/;
assert.ok(re.test(html), "regel voor herhalingen staat erin");
const isAantal = (h) => /^\s*\d+([-–]\d+)?\s*x?\s*$/i.test(h);
assert.ok(isAantal("10") && isAantal("8-12") && isAantal("10x"));
assert.ok(!isAantal("30 sec") && !isAantal("1 min") && !isAantal("2x30s"));

// beginscherm-uitnodiging niet meer op een klok
assert.ok(!/setTimeout\(function\(\)\{toonBanner\(true\);\},2500\)/.test(html), "geen balk na 2,5 s");
assert.ok(html.includes("closest('.oefdone,#ovalles,#gdaan,#mschaal button')"), "balk na eerste actie");

// Print en Deel onderaan, het schema op de print uitgeklapt
assert.ok(html.indexOf('id="printBtn"') > html.indexOf('id="oefs"'), "Print staat onder de oefeningen");
assert.ok(html.includes("beforeprint") && html.includes("schemablok"), "schema op de print");
console.log("Patiëntkaart mobiel: uitleg bij de oefening (9 talen), alleen avatars, stemzin één keer, tijd ≠ herhalingen, beginschermbalk na eerste actie, Print/Deel onderaan.");
