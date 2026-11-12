// Legal 2026-11-08 (inzage, art. 12 en 15 AVG): "Download mijn gegevens" op /k geeft een
// leesbaar tekstbestand: datums in plaats van tijdstempels, oefeningnamen en dosering in
// plaats van sleutels, de eigen seintjes en wat alleen op de telefoon staat. Nederlands op
// een Nederlandse kaart, Engels in elke andere taal (nooit Nederlandse sleutels op een
// Engelse of Arabische kaart). Draait zonder browser (CI); de serverkant (mijnSeintjes)
// staat in test-dossier-contact.mjs.
// `node scripts/test-mijn-gegevens.mjs`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

const html = await readFile(join(process.cwd(), "public/kaart.html"), "utf8");
const blok = html.match(/\/\/ <mgTekst>([\s\S]*?)\/\/ <\/mgTekst>/);
assert.ok(blok, "mgTekst staat tussen de markeringen");
const ctx = {};
vm.runInNewContext(blok[1] + ";this.mgTekst=mgTekst;this.TMGD=TMGD;this.mgTrouwTik=mgTrouwTik;this.mgSeintjeErbij=mgSeintjeErbij;", ctx);
assert.deepEqual(Object.keys(ctx.TMGD.nl).sort(), Object.keys(ctx.TMGD.en).sort(), "nl en en hebben dezelfde teksten");

const T = Date.UTC(2026, 10, 3, 9, 30);
const kaart = {
  id: "abc123def456", praktijk: "Fysio Test", verloopt: T + 90 * 864e5,
  client: { c_naam: "Truus", c_doel: "Traplopen", c_opm: "Rustig opbouwen" },
  chosen: [{ n: "Squat", i: 0 }, { n: "Brug", id: "b1", i: 0 }],
  cells: { "nsquat.0|r0|S": "3", "nsquat.0|r0|H": "10", "xb1.0|r0|W": "5 kg" },
  metingen: [{ t: T, s: 4 }], ervaring: [{ t: T, s: 1 }], pskDoel: "Trap op", psk: [{ t: T, s: 6 }],
  gedaan: [{ t: T }, { t: T + 864e5, ont: T + 2 * 864e5 }],
  oefTrouw: { Squat: { n: 7, d: "2026-11-03" } }, oefZwaar: { Brug: { t: T } },
  mijnSeintjes: [{ soort: "pijn", t: T }],
  antwoord: { t: T, tekst: "Doe het rustig aan." }, afspraak: { t: T + 7 * 864e5, herhaal: 4 }
};
const lokaal = { done: [0], zwaar: [1], wacht: { "/api/kaart/meting@2026-11-08": { pad: "/api/kaart/meting", body: { id: "abc123def456", score: 6, wanneer: T }, t: T },
  "/api/kaart/oefzwaar#1@2026-11-08": { pad: "/api/kaart/oefzwaar", body: { id: "abc123def456", oef: 1, wanneer: T }, t: T } } };
const h = (loc) => ({
  datum: (t) => new Date(t).toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }),
  dagTijd: (t) => new Date(t).toLocaleString(loc, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }),
  naam: (x) => x.n, sleutel: (x) => (x.id ? "x" + x.id : "n" + String(x.n).toLowerCase()) + "." + (x.i || 0)
});

const nl = ctx.mgTekst(kaart, "Fysio Test", lokaal, "nl", h("nl-NL"));
for (const moet of [/^Mijn gegevens bij Fysiplan/, /Praktijk: Fysio Test/, /Roepnaam: Truus/, /Doel: Traplopen/,
  /1\. Squat \(3 series, 10 herhalingen\)/, /2\. Brug \(5 kg\)/, /3 november 2026: 4/, /\+1 \(beter\)/,
  /Doelactiviteit: Trap op/, /3 november 2026, 4 november 2026/, /Squat: 7 dagen/, /Brug: 3 november 2026/,
  /Mijn seintjes aan de praktijk ==\n- 3 november 2026: Meer pijn/, /Doe het rustig aan\./, /wekelijks, 4 keer/,
  /Vandaag afgevinkt: Squat/, /Vandaag te zwaar: Brug/, /pijnscore: 6/, /te zwaar \(Brug\)/, /Je dossier staat bij je praktijk/]) {
  assert.match(nl, moet, "nl: " + moet);
}
assert.doesNotMatch(nl, /\d{12,}|chosen|oefTrouw|\|r0\||undefined|NaN|\[object/, "geen sleutels, tijdstempels of kapotte waarden");

const en = ctx.mgTekst(kaart, "Fysio Test", lokaal, "en", h("en-GB"));
assert.match(en, /^My data at Fysiplan/);
assert.match(en, /More pain/);
assert.match(en, /Pain scores/);
assert.doesNotMatch(en, /Roepnaam|Pijnscores|herhalingen|Mijn seintjes/, "Engelse download zonder Nederlandse kopjes");
// Legal 2026-11-08 13u: alle talen van de kaart hebben eigen kopjes, met dezelfde sleutels als nl
const TALEN = ["de", "fr", "es", "pl", "tr", "ar", "uk"];
const sleutels = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? Object.keys(o[k]).sort() : Array.isArray(o[k]) ? o[k].length : typeof o[k]]));
for (const t of TALEN) {
  assert.ok(ctx.TMGD[t], "download-teksten in " + t);
  assert.equal(sleutels(ctx.TMGD[t]), sleutels(ctx.TMGD.nl), t + ": zelfde teksten als nl");
  const tx = ctx.mgTekst(kaart, "Fysio Test", lokaal, t, h("en-GB"));
  assert.equal(tx.split("\n")[0], ctx.TMGD[t].titel, t + ": eigen titel");
  assert.doesNotMatch(tx, /Roepnaam|Pijnscores|Mijn seintjes|My data|Pain scores|undefined|NaN|\{n\}/, t + ": geen nl/en-kopjes of kapotte waarden");
  assert.ok(tx.includes(ctx.TMGD[t].seinW.pijn), t + ": seintje vertaald");
}
assert.equal(ctx.mgTekst(kaart, "", lokaal, "xx", h("en-GB")).split("\n")[0], "My data at Fysiplan", "onbekende taal: Engels");
// de pagina geeft de taal van de kaart door, niet alleen nl/en
assert.match(html, /var mt=TMGD\[TAAL\]\?TAAL:'en'/, "download volgt de kaarttaal");

