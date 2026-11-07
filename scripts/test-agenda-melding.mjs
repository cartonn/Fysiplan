// Agendaknoppen op /k: als het agenda-bestand niet komt (afspraak intussen weggehaald,
// te veel verzoeken, storing), blijft de patiënt op de kaart en ziet een melding in
// de eigen taal, in plaats van een kale JSON-foutpagina in het Nederlands.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:agendamelding`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const m = html.match(/var TAGF=(\{[\s\S]*?\});\n/);
assert.ok(m, "TAGF staat in kaart.html");
const TAGF = vm.runInNewContext("(" + m[1] + ")");
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) assert.ok(TAGF[t] && TAGF[t].weg && TAGF[t].fout, "agendamelding: " + t);
assert.doesNotMatch(html, /location\.href='\/api\/kaart\/agenda/, "agenda niet meer blind openen");
assert.match(html, /ics\.onclick=function\(e\)\{e\.preventDefault\(\);naarAgenda\(/, "afspraak-knop via naarAgenda");
console.log("test-agenda-melding: statisch OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-agenda-melding: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-agenda-"));
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
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
  const P = "Fysio Agenda";
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "agenda-wachtwoord", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" },
      chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    assert.equal((await (await post("/api/kaart/afspraak", { praktijk: P, id, t: Date.now() + 3 * 86400000 }, S)).json()).ok, true);
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.8.9.1" } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/k/" + id + "?taal=en");
      await page.waitForSelector("#afics", { state: "visible", timeout: 15000 });
      // de therapeut haalt de afspraak weg terwijl de kaart open staat
      assert.equal((await (await post("/api/kaart/afspraak", { praktijk: P, id, t: 0 }, S)).json()).ok, true);
      await page.click("#afics");
      await page.waitForSelector(".agmelding:not(:empty)", { timeout: 5000 });
      assert.match(page.url(), new RegExp("/k/" + id), "patiënt blijft op de kaart");
      assert.match(await page.textContent(".agmelding"), /This appointment has changed/);
      // oefenmomenten: storing → melding, geen navigatie
      await page.route((u) => u.pathname === "/api/kaart/agenda", (r) => r.fulfill({ status: 429, contentType: "application/json", body: '{"ok":false,"fout":"Te veel verzoeken."}' }));
      await page.click("details:has(#agdagen) summary");
      await page.click("#agdagen button[data-dag='MO']");
      await page.click("#agbtn");
      await page.waitForFunction(() => [...document.querySelectorAll(".agmelding")].some((e) => /try again/.test(e.textContent)), null, { timeout: 5000 });
      assert.match(page.url(), new RegExp("/k/" + id));
      assert.deepEqual(fouten, []);
    } finally { await browser.close(); }
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
console.log("test-agenda-melding: OK");
