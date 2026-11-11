// Gebruikers-sweep 2026-11-11 (Sanne, desktop): "Compacte kaart — kleinere plaatjes, meer ruimte voor
// het schema" gaf geen extra schemaruimte. Alleen de plaatjes krompen; kop, 15 rijen en onderkant bleven gelijk.
// Nu: de vrijgekomen ruimte wordt extra datumrijen (tr.xr), alleen bij het printen van de compacte kaart,
// en alles past nog op één A4 met legenda en veiligheidsregel. `npm run test:printcompact`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
const html = await readFile(join(root, "public/index.html"), "utf8");
assert.match(css, /html\.v2\.print-compact #a4 table\.mon tbody tr\.xr\{display:table-row\}/, "Compact: extra datumrijen zichtbaar bij printen");
assert.match(html, /#a4 table\.mon tbody tr\.xr\{display:none\}/, "extra datumrijen standaard verborgen");
assert.match(html, /dateRow\('r'\+\(12\+b\*XR_PER_BLOK\+x\),true\)/, "extra datumrijen per blok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-print-compact: geen Playwright, meten overgeslagen"); }
if (!pw) { console.log("Print Compact (statisch): extra datumrijen aanwezig."); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-printcompact-"));
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.73.0.1" } });
  await ctx.addInitScript(() => {
    localStorage.setItem("fysiplan_welkom_gezien", "1");
    localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
    localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Compact" }));
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
      scroll: document.getElementById("a4").scrollHeight - document.getElementById("a4").clientHeight,
      datum: [...rijen].filter((r) => r.querySelector("input.drow") && getComputedStyle(r).display !== "none").length };
  });
  let basis = null;
  const tel = {};
  assert.equal(await p.evaluate(() => [...document.querySelectorAll("#a4 table.mon tbody tr")].filter((r) => getComputedStyle(r).display !== "none" && r.querySelector("input.drow")).length), 12, "scherm: 12 datumrijen");
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
    tel[naam] = m.datum;
    assert.ok(m.leg <= basis.leg + 1 && m.leg <= m.a4, `${naam}: legenda blijft boven de veiligheidsregel ${JSON.stringify(m)} (gewoon: ${basis.leg})`);
    await p.emulateMedia({ media: "screen" });
    await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  }
  assert.equal(tel.uitgebreid, 12, "gewone kaart: 12 datumrijen");
  assert.ok(tel.compact > tel.uitgebreid, `compact geeft meer datumrijen (${tel.compact} tegen ${tel.uitgebreid})`);
  assert.ok(tel["compact+groot"] > tel.groot, "compact+groot geeft meer datumrijen dan groot");
  assert.equal(await p.evaluate(() => [...document.querySelectorAll("#a4 table.mon tbody tr")].filter((r) => getComputedStyle(r).display !== "none" && r.querySelector("input.drow")).length), 12, "na het printen weer 12 datumrijen op het scherm");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log(`Print Compact (browser): ${tel.compact} datumrijen compact tegen ${tel.uitgebreid} gewoon; alle vier varianten passen op één A4.`);
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
