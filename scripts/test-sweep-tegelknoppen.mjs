// Regressietest gebruikers-sweep 2026-11-15 02u en 06u (Sanne, desktop, alleen toetsenbord): de knopjes op een
// oefentegel (×, Eigen video, Vragen, ‹ ›) waren niet met Tab te bereiken. Ze stonden op display:none tot je met de
// muis over de tegel ging, en een element met display:none krijgt geen focus, dus :focus-within ging nooit af. De ×
// was bovendien een kale span. Nu zijn ze onzichtbaar met opacity (focusbaar), verschijnen ze bij focus, is de × een
// knop met naam, en blijft de focus na ×, ‹ of › op de tegel in plaats van op de pagina.
// CI heeft geen Playwright: de broncontrole draait altijd, de browserstap alleen waar Playwright staat.
// `npm run test:tegelknoppen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.doesNotMatch(html, /#a4 \.pic \.(rm|vid|vv)\{[^}]*display:none(?! !important)/, "tegelknopjes niet meer met display:none verborgen");
assert.doesNotMatch(css, /#a4 \.pic \.mvrij\{[^}]*display:none/, "pijltjes niet meer met display:none verborgen");
assert.match(html, /class='rm no-print' role='button' tabindex='0'/, "× is een knop voor het toetsenbord");
assert.match(html, /function tegelFocus\(n,soort\)\{/, "focus terug op de tegel na herteken");

let playwright = null;
try { playwright = createRequire(import.meta.url)("playwright"); } catch {
  try { playwright = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!playwright) { console.log("PASS tegelknoppen (bron; geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

async function vrijePoort() { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tegelknoppen-"));
const port = await vrijePoort();
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "",
  EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" };
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: "ignore" });
const browser = await playwright.chromium.launch();
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_wn_gezien", "9"); } catch {} });
  const page = await ctx.newPage();
  const fouten = []; page.on("pageerror", (e) => fouten.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/v2/app`);
  await page.waitForSelector("#list .row [data-add]", { timeout: 15000 });
  await page.keyboard.press("Escape");
  for (let i = 0; i < 3; i++) { await page.locator("#list .row [data-add]").nth(i).click(); }
  await page.waitForFunction(() => document.querySelectorAll("#mon .pic .rm").length === 3);
  const namen = () => page.evaluate(() => [...document.querySelectorAll("#mon .pic .rm")].map((x) => x.getAttribute("aria-label")));
  const voor = await namen();
  assert.ok(voor.every((n) => /^Verwijder .+ van de kaart$/.test(n)), "× noemt de oefening: " + JSON.stringify(voor));

  // Tab vanaf de pagina bereikt elk soort knopje op een tegel, en het wordt zichtbaar bij focus
  // begin bij het laatste focusbare element vóór de eerste tegel (de bibliotheek ervoor telt 1600+ tabstops)
  const start = await page.evaluate(() => {
    const eerste = document.querySelector("#mon .pic");
    const alle = [...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]")]
      .filter((x) => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length && !x.closest(".pic") &&
        (x.compareDocumentPosition(eerste) & Node.DOCUMENT_POSITION_FOLLOWING));
    const el = alle[alle.length - 1]; if (el) el.focus();
    return el ? el.tagName + "#" + el.id : null;
  });
  assert.ok(start, "er staat iets focusbaars vóór de tegels");
  const gezien = new Set();
  for (let i = 0; i < 500 && gezien.size < 5; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const a = document.activeElement; if (!a || !a.closest(".pic")) return null;
      const soort = a.classList.contains("rm") ? "rm" : a.classList.contains("vid") ? "vid" : a.classList.contains("vv") ? "vv" : a.dataset.mvr ? "mvr" : a.dataset.mvl ? "mvl" : a.className;
      const zicht = a.classList.contains("mvknop") ? getComputedStyle(a.parentElement).opacity : getComputedStyle(a).opacity;
      return { soort, zicht };
    });
    if (f) { gezien.add(f.soort); assert.equal(f.zicht, "1", f.soort + " is zichtbaar bij focus"); }
  }
  for (const s of ["rm", "vid", "vv", "mvr", "mvl"]) assert.ok(gezien.has(s), s + " met Tab bereikbaar (gezien: " + [...gezien] + ")");

  // › met Enter: oefening schuift op en de focus blijft op die oefening
  await page.locator("#mon [data-mvr='0']").focus();
  await page.keyboard.press("Enter");
  let na = await namen();
  assert.equal(na[1], voor[0], "oefening 1 staat nu op plek 2");
  let f = await page.evaluate(() => ({ mvr: document.activeElement.dataset.mvr || null, mvl: document.activeElement.dataset.mvl || null }));
  assert.ok(f.mvr === "1" || f.mvl === "1", "focus volgt de verschoven oefening: " + JSON.stringify(f));

  // × met Enter: oefening weg, focus op de × van de volgende tegel
  await page.locator("#mon [data-rm='0']").focus();
  await page.keyboard.press("Enter");
  na = await namen();
  assert.equal(na.length, 2, "één oefening van de kaart");
  f = await page.evaluate(() => document.activeElement.dataset.rm || null);
  assert.equal(f, "0", "focus op de × die nu op plek 1 staat");
  await page.keyboard.press(" ");
  assert.equal((await namen()).length, 1, "spatie werkt ook");
  // Enter op de × van de LAATSTE oefening: de kaart is leeg en de focus staat in het zoekveld. Eerst kwam
  // dezelfde Enter daarna ook bij het zoekveld langs en zette de eerste bibliotheekoefening stil op de kaart
  // (gebruikers-sweep 2026-11-16, toetsenbord).
  await page.locator("#mon [data-rm='0']").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  assert.equal((await namen()).length, 0, "Enter op de laatste × laat een lege kaart achter");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "search", "focus in het zoekveld");
  assert.deepEqual(fouten, [], "geen scriptfouten");

  // iPad (geen aanwijzen): onzichtbare pijltjes zijn niet aantikbaar; een tik rechtsonder in een vak schuift niets op
  // (hertest Sanne 2026-11-15 06u). × en Vragen staan op de iPad wel zichtbaar.
  const tab = await browser.newContext({ ...playwright.devices["iPad (gen 7) landscape"] });
  await tab.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_wn_gezien", "9"); } catch {} });
  const tp = await tab.newPage();
  await tp.goto(`http://127.0.0.1:${port}/v2/app`);
  await tp.waitForSelector("#list .row [data-add]", { timeout: 15000 });
  await tp.keyboard.press("Escape");
  for (let i = 0; i < 3; i++) { await tp.locator("#list .row [data-add]").nth(i).click(); }
  await tp.waitForFunction(() => document.querySelectorAll("#mon .pic .rm").length === 3);
  const tVoor = await tp.evaluate(() => [...document.querySelectorAll("#mon .pic .rm")].map((x) => x.getAttribute("aria-label")));
  const pe = await tp.evaluate(() => getComputedStyle(document.querySelector("#mon .pic .mvrij")).pointerEvents);
  assert.equal(pe, "none", "onzichtbare pijltjes op de iPad zijn niet aantikbaar");
  const box = await tp.locator("#mon [data-mvr='0']").boundingBox();
  await tp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await tp.waitForTimeout(200);
  const tNa = await tp.evaluate(() => [...document.querySelectorAll("#mon .pic .rm")].map((x) => x.getAttribute("aria-label")));
  assert.deepEqual(tNa, tVoor, "tik op de plek van het onzichtbare pijltje verschuift niets");
  await tab.close();
  console.log("PASS tegelknoppen: ×, eigen video, vragen en ‹ › met Tab bereikbaar en zichtbaar; focus blijft op de tegel");
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
