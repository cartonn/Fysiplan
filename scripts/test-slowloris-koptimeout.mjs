// Regressietest security 2026-11-18 (i) — slowloris: een half-open verbinding die de koppen nooit
// afmaakt, hield met de Node-standaard (headersTimeout 60 s) een socket een volle minuut bezet. Er is
// geen verbindingsplafond in server.js, dus veel zulke verbindingen kunnen de server vasthouden.
// De fix zet server.headersTimeout op 20 s met een veegbeurt elke 5 s, zodat de verbinding na ~25 s
// dichtgaat. Deze test opent één rauwe socket, stuurt een onvolledige kopregel (nooit de afsluitende
// lege regel) en eist dat de server de verbinding binnen 40 s sluit. Zonder de fix (standaard 60 s,
// veegbeurt 30 s) blijft de socket op 40 s nog open en faalt de test. Eén socket, geen flood, past in CI.
// `npm run test:slowloris`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-slowloris-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["ser" + "ver.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const t0 = Date.now();
  const dicht = await new Promise((res) => {
    const sock = net.connect(port, "127.0.0.1");
    const klaar = (hoe) => { try { sock.destroy(); } catch {} res(hoe); };
    sock.on("connect", () => {
      // een begonnen maar nooit afgemaakte kop: geen afsluitende lege regel
      sock.write("GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Traag: ");
      // elke 5 s één byte, zoals een slowloris; de server hoort de verbinding toch te snoeien
      const traag = setInterval(() => { try { sock.write("a"); } catch { clearInterval(traag); } }, 5000);
      sock.on("close", () => clearInterval(traag));
    });
    sock.on("close", () => klaar(Date.now() - t0));
    sock.on("error", () => klaar(Date.now() - t0));
    setTimeout(() => klaar(null), 40000).unref();
  });

  assert.notEqual(dicht, null, "de half-open verbinding is na 40 s nog open: server.headersTimeout snoeit slowloris niet (was 60 s)");
  console.log(`half-open verbinding gesloten na ${Math.round(dicht / 1000)} s (grens 20 s, standaard was 60 s)`);
  assert.ok(dicht < 40000, "binnen 40 s gesloten");
  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-slowloris-koptimeout: half-open verbinding wordt binnen de koptimeout gesloten");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode != null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
