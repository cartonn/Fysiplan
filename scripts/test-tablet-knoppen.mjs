// Regressietest gebruikers-sweep 2026-11-06: op een tablet (geen aanwijzen) zijn de
// knopjes op het plaatje bereikbaar. Voorheen verschenen "eigen video" en × alleen bij
// :hover, waren ze 22×22 px en werkte "eigen video" niet met het toetsenbord.
// CI heeft geen Playwright: de statische controle draait altijd, het iPad-deel alleen
// waar Playwright staat. `npm run test:tablet`
// Ook: een verlopen proef op een tweede apparaat (ingelogd, zonder proefcookie) gaf een
// eindeloze herlaadlus. Nu blijft de app staan met een melding en een link naar /v2/proef.
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
const media = index.match(/@media \(hover:none\)\{([\s\S]*?)\n  \}/);
assert.ok(media, "index.html heeft een @media (hover:none)-blok voor de knopjes");
assert.match(media[1], /#a4 \.pic \.vid\{display:flex/, "eigen-videoknop altijd zichtbaar zonder aanwijzen");
assert.match(media[1], /#a4 \.pic \.rm\{display:block/, "verwijderknop altijd zichtbaar zonder aanwijzen");
assert.match(media[1], /::after\{content:'';position:absolute;inset:-7px\}/, "tikvlak van 44 px");
assert.match(index, /#a4 \.pic:focus-within \.vid\{display:flex\}/, "zichtbaar bij toetsenbordfocus");
assert.match(index, /elMon\.addEventListener\('keydown'[\s\S]{0,200}\[data-evid\]/, "Enter/spatie opent eigen video");
assert.doesNotMatch(index, /proefVerlopen\)\{location\.reload/, "verlopen proef herlaadt de app niet (herlaadlus)");
assert.match(index, /function toonProefVoorbij\(\)/, "verlopen proef: melding in de app");

const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-tablet-knoppen: geen Playwright, iPad-check overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tablet-"));
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
    const ctx = await browser.newContext({ ...pw.devices["iPad (gen 7)"], extraHTTPHeaders: { "x-forwarded-for": "10.9.1.1" } });
    const page = await ctx.newPage();
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    // het welkomstvenster voor nieuwe gebruikers hoort niet bij deze test
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.querySelector("[data-add]").click(); });
    await page.waitForSelector("#a4 .pic .vid", { state: "attached", timeout: 10000 });
    const r = await page.evaluate(() => {
      const vid = document.querySelector("#a4 .pic .vid"), x = document.querySelector("#a4 .pic .rm");
      vid.scrollIntoView({ block: "center" });
      const bv = vid.getBoundingClientRect(), bx = x.getBoundingClientRect();
      // het onzichtbare tikvlak: een tik net naast de knop raakt de knop nog
      const naast = document.elementFromPoint(bv.right + 5, bv.top + bv.height / 2);
      return { vid: getComputedStyle(vid).display, rm: getComputedStyle(x).display, w: bv.width, h: bv.height,
        rmW: bx.width, naastRaakt: !!(naast && naast.closest && naast.closest(".vid")), naast: naast && naast.outerHTML.slice(0, 120), bv: [bv.left, bv.top, bv.width] };
    });
    assert.equal(r.vid, "flex", "eigen-videoknop zichtbaar op iPad");
    assert.notEqual(r.rm, "none", "verwijderknop zichtbaar op iPad");
    assert.ok(r.w >= 30 && r.h >= 30 && r.rmW >= 30, "knopjes minstens 30 px: " + JSON.stringify(r));
    assert.ok(r.naastRaakt, "tikvlak loopt door tot 44 px: " + JSON.stringify(r));
    await page.tap("#a4 .pic .vid");
    await page.waitForSelector("#ovEigenVideo.on", { timeout: 5000 });
    await page.click("#ev_sluit");
    // toetsenbord
    await page.focus("#a4 .pic .vid");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#ovEigenVideo.on", { timeout: 5000 });
    await ctx.close();

    // ---- verlopen proef op een tweede apparaat: geen herlaadlus ----
    const ctx2 = await browser.newContext({ ...pw.devices["iPad (gen 7)"], extraHTTPHeaders: { "x-forwarded-for": "10.9.1.2" } });
    const p2 = await ctx2.newPage();
    let posts = 0;
    await p2.route("**/api/kaarten", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      return route.fulfill({ status: 403, contentType: "application/json",
        body: JSON.stringify({ ok: false, proefVerlopen: true, fout: "Je gratis proef is voorbij." }) });
    });
    let laden = 0;
    p2.on("load", () => { laden++; });
    await p2.goto(origin + "/v2/app");
    await p2.waitForSelector("[data-add]", { timeout: 15000 });
    await p2.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.querySelector("[data-add]").click(); });
    await p2.fill("#praktijk", "Fysio Tablet Test");
    await p2.fill("#c_naam", "Truus");
    await p2.evaluate(() => { document.getElementById("c_naam").blur(); document.getElementById("c_naam").dispatchEvent(new Event("change", { bubbles: true })); });
    await p2.waitForSelector("#pb_voorbij", { timeout: 15000 });
    await wacht(3000);
    assert.equal(laden, 1, "de app herlaadt niet bij een verlopen proef (laadbeurten: " + laden + ")");
    assert.ok(posts >= 1 && posts <= 2, "na de weigering stopt het automatisch delen (POSTs: " + posts + ")");
    const link = await p2.getAttribute("#proefBalk a.btn", "href");
    assert.equal(link, "/v2/proef", "melding linkt naar /v2/proef");
    await ctx2.close();
    console.log("test-tablet-knoppen: knopjes op iPad zichtbaar, groot genoeg en met toetsenbord te bedienen");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
