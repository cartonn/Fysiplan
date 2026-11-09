// Gebruikers-sweep 2026-11-09 (Sanne, desktop 1280): zodra de QR op de A4 stond, duwde de rij deelknoppen
// (WhatsApp · E-mail · Kopieer link · Kopieer voor dossier) het QR-blok 170–200 px breed, en kromp het
// Roepnaam-veld (en Leeftijd, max. HF, Trainingszone) tot ±25 px. Nu mag die rij afbreken en is het blok smal.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:qrroepnaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.match(css, /html\.v2 #a4 \.qrblok\{max-width:\d+px\}/, "QR-blok heeft een maximale breedte");
assert.match(css, /html\.v2 #a4 \.qrblok>span\{flex-wrap:wrap/, "deelknoppen onder de QR breken af");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("qr roepnaam: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-qrroep-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  for (const breed of [1280, 1600]) {
    const ctx = await browser.newContext({ viewport: { width: breed, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.7.9." + (breed % 200) } });
    const p = await ctx.newPage();
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("#qrBlok", { state: "attached", timeout: 15000 });
    // dezelfde opbouw als toonQr() in index.html (QR, onderschrift, bekijk-link, rij deelknoppen)
    const r = await p.evaluate(() => {
      const b = document.getElementById("qrBlok");
      const a = (t) => "<a href='#' style='color:#2456a6;text-decoration:underline'>" + t + "</a>";
      b.innerHTML = "<svg viewBox='0 0 10 10'></svg><small>Scan voor de digitale kaart</small>" +
        "<a class='no-print' href='#' style='font-size:10.5px'>Bekijk zelf hoe je patiënt hem ziet</a>" +
        "<span class='no-print' style='display:flex;gap:9px;margin-top:3px;font-size:10.5px'>" +
        a("WhatsApp") + a("E-mail") + a("Kopieer link") + a("Kopieer voor dossier") + "</span>";
      b.style.display = "flex";
      const w = (el) => Math.round(el.getBoundingClientRect().width);
      return { naam: w(document.getElementById("c_naam")), qr: w(b) };
    });
    assert.ok(r.naam >= 90, `Roepnaam-veld met QR op ${breed} px is ${r.naam} px breed (QR-blok ${r.qr} px)`);
    await ctx.close();
  }
  console.log("qr roepnaam: ok (Roepnaam-veld blijft bruikbaar naast de QR)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
