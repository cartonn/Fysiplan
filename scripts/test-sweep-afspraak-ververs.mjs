// Regressietest gebruikers-sweep 2026-11-15 14u en 18u (MIDDEL, Jayden, Pixel 7 + iPhone 14): de therapeut verplaatste de
// afspraak terwijl de kaart openstond. "Add to my calendar" gaf de nieuwe tijd aan de agenda, maar de kaart bleef de oude
// tijd tonen: agenda en kaart spraken elkaar tegen. Na het weghalen van de afspraak bleven de oude datum en de knop staan.
// Nu haalt de kaart na een download de afspraak opnieuw op, en na een weggehaalde afspraak blijft alleen de melding staan.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:afspraakververs`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /if\(r\.ok\)\{location\.href=url;vrij\(1500\);if\(afspraak\)verversAfspraak\(\);return;\}/, "na download de afspraak verversen");
assert.match(html, /function verversAfspraak\(\)\{[\s\S]{0,400}?K\.kaart\.afspraak=d\.kaart\.afspraak\|\|null;\s*tekenAfspraak\(\);/, "verversAfspraak tekent opnieuw");
assert.match(html, /r\.status===404\)\{m\.textContent=trag\('weg'\);[^\n]*knop\.style\.display='none'/, "weggehaalde afspraak: knop weg");
console.log("test-sweep-afspraak-ververs: statisch OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-afspraak-ververs: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-afspraakververs-"));
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
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.5." + (ip++), ...extra }, body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const P = "Fysio Afspraak Ververs";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "afspraak-ververs-ww", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    assert.ok(id);
    const dag = (n) => { const d = new Date(Date.now() + n * 86400000); d.setHours(14, 0, 0, 0); return d.getTime(); };
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: dag(3) }, S)).status, 200);
    const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", timezoneId: "Europe/Amsterdam", acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.7.9.5" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id + "?taal=en");
    await page.waitForSelector("#afspraakblok", { state: "visible", timeout: 15000 });
    const oud = await page.textContent("#aftekst");
    // therapeut verplaatst de afspraak naar twee dagen later
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: dag(5) }, S)).status, 200, "afspraak verplaatst");
    const verwacht = await page.evaluate((t) => new Date(t).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long" }), dag(5));
    await page.click("#afics");
    await page.waitForFunction((o) => document.getElementById("aftekst").textContent !== o, oud, { timeout: 8000 });
    const nieuw = await page.textContent("#aftekst");
    for (const w of verwacht.split(/[ ,]+/).filter(Boolean)) assert.ok(nieuw.includes(w), "kaart toont de nieuwe datum (" + nieuw + " ∌ " + w + ")");
    // therapeut haalt de afspraak weg; de patiënt tikt na de rustpauze nog eens
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: null }, S)).status, 200, "afspraak weggehaald");
    await wacht(1700);
    await page.click("#afics");
    await page.waitForFunction(() => { const m = document.querySelector("#afspraakblok .agmelding"); return m && m.textContent.length > 5; }, null, { timeout: 8000 });
    assert.equal((await page.textContent("#aftekst")).trim(), "", "geen oude datum meer");
    assert.equal(await page.isVisible("#afics"), false, "geen agenda-knop meer voor een weggehaalde afspraak");
    assert.deepEqual(fouten, []);
  } catch (e) { console.error(uit.slice(-2000)); throw e; }
  finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
}
console.log("test-sweep-afspraak-ververs: OK");
