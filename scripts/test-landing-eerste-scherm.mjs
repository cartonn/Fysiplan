// Landing: gerichte reparaties uit de platformreview (hoofdstuk 9, reviewlijst punt 16).
// - Eén prijskaart, met daaronder één zin voor de eerste 25 praktijken; geen teller met de hand.
// - De voorbeeldkaart is een echte knop naast "Probeer gratis".
// - Op 1440 bij 900 staan de kop en beide knoppen in beeld; de banner zelf blijft gelijk.
// Statisch altijd; het browserdeel alleen waar Playwright staat. `npm run test:landingscherm`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/v2.html"), "utf8");
assert.equal((html.match(/<div class="plan[ "]/g) || []).length, 1, "één prijskaart");
assert.doesNotMatch(html, /Oprichterspraktijken|__OPRICHTERS_REGEL__/, "geen tweede kaart en geen teller");
assert.match(html, /<p class="oprichters">__OPRICHTERS_ZIN__<\/p>/);
assert.match(html, /<div class="cta"><a class="knop oranje" href="\/v2\/proef">[^<]*<span[^>]*>[^<]*<\/span><\/a><a class="knop omlijnd" href="\/k\/demo"/, "voorbeeldkaart als knop naast Probeer gratis");
assert.match(html, /\.reference-banner\{--knip:/, "de banner wordt alleen afgedekt, niet vervangen");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-landingscherm-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const pagina = await (await fetch(origin + "/v2")).text();
  assert.match(pagina, /De eerste 25 praktijken krijgen er 60 dagen begeleide start bij/);
  assert.doesNotMatch(pagina, /__[A-Z_]+__|Nog \d+ plek/);

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-landing-eerste-scherm: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      for (const [w, h, knip] of [[1440, 900, true], [1440, 1200, false], [1920, 1080, true], [390, 844, false]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        await page.goto(origin + "/v2");
        const m = await page.evaluate(() => {
          const r = (s) => document.querySelector(s).getBoundingClientRect();
          const b = document.querySelector(".reference-banner");
          return { h1: r(".hero h1").top, knoppen: [...document.querySelectorAll(".hero .cta .knop")].map((k) => k.getBoundingClientRect().bottom),
            knip: parseFloat(getComputedStyle(b).marginBottom) || 0, label: r(".reference-banner .ai-beeld").bottom, zichtbaar: r(".reference-banner").bottom + (parseFloat(getComputedStyle(b).marginBottom) || 0),
            ratio: b.getBoundingClientRect().width / b.getBoundingClientRect().height, breed: document.documentElement.scrollWidth };
        });
        assert.ok(Math.abs(m.ratio - 766 / 332) < 0.01, w + "x" + h + ": de banner houdt zijn verhouding");
        assert.equal(m.breed, w, w + "x" + h + ": geen horizontaal scrollen");
        assert.ok(m.label <= m.zichtbaar, w + "x" + h + ": het AI-bijschrift blijft zichtbaar");
        assert.equal(m.knip < 0, knip, w + "x" + h + ": afdekken alleen waar nodig");
        if (w > 700) {
          assert.equal(m.knoppen.length, 2);
          for (const k of m.knoppen) assert.ok(k <= h, w + "x" + h + ": knop in beeld (" + Math.round(k) + ")");
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }
  console.log("test-landing-eerste-scherm: ok (één prijskaart, voorbeeldkaart als knop, kop en knoppen in beeld op 1440 bij 900)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
