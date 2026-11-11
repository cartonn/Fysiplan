// Gebruikers-sweep 2026-11-11 (Truus, iPhone SE, Duitse kaart): de storingsmelding op /k stond alleen
// in het Nederlands en Engels, en zei altijd "geen verbinding", ook als de server een 500/503/429 gaf.
// Nu: melding in elke taal van de kaart, en bij een serverfout een eigen tekst ("ligt niet aan je internet").
// Code altijd (CI); de browsercontrole alleen waar Playwright staat. `npm run test:storingtaal`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const talen = (naam) => {
  const m = html.match(new RegExp("var " + naam + "=\\{([\\s\\S]*?)\\};"));
  assert.ok(m, naam + " gevonden");
  return [...m[1].matchAll(/(?:^|[{,\s])([a-z]{2}):[\[{]/g)].map((x) => x[1]);
};
const storing = talen("STORING");
for (const t of talen("NIETGEVONDEN")) assert.ok(storing.includes(t), `storingsmelding ook in ${t}`);
assert.ok(storing.includes("nl"), "storingsmelding in het Nederlands");
assert.match(html, /toonStoring\(res\[0\]&&res\[0\]\.status\)/, "status van de server gaat mee naar de melding");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-storing-taal: geen Playwright, browserdeel overgeslagen"); }
if (!pw) { console.log(`Storingsmelding (statisch): ${storing.length} talen.`); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-storingtaal-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  browser = await pw.chromium.launch();
  const gevallen = [
    ["de", 503, "Gerade nicht erreichbar", "druk"],
    ["de", 0, "Gerade keine Verbindung", "net"],
    ["nl", 500, "Het lukt even niet", "druk"],
    ["nl", 0, "Even geen verbinding", "net"],
    ["en", 429, "Not working right now", "druk"],
    ["tr", 502, "Şu anda çalışmıyor", "druk"]
  ];
  let n = 0;
  for (const [taal, status, kop, soort] of gevallen) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, locale: "nl-NL", serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": `10.74.0.${++n}` } });
    const p = await ctx.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(e.message));
    await p.route("**/api/kaart?id=*", (r) => status ? r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: false, error: "x" }) }) : r.abort("internetdisconnected"));
    await p.goto(`${origin}/k/abc123def456?taal=${taal}`, { waitUntil: "load" });
    await p.waitForSelector("#storing", { state: "visible" });
    const m = await p.evaluate(() => ({ kop: document.getElementById("storing_kop").textContent, soort: document.getElementById("storing").dataset.soort, lang: document.documentElement.lang }));
    assert.equal(m.kop, kop, `${taal} ${status || "geen verbinding"}: kop`);
    assert.equal(m.soort, soort);
    assert.equal(m.lang, taal, `${taal}: paginataal past bij de melding`);
    assert.deepEqual(fouten, [], "geen scriptfouten");
    await ctx.close();
  }
  console.log(`Storingsmelding (browser): ${gevallen.length} gevallen in de taal van de kaart, serverfout apart van geen verbinding.`);
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
