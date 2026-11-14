// Gebruikers-sweep 2026-11-13 18u (Mark, desktop + iPad): een eigen oefening "Squat" (of "Abroller")
// met een eigen foto gaf 200. De app zoekt oefeningen op naam, de laatste wint: het
// standaardsjabloon "Knie na operatie" en nieuwe kaarten toonden daarna de eigen foto bij Squat,
// voor het hele team; de bibliotheek toonde twee keer "Abroller". Nu weigert de server een eigen
// oefening met de naam (nu of eerder) van een bibliotheekoefening, met dezelfde vergelijking als
// de app (zonder hoofdletters, accenten en tekens). Zonder browser, past in CI. `npm run test:eigenbibnaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const bib = JSON.parse(await readFile(join(root, "public/oefeningen-v2.json"), "utf8"));
const lijst = Array.isArray(bib) ? bib : (bib.oefeningen || []);
const eenNaam = String((lijst.find((o) => o && o.naam) || {}).naam || "");
assert.ok(eenNaam, "bibliotheek heeft oefeningen");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-eigenbib-"));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.77." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(200, 1)]).toString("base64");
const P = "Fysio Bibnaam";
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  // de naam zoals de app de bibliotheek ziet (het manifest, niet het ruwe bestand)
  const man = await (await fetch(origin + "/v2/oefeningen.json", { headers: kop() })).json();
  const squat = man.find((o) => /^squat$/i.test(o.naam)) || man.find((o) => o && o.naam);
  const metEerder = man.find((o) => Array.isArray(o.eerder) && o.eerder.length);
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const voeg = (naam) => post("/api/praktijk/oefeningen", { praktijk: P, naam, img: png }, S);
  // precies, andere hoofdletters/spaties/accenten, en een eerdere naam: geweigerd
  const varianten = [squat.naam, squat.naam.toUpperCase(), "  " + squat.naam + " ", squat.naam.replace(/e/g, "é")];
  if (metEerder) varianten.push(metEerder.eerder[0]);
  for (const n of varianten) {
    const r = await voeg(n);
    assert.equal(r.status, 409, "bibliotheeknaam '" + n + "' hoort geweigerd: " + r.status);
    const d = await r.json();
    assert.equal(d.bibliotheek, true);
    assert.match(d.fout, /bibliotheek/);
  }
  // een eigen naam mag, en blijft maar één keer
  let r = await voeg(squat.naam + " met band (Fysio Bibnaam)");
  assert.equal(r.status, 200, "eigen naam mag");
  r = await voeg(squat.naam + " met band (Fysio Bibnaam)");
  assert.equal(r.status, 409, "zelfde eigen naam: 409");
  // eigen namen onderling: dezelfde vergelijking als de app (gebruikers-sweep 2026-11-13 22u, Mark)
  r = await voeg("Abroller Testdal");
  assert.equal(r.status, 200, "eerste eigen naam mag");
  for (const n of ["Abroller-Testdal", "Abröller Testdal", "ABROLLER_TESTDAL", "abroller  testdal!"]) {
    r = await voeg(n);
    assert.equal(r.status, 409, "variant '" + n + "' van een eigen naam hoort geweigerd: " + r.status);
    assert.match((await r.json()).fout, /Abroller Testdal/);
  }
  // een lijst of object als naam wordt geen "[object Object]"
  for (const n of [["Kniebuiging"], { a: 1 }]) {
    r = await voeg(n);
    assert.equal(r.status, 400, "naam als " + JSON.stringify(n) + " hoort 400: " + r.status);
  }
  console.log("eigen oefening met bibliotheeknaam: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
