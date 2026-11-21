// Gebruikers-sweep 2026-11-14 14u (Jayden, Pixel 7, Engelse kaart): een week lang elke dag losse oefeningen
// afgevinkt, nooit "Ik heb vandaag geoefend". De kaart zei "done 0× this week" met zeven lege stippen, de
// therapeut zag "4/3 van het doel". Keuze Ahmed (2026-11-12): een afgevinkte oefening telt als oefendag.
// Daarnaast telde een tweede tik op een oude dag dubbel (n 3 → 5) en deed uitvinken van een oude dag niets,
// omdat de server per oefening alleen de laatste dag kende. Nu: per oefening de dagen zelf (ds, max 60),
// en kaart, app en download tellen die dagen. Draait zonder browser (CI). `npm run test:oefdoelweek`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import { trouwTik } from "../lib/patient-routes.js";

const root = process.cwd();
const dag = 864e5;
const nlDag = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
// rekenen vanaf 12:00 UTC van vandaag (NL-datum): met Date.now() - i * dag gaf een sprong over de
// zomertijd tussen 22 en 23 uur UTC twee keer dezelfde dag (80 !== 81 in de sweep van 14-11 22u)
const basis = Date.parse(nlDag(Date.now()) + "T12:00:00Z");
const week = [6, 5, 4, 3, 2, 1, 0].map((i) => nlDag(basis - i * dag));

// 1. server: afvinkdagen per oefening
{
  const rec = { n: 0, d: "" };
  for (const d of week) trouwTik(rec, d, true);
  assert.equal(rec.n, 7, "zeven dagen afgevinkt = 7");
  assert.deepEqual(rec.ds, week, "de dagen zelf staan erbij, oplopend");
  assert.equal(rec.d, week[6], "d blijft de laatste dag");
  trouwTik(rec, week[2], true);
  trouwTik(rec, week[2], true);
  assert.equal(rec.n, 7, "een oude dag nog eens afvinken telt niet dubbel");
  trouwTik(rec, week[2], false);
  assert.equal(rec.n, 6, "uitvinken van een oude dag haalt die dag weg");
  assert.ok(!rec.ds.includes(week[2]));
  assert.equal(rec.d, week[6], "d blijft de laatste dag na uitvinken van een oude dag");
  trouwTik(rec, week[6], false);
  assert.equal(rec.d, week[5], "uitvinken van vandaag: d wordt de dag ervoor");
  // oud record zonder ds: begint met zijn laatste dag
  const oud = { n: 5, d: week[3] };
  trouwTik(oud, week[3], true);
  assert.equal(oud.n, 5, "oud record: dezelfde laatste dag telt niet nog eens");
  trouwTik(oud, week[4], true);
  assert.equal(oud.n, 6);
  // plafond: niet meer dan 60 dagen bewaard
  const lang = { n: 0, d: "" };
  for (let i = 80; i >= 0; i--) trouwTik(lang, nlDag(basis - i * dag), true);
  assert.equal(lang.ds.length, 60, "hooguit 60 dagen");
  assert.equal(lang.n, 81, "het totaal telt door");
  // rare waarden in ds worden genegeerd
  const raar = { n: 1, d: "x", ds: ["gisteren", 5, null, week[0]] };
  trouwTik(raar, week[1], true);
  assert.deepEqual(raar.ds, [week[0], week[1]]);
}

