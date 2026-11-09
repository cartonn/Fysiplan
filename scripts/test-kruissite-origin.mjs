// Security-routine 2026-11-07 (backlog: gebruikers-sweep, Jayden):
// 1. kruisSite() keek alleen naar Sec-Fetch-Site. Oudere browsers (Safari vóór 16.4)
//    sturen die niet; een andere website kon dan via zo'n browser de pijnscore of
//    "gedaan" van een kaart overschrijven. Nu beslist Origin als Sec-Fetch-Site ontbreekt.
// 2. {"id":["<id>"]} werd via String() stil het kaart-id. Nu telt alleen een echte tekst.
// 3. (2026-11-09) "Sec-Fetch-Site: same-site" liet elk subdomein of elke app op hetzelfde
//    registreerbare domein door. De proefcookie (SameSite=Lax) gaat dan mee, dus zo'n pagina
//    kon /v2/proef/opzeggen, wissen of doorgaan laten posten. Nu telt same-site alleen met
//    een Origin die precies deze host is.
// `npm run test:kruissite`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kruissite-"));
const ID = "c0ffee123456";
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio kruis": {
    "jayden": { id: ID, praktijk: "Fysio Kruis", naam: "Jayden", ts: Date.now(),
      chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} }
  }
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
const meting = (score, extra = {}, id = ID) => fetch(origin + "/api/kaart/meting", {
  method: "POST", body: JSON.stringify({ id, score }),
  headers: { "content-type": "application/json", "x-forwarded-for": "10.33.0." + (ip++), ...extra }
});
const scores = async () => JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio kruis"].jayden.metingen || [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // eigen pagina, moderne browser: mag
  assert.equal((await meting(3, { "sec-fetch-site": "same-origin", origin })).status, 200, "eigen site met Sec-Fetch-Site");
  // eigen pagina, oude browser zonder Sec-Fetch-Site maar met eigen Origin: mag
  assert.equal((await meting(4, { origin })).status, 200, "eigen Origin zonder Sec-Fetch-Site");
  // geen Origin (curl, server-naar-server): blijft zoals het was
  assert.equal((await meting(5)).status, 200, "zonder Origin");
  assert.equal((await scores()).at(-1).s, 5);

  // andere website, moderne browser: geweigerd (was al zo)
  assert.equal((await meting(9, { "sec-fetch-site": "cross-site", origin: "https://evil.example" })).status, 403);
  // andere website, oude browser zonder Sec-Fetch-Site: nu ook geweigerd
  const r = await meting(9, { origin: "https://evil.example" });
  assert.equal(r.status, 403, "vreemde Origin zonder Sec-Fetch-Site wordt geweigerd");
  assert.equal((await meting(9, { origin: "null" })).status, 403, "Origin null (sandbox-iframe) wordt geweigerd");
  assert.equal((await meting(9, { origin: "http://127.0.0.1:1" })).status, 403, "andere poort is een andere site");
  assert.equal((await meting(9, { origin: "rommel" })).status, 403, "onleesbare Origin wordt geweigerd");
  assert.equal((await scores()).at(-1).s, 5, "de pijnscore is niet overschreven");

  // same-site: een subdomein of een buurapp op hetzelfde domein is niet deze site
  const host = new URL(origin).host;
  assert.equal((await meting(9, { "sec-fetch-site": "same-site", origin: "https://x.fysiplan.nl" })).status, 403, "same-site van een subdomein wordt geweigerd");
  assert.equal((await meting(9, { "sec-fetch-site": "same-site" })).status, 403, "same-site zonder Origin wordt geweigerd");
  assert.equal((await scores()).at(-1).s, 5, "de pijnscore is niet overschreven door same-site");
  assert.equal((await meting(6, { "sec-fetch-site": "same-site", origin: "http://" + host })).status, 200, "same-site met precies deze host mag");
  assert.equal((await meting(5, { "sec-fetch-site": "none" })).status, 200, "none (zelf getypt/bladwijzer) blijft toegestaan");
  for (const pad of ["/v2/proef/opzeggen", "/v2/proef/wissen", "/v2/proef/doorgaan"]) {
    const r = await fetch(origin + pad, { method: "POST", redirect: "manual", body: "actie=opzeggen&zeker=1",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.33.2." + (ip++),
        "sec-fetch-site": "same-site", origin: "https://x.fysiplan.nl", cookie: "fpproef=" + "a".repeat(48) } });
    assert.equal(r.status, 403, pad + " weigert een post van een subdomein");
  }

  // id als lijst: geen kaart
  const lijst = await meting(7, {}, [ID]);
  assert.equal(lijst.status, 404, "id als lijst vindt geen kaart");
  const obj = await meting(7, {}, { toString: ID });
  assert.equal(obj.status, 404, "id als object vindt geen kaart");
  assert.equal((await scores()).at(-1).s, 5);
  const gedaan = await fetch(origin + "/api/kaart/gedaan", { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.33.1.1" }, body: JSON.stringify({ id: [ID], i: 0 }) });
  assert.equal(gedaan.status, 404, "ook /api/kaart/gedaan weigert een lijst-id");

  console.log("test-kruissite-origin: ok");
} catch (err) {
  console.error(uit.slice(-2000));
  throw err;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
