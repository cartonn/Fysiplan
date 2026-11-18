// Nette foutpagina voor de V2-kant (praktijk-routine, 2026-11-13). Een verkeerd getypt adres
// onder /v2/ gaf het inlogscherm of de app van V1 (status 200), en een serverfout bij het
// openen van een pagina gaf kale JSON. Nu: 404/500 als HTML in de huisstijl, met de weg terug.
// V1 en fetch-verzoeken uit de app houden hun oude antwoord. `npm run test:foutpagina`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { foutpaginaHtml, isV2Pad, wilPagina } from "../lib/foutpagina.js";

// --- puur: wie krijgt een pagina, en wat staat erop
assert.equal(wilPagina({ method: "GET", headers: { "sec-fetch-dest": "document" } }), true);
assert.equal(wilPagina({ method: "GET", headers: { "sec-fetch-dest": "empty", accept: "text/html" } }), false, "fetch uit de app");
assert.equal(wilPagina({ method: "GET", headers: { accept: "text/html,application/xhtml+xml" } }), true);
assert.equal(wilPagina({ method: "GET", headers: { accept: "application/json" } }), false);
assert.equal(wilPagina({ method: "POST", headers: { "sec-fetch-dest": "document" } }), false, "formulieren houden hun eigen antwoord");
assert.equal(isV2Pad("/v2/apps"), true);
assert.equal(isV2Pad("/v2"), false);
assert.equal(isV2Pad("/admin88"), false);
for (const st of [404, 500]) {
  const h = foutpaginaHtml(st);
  assert.match(h, /<html lang="nl">/);
  assert.match(h, /name="robots" content="noindex"/);
  assert.match(h, /href="\/v2\/app"/);
  assert.match(h, /href="\/v2"/);
  assert.doesNotMatch(h, /<script/i, "scriptloos");
  assert.doesNotMatch(h, /https?:\/\//, "geen externe bronnen");
  assert.ok(h.includes("Foutcode " + st));
}
assert.match(foutpaginaHtml(500), /niets kwijt/);

// --- tegen een echte server
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-foutpagina-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["server.js"], { cwd: root, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "test-foutpagina-sleutel", NODE_ENV: "test" } });
let log = "";
server.stdout.on("data", (d) => { log += d; });
server.stderr.on("data", (d) => { log += d; });
const PAGINA = { "sec-fetch-dest": "document", accept: "text/html" };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/health")).ok) break; } catch {} await wacht(150); }

  for (const pad of ["/v2/apps", "/v2/proef/bestaatniet", "/v2/oude-link/123"]) {
    const r = await fetch(base + pad, { headers: PAGINA, redirect: "manual" });
    const t = await r.text();
    assert.equal(r.status, 404, pad + " geeft 404");
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(r.headers.get("content-security-policy") || "", /default-src 'none'/);
    assert.match(r.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(t, /Deze pagina bestaat niet/, pad);
    assert.doesNotMatch(t, /<script/i);
  }
  // de bestaande V2-pagina's blijven werken
  for (const pad of ["/v2", "/v2/app", "/v2/proef"]) {
    const r = await fetch(base + pad, { headers: PAGINA, redirect: "manual" });
    assert.ok(r.status === 200 || r.status === 303 || r.status === 302, pad + " " + r.status);
  }
  // V1 verandert niet: een onbekend adres buiten /v2 loopt het oude vangnet in (geen 404-pagina)
  const v1 = await fetch(base + "/iets-onbekends", { headers: PAGINA, redirect: "manual" });
  assert.notEqual(v1.status, 404);
  assert.doesNotMatch(await v1.text(), /Deze pagina bestaat niet/);
  // een fetch uit de app (geen document) krijgt niet de foutpagina
  const f = await fetch(base + "/v2/apps", { headers: { "sec-fetch-dest": "empty" } });
  assert.doesNotMatch(await f.text(), /Deze pagina bestaat niet/);
  console.log("test-foutpagina: ok");
} catch (err) {
  console.error(log.slice(-2000));
  throw err;
} finally {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
