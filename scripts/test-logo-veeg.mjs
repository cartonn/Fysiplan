// Security-routine 2026-11-07 (audit uploads): na een nieuw logo veegde POST /api/praktijken
// alle bestanden weg die met `logo-<slug>-` beginnen. Die prefix is ook het begin van de
// logo's van andere praktijken: een (onbeveiligde) praktijk "Fysio" wiste zo het logo van
// "Fysio Noord", en een praktijk "P" dat van elke praktijk met een vaste code (p-<hex>).
// Zonder inloggen, dus over de grens van de eigen praktijk. Nu ruimt de veeg alleen
// bestanden op die precies `logo-<slug>-<tijd>.<ext>` heten en die geen ander profiel noemt.
// `npm run test:logoveeg`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-logoveeg-"));
const up = join(dataDir, "uploads");
await mkdir(up, { recursive: true });
// geldige (minimale) PNG-kop + opvulling: echteAfbeelding kijkt naar de magische bytes
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const CODE = "p-0123456789abcdef";
const slachtoffers = ["logo-fysio-noord-1700000000000.png", `logo-${CODE}-1700000000001.png`, "logo-fysio-1-1700000000002.png"];
for (const f of slachtoffers) await writeFile(join(up, f), png);
// eigen wees van "Fysio" uit het verleden: die mag wél weg
await writeFile(join(up, "logo-fysio-1600000000000.png"), png);
await writeFile(join(dataDir, "praktijken.json"), JSON.stringify({
  "fysio noord": { praktijk: "Fysio Noord", adres: "Noordweg 1", logo: "uploads/" + slachtoffers[0] },
  [CODE]: { praktijk: "Fysio Code", adres: "Codeweg 1", logo: "uploads/" + slachtoffers[1] },
  "fysio 1": { praktijk: "Fysio 1", adres: "Eenweg 1", logo: "uploads/" + slachtoffers[2] }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const profiel = (praktijk) => fetch(origin + "/api/praktijken", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.44.0." + (ip++) },
  body: JSON.stringify({ praktijk, adres: "Ergens 1", logo: "data:image/png;base64," + png.toString("base64") })
});
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // aanvaller zonder login: praktijk "Fysio" (prefix van "Fysio Noord" en "Fysio 1")
  let r = await profiel("Fysio");
  assert.equal(r.status, 200, "nieuw profiel met logo");
  const eigen = (await r.json()).logo.split("/").pop();
  // aanvaller zonder login: praktijk "P" (prefix van elke praktijkcode p-<hex>)
  assert.equal((await profiel("P")).status, 200);
  // tweede logo voor "Fysio": de eerste moet dan weg (eigen opruiming blijft werken)
  await wacht(5);
  r = await profiel("Fysio");
  const eigen2 = (await r.json()).logo.split("/").pop();

  const over = await readdir(up);
  for (const f of slachtoffers) assert.ok(over.includes(f), `logo van een andere praktijk is weggeveegd: ${f}`);
  assert.ok(over.includes(eigen2), "nieuw eigen logo staat er");
  assert.ok(!over.includes(eigen), "vorig eigen logo is opgeruimd");
  assert.ok(!over.includes("logo-fysio-1600000000000.png"), "eigen wees uit het verleden is opgeruimd");
  console.log("test-logo-veeg: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
