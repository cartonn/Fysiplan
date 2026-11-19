// Regressietest gebruikers-sweep 2026-11-19 22u (Mark, iPad + desktop; Jayden, Pixel 7): een wekelijkse afspraakreeks
// die al begonnen was, kon na de eerste afspraak niet meer worden bewerkt. Het veld toont de startdatum, en die lag in
// het verleden: Bewaar gaf "Kies een moment in de komende twaalf maanden", "+1 week" telde vanaf de oude start en
// mislukte ook. Het overzicht na de proef liet de lopende reeks weg, de download "Mijn gegevens" op /k noemde de al
// voorbije start als volgende afspraak, en een herhaling buiten de lijst (13) maakte van de reeks stil een eenmalige.
// Alleen server + statisch: draait ook in CI zonder browser. `npm run test:afspraakreeksloopt`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(index, /volgendeAfspraak\(\{afspraak:\{t:basisW,herhaal:Number\(selW\.value\)\|\|0\}\}\)/, "+1 week rekent met het aantal in de keuzelijst zoals het nu staat");
assert.match(index, /if\(vaW&&vaW\.t!==basisW\)\{\s*basisW=vaW\.t;/, "+1 week telt vanaf de eerstvolgende afspraak");
assert.match(kaart, /if\(aR>=2\)\{while\(aT<Date\.now\(\)-2\*3600000&&aR>1\)\{/, "download Mijn gegevens rolt de reeks door");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-reeksloopt-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.68.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const P = "Fysio Reeks Loopt";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "reeks-loopt-ww", akkoord: true })).json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Mark R.", client: { c_naam: "Mark R." }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gemaakt");
  const dag = 86400000;
  const start = Date.now() - 8 * dag;
  const zet = (body) => post("/api/kaart/afspraak", { praktijk: P, id, ...body }, S);

  // reeks van 6 die 8 dagen geleden begon: nog 4 afspraken te gaan -> bewerken mag (×6 naar ×8)
  let r = await zet({ t: start, herhaal: 6 });
  assert.equal(r.status, 200, "lopende reeks met haar startdatum bewaren mag");
  r = await zet({ t: start, herhaal: 8 });
  assert.equal(r.status, 200, "aantal van een lopende reeks aanpassen mag");
  assert.equal((await r.json()).afspraak.herhaal, 8);
  // een eenmalige afspraak in het verleden blijft geweigerd
  r = await zet({ t: start, herhaal: 0 });
  assert.equal(r.status, 400, "eenmalige afspraak in het verleden: geweigerd");
  // een reeks die helemaal voorbij is ook
  r = await zet({ t: Date.now() - 60 * dag, herhaal: 4 });
  assert.equal(r.status, 400, "voorbije reeks: geweigerd");
  // herhaling buiten de lijst: 400 met een zin, de bestaande reeks blijft staan
  r = await zet({ t: Date.now() + 2 * dag, herhaal: 13 });
  assert.equal(r.status, 400, "herhaal 13: geweigerd");
  assert.match((await r.json()).fout, /wekelijkse reeks van 2 tot en met 12/);
  const k = await (await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.68.1.1" } })).json();
  const af = (k.kaart || k).afspraak;
  assert.equal(af && af.herhaal, 8, "reeks van 8 staat er nog");
  // eenmalig blijft werken (0, 1, leeg)
  for (const h of [0, 1, "", null, undefined]) {
    r = await zet({ t: Date.now() + 3 * dag, herhaal: h });
    assert.equal(r.status, 200, "eenmalig met herhaal " + JSON.stringify(h));
  }
  console.log("test-afspraak-reeks-loopt: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
