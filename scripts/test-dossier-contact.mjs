// Legal 2026-11-07 (WGBO art. 7:454 BW, KNGF-richtlijn dossiervoering): seintjes,
// "te zwaar"-meldingen en berichten van de praktijk verdwenen na afhandeling spoorloos.
// Ze staan nergens anders en de kaart wordt na de bewaartermijn gewist, dus ze moeten
// mee in "Kopieer voor dossier". Deze test controleert dat de server ze in een kort
// contactlogboek bij de kaart houdt, dat de patiëntroute ze niet laat zien, dat opnieuw
// opslaan ze niet wist en dat de dossiertekst ze met datum en bron noemt.
// Zonder browser (draait ook in CI). Onderdeel van `npm run test:privacy`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-dossier-"));
const nu = Date.now();
const ID = "c0c0c0c0c0c1";
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu }));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio dossier": { truus: { id: ID, praktijk: "Fysio Dossier", naam: "Truus", ts: nu,
    chosen: [{ n: "Squat", i: 0 }], rows: {}, cells: {}, vids: {}, client: { c_naam: "Truus" } } }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.3.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Dossier", wachtwoord: "dossier-wachtwoord-1", akkoord: true });
  assert.equal(claim.status, 200);
  const sessie = (await claim.json()).sessie;
  const S = { "x-praktijk-sessie": sessie };

  // patiënt: pijn-seintje en "te zwaar"; praktijk antwoordt; patiënt tikt het weg; praktijk handelt te zwaar af
  assert.equal((await post("/api/kaart/seintje", { id: ID, soort: "pijn" })).status, 200);
  assert.equal((await post("/api/kaart/oefzwaar", { id: ID, oef: 0 })).status, 200);
  assert.equal((await post("/api/kaart/antwoord", { praktijk: "Fysio Dossier", id: ID, tekst: "Doe de squat tot 90 graden, bel bij meer pijn." }, S)).status, 200);
  assert.equal((await post("/api/kaart/antwoord/gezien", { id: ID })).status, 200);
  assert.equal((await post("/api/kaart/oefzwaar/gezien", { praktijk: "Fysio Dossier", id: ID }, S)).status, 200);

  // opnieuw opslaan door de praktijk mag het logboek niet wissen
  const opslaan = await post("/api/kaarten", { praktijk: "Fysio Dossier", naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }], rows: {}, cells: {} }, S);
  assert.equal(opslaan.status, 200, await opslaan.clone().text());

  // patiëntroute: logboek blijft binnen
  const pat = await (await fetch(origin + "/api/kaart?id=" + ID, { headers: kop() })).json();
  assert.equal(pat.ok, true);
  assert.equal("contact" in pat.kaart, false, "het contactlogboek reist niet mee naar de patiëntroute");
  // inzage (legal 2026-11-08): de eigen seintjes wel, ook na afhandeling, alleen soort en moment
  assert.equal(pat.kaart.mijnSeintjes.length, 1, "eigen seintje in Mijn gegevens");
  assert.deepEqual(Object.keys(pat.kaart.mijnSeintjes[0]).sort(), ["soort", "t"]);
  assert.equal(pat.kaart.mijnSeintjes[0].soort, "pijn");
  assert.doesNotMatch(JSON.stringify(pat.kaart), /90 graden/, "berichten uit het logboek blijven binnen");

  // praktijkroute: alles staat er, in volgorde, ook na afhandeling
  const pr = await (await fetch(origin + "/api/praktijk/kaart?praktijk=fysio%20dossier&id=" + ID, { headers: kop(S) })).json();
  assert.equal(pr.ok, true);
  const c = pr.kaart.contact || [];
  assert.deepEqual(c.map((x) => x.van + ":" + (x.soort || "tekst")), ["patient:pijn", "patient:zwaar", "praktijk:tekst"]);
  assert.equal(c[1].oef, "Squat");
  assert.equal(pr.kaart.seintje, null, "het seintje is afgehandeld");
  assert.equal(pr.kaart.antwoord, null, "het bericht is weggetikt");

  // dossiertekst uit de echte app-code
  const html = await readFile(join(root, "public/index.html"), "utf8");
  const fn = html.match(/  function dossierTekst\(kaart\)\{[\s\S]*?\n  \}\n/);
  assert.ok(fn, "dossierTekst gevonden");
  const ctx = { location: { origin: "https://fysiplan.nl" }, normEx: (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "") };
  vm.runInNewContext(fn[0] + ";this.dossierTekst=dossierTekst;", ctx);
  const tekst = ctx.dossierTekst(pr.kaart);
  assert.match(tekst, /Contact via de digitale kaart:/);
  assert.match(tekst, /patiënt: seintje: meldt te veel pijn/);
  assert.match(tekst, /patiënt: oefening te zwaar \(Squat\)/);
  assert.match(tekst, /praktijk: "Doe de squat tot 90 graden, bel bij meer pijn\."/);
  assert.match(tekst, /Bron: Fysiplan, overgenomen op \d\d-\d\d-\d{4}\. De digitale kaart wordt na de bewaartermijn gewist/);

  // plafond: het logboek groeit niet onbeperkt
  for (let i = 0; i < 60; i++) await post("/api/kaart/seintje", { id: ID, soort: "goed" });
  const opslag = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio dossier"].truus;
  assert.equal(opslag.contact.length, 50, "hooguit 50 regels per kaart");
  console.log("test-dossier-contact: seintjes, te zwaar en berichten blijven tot de bewaartermijn en gaan mee naar het dossier");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
