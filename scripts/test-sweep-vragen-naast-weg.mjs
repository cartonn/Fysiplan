// Regressietest gebruikers-sweep 2026-11-13 10u (HOOG, Mark, iPad staand en liggend): een tik op of
// net naast de "?" (vaste vragen) op een oefening van de kaart raakte het tikvlak van de × en
// verwijderde de oefening zonder vraag, met dosering en al. De "?" stond vast op left:40px en schaalde
// niet mee met de ingezoomde kaart (--a4z), terwijl het tikvlak van de × (24 + 2×10 px, gedeeld door
// --a4z) in een smal vakje over de "?" heen viel.
// Nu: op een tablet staat de "?" linksboven met dezelfde maat en hetzelfde tikvlak als de andere knopjes,
// en de tikvlakken van "?", × en eigen video overlappen elkaar nergens.
// CI heeft geen Playwright: de statische controle draait altijd, het iPad-deel alleen waar Playwright staat.
// `npm run test:vragennaastweg`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.match(css, /html\.v2 #a4 \.pic \.vv[^{]*\{[^}]*calc\([^)]*var\(--a4z/, "de \"?\" schaalt op een tablet mee met de ingezoomde kaart (--a4z)");

const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-sweep-vragen-naast-weg: geen Playwright, iPad-check overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vvnaast-"));
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
  const browser = await pw.chromium.launch();
  const rnVersie = (await readFile(join(root, "public/release-notes.js"), "utf8")).match(/version='([^']+)'/)[1];
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    let n = 0;
    for (const toestel of ["iPad (gen 7)", "iPad (gen 7) landscape", "iPad Pro 11", "iPad Mini"]) {
      const ctx = await browser.newContext({ ...pw.devices[toestel], extraHTTPHeaders: { "x-forwarded-for": "10.9.7." + (++n) } });
      await ctx.addInitScript((v) => { try { localStorage.setItem("fysiplan_release_seen", v); } catch {} }, rnVersie);
      const page = await ctx.newPage();
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("[data-add]", { timeout: 15000 });
      // twaalf oefeningen: de vakjes zijn dan het smalst
      await page.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
      for (let k = 0; k < 12; k++) await page.evaluate((k) => document.querySelectorAll("[data-add]")[k].click(), k);
      await page.waitForFunction(() => document.querySelectorAll("#a4 .pic .vv").length >= 6, null, { timeout: 10000 });
      await wacht(400);
      const r = await page.evaluate(() => {
        const fouten = [];
        const vakjes = [...document.querySelectorAll("#a4 .pic")].filter((p) => p.querySelector(".vv"));
        // tikvlak = de knop plus zijn ::after
        const vlak = (el) => {
          const b = el.getBoundingClientRect(), a = getComputedStyle(el, "::after");
          const k = el.offsetWidth ? b.width / el.offsetWidth : 1; // ingezoomde kaart: css-px → scherm-px
          const z = (kant) => (a.content && a.content !== "none" ? -(parseFloat(a[kant]) || 0) * k : 0);
          return { l: b.left - z("left"), t: b.top - z("top"), r: b.right + z("right"), b: b.bottom + z("bottom"), w: b.width };
        };
        const overlapt = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
        for (const [i, p] of vakjes.entries()) {
          p.scrollIntoView({ block: "center" });
          const vv = p.querySelector(".vv"), rm = p.querySelector(".rm"), vid = p.querySelector(".vid");
          if (getComputedStyle(vv).display === "none") { fouten.push(i + ": ? onzichtbaar"); continue; }
          const v = vlak(vv), x = vlak(rm), d = vid ? vlak(vid) : null;
          if (overlapt(v, x)) fouten.push(i + ": tikvlak ? overlapt × " + JSON.stringify({ v, x }));
          if (d && overlapt(v, d)) fouten.push(i + ": tikvlak ? overlapt eigen video");
          if (v.w < 20) fouten.push(i + ": ? kleiner dan 20 px (" + v.w + ")"); // was 19,8 px; liggend is het vakje maar 72 px hoog: drie stroken van 30 %
          // tikken in en net naast de "?" raakt de "?", nooit de ×
          const b = vv.getBoundingClientRect();
          for (const [dx, dy] of [[0.5, 0.5], [0.95, 0.5], [0.5, 0.95], [1.2, 0.5], [1.2, 1.2]]) {
            const el = document.elementFromPoint(b.left + b.width * dx, b.top + b.height * dy);
            if (el && el.closest(".rm")) fouten.push(i + ": tik op ? (" + dx + "," + dy + ") raakt ×");
            else if (dx <= 1 && dy <= 1 && !(el && el.closest(".vv"))) fouten.push(i + ": tik midden in ? raakt " + (el && el.className));
          }
        }
        return { aantal: vakjes.length, fouten };
      });
      assert.ok(r.aantal >= 6, toestel + ": vakjes met ? gevonden: " + r.aantal);
      assert.deepEqual(r.fouten, [], toestel + ": " + r.fouten.slice(0, 4).join(" | "));
      // echt tikken op de "?" opent de vaste vragen en laat de oefening staan
      const voor = await page.locator("#a4 .pic .vv").count();
      await page.locator("#a4 .pic .vv").first().scrollIntoViewIfNeeded();
      await page.locator("#a4 .pic .vv").first().tap();
      await wacht(300);
      assert.equal(await page.locator("#a4 .pic .vv").count(), voor, toestel + ": tik op ? verwijdert geen oefening");
      await ctx.close();
    }
    console.log("test-sweep-vragen-naast-weg: \"?\" en × overlappen nergens op vier iPads (staand en liggend)");
  } catch (e) {
    console.error(uit.slice(-1500));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
