// Gebruikers-sweep 2026-11-19 06u (desktop, alleen het toetsenbord): het welkomstvenster van een
// nieuwe proef ging vanzelf open. Enter in de praktijknaam deed niets, Escape sloot het niet (de knop viel
// buiten de sluitregel) en na "Naar mijn voorbeeldkaart" viel de focus op body, met een verloren tabstop.
// Bij het tweede bezoek kreeg de nieuwe gebruiker ook "Nieuw in Fysiplan" over wijzigingen van vóór de proef.
// Nu: Enter en Escape bevestigen, de focus gaat naar het zoekveld (stap 1 van het welkom), en wie net een
// proef begon krijgt de oude release-melding niet.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:proefwelkom`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
const notes = await readFile(join(root, "public/release-notes.js"), "utf8");
assert.match(appHtml, /\|\^pw_start\$\/;/, "Escape sluit het welkom via de eigen knop");
assert.match(appHtml, /getElementById\('pw_praktijk'\)\.addEventListener\('keydown'/, "Enter in de praktijknaam bevestigt");
assert.match(appHtml, /var z=document\.getElementById\('search'\);if\(z&&z\.offsetParent/, "focus naar het zoekveld na het welkom");
assert.match(notes, /localStorage\.getItem\('fysiplan_proef_start'\)\)\{localStorage\.setItem\(key,version\);seen=true;\}/, "nieuwe proef: geen oude release-melding");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("proefwelkom: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefwelkom-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const tokens = [randomBytes(24).toString("hex"), randomBytes(24).toString("hex")];
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  welk000000000001: { id: "welk000000000001", email: "proef@example.test", naam: "Proef Gebruiker", tel: "+31612340009",
    praktijk: "", gestart: Date.now() - 1000, verloopt: Date.now() + 13 * dag, akkoord: "x", tokens: tokens.map(sha) }
}));
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
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  browser = await pw.chromium.launch();
  for (const [nr, toets] of [[0, "Enter"], [1, "Escape"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.72.0." + (nr + 1) } });
    await ctx.addCookies([{ name: "fpproef", value: tokens[nr], url: origin }]);
    const p = await ctx.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(e.message));
    p.on("dialog", (d) => d.dismiss().catch(() => {}));
    await p.goto(origin + "/v2/app", { waitUntil: "load" });
    await p.waitForSelector("#ovProefWelkom.on", { timeout: 10000 });
    let inVeld = false;
    for (let i = 0; i < 40 && !inVeld; i++) { inVeld = await p.evaluate(() => !!document.activeElement && document.activeElement.id === "pw_praktijk"); if (!inVeld) await wacht(50); }
    assert.ok(inVeld, toets + ": focus in de praktijknaam");
    await p.fill("#pw_praktijk", "Fysio Toets " + nr);
    await p.keyboard.press(toets);
    let stand = null;
    for (let i = 0; i < 40; i++) {
      stand = await p.evaluate(() => ({ open: document.getElementById("ovProefWelkom").classList.contains("on"), focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : "" }));
      if (!stand.open && stand.focus === "search") break;
      await wacht(50);
    }
    assert.equal(stand.open, false, toets + ": welkom gesloten");
    assert.equal(stand.focus, "search", toets + ": focus op het zoekveld, niet op body");
    const naam = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("fysiplan_settings") || "{}").praktijk || ""; } catch { return ""; } });
    assert.equal(naam, "Fysio Toets " + nr, toets + ": praktijknaam bewaard");
    // tweede bezoek: geen release-melding over wijzigingen van vóór de proef
    await p.reload({ waitUntil: "load" });
    await wacht(1800);
    const nieuw = await p.evaluate(() => { const d = document.querySelector("dialog.fp-nieuw"); return !!(d && d.open); });
    assert.equal(nieuw, false, toets + ": geen 'Nieuw in Fysiplan' bij een nieuwe proef");
    assert.deepEqual(fouten, [], toets + ": geen scriptfouten");
    await ctx.close();
  }
  console.log("proefwelkom: ok (Enter en Escape bevestigen het welkom, focus naar het zoekveld, geen oude release-melding)");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
