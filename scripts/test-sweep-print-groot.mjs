// Gebruikers-sweep 2026-11-10 (Sanne, desktop): de printvariant "Groot lettertype" liep van de A4.
// Bij 12 oefeningen werd de inhoud 206 mm hoog op een printvlak van 200 mm: de S/H/W-legenda viel
// weg en de veiligheidsregel ("Neem pijn serieus…") stond dwars over de laatste rij. De grotere
// namen (tot drie regels) maken de kop ±20 px hoger; de vaste rijhoogte gaf niets terug.
// Nu: bij Groot een iets lager invulvak en rij, zodat alles op één A4 past, in alle vier varianten.
// Code altijd (CI); het meten alleen waar Playwright staat. `npm run test:printgroot`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.match(css, /html\.v2\.print-groot #a4 table\.mon tbody tr\{height:5\.7mm\}/, "Groot: rijhoogte geeft ruimte terug");
assert.match(css, /html\.v2\.print-groot #a4 table\.mon input\{font-size:11\.5px;height:19px\}/, "Groot: invulvak past in de rij");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-print-groot: geen Playwright, meten overgeslagen"); }
if (!pw) { console.log("Print Groot (statisch): rij en invulvak passen."); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-printgroot-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.72.0.1" } });
  await ctx.addInitScript(() => {
    localStorage.setItem("fysiplan_welkom_gezien", "1");
    localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
    localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Groot" }));
  });
  const p = await ctx.newPage();
  const fouten = [];
  p.on("pageerror", (e) => fouten.push(e.message));
  p.on("dialog", (d) => d.dismiss().catch(() => {}));
  await p.goto(origin + "/v2/app", { waitUntil: "load" });
  await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  // twaalf oefeningen, met de langste namen: die breken bij Groot over meerdere regels
  await p.waitForSelector("button.add[data-add]");
  const ids = await p.evaluate(() => [...document.querySelectorAll("button.add[data-add]:not(.on)")]
    .map((b) => ({ id: b.dataset.add, n: (b.closest(".row") || b.parentNode).textContent.trim().length }))
    .sort((a, b) => b.n - a.n).slice(0, 12).map((x) => x.id));
  for (const id of ids) { await p.click(`button.add[data-add="${id}"]`); await p.waitForTimeout(60); }
  assert.equal(await p.evaluate(() => document.querySelectorAll("#a4 table.mon thead tr:nth-child(2) .pic").length), 12, "12 oefeningen op de kaart");

  const meet = () => p.evaluate(() => {
    const a4 = document.getElementById("a4").getBoundingClientRect();
    const rijen = document.querySelectorAll("#a4 table.mon tbody tr");
    const laatste = rijen[rijen.length - 1].getBoundingClientRect();
    const leg = document.querySelector("#a4 .shw-legenda").getBoundingClientRect();
    const na = getComputedStyle(document.getElementById("a4"), "::after");
    const regelTop = a4.bottom - parseFloat(na.bottom) - parseFloat(na.fontSize) * 1.25;
    return { a4: Math.round(a4.bottom), rij: Math.round(laatste.bottom), legTop: Math.round(leg.top), leg: Math.round(leg.bottom), regel: Math.round(regelTop),
      scroll: document.getElementById("a4").scrollHeight - document.getElementById("a4").clientHeight };
  });
  let basis = null;
  for (const [naam, groot, compact] of [["uitgebreid", false, false], ["compact", false, true], ["groot", true, false], ["compact+groot", true, true]]) {
    await p.evaluate(([g, c]) => { const h = document.documentElement; h.classList.toggle("print-groot", g); h.classList.toggle("print-compact", c);
      window.dispatchEvent(new Event("beforeprint")); }, [groot, compact]);
    await p.emulateMedia({ media: "print" });
    await p.waitForTimeout(150);
    const m = await meet();
    assert.ok(m.scroll <= 1, `${naam}: inhoud past in het printvlak (${m.scroll} px te veel)`);
    assert.ok(m.rij <= m.legTop + 1, `${naam}: laatste rij boven de legenda ${JSON.stringify(m)}`);
    // de legenda eindigt niet lager dan bij de gewone kaart (die met de veiligheidsregel klopt)
    if (!basis) basis = m;
    assert.ok(m.leg <= basis.leg + 1 && m.leg <= m.a4, `${naam}: legenda blijft boven de veiligheidsregel ${JSON.stringify(m)} (gewoon: ${basis.leg})`);
    await p.emulateMedia({ media: "screen" });
    await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  }
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("Print Groot (browser): 12 oefeningen, uitgebreid/compact/groot/compact+groot passen met legenda en veiligheidsregel op één A4.");
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
