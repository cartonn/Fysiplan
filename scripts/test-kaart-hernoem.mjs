// Gebruikers-sweep 2026-11-07 (Sanne): de roepnaam van een gedeelde kaart verbeteren
// ("Dirk" → "Dirck") maakte stil een tweede kaart met een nieuwe QR/link. De al
// geprinte QR toonde de oude inhoud en pijnscores kwamen op de oude kaart.
// Nu hernoemt POST /api/kaarten de kaart die de editor bewerkt (kaartId) zolang de
// nieuwe naam vrij is; het id (en dus de QR) en de voortgang blijven gelijk.
// Zonder browser, past in CI. `npm run test:hernoem`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-hernoem-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Hernoem", wachtwoord: "wachtwoord-hernoem-test", akkoord: true });
  assert.equal(claim.status, 200);
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const deel = (naam, extra) => post("/api/kaarten", { praktijk: "Fysio Hernoem", naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }], ...extra }, S);
  const lijst = async () => {
    const r = await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent("Fysio Hernoem"), { headers: kop(S) });
    assert.equal(r.status, 200);
    return r.json();
  };

  // kaart "Dirk" delen; patiënt geeft een pijnscore
  const r1 = await deel("Dirk", { kaartId: "" });
  assert.equal(r1.status, 200);
  const { id, ts } = await r1.json();
  assert.equal((await post("/api/kaart/meting", { id, score: 4 })).status, 200);

  // therapeut verbetert de roepnaam en slaat opnieuw op vanuit dezelfde editor
  const r2 = await deel("Dirck", { kaartId: id, basisTs: ts });
  assert.equal(r2.status, 200, "hernoemen via opslaan lukt");
  const d2 = await r2.json();
  assert.equal(d2.id, id, "zelfde id, dus de geprinte QR blijft kloppen");
  const k = await lijst();
  assert.equal(k.length, 1, "geen stille tweede kaart: " + JSON.stringify(k.map((x) => x.naam)));
  assert.equal(k[0].naam, "Dirck");
  assert.equal(k[0].scores.length, 1, "pijnscore blijft bij de kaart");

  // de link toont de nieuwe naam
  const g = await fetch(origin + "/api/kaart?id=" + id, { headers: kop() });
  assert.equal(g.status, 200);
  assert.match(JSON.stringify(await g.json()), /Dirck/);

  // iPad opent dezelfde kaart (deelt bij openen, zonder wijziging): versie blijft gelijk,
  // dus de desktop met die versie mag daarna gewoon zijn wijziging opslaan (Mark, 2026-11-07)
  await wacht(5);
  const open = await deel("Dirck", { kaartId: id, basisTs: d2.ts });
  assert.equal(open.status, 200);
  assert.equal((await open.json()).ts, d2.ts, "alleen openen hoogt de versie niet op");
  await wacht(5);
  const wijzig = await deel("Dirck", { kaartId: id, basisTs: d2.ts, client: { c_naam: "Dirck", c_doel: "traplopen" } });
  assert.equal(wijzig.status, 200, "desktop na openen op de iPad niet verouderd");
  const d3 = await wijzig.json();
  assert.ok(d3.ts > d2.ts, "echte wijziging hoogt de versie wel op");
  // en de oude versie wordt daarna wel geweigerd (gedrag van PR #56 blijft)
  assert.equal((await deel("Dirck", { kaartId: id, basisTs: d2.ts, client: { c_naam: "Dirck", c_doel: "fietsen" } })).status, 409);
  d2.ts = d3.ts;

  // botsing: een andere bestaande kaart heeft al de nieuwe naam → nog steeds 409, niets weg
  const r3 = await deel("Ellen", { kaartId: "" });
  assert.equal(r3.status, 200);
  const r4 = await deel("Ellen", { kaartId: id, basisTs: d2.ts });
  assert.equal(r4.status, 409, "naam van een andere kaart wordt niet stil overgenomen");
  const na = await lijst();
  assert.deepEqual(na.map((x) => x.naam).sort(), ["Dirck", "Ellen"]);

  // nieuwe kaart zonder kaartId maakt gewoon een nieuwe kaart
  const r5 = await deel("Fien", { kaartId: "" });
  assert.equal(r5.status, 200);
  assert.notEqual((await r5.json()).id, id);
  assert.equal((await lijst()).length, 3);

  // gegokt kaartId van een andere praktijk hernoemt niets daarbuiten
  const claim2 = await post("/api/praktijk/claim", { praktijk: "Fysio Ander", wachtwoord: "wachtwoord-ander-test", akkoord: true });
  const S2 = { "x-praktijk-sessie": (await claim2.json()).sessie };
  const r6 = await post("/api/kaarten", { praktijk: "Fysio Ander", naam: "Gijs", client: { c_naam: "Gijs" },
    chosen: [{ n: "Squat", i: 0 }], kaartId: id }, S2);
  assert.equal(r6.status, 200);
  assert.notEqual((await r6.json()).id, id, "andere praktijk krijgt een eigen kaart");
  assert.equal((await lijst()).length, 3, "kaart van de eerste praktijk blijft staan");

  // "Naam wijzigen" in het overzicht (Sanne, 2026-11-07): de roepnaam op /k gaat mee en
  // een editor met de oude naam en versie zet hem niet stil terug
  const hn = await post("/api/kaart/naam", { praktijk: "Fysio Hernoem", id, naam: "Dirk B." }, S);
  assert.equal(hn.status, 200);
  const dn = await hn.json();
  assert.ok(dn.ts > d2.ts, "hernoemen hoogt de versie op");
  const gk = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json();
  assert.equal(gk.kaart.client.c_naam, "Dirk", "de patiënt ziet de verbeterde roepnaam (Dirck → Dirk)");
  const terug = await deel("Dirck", { kaartId: id, basisTs: d2.ts, client: { c_naam: "Dirck", c_doel: "wandelen" } });
  assert.equal(terug.status, 409, "oude editor zet de oude naam niet stil terug");
  assert.equal((await terug.json()).verouderd, true);
  assert.ok((await lijst()).some((x) => x.naam === "Dirk B."), "naam blijft Dirk B.");
  // de editor die zelf hernoemde neemt naam en versie over en kan gewoon verder
  const verder = await deel("Dirk B.", { kaartId: id, basisTs: dn.ts, client: { c_naam: "Dirk B.", c_doel: "wandelen" } });
  assert.equal(verder.status, 200);
  assert.ok((await lijst()).some((x) => x.naam === "Dirk B."));
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  const hblok = idx.match(/var hn=e\.target\.closest\('\[data-shernoem\]'\);[\s\S]*?\n      return;\n    \}/);
  assert.ok(hblok, "hernoem-handler gevonden");
  assert.match(hblok[0], /zetKaartId\(KAART_ID,d\.ts/, "open editor neemt de nieuwe versie over");
  assert.match(hblok[0], /getElementById\('c_naam'\)/, "open editor neemt de nieuwe naam over");
  assert.match(hblok[0], /getElementById\('k_naam'\)[\s\S]*?knv\.value=d\.naam\|\|nieuw/, "opslagveld in Kaarten neemt de nieuwe naam over (geen stille terugzet via In de praktijk)");

  console.log("test-kaart-hernoem: OK");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
