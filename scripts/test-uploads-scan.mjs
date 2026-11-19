// Regressietest security 2026-11-19: elk verzoek naar /uploads/ doorzocht alle kaarten van alle praktijken
// (`verwijzingen`), zonder login en zonder rem, ook voor een logo, een bibliotheekvideo of een pad dat niet
// bestaat. Bij veel kaarten hield zo elke anonieme aanvraag de server milliseconden bezig. Nu zoekt de server
// alleen nog voor een eigen opname, en pas als het verzoek die ooit mag zien (tijdelijke link, sessie, v1-login
// of beheer). De test vult de datamap met 150.000 kaarten en vergelijkt de duur van een anonieme aanvraag naar
// een eigen opname met die van een kale doorverwijzing. Zonder de fix is die verhouding vele malen hoger.
// Zonder browser, past in CI. `npm run test:uploadsscan`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer, get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uploadsscan-"));
const N = 150000;
const kaarten = {};
const hex = (i, n) => i.toString(16).padStart(n, "0");
for (let i = 0; i < N; i++) {
  const pk = "praktijk " + (i % 50);
  (kaarten[pk] ||= {})["k" + i] = { id: hex(i, 12), praktijk: pk, chosen: [], vids: { ["o" + i]: "uploads/videos/v-" + hex(i, 16) + ".mp4" } };
}
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(kaarten));
await mkdir(join(dataDir, "uploads", "videos"), { recursive: true });
await writeFile(join(dataDir, "uploads", "videos", "v-" + hex(7, 16) + ".mp4"), Buffer.alloc(64));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const app = spawn(process.execPath, ["ser" + "ver.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const vraag = (pad) => new Promise((resolve, reject) => {
  const t = process.hrtime.bigint();
  get({ host: "127.0.0.1", port, path: pad, agent: false }, (res) => {
    res.resume();
    res.on("end", () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t) / 1e6 }));
  }).on("error", reject);
});
const mediaan = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
async function meet(pad, n = 25) {
  const tijden = [];
  let status = 0;
  for (let i = 0; i < n; i++) { const r = await vraag(pad); tijden.push(r.ms); status = r.status; }
  return { status, ms: mediaan(tijden) };
}

try {
  for (let i = 0; i < 300; i++) { try { if ((await vraag("/health")).status === 200) break; } catch {} await wacht(100); }
  await meet("/proef", 5); // opwarmen
  const basis = await meet("/proef");
  assert.equal(basis.status, 301);
  const opname = await meet("/uploads/videos/v-" + hex(7, 16) + ".mp4");
  assert.equal(opname.status, 404, "eigen opname zonder link of login blijft dicht");
  const onbekend = await meet("/uploads/bestaat-niet.png");
  console.log(`mediaan bij ${N} kaarten: doorverwijzing ${basis.ms.toFixed(2)} ms, anonieme opname ${opname.ms.toFixed(2)} ms, onbekend pad ${onbekend.ms.toFixed(2)} ms`);
  const grens = basis.ms * 4 + 3;
  assert.ok(opname.ms < grens, `anonieme aanvraag naar een eigen opname doorzoekt geen kaarten meer (${opname.ms.toFixed(2)} ms ≥ ${grens.toFixed(2)} ms)`);
  assert.ok(onbekend.ms < grens, `onbekend pad onder /uploads/ doorzoekt geen kaarten meer (${onbekend.ms.toFixed(2)} ms ≥ ${grens.toFixed(2)} ms)`);
  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-uploads-scan: /uploads/ doorzoekt de kaarten alleen nog voor wie een eigen opname mag zien");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode != null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
