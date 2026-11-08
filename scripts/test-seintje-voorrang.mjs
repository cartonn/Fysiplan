// Gebruikers-sweep 2026-11-08 (HOOG, Mark): seintjes overschreven elkaar. "Het doet te
// veel pijn" verdween als de patiënt daarna "Ik heb een vraag" tikte, en een vraag
// verdween stil door "Het gaat goed". Nu wint het zwaarste open seintje (pijn > vraag >
// goed); wat er intussen nog binnenkwam staat in `ook`. Draait zonder browser (CI).
// `npm run test:seintjevoorrang`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-seinvoorrang-"));
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
let sessie = "";
const kop = () => ({ "content-type": "application/json", "x-forwarded-for": "10.9.0." + (ip++), ...(sessie ? { "x-praktijk-sessie": sessie } : {}) });
const post = (pad, body) => fetch(origin + pad, { method: "POST", headers: kop(), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(100); }
  const P = "Fysio Voorrang";
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wachtwoord-voorrang-test", akkoord: true });
  assert.equal(claim.status, 200, "praktijk beveiligen: " + claim.status);
  const cj = await claim.json();
  sessie = cj.sessie;
  assert.ok(sessie, "sessie na beveiligen");
  const nieuweKaart = async (naam) => {
    const r = await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" });
    const d = await r.json();
    assert.ok(d.id, "kaart gedeeld: " + JSON.stringify(d));
    return d.id;
  };
  const lijst = async () => {
    const r = await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop() });
    assert.equal(r.status, 200, "overzicht: " + r.status);
    const d = await r.json();
    return d;
  };
  const sein = async (id) => (await lijst()).find((k) => k.id === id).seintje;

  // 1. pijn, daarna vraag: pijn blijft staan, de vraag staat erbij
  const a = await nieuweKaart("Truus");
  assert.equal((await post("/api/kaart/seintje", { id: a, soort: "pijn" })).status, 200);
  await wacht(5);
  assert.equal((await post("/api/kaart/seintje", { id: a, soort: "vraag" })).status, 200);
  let s = await sein(a);
  assert.equal(s && s.soort, "pijn", "pijn wordt niet overschreven door een vraag");
  assert.deepEqual(s.ook, ["vraag"], "de vraag staat er wel bij");
  // daarna "gaat goed": pijn blijft staan
  await post("/api/kaart/seintje", { id: a, soort: "goed" });
  s = await sein(a);
  assert.equal(s.soort, "pijn", "pijn wordt niet overschreven door gaat goed");

  // de inbox toont beide: pijn én de vraag (sweep 2026-11-08, Mark)
  const ib = await (await fetch(origin + "/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), { headers: kop() })).json();
  const ka = (ib.kaarten || []).find((k) => k.id === a);
  assert.ok(ka, "kaart in de inbox: " + JSON.stringify(ib).slice(0, 300));
  assert.deepEqual(ka.items.filter((i) => i.soort === "seintje").map((i) => i.wat).sort(), ["pijn", "vraag"], "inbox: pijn en vraag");

  // 2. vraag, daarna gaat goed: de vraag blijft open
  const b = await nieuweKaart("Jayden");
  await post("/api/kaart/seintje", { id: b, soort: "vraag" });
  await wacht(5);
  await post("/api/kaart/seintje", { id: b, soort: "goed" });
  assert.equal((await sein(b)).soort, "vraag", "vraag verdwijnt niet door gaat goed");

  // 3. vraag, daarna pijn: pijn neemt het over, de vraag blijft zichtbaar
  const c = await nieuweKaart("Mark");
  await post("/api/kaart/seintje", { id: c, soort: "vraag" });
  await wacht(5);
  await post("/api/kaart/seintje", { id: c, soort: "pijn" });
  s = await sein(c);
  assert.equal(s.soort, "pijn");
  assert.deepEqual(s.ook, ["vraag"]);

  // 4. gaat goed, daarna nog eens gaat goed: gewoon bijwerken (geen ook)
  const d = await nieuweKaart("Sanne");
  await post("/api/kaart/seintje", { id: d, soort: "goed" });
  await wacht(5);
  await post("/api/kaart/seintje", { id: d, soort: "goed" });
  s = await sein(d);
  assert.equal(s.soort, "goed");
  assert.equal(s.ook, undefined);

  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen fout in het serverlog");
  console.log("test-seintje-voorrang: OK (pijn > vraag > gaat goed, rest in ook)");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
