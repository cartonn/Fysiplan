// Regressietest gebruikers-sweep 2026-11-16 06u (MIDDEL, Jayden, Pixel 7, Engelse kaart): op een telefoon die niet op
// Nederlandse tijd staat, toonde de kaart de afspraak in de tijdzone van de telefoon ("10:15"), terwijl "My data" en de
// agenda (.ics) de tijd van de praktijk gaven ("11:15"). Nu toont de kaart altijd de Nederlandse tijd, en "today/tomorrow"
// volgt de Nederlandse dag.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:afspraaktijdzone`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const blok = html.slice(html.indexOf("document.getElementById('afkop').textContent"), html.indexOf("var el=document.getElementById('aftekst');"));
assert.match(blok, /hourCycle:'h23',timeZone:'Europe\/Amsterdam'\}/, "afspraak op de kaart in Nederlandse tijd");
assert.doesNotMatch(blok, /toDateString\(\)/, "vandaag/morgen niet volgens de tijdzone van de telefoon");
console.log("test-sweep-afspraak-tijdzone: statisch OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-afspraak-tijdzone: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-afspraaktz-"));
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
    const P = "Fysio Afspraak Tijdzone";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "afspraak-tijdzone-ww", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    assert.ok(id);
    // over 5 dagen; welk uur dat in Nederland is, rekenen we uit met Intl
    const t = Math.floor((Date.now() + 5 * 86400000) / 3600000) * 3600000 + 15 * 60000;
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t }, S)).status, 200, uit.slice(-300));
    const uurNL = new Date(t).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Amsterdam" });
    for (const timezoneId of ["Europe/London", "America/New_York", "Europe/Amsterdam"]) {
      const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", timezoneId, extraHTTPHeaders: { "x-forwarded-for": "10.7.9.6" } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/k/" + id + "?taal=en");
      await page.waitForSelector("#afspraakblok", { state: "visible", timeout: 15000 });
      const tekst = (await page.textContent("#aftekst")).trim();
      assert.ok(tekst.includes(uurNL), `${timezoneId}: kaart toont ${tekst}, verwacht ${uurNL} (Nederlandse tijd)`);
      assert.deepEqual(fouten, []);
      await ctx.close();
    }
    console.log("test-sweep-afspraak-tijdzone: browser OK");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
