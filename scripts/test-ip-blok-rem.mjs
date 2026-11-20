// Security (2026-11-20 16u): IPv6 telde alleen per /64. Wie een /48 heeft (een gratis tunnel geeft
// er al een, veel hosters ook) heeft 65.536 blokken van /64 en kreeg zo 65.536 keer de rem:
// - aanmelden voor de proef: 10 per uur per /64. Met één /48 vulde iemand binnen het uur de grens van
//   5000 aanmeldingen (daarna kon 44 dagen niemand meer een proef starten) en liet Fysiplan 5000
//   welkomstmails naar willekeurige adressen sturen.
// - kaartlinks raden: 30 missers per 5 minuten per /64, dus ~2 miljoen per 5 minuten per /48.
// Nu telt naast de /64 ook het /48-blok (IPv4: het /24-blok) met een ruimere grens.
// Zonder browser. `npm run test:ipblokrem`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ipBlok } from "../lib/ip-sleutel.js";

// ---- de sleutel van het blok ----
assert.equal(ipBlok("2001:db8:1:2:3:4:5:6"), "2001:db8:1::/48");
assert.equal(ipBlok("2001:DB8:0001:ffff::1"), "2001:db8:1::/48");
assert.equal(ipBlok("[2001:db8:1::9]"), "2001:db8:1::/48");
assert.equal(ipBlok("2001:db8::1"), "2001:db8:0::/48");
assert.equal(ipBlok("203.0.113.77"), "203.0.113.0/24");
assert.equal(ipBlok("::ffff:203.0.113.77"), "203.0.113.0/24");
assert.equal(ipBlok("onzin"), "onzin");

// ---- runtime ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-ip-blok-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$)/.test(k)) delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { if (uitvoer.length < 20000) uitvoer += c; });
app.stderr.on("data", (c) => { if (uitvoer.length < 20000) uitvoer += c; });
const adres = (i) => ["praktijk" + i, "fysio-zonnig.nl"].join("@");
const aanmelden = (ip, i) => fetch(origin + "/v2/proef", { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, "sec-fetch-site": "same-origin" },
  body: new URLSearchParams({ email: adres(i), naam: "Anna de Vries", tel: "0687654321", praktijk: "Zonnig " + i, akkoord: "1", vwo: "1" }).toString() });
const kaart = (ip, id) => fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": ip } });
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // 1. aanmelden: 40 verschillende /64's uit één /48
  let gelukt = 0, geremd = 0;
  for (let i = 0; i < 40; i++) {
    const r = await aanmelden("2001:db8:7:" + i.toString(16) + "::1", i);
    if (r.status === 303) gelukt++; else if (r.status === 429) geremd++;
  }
  assert.equal(gelukt, 30, "uit één /48 hooguit 30 aanmeldingen per uur (was: alle 40, één per /64)");
  assert.equal(geremd, 10, "de rest krijgt 429");
  // een ander /48 merkt er niets van
  assert.equal((await aanmelden("2001:db8:8::1", 100)).status, 303, "een ander /48 kan gewoon aanmelden");
  // de oude grens per /64 blijft
  for (let i = 0; i < 10; i++) await aanmelden("2001:db8:9:1::" + (i + 1), 200 + i);
  assert.equal((await aanmelden("2001:db8:9:1::ff", 300)).status, 429, "11e aanmelding uit één /64 blijft 429");

  // 2. kaartlinks raden: 20 /64's × 30 missers uit één /48
  const id = (n) => ("x" + n.toString(36)).padEnd(8, "q");
  let mis = 0, rem = 0, n = 0;
  for (let b = 0; b < 20; b++) {
    for (let j = 0; j < 30; j++) {
      const r = await kaart("2001:db8:aa:" + b.toString(16) + "::" + (j + 1), id(n++));
      if (r.status === 404) mis++; else if (r.status === 429) rem++;
    }
  }
  assert.equal(mis, 480, "uit één /48 hooguit 480 missers per 5 minuten (was: 600, 30 per /64)");
  assert.equal(rem, 120, "daarna 429");
  // ook een vers /64 in dat /48 is geblokkeerd, ook voor een id dat mis is
  assert.equal((await kaart("2001:db8:aa:ff::1", id(9999))).status, 429, "vers /64 in een geblokkeerd /48: 429");
  // een ander /48 merkt er niets van
  assert.equal((await kaart("2001:db8:bb::1", id(10000))).status, 404, "een ander /48 krijgt gewoon 404");
  console.log("test:ipblokrem: alles goed");
} catch (err) {
  console.error(uitvoer.slice(-3000));
  throw err;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
