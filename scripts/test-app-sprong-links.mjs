// Regressietest gebruikers-sweep 2026-11-12 02u (Sanne, desktop, alleen toetsenbord): in /v2/app zaten ruim 2.000
// tabstops vóór de kaart en Kaarten (elke oefenrij heeft een ster en een plus), zonder sprongkoppeling, en de ster en
// de plus noemden de oefening niet ("favoriet", "op kaart zetten"). Nu: drie sprongkoppelingen bovenaan die pas bij
// focus zichtbaar worden, een zoekveld met uitleg voor pijltjes + Enter, en knoppen met de oefennaam. v1 (/) blijft gelijk.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:spronglinks`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.match(appHtml, /function bouwSprongLinks\(\)\{/, "sprongkoppelingen worden gebouwd");
assert.match(appHtml, /if\(window\.FYSIPLAN_V2\)\{[\s\S]{0,400}bouwSprongLinks\(\);/, "alleen in V2");
assert.match(appHtml, /\(IS_V2\?esc\(o\.naam\)\+": favoriet":"favoriet"\)/, "ster noemt de oefening in V2");
assert.match(appHtml, /\(IS_V2\?esc\(o\.naam\)\+": ":""\)\+\(has\?"van kaart halen"/, "plus noemt de oefening in V2");
assert.match(css, /html\.v2 \.spronglinks a:focus\{position:static/, "sprongkoppeling zichtbaar bij focus");
console.log("test-app-sprong-links (statisch): sprongkoppelingen en knoppen met oefennaam aanwezig");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-app-sprong-links: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sprong-"));
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.65.0.1" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/v2/app", { waitUntil: "networkidle" });
    // welkom van een nieuwe gebruiker wegdoen
    // welkom en daarna eventueel "Nieuw in Fysiplan" wegdoen
    for (let i = 0; i < 6; i++) { await wacht(400); if (!(await page.$(".ov.on"))) break; await page.keyboard.press("Escape"); }
    assert.equal(await page.$(".ov.on"), null, "geen venster meer open");
    // de sprongkoppelingen zijn de eerste drie tabstops van de pagina (documentvolgorde, zonder tabindex > 0)
    const eersteDrie = await page.evaluate(() => {
      const sel = "a[href],button,input,select,textarea,[tabindex]";
      return [...document.querySelectorAll(sel)].filter((e) => !e.disabled && e.tabIndex >= 0 && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden" && (e.getClientRects().length || e.closest("#sprongLinks")))
        .slice(0, 3).map((e) => e.id);
    });
    assert.deepEqual(eersteDrie, ["sprong_zoek", "sprong_kaart", "sprong_kaarten"], "sprongkoppelingen zijn de eerste tabstops");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("[tabindex]")].filter((e) => e.tabIndex > 0).length), 0, "geen tabindex > 0 die ervoor springt");
    // onzichtbaar zonder focus, zichtbaar en 44 px hoog met focus; Tab loopt de drie langs
    const verstopt = await page.evaluate(() => { const r = document.getElementById("sprong_zoek").getBoundingClientRect(); return r.right < 0; });
    assert.ok(verstopt, "sprongkoppeling onzichtbaar zonder focus");
    await page.evaluate(() => document.getElementById("sprong_zoek").focus());
    const eerste = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { id: a.id, l: r.left, t: r.top, w: r.width, h: r.height }; });
    assert.ok(eerste.id === "sprong_zoek" && eerste.l >= 0 && eerste.t >= 0 && eerste.w > 40 && eerste.h >= 44, "sprongkoppeling zichtbaar en minstens 44 px hoog " + JSON.stringify(eerste));
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "sprong_kaart", "Tab gaat naar 'Naar de kaart'");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "sprong_kaarten", "Tab gaat naar 'Kaarten openen'");
    await page.evaluate(() => document.getElementById("sprong_zoek").focus());
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "search", "Enter springt naar het zoekveld");
    const zoek = await page.evaluate(() => { const z = document.getElementById("search"); const d = document.getElementById(z.getAttribute("aria-describedby") || "-"); return { naam: z.getAttribute("aria-label"), uitleg: d ? d.textContent : "" }; });
    assert.equal(zoek.naam, "Zoek oefening", "zoekveld heeft een naam");
    assert.match(zoek.uitleg, /pijltje.*Enter/, "zoekveld legt pijltjes + Enter uit");
    // pijltje + Enter zet een oefening op de kaart
    const voor = await page.evaluate(() => document.querySelectorAll("#list .add.on").length);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await wacht(200);
    assert.equal(await page.evaluate(() => document.querySelectorAll("#list .add.on").length), voor + 1, "pijltje + Enter zet een oefening op de kaart");
    // naar de kaart
    await page.evaluate(() => document.getElementById("sprong_kaart").focus());
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "a4wrap", "Enter springt naar de kaart");
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.getElementById("a4wrap").contains(document.activeElement)), "volgende Tab blijft in de kaart");
    // Kaarten openen
    await page.evaluate(() => document.getElementById("sprong_kaarten").focus());
    await page.keyboard.press("Enter");
    await page.waitForSelector("#ovKaarten.on", { timeout: 3000 });
    // ster en plus noemen de oefening
    const labels = await page.evaluate(() => { const r = document.querySelector("#list .row"); const n = r.querySelector(".nm").firstChild.textContent.trim(); return { n, fav: r.querySelector(".fav").getAttribute("aria-label"), add: r.querySelector(".add").getAttribute("aria-label"), druk: r.querySelector(".fav").getAttribute("aria-pressed") }; });
    assert.ok(labels.fav.startsWith(labels.n + ":"), "ster noemt de oefening (" + labels.fav + ")");
    assert.ok(labels.add.startsWith(labels.n + ":"), "plus noemt de oefening (" + labels.add + ")");
    assert.ok(labels.druk === "true" || labels.druk === "false", "ster zegt of hij aan staat");
    assert.deepEqual(fouten, [], "geen scriptfouten in /v2/app");
    await ctx.close();
    // v1 blijft gelijk
    const v1 = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.65.0.2" } });
    const p1 = await v1.newPage();
    await p1.goto(origin + "/", { waitUntil: "networkidle" });
    assert.equal(await p1.evaluate(() => !!document.getElementById("sprongLinks")), false, "v1 krijgt geen sprongkoppelingen");
    const fav1 = await p1.evaluate(() => { const f = document.querySelector("#list .fav"); return f ? f.getAttribute("aria-label") : "favoriet"; });
    assert.equal(fav1, "favoriet", "v1-labels ongewijzigd");
    await v1.close();
    console.log("test-app-sprong-links: Tab → zoeken / kaart / Kaarten, pijltje + Enter, knoppen met oefennaam; v1 ongewijzigd");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await wacht(200);
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}
