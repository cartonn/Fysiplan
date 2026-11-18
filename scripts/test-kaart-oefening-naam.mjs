// Gebruikers-sweep 2026-11-13 18u (Jayden, Pixel 7): de patiënt heeft /k open, de praktijk haalt
// "Squat" (oefening 1) van de kaart, de patiënt tikt op het oude scherm "Gedaan" bij Squat:
// de server boekte het vinkje op "Lunges" (de nieuwe oefening 1). Ook "te zwaar" en de offline-
// wachtrij. Nu stuurt de kaart de naam mee (n) en volgt de server die: nieuwe plek als de
// oefening nog op de kaart staat, anders 409. Zonder n (oude kaartpagina in een cache) blijft
// het de plek. Zonder browser, past in CI. `npm run test:oefnaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /stuur\('\/api\/kaart\/oefening',\{id:id,oef:idx,n:oefNamen\(\[idx\]\)\[0\]/, "vinkje stuurt de naam mee");
assert.match(kaart, /var zn=oefNamen\(\[zidx\]\)\[0\];[\s\S]{0,200}JSON\.stringify\(\{id:id,oef:zidx,n:zn\}\)/, "te zwaar stuurt de naam mee");
assert.match(kaart, /zetInWacht\('\/api\/kaart\/oefzwaar',\{id:id,oef:zidx,n:zn\}\)/, "te zwaar in de wachtrij met naam");

const ID = "0e5a0e5a1234";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefnaam-"));
const kaartData = (chosen) => JSON.stringify({ "fysio oefnaam": { jayden: { id: ID, praktijk: "Fysio Oefnaam", naam: "Jayden",
  ts: Date.now(), chosen, rows: {}, cells: {}, vids: {} } } });
// de kaart zoals de praktijk hem NA het weghalen van Squat bewaarde
await writeFile(join(dataDir, "kaarten.json"), kaartData([{ n: "Lunges", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }]));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const post = (pad, body) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.6.3." + (ip++) }, body: JSON.stringify({ id: ID, ...body }) });
const kaartNu = async () => (await (await fetch(origin + "/api/kaart?id=" + ID, { headers: { "x-forwarded-for": "10.6.4." + (ip++) } })).json());
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  // oud scherm: Squat stond op plek 0 en is weg → geweigerd, niets bij Lunges
  let r = await post("/api/kaart/oefening", { oef: 0, n: "Squat", aan: true });
  assert.equal(r.status, 409, "weggehaalde oefening: 409");
  assert.match((await r.json()).fout, /niet meer op je kaart/);
  r = await post("/api/kaart/oefzwaar", { oef: 0, n: "Squat" });
  assert.equal(r.status, 409, "te zwaar bij weggehaalde oefening: 409");
  let k = await kaartNu();
  const trouw = (k.kaart || k).oefTrouw || {};
  assert.ok(!trouw.Lunges, "Lunges kreeg geen vinkje: " + JSON.stringify(trouw));
  // oud scherm: Brug stond op plek 2, staat nu op plek 1 → telt bij Brug
  r = await post("/api/kaart/oefening", { oef: 2, n: "Brug", aan: true });
  assert.equal(r.status, 200, "verschoven oefening telt");
  r = await post("/api/kaart/oefzwaar", { oef: 2, n: "Brug" });
  assert.equal(r.status, 200);
  // klopt plek en naam: gewoon
  r = await post("/api/kaart/oefening", { oef: 0, n: "Lunges", aan: true });
  assert.equal(r.status, 200);
  // zonder n (oude pagina in cache): de plek, zoals vroeger
  r = await post("/api/kaart/oefzwaar", { oef: 0 });
  assert.equal(r.status, 200);
  k = await kaartNu();
  const kk = k.kaart || k;
  assert.equal(kk.oefTrouw && kk.oefTrouw.Brug && kk.oefTrouw.Brug.n, 1, "vinkje bij Brug");
  assert.equal(kk.oefTrouw && kk.oefTrouw.Lunges && kk.oefTrouw.Lunges.n, 1, "vinkje bij Lunges");
  assert.ok(kk.oefZwaar && kk.oefZwaar.Brug && kk.oefZwaar.Lunges && !kk.oefZwaar.Squat, "te zwaar klopt: " + JSON.stringify(kk.oefZwaar));
  // rare n: weigeren, nooit 500
  for (const n of ["constructor", "x".repeat(5000)]) {
    r = await post("/api/kaart/oefening", { oef: 0, n });
    assert.ok([400, 409].includes(r.status), "rare n: " + r.status);
  }
  console.log("oefening op naam: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
