// Gebruikers-sweep 2026-11-13 06u (Truus, iPhone SE): "Jouw verloop" met veertien pijnscores was op
// 320 px onleesbaar ("01-1102-1003-10…" door elkaar, eerste en laatste datum afgekapt) en bij 200 %
// tekst + A A werd de pagina breder dan het scherm. Nu tekent /k zoveel staven als er passen en
// alleen datums die niet overlappen, in de taal van de kaart.
// Statisch altijd (CI); browser alleen met Playwright. `npm run test:verloopsmal`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /function tekenVerloop\(lijst\)/, "verloop tekent via tekenVerloop");
assert.doesNotMatch(kaart, /'<span class="mdat">'\+\('0'\+d\.getDate\(\)\)/, "geen vaste dd-mm onder elke staaf meer");
assert.match(kaart, /toLocaleDateString\(datumLocale\(\),\{day:'numeric',month:'numeric'\}\)/, "datum in de taal van de kaart");
assert.match(kaart, /if\(VERLOOP\)try\{tekenVerloop\(VERLOOP\);\}catch\(e\)\{\}/, "A A tekent het verloop opnieuw");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-verloopsmal: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-verloop-"));
  const dag = 864e5, nu = Date.now();
  const metingen = Array.from({ length: 14 }, (_, i) => ({ t: nu - (13 - i) * dag, s: [3, 7, 10, 2, 5, 8, 1, 6, 9, 4, 10, 3, 7, 5][i] }));
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
    "fysio verloop": { "truus": { id: "a1b2c3d4e5f7", praktijk: "Fysio Verloop", naam: "Truus", ts: nu - 20 * dag,
      chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Brug", id: "", i: 1 }], rows: {}, cells: {}, vids: {}, metingen } }
  }));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = ""; app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    let n = 1;
    for (const [naam, groot, aa, taal] of [["100 %", false, false, "nl"], ["200 %", true, false, "nl"], ["200 % + A A", true, true, "nl"], ["Engels", false, false, "en"]]) {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], viewport: { width: 320, height: 568 }, locale: taal === "en" ? "en-GB" : "nl-NL",
        extraHTTPHeaders: { "x-forwarded-for": "10.7.3." + (n++) } });
      await ctx.addInitScript(([g, a]) => {
        try { localStorage.setItem("fp_groot", a ? "1" : ""); } catch {}
        if (!g) return;
        const zet = () => { if (document.documentElement) { document.documentElement.style.fontSize = "200%"; return true; } return false; };
        if (!zet()) { const o = new MutationObserver(() => { if (zet()) o.disconnect(); }); o.observe(document, { childList: true }); }
      }, [groot, aa]);
      const page = await ctx.newPage();
      const fouten = []; page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/k/a1b2c3d4e5f7" + (taal === "en" ? "?taal=en" : ""));
      await page.waitForSelector("#mbars .mbar", { state: "attached", timeout: 15000 });
      await page.locator("#mhist").scrollIntoViewIfNeeded().catch(() => {});
      await wacht(200);
      const m = await page.evaluate(() => {
        const el = document.getElementById("mbars"), box = el.getBoundingClientRect();
        const lab = [...el.querySelectorAll(".mdat")].filter((l) => l.textContent.trim()).map((l) => { const r = l.getBoundingClientRect(); return { l: r.left, r: r.right, t: l.textContent }; });
        const val = [...el.querySelectorAll(".mval")].map((v) => { const r = v.getBoundingClientRect(); return { l: r.left, r: r.right }; });
        return { breed: document.documentElement.scrollWidth, vw: innerWidth, box: { l: box.left, r: box.right }, lab, val, staven: el.children.length };
      });
      if (process.env.SCREENSHOT_DIR) await page.locator("#mhist").screenshot({ path: join(process.env.SCREENSHOT_DIR, "verloop-" + naam.replace(/\W+/g, "") + ".png") });
      assert.equal(m.breed, m.vw, naam + ": geen horizontaal scrollen (" + m.breed + ")");
      assert.ok(m.lab.length >= 2, naam + ": minstens twee datums");
      for (let i = 1; i < m.lab.length; i++) assert.ok(m.lab[i].l >= m.lab[i - 1].r, naam + ": datums overlappen niet (" + m.lab[i - 1].t + " / " + m.lab[i].t + ")");
      for (let i = 1; i < m.val.length; i++) assert.ok(m.val[i].l >= m.val[i - 1].r - 0.5, naam + ": scores overlappen niet");
      for (const l of m.lab) assert.ok(l.l >= m.box.l - 0.5 && l.r <= m.box.r + 0.5, naam + ": datum " + l.t + " binnen het vak");
      const vandaag = new Date();
      const verwacht = vandaag.toLocaleDateString(taal === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "numeric" });
      assert.equal(m.lab[m.lab.length - 1].t, verwacht, naam + ": de laatste datum is vandaag");
      assert.ok(m.staven >= 3 && m.staven <= 14, naam + ": aantal staven " + m.staven);
      assert.deepEqual(fouten, [], naam + ": geen fouten");
      await ctx.close();
    }
    console.log("test-verloopsmal: browser OK");
  } catch (e) { console.error(uit.slice(-1500)); throw e; }
  finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
}
console.log("PASS verloop op een smal scherm: staven en datums passen, ook bij 200 % en A A");
