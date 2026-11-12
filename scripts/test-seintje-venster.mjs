// Het venster waarin de therapeut een seintje beantwoordt, zei alleen "Seintje van de patiënt
// (vandaag)". Wie het stuurde en wat er gemeld was, stond er niet in: je schreef een antwoord
// zonder de melding voor je (platformreview 2026-11-11).
// Nu staat erboven wie het is, welk seintje en wanneer, plus wat er verder op die kaart is
// doorgegeven: de laatste pijnscore, "te zwaar", herstel, en het bericht van de praktijk dat nog
// op de kaart staat. Tonen, niet duiden.
// - De kaartenlijst van de praktijk levert alles wat het venster toont.
// - De opbouw van het venster (uit public/index.html) noemt elk feit en laat geen HTML door.
// Zonder browser, past in CI. `npm run test:seinvenster`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");

// ---- de opbouw van het venster, uit de pagina gehaald ----
const stuk = (naam, patroon) => { const m = html.match(patroon); assert.ok(m, naam + " staat in public/index.html"); return m[0]; };
const bron = [
  stuk("esc", /function esc\(s\)\{.*\}\n/),
  stuk("wanneerTekst", /function wanneerTekst\(t\)\{[\s\S]*?\n  \}\n/),
  stuk("seinFeitenHtml", /function seinFeitenHtml\(c\)\{[\s\S]*?\n  \}\n/)
].join("\n");
const seinFeitenHtml = new Function(bron + "\nreturn seinFeitenHtml;")();
const nu = Date.now(), dag = 86400000;

const rijk = seinFeitenHtml({ naam: "Truus B.", behandelaar: "Karin",
  seintje: { soort: "pijn", t: nu - 5 * 60000, ook: ["vraag", "pijn"] },
  scores: [{ t: nu - 3 * dag, s: 4 }, { t: nu - 10 * 60000, s: 6 }],
  oefZwaar: { "Squat": { t: nu - dag - 1000 } },
  ervaring: [{ t: nu - 2 * dag - 1000, s: -1 }],
  antwoord: { t: nu - 4 * dag - 1000, tekst: "Doe deze week de helft." } });
assert.match(rijk, /Meldt te veel pijn <small>· vandaag \d\d:\d\d<\/small>/, "het seintje en het moment");
assert.match(rijk, /Ook: heeft een vraag</, "wat er naast het zwaarste seintje binnenkwam");
assert.doesNotMatch(rijk, /Ook: [^<]*te veel pijn/, "het seintje zelf staat er niet twee keer");
assert.match(rijk, /Laatste pijnscore: <b>6<\/b> <small>· vandaag/, "de laatste pijnscore, niet een oudere");
assert.match(rijk, /Te zwaar gemeld: Squat <small>· gisteren<\/small>/);
assert.match(rijk, /Herstel: iets slechter <small>· 2 dagen geleden<\/small>/);
assert.match(rijk, /Behandelaar: Karin/);
assert.match(rijk, /Er staat nog een bericht van de praktijk op de kaart \(4 dagen geleden\): “Doe deze week de helft\.” Een nieuw antwoord vervangt dat bericht\./);
assert.doesNotMatch(rijk, /ernstig|let op|zorgelijk|dringend/i, "het venster duidt niet, het toont");

const kaal = seinFeitenHtml({ naam: "Jan K.", seintje: { soort: "vraag", t: nu - 60000 }, scores: [], oefZwaar: null, ervaring: [], antwoord: null });
assert.match(kaal, /Heeft een vraag/);
assert.doesNotMatch(kaal, /sn-feiten|sn-eerder|Ook:/, "zonder verdere meldingen alleen het seintje");
assert.match(seinFeitenHtml({ seintje: { soort: "goed", t: nu } }), /Meldt: het gaat goed/);
assert.equal(seinFeitenHtml({ naam: "Zonder", seintje: null }), "", "geen seintje: het venster valt terug op de oude regel");

// invoer van buiten (oefennaam van een eigen oefening, bericht, behandelaar) komt er als tekst in
const vies = seinFeitenHtml({ seintje: { soort: "vraag", t: nu }, behandelaar: "<img src=x onerror=alert(1)>",
  oefZwaar: { "<script>alert(2)</script>": { t: nu } }, antwoord: { t: nu, tekst: "'\"><svg onload=alert(3)>" }, scores: [{ t: nu, s: "<b>9</b>" }] });
assert.doesNotMatch(vies, /<img|<script|<svg|<b>9/, "geen HTML uit de gegevens: " + vies);
assert.match(vies, /&lt;img src=x onerror=alert\(1\)&gt;/);

// het venster zet de naam als tekst in de titel en haalt de kaart uit de lijst van het overzicht
assert.match(html, /SRV_KAART\[c\.id\]=c;/, "het overzicht onthoudt de kaarten voor het seintjesvenster");
assert.match(html, /document\.getElementById\('sn_titel'\)\.textContent=sk&&sk\.naam\?'Seintje van '\+sk\.naam:/, "de titel noemt de patiënt, als tekst");
assert.match(html, /var sk=SRV_KAART\[id\],feiten=sk\?seinFeitenHtml\(sk\):'';/);

// ---- de kaartenlijst levert wat het venster toont ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-seinvenster-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.70." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Seinvenster";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "seinvenster-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus B.", client: { c_naam: "Truus B." },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  assert.equal((await post("/api/kaart/antwoord", { praktijk: P, id, tekst: "Doe deze week de helft." }, S)).status, 200);
  assert.equal((await post("/api/kaart/meting", { id, score: 6 })).status, 200);
  assert.equal((await post("/api/kaart/oefzwaar", { id, oef: 0, zwaar: true })).status, 200);
  assert.equal((await post("/api/kaart/ervaring", { id, score: -1 })).status, 200);
  assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);
  assert.equal((await post("/api/kaart/seintje", { id, soort: "pijn" })).status, 200);

  const lijst = await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json();
  const c = lijst.find((x) => x.id === id);
  assert.ok(c, "de kaart staat in het overzicht");
  assert.equal(c.naam, "Truus B.");
  assert.equal(c.seintje.soort, "pijn", "het zwaarste open seintje");
  assert.deepEqual(c.seintje.ook, ["vraag"], "de vraag die er ook was");
  assert.equal(c.scores[c.scores.length - 1].s, 6);
  assert.ok(c.oefZwaar && c.oefZwaar["Bruggen beginner"] && c.oefZwaar["Bruggen beginner"].t, "te zwaar gemeld");
  assert.equal(c.ervaring[c.ervaring.length - 1].s, -1);
  assert.equal(c.antwoord.tekst, "Doe deze week de helft.");

  // en precies die kaart geeft in het venster elk feit
  const venster = seinFeitenHtml(c);
  for (const stukje of [/Meldt te veel pijn/, /Ook: heeft een vraag/, /Laatste pijnscore: <b>6<\/b>/, /Te zwaar gemeld: Bruggen beginner/, /Herstel: iets slechter/, /Doe deze week de helft\./]) {
    assert.match(venster, stukje);
  }
  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  console.log("seintjesvenster: wie wat meldde staat boven het antwoordveld: ok");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
