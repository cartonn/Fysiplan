// Regressietest gebruikers-sweep 2026-11-06: de cliëntkaart /k werkt offline al na het
// EERSTE bezoek. Voorheen beheerde de service worker de pagina pas na een herlaad, zodat
// de kaart en /api/kaart van het eerste bezoek nooit in de cache kwamen: offline herladen
// gaf een wit scherm. CI heeft geen Playwright; de statische controle draait altijd, het
// browserdeel alleen waar Playwright staat. `npm run test:offline`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- statisch: de kaart vraagt de werker om te bewaren, de werker filtert veilig ----
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /navigator\.serviceWorker\.ready/, "kaart wacht op de actieve werker");
assert.match(kaart, /postMessage\(\{type:'bewaar',urls:urls\}\)/, "kaart stuurt de geladen adressen");
const sw = await readFile(join(root, "public/kaart-sw.js"), "utf8");
const m = sw.match(/function magBewaren\(pad\) \{[\s\S]*?\n\}/);
assert.ok(m, "magBewaren staat in kaart-sw.js");
const magBewaren = vm.runInNewContext("(" + m[0] + ")");
for (const ok of ["/k/abcdefabcdef", "/api/kaart?id=abcdefabcdef", "/api/kaart/vertaal?id=abcdefabcdef&taal=en",
  "/mobile-media-review.json", "/v2/oefeningen.json", "/img/x.webp"]) assert.equal(magBewaren(ok), true, ok);
for (const nee of ["https://elders.nl/x", "//elders.nl/x", "/uploads/videos/a.mp4", "/api/kaart/gedaan",
  "/api/kaarten?praktijk=x", "/api/praktijk/status", "/api/kaart?id=abc", null, 5]) assert.equal(magBewaren(nee), false, String(nee));

// ---- browser: eerste bezoek, dan offline herladen ----
const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-kaart-offline: geen Playwright, browsercheck overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-offline-"));
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
    "fysio offline": { "truus": { id: "abcdef123456", praktijk: "Fysio Offline", naam: "Truus", ts: Date.now(),
      chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} } }
  }));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  // service workers vereisen een veilige oorsprong: localhost telt als veilig
  const origin = `http://localhost:${port}`;
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
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.9.0.1" } });
    const page = await ctx.newPage();
    await page.goto(origin + "/k/abcdef123456");
    await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    // Wacht tot de werker de pagina en de kaartgegevens bewaard heeft. Bewust met evaluate in een
    // lus en niet met waitForFunction: die wacht niet op een async functie (de Promise zelf telt
    // al als waar), zodat de test offline ging terwijl de werker nog bezig was en de ene keer
    // wel, de andere keer niet slaagde.
    let bewaard = false;
    for (let i = 0; i < 75 && !bewaard; i++) {
      bewaard = await page.evaluate(async () => {
        if (!navigator.serviceWorker.controller) return false;
        for (const n of await caches.keys()) {
          const c = await caches.open(n);
          if ((await c.match("/k/abcdef123456")) && (await c.match("/api/kaart?id=abcdef123456"))) return true;
        }
        return false;
      });
      if (!bewaard) await wacht(200);
    }
    assert.ok(bewaard, "na het eerste bezoek bewaart de werker de kaart en de kaartgegevens");
    if (process.env.DEBUG_OFFLINE) console.log(await page.evaluate(async () => { const o = []; for (const n of await caches.keys()) { const c = await caches.open(n); o.push(n, (await c.keys()).map((r) => r.url)); } return { ctl: !!navigator.serviceWorker.controller, o }; }));
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    const naam = await page.evaluate(() => document.body.innerText.includes("Truus") || document.body.innerText.length > 200);
    assert.ok(naam, "offline na het eerste bezoek: de kaart staat er, geen wit scherm");
    await ctx.close();
    console.log("test-kaart-offline: offline na eerste bezoek werkt");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
} else {
  console.log("test-kaart-offline: statische controle in orde");
}
