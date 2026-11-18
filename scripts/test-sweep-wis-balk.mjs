// Regressietest gebruikers-sweep 2026-11-15 14u (MIDDEL, Truus, iPhone SE): wie "Ik heb vandaag geoefend" aantikte en
// binnen 2,5 s "Wis deze kaart van mijn telefoon" koos, kreeg daarna alsnog de balk "Zet op beginscherm" over het
// wis-bericht. En offline wissen liet de offline-balk staan met "wat je aantikt bewaren we", terwijl er niets meer
// bewaard wordt. Nu tonen beide balken niets meer zodra de kaart van de telefoon is gewist.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:wisbalk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /function toonBanner\(ios\)\{[\s\S]{0,200}?if\(KAART_GEWIST\)return;/, "beginscherm-balk niet na wissen");
assert.match(html, /function tekenOfflijn\(\)\{[^\n]*if\(KAART_GEWIST\)\{el\.style\.display='none';return;\}/, "offline-balk niet na wissen");
assert.match(html, /var klaar=function\(\)\{[\s\S]{0,400}?getElementById\('offlijn'\)[^\n]*display='none'/, "wissen verbergt de offline-balk");
console.log("test-sweep-wis-balk: statisch OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-wis-balk: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-wisbalk-"));
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
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.4." + (ip++), ...extra }, body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const P = "Fysio Wisbalk";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wis-balk-ww-123", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    assert.ok(id);
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.4" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    // offline-cache gevuld (service worker) plus een gedeeld plaatje en de bibliotheek. Met
    // evaluate in een lus: waitForFunction wacht niet op een async functie (de Promise zelf
    // telt al als waar).
    let gevuld = false;
    for (let n = 0; n < 60 && !gevuld; n++) {
      gevuld = await page.evaluate(async (i) => { for (const naam of await caches.keys()) { const c = await caches.open(naam); if (await c.match("/k/" + i)) return true; } return false; }, id);
      if (!gevuld) await wacht(250);
    }
    assert.ok(gevuld, "de service worker bewaart de kaart na het eerste bezoek");
    // Truus tikt "Ik heb vandaag geoefend" (dat zet de beginscherm-uitnodiging klaar voor over 2,5 s),
    // verliest het netwerk en wist meteen daarna de kaart
    await page.click("#gdaan");
    await ctx.setOffline(true);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("offlijn")).display === "block", null, { timeout: 5000 });
    page.once("dialog", (d) => d.accept());
    await page.click("#mgblok summary");
    await page.click("#mg_wis");
    await page.waitForSelector("#mg_weg", { state: "visible", timeout: 8000 });
    await wacht(3200);
    assert.equal(await page.evaluate(() => document.getElementById("appbanner").classList.contains("aan")), false, "geen beginscherm-balk na wissen");
    assert.equal(await page.isVisible("#offlijn"), false, "geen offline-balk na wissen");
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    assert.equal(await page.isVisible("#offlijn"), false, "ook niet na een nieuwe offline-melding");
    assert.deepEqual(fouten, []);
  } catch (e) { console.error(uit.slice(-2000)); throw e; }
  finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
}
console.log("test-sweep-wis-balk: OK");
