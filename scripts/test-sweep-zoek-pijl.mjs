// Regressietest gebruikers-sweep 2026-11-13 10u (HOOG, Sanne, desktop toetsenbord): zoeken, pijl omlaag en Enter
// zette bij de tweede zoekterm stil de 2e treffer op de kaart, bij de derde de 3e, enzovoort: de pijltjespositie
// van de vorige zoekopdracht liep door. Nu begint elke nieuwe zoekterm (en elk ander filter) weer bij de eerste treffer.
// CI heeft geen Playwright: de statische controle draait altijd, het browserdeel alleen waar Playwright staat.
// `npm run test:zoekpijl`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /getElementById\('search'\)\.addEventListener\('input',function\(e\)\{[^}]*keyboardIndex=-1/, "nieuwe zoekterm zet de pijltjeskeuze terug");
assert.match(index, /curG=b\.dataset\.g;keyboardIndex=-1;/, "andere categorie zet de pijltjeskeuze terug");

const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-sweep-zoek-pijl: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-zoekpijl-"));
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
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const rnVersie = (await readFile(join(root, "public/release-notes.js"), "utf8")).match(/version='([^']+)'/)[1];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.9.6.1" } });
    await ctx.addInitScript((v) => { try { localStorage.setItem("fysiplan_release_seen", v); } catch {} }, rnVersie);
    const page = await ctx.newPage();
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    const opKaart = () => page.evaluate(() => [...document.querySelectorAll("#a4 .pic")].filter((p) => p.querySelector(".rm")).length);
    const begin = await opKaart();
    const termen = ["brug", "plank", "squat", "kuit"];
    for (const [i, term] of termen.entries()) {
      await page.focus("#search");
      await page.fill("#search", "");
      await page.keyboard.type(term);
      await wacht(150);
      const eerste = await page.evaluate(() => { const r = document.querySelector("#list .row"); return r && r.dataset.id; });
      assert.ok(eerste, term + ": treffers");
      await page.keyboard.press("ArrowDown");
      const gekozen = await page.evaluate(() => { const r = document.querySelector("#list .row.keyboard-focus"); return r && r.dataset.id; });
      assert.equal(gekozen, eerste, term + " (zoekopdracht " + (i + 1) + "): pijl omlaag kiest de eerste treffer");
      await page.keyboard.press("Enter");
      await wacht(150);
    }
    assert.equal(await opKaart(), begin + termen.length, "elke zoekopdracht zette precies één oefening erbij");
    await ctx.close();
    console.log("test-sweep-zoek-pijl: pijl omlaag kiest na elke nieuwe zoekterm de eerste treffer");
  } catch (e) {
    console.error(uit.slice(-1500));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