// 2. kaart: dezelfde regel, en de oefenweek telt de afgevinkte dagen
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
const blok = kaart.match(/\/\/ <mgTekst>([\s\S]*?)\/\/ <\/mgTekst>/);
assert.ok(blok, "mgTekst-blok");
const k = {};
vm.runInNewContext(blok[1] + ";this.mgTrouwTik=mgTrouwTik;this.mgTrouwDagen=mgTrouwDagen;", k);
{
  let tr = {};
  week.forEach((d, i) => { tr = k.mgTrouwTik(tr, i % 2 ? "Squat" : "Lunge", d, true); });
  assert.deepEqual(Array.from(k.mgTrouwDagen(tr)), week, "kaart: zeven oefendagen over twee oefeningen");
  k.mgTrouwTik(tr, "Squat", week[1], true);
  assert.equal(tr.Squat.n, 3, "kaart: geen dubbele dag");
  k.mgTrouwTik(tr, "Squat", week[1], false);
  assert.equal(tr.Squat.n, 2);
  assert.deepEqual(Array.from(k.mgTrouwDagen({ a: { n: 1, d: week[0] }, b: null, c: { d: "gisteren" } })), [week[0]], "oud record en rare waarden");
}
// tekenGedaan echt draaien met een nep-DOM: zeven dagen losse vinkjes, doel 3× per week
{
  const m = kaart.match(/  function tekenGedaan\(\)\{[\s\S]*?\n  \}\n(?=  \/\/ ---- afvinken)/);
  assert.ok(m, "tekenGedaan staat in de kaart");
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, style: {}, textContent: "", innerHTML: "",
    classList: { toggle() {} }, setAttribute() {}, querySelector: () => el(id + "_span") });
  let tr = {};
  week.forEach((d, i) => { tr = k.mgTrouwTik(tr, i % 2 ? "Squat" : "Lunge", d, true); });
  const ctx = {
    K: { kaart: { gedaan: [], doel: 3, oefTrouw: tr } },
    document: { getElementById: el },
    // dezelfde kalender als de week hierboven (Europe/Amsterdam); met de lokale tijd van de runner (UTC)
    // was "vandaag" tussen 23:00 en 24:00 UTC een dag eerder en faalde de test elke nacht
    dagStr: (t) => nlDag(t),
    tr: () => ["ma", "di", "wo", "do", "vr", "za", "zo"],
    trg: (s) => ({ vdaan: "Ik heb vandaag geoefend", vweek: "Jouw oefenweek", doel: "Je oefendoel: {d}× per week — deze week {n}× gedaan.",
      doelklaar: "Je haalde je oefendoel van {d}× deze week — sterk!", reeks: "Al {n} weken op rij bezig" })[s] || s,
    esc: (s) => String(s), mgTrouwDagen: k.mgTrouwDagen, Date
  };
  vm.runInNewContext(m[0] + ";tekenGedaan();", ctx);
  assert.equal(els.gweek.style.display, "flex", "oefenweek zichtbaar");
  assert.equal((els.gdots.innerHTML.match(/class="aan"/g) || []).length, 7, "zeven gevulde stippen");
  assert.equal(els.gweeksom.textContent, "Je haalde je oefendoel van 3× deze week — sterk!", "doel gehaald, niet '0×'");
  // zonder doel en zonder dagvink: de week verschijnt toch als er vinkjes zijn
  ctx.K = { kaart: { gedaan: [], oefTrouw: { Squat: { n: 1, d: week[6] } } } };
  els.gweek.style.display = "";
  vm.runInNewContext("tekenGedaan();", ctx);
  assert.equal(els.gweek.style.display, "flex", "oefenweek ook met alleen vinkjes");
}

// na een vinkje meteen de oefenweek opnieuw tekenen (anders vult de stip van vandaag pas na herladen; hertest Jayden)
assert.match(kaart, /zetOefTrouwLokaal\(idx,p===-1\);\s*bewaarOefDaan\(st\);\s*tekenOefDaan\(\);\s*\/\/[^\n]*\n\s*tekenGedaan\(\);/, "vinkje tekent de oefenweek opnieuw");

// 3. app: oefDagen telt alle afvinkdagen
const app = await readFile(join(root, "public/index.html"), "utf8");
const od = app.match(/  function oefDagen\(c\)\{[\s\S]*?\n  \}\n/);
assert.ok(od, "oefDagen staat in de app");
const a = {};
vm.runInNewContext(od[0] + ";this.oefDagen=oefDagen;", a);
assert.equal(a.oefDagen({ gedaan: [], oefTrouw: { Squat: { n: 4, d: week[6], ds: [week[0], week[2], week[4], week[6]] }, Lunge: { n: 3, d: week[5], ds: [week[1], week[3], week[5]] } } }).length, 7,
  "app: zeven oefendagen, niet alleen de laatste dag per oefening");
assert.equal(a.oefDagen({ oefTrouw: { Squat: { n: 1, d: week[6] } } }).length, 1, "app: oud record zonder ds");

// 4. download "Mijn gegevens": ook alle dagen
const k2 = {};
vm.runInNewContext(blok[1] + ";this.mgTekst=mgTekst;", k2);
const h = { datum: (t) => new Date(t).toISOString().slice(0, 10), dagTijd: (t) => new Date(t).toISOString(), naam: (x) => x.n, sleutel: (x) => "n" + x.n };
const tekst = k2.mgTekst({ id: "abc123def456", praktijk: "Fysio Test", verloopt: Date.now() + 90 * dag, client: { c_naam: "Truus" },
  chosen: [{ n: "Squat" }], cells: {}, gedaan: [], oefTrouw: { Squat: { n: 2, d: "2026-11-05", ds: ["2026-11-03", "2026-11-05"] } } }, "Fysio Test", {}, "nl", h);
assert.match(tekst, /\n- 2026-11-03, 2026-11-05\n/, "download: beide afvinkdagen");
console.log("test-oefdoel-week: ok (losse vinkjes tellen als oefendag op kaart, app en download; oude dag telt niet dubbel)");
