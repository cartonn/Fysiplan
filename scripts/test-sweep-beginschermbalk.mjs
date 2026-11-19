// Gebruikers-sweep 2026-11-19 (Truus, iPhone SE 100–140 %): de vaste balk "Zet op beginscherm" (83–130 px hoog)
// lag over het einde van /k. De kaart hield onderaan maar 32 px ruimte, dus de voettekst en de Privacy-link
// bleven eronder, ook helemaal naar beneden gescrold.
// Nu krijgt de kaart zolang de balk echt zichtbaar is (body.abaan) zijn hoogte als extra ruimte onderaan,
// en verdwijnt die ruimte weer als de balk weg is.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:beginschermbalk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /body\.abaan \.wrap\{padding-bottom:calc\(var\(--ab-h,0px\)/, "ruimte onder de kaart zolang de balk staat");
assert.match(kaartHtml, /abRuimteBijhouden\(banner\);/, "de balk wordt bijgehouden");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("beginschermbalk: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-abbalk-"));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.9.31.1", ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Beginscherm";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "beginscherm-wachtwoord", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus B.", client: { c_naam: "Truus B." },
    chosen: [{ n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");
  const browser = await pw.chromium.launch();
  try {
    for (const zoom of ["100%", "125%", "140%"]) {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.32." + zoom.length } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await page.evaluate((z) => { document.documentElement.style.fontSize = z; window.dispatchEvent(new Event("resize")); }, zoom);
      await wacht(300);
      // de balk komt normaal 2,5 s na de eerste pijnscore of "gedaan"; hier zetten we hem rechtstreeks aan
      await page.evaluate(() => { document.getElementById("ab_tekst").textContent = "Zet deze kaart op je beginscherm: tik op Delen en kies Zet op beginscherm."; document.getElementById("appbanner").classList.add("aan"); });
      await wacht(200);
      const meet = () => page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const ab = document.getElementById("appbanner");
        const zicht = getComputedStyle(ab).display !== "none";
        const link = document.getElementById("privlink").getBoundingClientRect();
        return { zicht, abTop: ab.getBoundingClientRect().top, linkOnder: link.bottom, abaan: document.body.classList.contains("abaan") };
      });
      await wacht(100);
      let m = await meet();
      await wacht(150);
      m = await meet();
      if (m.zicht) {
        assert.ok(m.abaan, zoom + ": body.abaan staat zolang de balk zichtbaar is");
        assert.ok(m.linkOnder <= m.abTop, zoom + ": Privacy-link valt niet meer onder de balk " + JSON.stringify(m));
      } else {
        assert.ok(!m.abaan, zoom + ": geen extra ruimte als de balk verborgen is (body.krap)");
      }
      await page.click("#ab_weg").catch(() => {});
      await page.evaluate(() => document.getElementById("appbanner").classList.remove("aan"));
      await wacht(150);
      const na = await page.evaluate(() => document.body.classList.contains("abaan"));
      assert.equal(na, false, zoom + ": ruimte weg zodra de balk weg is");
      assert.deepEqual(fouten, [], zoom + ": geen scriptfouten");
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log("beginschermbalk: ok (iPhone SE 100/125/140 %: Privacy-link blijft boven de balk, ruimte weg na sluiten)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