// lege kaart: geen fouten, overal "niets"
const leeg = ctx.mgTekst({ client: {} }, "", {}, "nl", h("nl-NL"));
assert.match(leeg, /== Mijn oefeningen ==\n- niets/);
assert.doesNotMatch(leeg, /undefined|NaN/);

// de pagina gebruikt mgTekst voor de download, als tekstbestand
assert.match(html, /a\.download='fysiplan-mijn-gegevens\.txt'/);
assert.match(html, /var tekst=mgTekst\(K\.kaart/);
// sweep 2026-11-08 (Truus): direct na twee vinkjes en een seintje zei de download "0 dagen" en
// "seintjes: niets"; pas na herladen klopte het. De lokale bijwerking volgt nu de serverregel.
{
  const k = { client: { c_naam: "Truus" }, chosen: [{ n: "Squat" }, { n: "Brug" }], oefTrouw: { Brug: { n: 2, d: "2026-11-07" } } };
  k.oefTrouw = ctx.mgTrouwTik(k.oefTrouw, "Squat", "2026-11-08", true);
  k.oefTrouw = ctx.mgTrouwTik(k.oefTrouw, "Brug", "2026-11-08", true);
  k.oefTrouw = ctx.mgTrouwTik(k.oefTrouw, "Brug", "2026-11-08", true); // dubbel tikken telt niet dubbel
  assert.equal(k.oefTrouw.Squat.n, 1, "nieuwe oefening: 1 dag na eerste vinkje");
  assert.equal(k.oefTrouw.Brug.n, 3, "bestaande oefening: dag erbij, één keer per dag");
  ctx.mgTrouwTik(k.oefTrouw, "Brug", "2026-11-08", false);
  assert.equal(k.oefTrouw.Brug.n, 2, "uitvinken op dezelfde dag haalt de dag weer weg");
  ctx.mgTrouwTik(k.oefTrouw, "Brug", "2026-11-08", true);
  ctx.mgSeintjeErbij(k, "vraag", T);
  ctx.mgSeintjeErbij(k, "<script>", T);
  assert.equal(k.mijnSeintjes.length, 1, "alleen de drie vaste soorten");
  const fr = ctx.mgTekst(k, "", {}, "fr", h("fr-FR"));
  assert.match(fr, /- Squat: 1 jours/);
  assert.match(fr, /- Brug: 3 jours/);
  assert.doesNotMatch(fr, /: 0 jours/);
  assert.ok(fr.includes(ctx.TMGD.fr.seinW.vraag), "eigen seintje staat er direct in");
}
// de pagina gebruikt de helpers bij het vinkje en na een verstuurd seintje
assert.match(html, /K\.kaart\.oefTrouw=mgTrouwTik\(/);
assert.match(html, /if\(d&&d\.ok\)mgSeintjeErbij\(K&&K\.kaart,soort,/);
// sweep 2026-11-12 10u (Truus): een seintje dat offline in de wachtrij stond en later vanzelf
// verstuurd werd ("Verstuurd ✓"), ontbrak in de download tot herladen. verstuurWacht werkt nu ook bij.
{
  const vw = html.match(/function verstuurWacht\(\)\{[\s\S]*?\n  \}\n/);
  assert.ok(vw, "verstuurWacht gevonden");
  assert.match(vw[0], /it\.pad==='\/api\/kaart\/seintje'[^\n]*mgSeintjeErbij\(K&&K\.kaart,it\.body\.soort,/, "wachtrij-seintje komt in mijnSeintjes");
}
// de privacylinks op de kaart openen meteen het patiëntdeel (sweep 18u, Jayden)
assert.match(html, /id="privmeer" href="\/privacy#patient"/);
assert.match(html, /id="privlink" href="\/privacy#patient"/);
console.log("test-mijn-gegevens: download leesbaar in nl en en, met seintjes en wat alleen op de telefoon staat");
