// Regressietest gebruikers-sweep 2026-11-10 14u (Truus, 72, iPhone SE met 200 % tekst):
// - de elf pijncijfers liepen in elkaar over ("910"): elk vak is 26 px breed en het cijfer was 32 px;
// - in "Herinnering in je agenda" stak de knop "Zo" rechts buiten beeld (raster 1fr krimpt niet onder de tekst).
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:grotelettersk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /\.mschaal button\{font-size:min\(1rem,[\d.]+vw\)/, "pijncijfers groeien niet groter dan hun vak");
assert.match(html, /\.agdagen\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/, "dagknoppen krimpen mee met het scherm");
assert.match(html, /\.agdagen button\{[^}]*min-width:0;[^}]*font:600 min\(/, "daglabel past in het vak");
console.log("test-kaart-grote-letters (statisch): pijncijfers en dagknoppen passen ook bij grote letters");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-grote-letters: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-grotelet-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://localhost:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    browser = await pw.chromium.launch();
    for (const [toestel, groot] of [["iPhone SE", "200%"], ["iPhone SE", "100%"], ["Pixel 7", "200%"]]) {
      const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.62.0.1" } });
      // tekstgrootte van de telefoon nabootsen: de kaart rekent alles in rem
      await c.addInitScript((g) => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "html{font-size:" + g + " !important}"; document.head.appendChild(s); }); }, groot);
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      await p.waitForFunction(() => document.querySelectorAll("#mschaal button").length === 11);
      const tag = toestel + " " + groot;

      // pijncijfers: elk cijfer past in zijn vak en raakt het buurcijfer niet
      const cijfers = await p.evaluate(() => [...document.querySelectorAll("#mschaal button")].map((b) => {
        const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(), k = b.getBoundingClientRect();
        return { c: b.textContent.trim(), past: b.scrollWidth <= b.clientWidth, tl: t.left, tr: t.right, kl: k.left, kr: k.right };
      }));
      assert.deepEqual(cijfers.filter((x) => !x.past || x.tl < x.kl - 0.5 || x.tr > x.kr + 0.5).map((x) => x.c), [], tag + ": elk pijncijfer past in zijn vak");
      for (let i = 1; i < cijfers.length; i++) assert.ok(cijfers[i].tl - cijfers[i - 1].tr >= 2, tag + ": " + cijfers[i - 1].c + " en " + cijfers[i].c + " lopen niet in elkaar over");

      // agenda: alle zeven dagen binnen het scherm
      await p.evaluate(() => { const d = document.getElementById("agdagen").closest("details"); d.open = true; d.scrollIntoView(); });
      const dagen = await p.evaluate(() => [...document.querySelectorAll("#agdagen button")].map((b) => {
        const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), r: r.right, past: b.scrollWidth <= b.clientWidth + 1, h: r.height };
      }));
      const breed = await p.evaluate(() => document.documentElement.clientWidth);
      assert.equal(dagen.length, 7);
      assert.deepEqual(dagen.filter((d) => d.r > breed || !d.past).map((d) => d.t), [], tag + ": alle dagknoppen binnen beeld");
      assert.ok(dagen.every((d) => d.h >= 44), tag + ": dagknoppen blijven 44 px hoog");
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, tag + ": niets steekt opzij uit");
      assert.deepEqual(fouten, [], tag + ": geen scriptfouten");
      await c.close();
    }
    console.log("test-kaart-grote-letters: pijncijfers en dagknoppen passen op iPhone SE en Pixel 7, ook bij 200 % tekst");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
