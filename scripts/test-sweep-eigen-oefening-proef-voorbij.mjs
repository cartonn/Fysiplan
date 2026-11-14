// Gebruikers-sweep 2026-11-14 (Mark, desktop + iPad): met een verlopen proef gaf "Toevoegen" of
// "Verwijderen" in het venster Eigen oefening een kale alert met de serverzin. Nu dezelfde vaste
// melding als elders (toonProefVoorbij): de proefbalk plus "Niet bewaard" in het venster, met de
// link naar /v2/proef, en geen browserdialoog.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:eigenoefproef`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /api\/praktijk\/oefeningen\/verwijder'[\s\S]{0,500}if\(d\.proefVerlopen\)\{toonProefVoorbij\(w\);return;\}/,
  "verwijderen eigen oefening: verlopen proef via toonProefVoorbij");
assert.match(index, /fetch\('api\/praktijk\/oefeningen',\{method:'POST'[\s\S]{0,500}if\(!d\.ok\)\{if\(d\.proefVerlopen\)\{toonProefVoorbij\(knop\);return;\}/,
  "toevoegen eigen oefening: verlopen proef via toonProefVoorbij");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-eigen-oefening-proef-voorbij: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-eigenoefproef-"));
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
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const png = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a50000000049454e44ae426082", "hex")]);

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  for (const [naam, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["iPad", pw.devices["iPad (gen 7)"]]]) {
    const ctx = await browser.newContext({ ...opts, extraHTTPHeaders: { "x-forwarded-for": "10.9.2." + (naam === "iPad" ? 2 : 1) } });
    const rnVersie = (await readFile(join(root, "public/release-notes.js"), "utf8")).match(/version='([^']+)'/)[1];
    await ctx.addInitScript((v) => { try { localStorage.setItem("fysiplan_release_seen", v); } catch {} }, rnVersie);
    const page = await ctx.newPage();
    const dialogen = [];
    page.on("dialog", (d) => { dialogen.push(d.message()); d.accept(); });
    // de praktijk is ingelogd, maar de proef is voorbij: de server weigert schrijven met proefVerlopen
    await page.route("**/api/praktijk/status?**", (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, geclaimd: true, ingelogd: true }) }));
    await page.route("**/api/praktijk/oefeningen**", (r) => {
      const u = r.request().url();
      if (r.request().method() === "GET") return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, oefeningen: [{ id: "eo1", naam: "Muurzit eigen", uitleg: "", img: "" }] }) });
      return r.fulfill({ status: 403, contentType: "application/json",
        body: JSON.stringify({ ok: false, proefVerlopen: true, fout: u.endsWith("/verwijder") ? "Proef voorbij (verwijderen)." : "Proef voorbij (toevoegen)." }) });
    });
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.fill("#praktijk", "Fysio Proef Voorbij");
    await page.evaluate(() => document.getElementById("praktijk").dispatchEvent(new Event("change", { bubbles: true })));
    await page.evaluate(() => document.getElementById("eigenOefBtn").click());
    await page.waitForSelector("#ovEigenOef.on #eo_form", { state: "visible", timeout: 10000 });
    await page.fill("#eo_naam", "Muurzit variant");
    await page.setInputFiles("#eo_foto", { name: "foto.png", mimeType: "image/png", buffer: png });
    await page.click("#eo_bewaar");
    await page.waitForSelector("#ovEigenOef.on .proef-voorbij-ov", { timeout: 10000 });
    await page.waitForSelector("#pb_voorbij", { state: "attached" });
    assert.equal(await page.getAttribute("#ovEigenOef .proef-voorbij-ov a", "href"), "/v2/proef", naam + ": link naar /v2/proef");
    assert.equal(await page.textContent("#eo_bewaar"), "Toevoegen", naam + ": knop weer bruikbaar");
    assert.deepEqual(dialogen, [], naam + ": geen kale alert bij toevoegen: " + JSON.stringify(dialogen));
    // verwijderen: alleen de vraag of het mag, daarna geen alert met de serverzin
    const weg = page.locator("#eo_lijst [data-eoweg]").first();
    if (await weg.count()) {
      await weg.click();
      await wacht(800);
      assert.equal(dialogen.length, 1, naam + ": alleen de bevestigingsvraag bij verwijderen: " + JSON.stringify(dialogen));
      assert.doesNotMatch(dialogen[0], /Proef voorbij/, naam + ": geen serverzin als alert");
    } else console.log(naam + ": geen verwijderknop in de lijst (lijst uit bibliotheek), verwijderdeel overgeslagen");
    await ctx.close();
  }
  console.log("test-sweep-eigen-oefening-proef-voorbij: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
