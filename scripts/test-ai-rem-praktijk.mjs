// Security-routine 2026-11-21 08u, audit (i) denial of service. De zoekhulp (/api/assistent) had geen
// login: iedereen kon hem aanroepen, elke keer met de hele bibliotheek naar de AI-dienst (kosten), en met
// 15 adressen × 20 per uur stond het gedeelde dagmaximum van 300 vol. Daarna gaven de zoekhulp, de
// vertaling op de patiëntkaart en de vraaghulp een dag lang 429, voor alle praktijken.
// Nu: de zoekhulp alleen met een praktijksessie of eigen beheer, en per praktijk hooguit
// AI_PRAKTIJK_DAG (100) AI-aanroepen per dag, zodat één praktijk (ook een gratis proef of de kaarten
// van één praktijk) het dagmaximum niet voor de rest opmaakt.
// Zonder browser, past in CI. `npm run test:airem`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

// nagebootste AI-dienst
let aiAanvragen = 0;
const ai = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  aiAanvragen++;
  const b = JSON.parse(body || "{}");
  const tekst = b.output_config && b.output_config.format
    ? JSON.stringify({ oefeningen: [{ naam: "Squat", traint: "Kracht van de benen." }] })
    : JSON.stringify({ antwoord: "Houd je rug recht." });
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ content: [{ type: "text", text: tekst }] }));
});
await new Promise((r) => ai.listen(0, "127.0.0.1", r));

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-airem-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const schoon = { ...process.env };
delete schoon.VRAAGHULP;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...schoon, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "",
    ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.address().port}`, VRAAGHULP: "aan",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });

let ipTeller = 1;
const nieuwIp = () => "10.71." + ((ipTeller >> 8) & 255) + "." + (ipTeller++ & 255);
const post = (pad, body, sessie) => fetch(origin + pad, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": nieuwIp(), ...(sessie ? { "x-praktijk-sessie": sessie } : {}) },
  body: JSON.stringify(body)
});
const zoek = { regio: "Knie", doel: "Maximale kracht" };

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // ---- 1. zonder login: geweigerd, en er gaat niets naar de AI-dienst ----
  for (let i = 0; i < 5; i++) {
    const r = await post("/api/assistent", zoek);
    assert.equal(r.status, 401, "zoekhulp zonder login geeft 401 (was " + r.status + ")");
    assert.equal((await r.json()).login, true);
  }
  assert.equal(aiAanvragen, 0, "zonder login geen AI-aanroep");

  // ---- 2. met een praktijksessie: werkt, tot het deel van de praktijk op is ----
  const claim = async (naam) => {
    const r = await post("/api/praktijk/claim", { praktijk: naam, wachtwoord: "geheim-wachtwoord-1", akkoord: true });
    assert.equal(r.status, 200, "claim " + naam);
    return (await r.json()).sessie;
  };
  const sessieA = await claim("Fysio Airem A");
  const sessieB = await claim("Fysio Airem B");
  for (let i = 0; i < 100; i++) {
    const r = await post("/api/assistent", zoek, sessieA);
    assert.equal(r.status, 200, "zoekhulp " + (i + 1) + " van praktijk A werkt (was " + r.status + ")");
    await r.json();
  }
  assert.equal(aiAanvragen, 100);
  const teVeel = await post("/api/assistent", zoek, sessieA);
  assert.equal(teVeel.status, 429, "na 100 per dag stopt praktijk A (vanaf een nieuw adres)");
  assert.match((await teVeel.json()).fout, /deze praktijk/);
  assert.equal(aiAanvragen, 100, "de 101e gaat niet naar de AI-dienst");

  // ---- 3. een andere praktijk en de patiëntkant hebben nog ruimte ----
  const b = await post("/api/assistent", zoek, sessieB);
  assert.equal(b.status, 200, "praktijk B kan de zoekhulp nog gebruiken");
  const v = await post("/api/kaart/vraag", { id: "demo", vraag: "Hoe diep moet ik zakken?", taal: "nl" });
  assert.equal(v.status, 200, "de vraaghulp op de voorbeeldkaart werkt nog");
  assert.equal((await v.json()).ok, true);
  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  console.log("ok: zoekhulp alleen met login, AI-rem per praktijk (100 per dag)");
} finally {
  app.kill();
  ai.close();
  await rm(dataDir, { recursive: true, force: true });
}
