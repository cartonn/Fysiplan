// Gebruikers-sweep 2026-11-15 02u (Truus, iPhone SE, 200 % tekst): in de oefenweergave van /k is de vaste
// onderbalk ("Vandaag gedaan" + Klaar) bij 200 % ~206 px hoog, maar de pagina hield onderaan maar 132 px vrij.
// De pijnregel ("stop bij toenemende pijn en overleg met je fysiotherapeut") viel half onder de balk.
// Nu volgt de ruimte onderaan de echte hoogte van de balk (--sbalk-h).
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:sessie200`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /body\.sessie \.wrap\{[^}]*padding-bottom:max\([^}]*var\(--sbalk-h/, "ruimte onderaan volgt de balk");
assert.match(kaart, /function volgSessiebalk\(\)\{[\s\S]{0,400}setProperty\('--sbalk-h'/, "hoogte van de balk als variabele");
assert.match(kaart, /getElementById\('sessiebalk'\)\.hidden=!open;\s*volgSessiebalk\(\);/, "bijgewerkt bij openen en sluiten");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-sessie-200: broncontrole groen (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sessie200-"));
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
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.5." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Sessie200";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wachtwoord-sessie200", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const r = await post("/api/kaarten", { praktijk: P, naam: "Mees", client: { c_naam: "Mees" },
    chosen: [{ n: "360 graden ademhaling – eerste fase rustig", id: "fp_8d4fb0f3f39ab16e", i: 0 }, { n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }],
    kaartId: "" }, S);
  const { id } = await r.json();
  assert.ok(id, "kaart gedeeld");

  for (const zoom of ["100%", "200%"]) {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.6." + (ip++) } });
    await ctx.addInitScript((z) => {
      const zet = () => { if (document.documentElement) { document.documentElement.style.setProperty("-webkit-text-size-adjust", z); document.documentElement.style.fontSize = z; } };
      zet(); document.addEventListener("DOMContentLoaded", zet);
    }, zoom);
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
    if (await page.locator("#privok").isVisible().catch(() => false)) await page.tap("#privok");
    await page.tap("#oefs .oef[data-oidx='0'] .oefinfo");
    await page.waitForSelector("body.sessie #sessiebalk:not([hidden])");
    for (let i = 0; i < 4; i++) { await page.evaluate(() => scrollTo(0, 1e6)); await wacht(250); }
    const m = await page.evaluate(() => {
      const balk = document.getElementById("sessiebalk").getBoundingClientRect();
      // laatste zichtbare tekst op de pagina (de vaste kop en balk zelf niet meegerekend)
      let onder = 0;
      document.querySelectorAll("body *").forEach((e) => {
        if (e.closest("#sessiebalk,#sessiekop") || e.children.length) return;
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        if (r.height > 0 && cs.visibility !== "hidden" && cs.position !== "fixed" && e.textContent.trim() && e.offsetParent !== null) onder = Math.max(onder, r.bottom);
      });
      return { balkTop: balk.top, balkH: balk.height, onder };
    });
    assert.ok(m.onder <= m.balkTop + 1, zoom + ": einde van de oefening boven de onderbalk (" + JSON.stringify(m) + ")");
    assert.deepEqual(fouten, [], zoom);
    await ctx.close();
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
console.log("test-sweep-sessie-200: OK");
