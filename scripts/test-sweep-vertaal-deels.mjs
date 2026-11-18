// Gebruikers-sweep 2026-11-12 22u (Jayden, Pixel 7 en iPhone 14, Engels): de bibliotheek wordt vooraf
// vertaald (#250), maar ontbrak er op een kaart één tekst (een nieuwe oefening, de naam van een eigen
// oefening) en lukte het bijvertalen niet (geen sleutel, andere site, storing), dan gaf /api/kaart/vertaal
// een fout en bleef de HELE kaart Nederlands, ook wat al vertaald en nagelezen was. Nu krijgt de kaart
// wat er al is (`deels: true`); alleen de ontbrekende tekst blijft Nederlands, met de melding op de kaart.
// Staat er nog niets in de cache, dan de fout zoals eerst. Alleen server, draait overal. `npm run test:vertaaldeels`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zetNagelezen } from "../lib/vertaling.js";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vertaal-deels-"));
// vooraf vertaald: alleen de naam van de eerste oefening (Engels, nagelezen), niets in het Duits
const en = {};
zetNagelezen(en, "Bruggen beginner", "Bridges for beginners", "test");
await writeFile(join(dataDir, "vertalingen.json"), JSON.stringify({ en }));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
const gestopt = new Promise((r) => app.on("exit", r));
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.10." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Vertaal Deels";
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "vertaal-deels-wachtwoord", akkoord: true })).json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay", client: { c_naam: "Jay" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const vraag = (taal, extra) => fetch(origin + "/api/kaart/vertaal?id=" + id + "&taal=" + taal, { headers: kop(extra) });

  // Engels: de naam staat klaar, de uitleg niet en er is geen sleutel → toch de naam
  let r = await vraag("en");
  let d = await r.json();
  assert.equal(r.status, 200, "deels vertaald is geen fout: " + JSON.stringify(d));
  assert.equal(d.ok, true);
  assert.equal(d.deels, true, "de kaart weet dat er nog iets ontbreekt");
  assert.equal(d.teksten["Bruggen beginner"], "Bridges for beginners", "wat vooraf vertaald is, komt mee");
  assert.deepEqual(d.nagelezen, ["Bruggen beginner"], "nagelezen blijft nagelezen");
  assert.equal(Object.keys(d.teksten).length, 1, "alleen wat er is, niets verzonnen");

  // een andere site mag geen nieuwe vertaling laten maken, maar wel lezen wat er al is
  r = await vraag("en", { "sec-fetch-site": "cross-site", origin: "https://kwaad.invalid" });
  d = await r.json();
  assert.equal(r.status, 200, "cross-site: wat er al is");
  assert.equal(d.teksten["Bruggen beginner"], "Bridges for beginners");

  // Duits: niets in de cache → de fout zoals eerst (de kaart toont dan de storingsmelding)
  r = await vraag("de");
  assert.equal(r.status, 503, "niets vertaald en geen sleutel: 503");
  assert.equal((await r.json()).ok, false);
  console.log("vertaal deels: ok (vooraf vertaald blijft staan als bijvertalen niet kan)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await gestopt;
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
}
