// Regressietest gebruikers-sweep 2026-11-16 (praktijkhouder op iPad): bij een eigen behandelkaart waren
// "Delen met de praktijk" en "Verwijderen" tekstlinkjes van 15 px hoog en de knoppen erboven 38 px.
// Op een aanraakscherm zijn ze nu minstens 44 px; op desktop met muis blijft het rustige linkje.
// CI heeft geen Playwright: de statische controle draait altijd, het browserdeel alleen waar Playwright staat.
// `npm run test:sjabloonipad`
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
assert.match(css, /@media screen and \(pointer:coarse\)\{\n(?:  [^\n]*\n)*?  html\.v2 \.sjb-link\{[^}]*min-height:44px/, "sjabloonlinks 44 px op aanraakschermen");
assert.match(css, /\.sjb-vb-acties \.btn\{height:44px\}/, "sjabloonknoppen 44 px op aanraakschermen");
console.log("test-sjabloon-ipad (statisch): sjabloonknoppen groot genoeg op aanraakschermen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sjabloon-ipad: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sjab-ipad-"));
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
  const P = "Fysio Sjabloon iPad";
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const claim = await fetch(origin + "/api/praktijk/claim", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.66.0.1" },
      body: JSON.stringify({ praktijk: P, wachtwoord: "sjabloon-wachtwoord-1", akkoord: true }) });
    assert.equal(claim.status, 200);
    const sessie = (await claim.json()).sessie;
    const eigen = [{ naam: "Mijn knieschema", sub: "Jouw behandelkaart (alleen op dit apparaat)", persoonlijk: true,
      oefeningen: [{ n: "Bruggen beginner" }, { n: "Squat" }] }];
    browser = await pw.chromium.launch();
    for (const [toestel, opts] of [["iPad staand", pw.devices["iPad (gen 7)"]], ["iPad liggend", pw.devices["iPad (gen 7) landscape"]], ["desktop", { viewport: { width: 1280, height: 800 } }]]) {
      const ctx = await browser.newContext({ ...opts, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.66.1.1" } });
      await ctx.addInitScript(([t, pr, e]) => { try {
        localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
        localStorage.setItem("fysiplan_eigen_sjablonen", e);
      } catch {} }, [sessie, P, JSON.stringify(eigen)]);
      const page = await ctx.newPage();
      const fouten = []; page.on("pageerror", (e) => fouten.push(e.message));
      page.on("dialog", (d) => d.dismiss().catch(() => {}));
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("[data-add]", { timeout: 15000 });
      await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); }, P);
      await page.evaluate(() => document.getElementById("sjabBtn").click());
      await page.waitForSelector("#ovSjab.on [data-sjsel='eigen:0']", { timeout: 8000 });
      await page.evaluate(() => document.querySelector("#ovSjab [data-sjsel='eigen:0']").click());
      await page.waitForSelector("#sj_voorbeeld .sjb-link.rood", { timeout: 8000 });
      const maten = await page.evaluate(() => [...document.querySelectorAll("#sj_voorbeeld .sjb-link, #sj_voorbeeld .sjb-vb-acties .btn")]
        .map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })));
      assert.ok(maten.some((m) => /Delen met de praktijk/.test(m.t)), toestel + ": Delen met de praktijk staat er");
      assert.ok(maten.some((m) => /^Verwijderen$/.test(m.t)), toestel + ": Verwijderen staat er");
      if (toestel !== "desktop") {
        const klein = maten.filter((m) => m.h < 44);
        assert.deepEqual(klein, [], toestel + ": knoppen bij een eigen behandelkaart minstens 44 px");
        // de knoppen blijven naast elkaar binnen het voorbeeld en lopen niet over de rand
        const buiten = await page.evaluate(() => { const v = document.getElementById("sj_voorbeeld").getBoundingClientRect();
          return [...document.querySelectorAll("#sj_voorbeeld .sjb-link")].filter((b) => { const r = b.getBoundingClientRect(); return r.left < v.left - 1 || r.right > v.right + 1; }).length; });
        assert.equal(buiten, 0, toestel + ": links vallen niet buiten het voorbeeld");
      } else {
        const link = maten.find((m) => /^Verwijderen$/.test(m.t));
        assert.ok(link.h < 30, "desktop: Verwijderen blijft een rustig linkje (" + link.h + ")");
      }
      assert.deepEqual(fouten, [], toestel + ": geen scriptfouten");
      await ctx.close();
    }
    console.log("test-sjabloon-ipad: Delen/Verwijderen en knoppen bij een eigen behandelkaart 44 px op iPad staand en liggend, desktop ongewijzigd");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
