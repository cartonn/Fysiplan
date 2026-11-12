// Regressietest gebruikers-sweep 2026-11-12 02u (Truus, 72, iPhone SE met 200 % tekst):
// in de vergrote foto ("Houdingen") bleef de uitleg 12,5 px, de bronregel 11 px (contrast 3,76:1) en de ondertitel en
// de oefennaam 15 px, terwijl de rest van de kaart meegroeide. Oorzaak: vaste px in public/kaart.html in plaats van rem.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:houdingengroot`
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
const regel = (sel) => { const i = html.indexOf(sel + "{"); assert.ok(i >= 0, sel + " bestaat"); return html.slice(i, html.indexOf("}", i)); };
for (const sel of [".lightbox .lbnaam", ".lightbox .demotekst", ".lightbox .demouitleg", ".lightbox .demobron", ".lightbox .lbknop"]) {
  const r = regel(sel);
  assert.match(r, /font:\d{3} [\d.]+rem\//, sel + ": lettergrootte in rem, zodat hij meegroeit met de telefoon");
}
// contrast van de bronregel op wit: minstens 4,5:1
const kleur = /color:#([0-9a-f]{6})/i.exec(regel(".lightbox .demobron"))[1];
const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = 1.05 / (lum(kleur) + 0.05);
assert.ok(contrast >= 4.5, "bronregel in de vergrote foto leesbaar op wit (" + contrast.toFixed(2) + ":1)");
console.log("test-kaart-houdingen-groot (statisch): tekst in de vergrote foto in rem, bronregel " + contrast.toFixed(2) + ":1");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-houdingen-groot: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-houdingen-"));
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
    const meet = async (groot) => {
      const c = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.64.0.1" } });
      await c.addInitScript((g) => { const zet = () => { const s = document.createElement("style"); s.textContent = "html{font-size:" + g + " !important}"; document.documentElement.appendChild(s); };
        if (document.documentElement) zet(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); zet(); } }).observe(document, { childList: true }); }, groot);
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      // eerste oefenfoto met twee houdingen openen; de demonstratie start vanzelf
      const knoppen = await p.$$(".fotoknop");
      let open = false;
      for (const k of knoppen) {
        await k.evaluate((e) => e.click());
        for (let i = 0; i < 30 && !open; i++) { open = await p.evaluate(() => !document.getElementById("lbdemo").hidden && !!document.querySelector("#lbdemo .demouitleg")); if (!open) await wacht(100); }
        if (open) break;
        await p.evaluate(() => document.getElementById("lbsluit").click());
        await wacht(200);
      }
      assert.ok(open, groot + ": een foto met houdingen opent de demonstratie");
      const m = await p.evaluate(() => {
        const px = (s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
        const uit = [...document.querySelectorAll("#lightbox, #lightbox *")].filter((e) => !e.closest("[hidden]") && getComputedStyle(e).display !== "none")
          .map((e) => e.getBoundingClientRect()).filter((q) => q.width && (q.right > innerWidth + 1 || q.left < -1)).length;
        return { naam: px("#lbnaam"), tekst: px("#lightbox .demotekst"), uitleg: px("#lightbox .demouitleg"), bron: px("#lightbox .demobron"), uit };
      });
      assert.deepEqual(fouten, [], groot + ": geen scriptfouten");
      await c.close();
      return m;
    };
    const gewoon = await meet("100%");
    const groot = await meet("200%");
    assert.ok(gewoon.uitleg >= 13, "100 %: uitleg minstens 13 px (" + gewoon.uitleg + ")");
    assert.ok(gewoon.bron >= 12, "100 %: bronregel minstens 12 px (" + gewoon.bron + ")");
    for (const k of ["naam", "tekst", "uitleg"]) if (gewoon[k]) assert.ok(groot[k] >= gewoon[k] * 1.9, "200 %: " + k + " groeit mee (" + gewoon[k] + " → " + groot[k] + " px)");
    if (gewoon.bron) assert.ok(groot.bron >= gewoon.bron * 1.9, "200 %: bronregel groeit mee (" + gewoon.bron + " → " + groot.bron + " px)");
    assert.equal(groot.uit, 0, "200 %: niets in de vergrote foto steekt buiten beeld");
    console.log("test-kaart-houdingen-groot: uitleg " + gewoon.uitleg + " → " + groot.uitleg + " px, naam " + gewoon.naam + " → " + groot.naam + " px bij 200 %");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await wacht(200);
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}
