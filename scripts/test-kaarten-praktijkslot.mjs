// Regressietest gebruikers-sweep 2026-11-06 (Sanne, Mark): het Kaarten-venster in de v2-app.
// 1) Een proef zonder praktijknaam liep vast: Kaarten toonde geen beveiligingsblok en geen
//    uitleg, terwijl welkom en mail naar "knop Kaarten" verwijzen. Nu vraagt Kaarten de naam.
// 2) Een 429/5xx op de status of de kaartenlijst leek op "nog niet beveiligd" en "nog geen
//    gedeelde kaarten". Nu staat er dat het niet lukte, met "Opnieuw proberen".
// 3) Op telefoon en iPad staand waren Help en de beeldkeuze (lijn/kleur, ook voor de print)
//    weg: v2.css verborg .menu onder 920 px. (Sanne iPhone 14, Mark iPad)
// CI heeft geen Playwright: de statische controle draait altijd, het browserdeel alleen
// waar Playwright staat. `npm run test:praktijkslot`
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
const srv = index.match(/function toonSrvKaarten\(\)\{[\s\S]*?\n  \}\n/);
assert.ok(srv, "toonSrvKaarten gevonden");
assert.doesNotMatch(srv[0], /r\.ok\?r\.json\(\):\[\]/, "een fout bij de kaartenlijst wordt geen lege lijst");
assert.match(srv[0], /toonPraktijknaamVraag\(blok\)/, "zonder praktijknaam vraagt Kaarten de naam (v2)");
const slot = index.match(/function toonPrakSlot\(pr\)\{[\s\S]*?\n  \}\n/);
assert.ok(slot, "toonPrakSlot gevonden");
assert.match(slot[0], /if\(!r\.ok\)throw/, "status-fout wordt niet als 'nog niet beveiligd' gelezen");

const v2css = await readFile(join(root, "public/v2.css"), "utf8");
assert.doesNotMatch(v2css, /header\.topbar \.menu[^{]*\{display:none\}/, "menu met beeldkeuze niet verborgen op smalle schermen");

const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-kaarten-praktijkslot: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-prslot-"));
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
  // het eenmalige welkom opent 400 ms na het laden en kon zo over de knop Kaarten vallen,
  // nadat de test de overlays al had gesloten; hier is het welkom al gezien
  const geenWelkom = (c) => c.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); } catch {} });
  const openKaarten = async (page) => {
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#kaartenBtn");
  };
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    // ---- 1: geen praktijknaam ----
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.2.1" } });
    await geenWelkom(ctx);
    const page = await ctx.newPage();
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate(() => { const p = document.getElementById("praktijk"); p.value = ""; p.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#kaartenBtn");
    await page.waitForSelector("#k_pr_in", { state: "visible", timeout: 5000 });
    await page.click("#k_pr_vraag button[type=submit]");
    assert.match(await page.textContent("#k_pr_fout"), /praktijknaam/, "lege naam geeft een melding");
    await page.fill("#k_pr_in", "Fysio Sweep Slot");
    await page.click("#k_pr_vraag button[type=submit]");
    await page.waitForSelector("#ps_do", { state: "visible", timeout: 5000 });
    assert.equal((await page.textContent("#ps_do")).trim(), "Beveiligen", "na de naam kan de praktijk beveiligd worden");
    assert.equal(await page.inputValue("#praktijk"), "Fysio Sweep Slot", "naam staat ook op de kaart");
    assert.equal(await page.$("#k_pr_vraag"), null, "de vraag verdwijnt na invullen");
    await ctx.close();

    // ---- 2: server druk (429) en storing (503) ----
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.2.2" } });
    await geenWelkom(ctx2);
    const p2 = await ctx2.newPage();
    await p2.route("**/api/praktijk/status**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await p2.route("**/api/kaarten?**", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, fout: "Te veel verzoeken." }) }));
    await p2.goto(origin + "/v2/app");
    await p2.waitForSelector("[data-add]", { timeout: 15000 });
    await p2.evaluate(() => { const p = document.getElementById("praktijk"); p.value = "Fysio Druk"; p.dispatchEvent(new Event("input", { bubbles: true })); });
    await openKaarten(p2);
    await p2.waitForSelector("#k_srv_opnieuw", { timeout: 5000 });
    await p2.waitForSelector("#ps_opnieuw", { timeout: 5000 });
    const lijst = await p2.textContent("#k_srv_lijst");
    assert.doesNotMatch(lijst, /Nog geen gedeelde kaarten/, "429 is geen lege praktijk");
    assert.match(lijst, /niet weg/, "uitleg dat de kaarten niet weg zijn");
    assert.doesNotMatch(await p2.textContent("#ps_status"), /nog niet beveiligd/, "503 is niet 'nog niet beveiligd'");
    assert.equal(await p2.isVisible("#ps_do"), false, "geen Beveiligen-knop bij een storing");
    // herstel: de server antwoordt weer
    await p2.unroute("**/api/praktijk/status**");
    await p2.unroute("**/api/kaarten?**");
    await p2.click("#ps_opnieuw");
    await p2.waitForFunction(() => /nog niet beveiligd/.test(document.getElementById("ps_status").textContent), null, { timeout: 5000 });
    await ctx2.close();
    // ---- 3: beeldkeuze en Help op telefoon en iPad staand ----
    for (const [i, toestel] of ["iPhone 14", "iPad (gen 7)"].entries()) {
      const c3 = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.2." + (10 + i) } });
      await geenWelkom(c3);
      const p3 = await c3.newPage();
      await p3.goto(origin + "/v2/app");
      await p3.waitForSelector("[data-add]", { timeout: 15000 });
      await p3.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
      assert.ok(await p3.isVisible("#beeldKeuze [data-v2-beeld]"), "beeldkeuze zichtbaar op " + toestel);
      assert.ok(await p3.isVisible("#menuHelp"), "Help zichtbaar op " + toestel);
      const sw = await p3.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(sw <= 0, "geen horizontaal scrollen op " + toestel + " (" + sw + ")");
      await c3.close();
    }
    console.log("test-kaarten-praktijkslot: naam vragen in Kaarten, storing ≠ leeg, beeldkeuze op telefoon/iPad");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
