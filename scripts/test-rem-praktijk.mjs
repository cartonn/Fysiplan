// Security-routine 2026-11-09 20u, audit (i) denial of service / backlog MIDDEL "schrijfrem per IP":
// de schrijfrem (40 per 5 min) en leesrem (120) telden per IP voor álles. Een praktijk achter één
// wifi liep na ±40 gewone handelingen tegen 429 aan, en dan ook de patiënten op dat netwerk.
// Nu: met een geldige praktijksessie telt een verzoek per praktijk (200 schrijven / 600 lezen per
// 5 min) plus een ruimere bak voor alle sessies op één IP (400 / 1200); anonieme verzoeken
// (patiënt, inloggen, aanmelden) houden de oude rem per IP.
// `npm run test:rempraktijk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-rempraktijk-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "test-" + Math.random().toString(16).slice(2), ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (pad, body, ip, extra = {}) => fetch(origin + pad, {
  method: "POST",
  headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", "x-forwarded-for": ip, ...extra },
  body: JSON.stringify(body)
});
const get = (pad, ip, extra = {}) => fetch(origin + pad, { headers: { "x-forwarded-for": ip, ...extra } });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // een praktijk achter één wifi (10.90.0.1)
  const WIFI = "10.90.0.1";
  const c = await post("/api/praktijk/claim", { praktijk: "Fysio Wifi", wachtwoord: "wachtwoord-wifi", akkoord: true }, WIFI);
  assert.equal(c.status, 200);
  const S = { "x-praktijk-sessie": (await c.json()).sessie };

  // 1) 80 gewone schrijfacties van het team: geen 429 meer (was 429 vanaf de 40e)
  for (let i = 0; i < 80; i++) {
    const r = await post("/api/praktijken", { praktijk: "Fysio Wifi", adres: "Laan " + i }, WIFI, S);
    assert.equal(r.status, 200, "schrijfactie " + (i + 1) + " van de praktijk geeft " + r.status);
  }
  // 2) 150 keer lezen (inbox/overzicht verversen): geen 429 (was 429 vanaf de 120e)
  for (let i = 0; i < 150; i++) {
    const r = await get("/api/praktijk/status", WIFI, S);
    assert.notEqual(r.status, 429, "leesactie " + (i + 1) + " van de praktijk geeft 429");
  }
  // 3) een patiënt (of inlogpoging) op dezelfde wifi heeft er geen last van
  const anoniem = await post("/api/praktijk/login", { praktijk: "Fysio Wifi", wachtwoord: "fout-fout-fout" }, WIFI);
  assert.notEqual(anoniem.status, 429, "anoniem verzoek op dezelfde wifi wordt niet geremd door het team");

  // 4) anoniem blijft per IP geremd: 41e schrijfactie van één IP zonder sessie → 429
  let laatste = 0;
  for (let i = 0; i < 41; i++) laatste = (await post("/api/praktijken", { praktijk: "Iets", adres: "X" }, "10.91.0.1")).status;
  assert.equal(laatste, 429, "anonieme schrijfrem per IP werkt nog (41e = " + laatste + ")");

  // 5) een sessie is geen vrijbrief: per praktijk hooguit 200 schrijfacties per 5 min, ook vanaf wisselende IP's
  let n429 = 0;
  for (let i = 0; i < 140; i++) {
    const r = await post("/api/praktijken", { praktijk: "Fysio Wifi", adres: "Weg " + i }, "10.92.0." + (i % 250), S);
    if (r.status === 429) n429++;
  }
  // 80 + 140 = 220 → de laatste 20 geweigerd
  assert.equal(n429, 20, "praktijkrem van 200 per 5 min (geweigerd: " + n429 + ")");
  // 6) een ongeldige sessie telt gewoon per IP (geen omzeiling met een nep-kop)
  for (let i = 0; i < 41; i++) laatste = (await post("/api/praktijken", { praktijk: "Iets", adres: "X" }, "10.93.0.1", { "x-praktijk-sessie": "nep-" + i })).status;
  assert.equal(laatste, 429, "nep-sessie omzeilt de IP-rem niet");

  console.log("ok: schrijf- en leesrem per praktijk met sessie, anoniem per IP");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
