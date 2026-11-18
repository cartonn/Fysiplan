// Regressietest gebruikers-sweep 2026-11-15 18u (MIDDEL, Jayden, Pixel 7): op een trage lijn gaf "Add to my calendar"
// ±5 seconden geen enkel teken van leven; de patiënt tikte nog eens of gaf op. Nu staat er na een halve seconde onder de
// knop dat het agenda-bestand wordt opgehaald (role=status) en is de knop aria-busy; daarna verdwijnt dat weer.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:agendatraag`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const tagf = html.match(/var TAGF=\{([^\n]*)\};/);
assert.ok(tagf, "TAGF gevonden");
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) assert.match(tagf[1], new RegExp(t + ":\\{bezig:'[^']{8,}"), "bezig-tekst in " + t);
assert.match(html, /var tBezig=setTimeout\(function\(\)\{m\.textContent=trag\('bezig'\);knop\.setAttribute\('aria-busy','true'\);/, "na een halve seconde bezig-melding");
assert.match(html, /\.then\(function\(r\)\{\s*klaar\(r\.ok\);/, "klaar na antwoord");
assert.match(html, /\.catch\(function\(\)\{klaar\(\);vrij\(0\);/, "klaar na fout");
console.log("test-sweep-agenda-traag: statisch OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-agenda-traag: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-agendatraag-"));
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
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.6." + (ip++), ...extra }, body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const P = "Fysio Agenda Traag";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "agenda-traag-ww", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    assert.ok(id);
    const d = new Date(Date.now() + 3 * 86400000); d.setHours(14, 0, 0, 0);
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: d.getTime() }, S)).status, 200);
    const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", timezoneId: "Europe/Amsterdam", acceptDownloads: true, serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.6" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id + "?taal=en");
    await page.waitForSelector("#afics", { state: "visible", timeout: 15000 });
    // trage lijn: het agenda-bestand komt pas na 2,5 s
    await page.route("**/api/kaart/afspraak.ics**", async (route) => { await wacht(2500); await route.continue(); });
    await page.click("#afics");
    await page.waitForFunction(() => { const m = document.querySelector("#afspraakblok .agmelding"); return m && /One moment/.test(m.textContent); }, null, { timeout: 2000 });
    assert.equal(await page.getAttribute("#afics", "aria-busy"), "true", "knop is aria-busy");
    await page.waitForFunction(() => !document.getElementById("afics").hasAttribute("aria-busy"), null, { timeout: 8000 });
    // de melding blijft nog even staan terwijl de download zelf binnenkomt, en verdwijnt daarna
    await page.waitForFunction(() => !/One moment/.test((document.querySelector("#afspraakblok .agmelding") || {}).textContent || ""), null, { timeout: 8000 });
    assert.deepEqual(fouten, []);
  } catch (e) { console.error(uit.slice(-2000)); throw e; }
  finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
}
console.log("test-sweep-agenda-traag: OK");
