// Security 2026-11-18: één proef beveiligt hooguit MAX_PRAKTIJKEN_PER_PROEF (3) praktijken.
// Zonder grens vulde één proefcookie met `nieuw: true` en wisselende verbindingen de grens van
// 1000 praktijkaccounts, waarna niemand meer een praktijk kon beveiligen. Een andere proef merkt
// niets. `npm run test:proefpraktijkgrens` (faalt zonder de fix: de vierde claim gaf 200)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefgrens-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const tokenA = randomBytes(24).toString("hex");
const tokenB = randomBytes(24).toString("hex");
const adres = (n) => ["proef" + n, "voorbeeld.nl"].join("@");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proefa0000000001: { id: "proefa0000000001", email: adres("a"), naam: "Anna Proef", tel: "+31612340010",
    gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, akkoord: "x", tokens: [sha(tokenA)] },
  proefb0000000001: { id: "proefb0000000001", email: adres("b"), naam: "Bram Proef", tel: "+31612340011",
    gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, akkoord: "x", tokens: [sha(tokenB)] }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "",
    PROEF_VERPLICHT: "aan", EIGEN_LOGIN_VERPLICHT: "uit" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });

let ip = 0;
// elke claim een eigen verbinding, zoals een aanvaller met wisselende adressen (de rem van 5 per dag per adres helpt dan niet)
const claim = (naam, token) => fetch(origin + "/api/praktijk/claim", { method: "POST",
  headers: { "content-type": "application/json", cookie: "fpproef=" + token, "x-forwarded-for": "10.77." + (++ip) + ".1" },
  body: JSON.stringify({ praktijk: naam, wachtwoord: "lang-genoeg-1", akkoord: true, nieuw: true }) });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  for (let i = 1; i <= 3; i++) assert.equal((await claim("Fysio Grens", tokenA)).status, 200, "claim " + i + " met proef A");
  const vierde = await claim("Fysio Grens", tokenA);
  assert.equal(vierde.status, 403, "vierde praktijk met dezelfde proef geweigerd");
  const j = await vierde.json();
  assert.equal(j.proefVol, true);
  assert.match(j.fout, /al 3 praktijken/);
  assert.equal((await claim("Andere naam", tokenA)).status, 403, "ook onder een andere naam");

  const accs = JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
  assert.equal(Object.values(accs).filter((a) => a.proef?.id === "proefa0000000001").length, 3, "precies 3 aan proef A");

  // een andere proef merkt niets
  assert.equal((await claim("Fysio Grens", tokenB)).status, 200, "proef B beveiligt gewoon");

  console.log("Proef-praktijkgrens: alle controles geslaagd.");
} catch (err) {
  console.error(uit);
  throw err;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
