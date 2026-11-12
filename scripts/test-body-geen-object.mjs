// Security-routine 2026-11-12, audit (h) foutmeldingen: een JSON-body die geen object is
// ("null", [], "x", 5) gaf op /api/praktijk/akkoord, /api/praktijk/team, /team/eigen-login en
// /team/sein-mail een 500 met "Cannot read properties of null" in het serverlog. Nu 400.
// Statisch: elke route die de body buiten een try leest, controleert daarna of het een object is.
// `npm run test:bodygeenobject`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// -- statisch --
const bron = (await readFile(join(root, "server.js"), "utf8")).split("\n");
let gezien = 0;
bron.forEach((regel, i) => {
  if (!/^\s*try \{ b = JSON\.parse\(await readBody\(request[^)]*\)\); \} catch \{ await sendJson/.test(regel)) return;
  gezien++;
  const volgende = bron.slice(i + 1, i + 3).join("\n");
  assert.match(volgende, /typeof b !== "object"/, "server.js r. " + (i + 1) + ": body na JSON.parse niet op object gecontroleerd");
});
assert.ok(gezien >= 3, "verwacht minstens 3 routes die de body buiten een try lezen, gezien " + gezien);

// -- runtime --
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-bodyobject-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const post = (pad, body, sessie) => fetch(origin + pad, { method: "POST", body,
  headers: { "content-type": "application/json", "x-forwarded-for": "10.44.0." + (ip++), ...(sessie ? { "x-praktijk-sessie": sessie } : {}) } });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", JSON.stringify({ praktijk: "Fysio Body", wachtwoord: "body-wachtwoord-1", akkoord: true }));
  assert.equal(claim.status, 200);
  const sessie = (await claim.json()).sessie;
  assert.match(sessie, /^[a-f0-9]{48}$/);
  for (const pad of ["/api/praktijk/akkoord", "/api/praktijk/team", "/api/praktijk/team/eigen-login", "/api/praktijk/team/sein-mail"]) {
    for (const body of ["null", "[]", '"x"', "5", "true"]) {
      const r = await post(pad, body, sessie);
      assert.equal(r.status, 400, pad + " met body " + body + " gaf " + r.status);
      const lijf = await r.json();
      assert.equal(lijf.ok, false);
    }
  }
  // gewone verzoeken werken nog
  assert.equal((await post("/api/praktijk/team/sein-mail", JSON.stringify({ aan: true }), sessie)).status, 200);
  await wacht(100);
  assert.doesNotMatch(uit, /verzoek mislukt|Cannot read properties/, "geen fout in het serverlog:\n" + uit);
  console.log("test:bodygeenobject ok");
} finally {
  app.kill();
  await wacht(200);
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
