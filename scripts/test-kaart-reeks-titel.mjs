// Regressietest gebruikers-sweep 2026-11-11 06u (/k, patiëntkaart):
// - Mark (Pixel 7): na de zomertijdwissel toonde /k bij een reeks 15:00 in plaats van 14:00 (doorrollen met 7×24 uur);
//   de agenda (RRULE met TZID) zei wel 14:00. Nu een week later op dezelfde klokketijd in Europe/Amsterdam.
// - Mark: bij een wekelijkse reeks van 4 zei de kaart "wekelijks, nog 4 keer" ná de getoonde afspraak (las als vijf);
//   nu "nog 3 keer", en "1 more time" in het enkelvoud.
// - Jayden (iPhone 14): na "Wis deze kaart van mijn telefoon" bleef de praktijknaam in de tabtitel staan, en na
//   herladen werd de gewist-pagina Nederlands (taal viel uit de URL).
// - Truus/Jayden: tijdens het laden en in foutstaten was de tabtitel altijd "Trainingskaart — Fysiplan".
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:reekstitel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /var nogN=rest-1;/, "de reeks telt de getoonde afspraak niet nog eens mee");
assert.match(html, /TAFHER1=\{en:'weekly, 1 more time'/, "enkelvoud voor nog één keer");
assert.match(html, /function neutraleTitel\(\)\{try\{document\.title=tr\('eyebrow'\)\+' — Fysiplan';document\.documentElement\.lang=TAAL;/, "neutrale titel in de taal van de patiënt");
assert.match(html, /neutraleTitel\(\);\s*try\{if\(history\.replaceState\)history\.replaceState\(null,'','\/k\?gewist=1'\+\(TAAL!=='nl'\?'&taal='/, "wissen: titel neutraal en taal blijft in de URL");
// weekLater los rekenen (draait ook in CI zonder browser)
{
  const stuk = html.match(/function amsVerschil[\s\S]*?\n  function weekLater[^\n]*/);
  assert.ok(stuk, "weekLater gevonden");
  const { weekLater } = new Function(stuk[0] + "; return { weekLater };")();
  const ams = (t) => new Date(t).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  assert.equal(ams(weekLater(Date.parse("2027-03-22T13:00:00Z"))), "29-3, 14:00", "over de zomertijd: 14:00 blijft 14:00");
  assert.equal(ams(weekLater(Date.parse("2026-10-19T12:00:00Z"))), "26-10, 14:00", "over de wintertijd: 14:00 blijft 14:00");
  assert.equal(ams(weekLater(Date.parse("2026-11-18T13:00:00Z"))), "25-11, 14:00", "gewone week");
  assert.match(html, /at=weekLater\(at\);rest--;/, "tekenAfspraak rolt met weekLater door");
}
console.log("test-kaart-reeks-titel (statisch): reeks, neutrale titel en wissen staan erin");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-reeks-titel: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-reekstitel-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://localhost:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    browser = await pw.chromium.launch();
    const ctx = (toestel, ip, extra = {}) => browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": ip }, ...extra });
    let ip = 1;
    const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.64.1." + (ip++), ...extra }, body: JSON.stringify(body) });
    const P = "Fysio Reeks";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "reeks-wachtwoord-1", akkoord: true })).json()).sessie };
    const maak = async (naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
    const id = await maak("Jayden");
    const id2 = await maak("Mark");
    const over = (dagen) => Date.now() + dagen * 864e5;
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: over(3), herhaal: 4 }, S)).status, 200, "reeks van 4");
    assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id: id2, t: over(3), herhaal: 2 }, S)).status, 200, "reeks van 2");

    // 1) reeks: "nog 3 keer" bij 4, "1 more time" bij 2 (Engels)
    {
      const c = await ctx("Pixel 7", "10.64.0.1");
      const p = await c.newPage();
      await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await p.waitForFunction(() => document.getElementById("afspraakblok").style.display !== "none");
      const t = await p.textContent("#aftekst");
      assert.match(t, /wekelijks, nog 3 keer/, "reeks van 4: nog 3 keer na de getoonde (" + t + ")");
      await p.goto(origin + "/k/" + id2 + "?taal=en", { waitUntil: "networkidle" });
      await p.waitForFunction(() => document.getElementById("afspraakblok").style.display !== "none" && document.documentElement.lang === "en");
      const t2 = await p.textContent("#aftekst");
      assert.match(t2, /weekly, 1 more time$/, "reeks van 2 in het Engels: 1 more time (" + t2 + ")");
      await c.close();
    }
    // 1b) zomertijd: reeks ma 22-03-2027 14:00, telefoon op 23-03 → maandag 29 maart 14:00
    {
      const id3 = await maak("Zomertijd");
      assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id: id3, t: Date.parse("2027-03-22T13:00:00Z"), herhaal: 4 }, S)).status, 200, "reeks over de zomertijd");
      const c = await ctx("Pixel 7", "10.64.0.4", { timezoneId: "Europe/Amsterdam" });
      const p = await c.newPage();
      await p.clock.install({ time: new Date("2027-03-23T10:00:00Z") });
      await p.goto(origin + "/k/" + id3, { waitUntil: "load" });
      await p.waitForFunction(() => document.getElementById("afspraakblok").style.display !== "none");
      const t = await p.textContent("#aftekst");
      assert.match(t, /29 maart.*14:00/, "na de zomertijdwissel nog steeds 14:00 (" + t + ")");
      assert.match(t, /nog 2 keer/, "na de eerste van 4: nog 2 keer na de getoonde (" + t + ")");
      await c.close();
    }
    // 2) laden en niet gevonden: titel in de taal van de patiënt, zonder praktijk
    {
      const c = await ctx("iPhone 14", "10.64.0.2", { locale: "en-GB" });
      const p = await c.newPage();
      let laat = null;
      await p.route((u) => u.pathname === "/api/kaart", async (r) => { await new Promise((res) => { laat = res; }); r.continue(); });
      await p.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "domcontentloaded" });
      await p.waitForFunction(() => document.title === "Training card — Fysiplan");
      laat();
      await p.unroute((u) => u.pathname === "/api/kaart");
      await p.waitForFunction(() => /Fysio Reeks/.test(document.title));
      const p2 = await c.newPage();
      await p2.goto(origin + "/k/0000aaaa0000", { waitUntil: "load" });
      await p2.waitForFunction(() => getComputedStyle(document.getElementById("fout")).display === "block" || getComputedStyle(document.getElementById("storing")).display === "block");
      assert.equal(await p2.evaluate(() => getComputedStyle(document.getElementById("fout")).display), "block", "niet gevonden-pagina");
      assert.equal(await p2.title(), "Training card — Fysiplan", "niet gevonden: Engelse titel");
      await c.close();
    }
    // 3) wissen op een Engelse kaart, telefoon in het Nederlands: titel neutraal, na herladen Engels
    {
      const c = await ctx("iPhone 14", "10.64.0.3");
      const p = await c.newPage();
      p.on("dialog", (d) => d.accept());
      await p.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
      await p.waitForFunction(() => /Fysio Reeks/.test(document.title));
      await p.evaluate(() => document.getElementById("mg_wis").click());
      await p.waitForSelector("#mg_weg");
      assert.equal(await p.title(), "Training card — Fysiplan", "na wissen geen praktijknaam meer in de tab");
      assert.match(p.url(), /\/k\?gewist=1&taal=en$/, "taal blijft in de URL");
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForSelector("#mg_weg");
      assert.equal(await p.evaluate(() => document.documentElement.lang), "en", "gewist-pagina blijft Engels");
      assert.match(await p.textContent("#mg_weg"), /^Removed from this phone/, "Engelse tekst na herladen");
      await c.close();
    }
    console.log("test-kaart-reeks-titel: reeks, titel en wissen werken op Pixel 7 en iPhone 14");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
