// Security 2026-11-15 20u (DoS): de QR naar de voorbeeldkaart op /v2/proef werd per Host-kop
// gemaakt en bewaard in een Map zonder grens. Elk verzoek met een andere Host-kop (bv. het eigen
// domein met een poort van 15.000 cijfers) bleef voor altijd in het geheugen staan; zonder inloggen
// liep het geheugen van de server zo vol. Nu: een begrensde cache (lib/qr-cache.js) en eigenHost
// neemt alleen een echte host (hooguit 253 tekens, poort hooguit 5 cijfers) over.
// Zonder browser (draait ook in CI). `npm run test:qrcachegrens`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maakQrCache } from "../lib/qr-cache.js";

// 1) de cache blijft begrensd en houdt de laatst gebruikte
let gemaakt = 0;
const qr = maakQrCache(async (url, px) => { gemaakt++; return "<svg>" + px + url + "</svg>"; }, 4);
for (let i = 0; i < 500; i++) await qr("https://h" + i + ".voorbeeld/k/demo", 112);
assert.equal(qr.grootte(), 4, "de cache groeit niet mee met het aantal hosts");
gemaakt = 0;
await qr("https://h499.voorbeeld/k/demo", 112);
assert.equal(gemaakt, 0, "de laatst gebruikte staat nog in de cache");
await qr("https://h0.voorbeeld/k/demo", 112);
assert.equal(gemaakt, 1, "een verdrongen host wordt opnieuw gemaakt");
const fout = maakQrCache(async () => { throw new Error("stuk"); }, 2);
assert.equal(await fout("https://x/k/demo", 1), "", "een fout geeft een lege QR, geen crash");

// 2) runtime: een absurde poort in de Host-kop geeft dezelfde QR als het eigen domein
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-qr-cache-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const pagina = (host) => new Promise((ok, nee) => {
  get({ host: "127.0.0.1", port, path: "/v2/proef", headers: { host } }, (r) => {
    let t = ""; r.setEncoding("utf8"); r.on("data", (c) => { t += c; }); r.on("end", () => ok({ status: r.statusCode, t }));
  }).on("error", nee);
});
const qrVak = (t) => { const m = t.match(/<div class="qrvak">([\s\S]*?)<p>/); return m ? m[1] : null; };
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await pagina("127.0.0.1")).status === 200) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const dom = ["fysiplan", "nl"].join(".");
  const gewoon = await pagina(dom);
  assert.equal(gewoon.status, 200);
  const svg = qrVak(gewoon.t);
  assert.ok(svg && svg.includes("<svg"), "de proefpagina heeft een QR naar de voorbeeldkaart");
  for (const host of [dom + ":" + "9".repeat(15000), dom + ":123456", "a".repeat(300) + "." + dom]) {
    const r = await pagina(host);
    assert.equal(r.status, 200);
    assert.equal(qrVak(r.t), svg, "een onechte host (" + host.length + " tekens) geeft de QR van het eigen domein");
  }
  // een echte poort blijft gewoon werken (bv. lokaal testen)
  const lokaal = await pagina("localhost:8080");
  assert.ok(qrVak(lokaal.t).includes("<svg") && qrVak(lokaal.t) !== svg, "een echte poort krijgt een eigen QR");
  console.log("ok test:qrcachegrens");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
