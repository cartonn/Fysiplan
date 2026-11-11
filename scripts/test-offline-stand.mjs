// /k zonder internet: wat de patiënt aantikt, staat meteen in de juiste stand.
// - "Ik heb vandaag geoefend" opnieuw aantikken (offline) zet de knop zichtbaar uit en de
//   vinkjes per oefening mee uit; eerder bleef de knop aan terwijl de dag na het online
//   komen stil van de server verdween.
// - Een offline pijnscore staat als gekozen (aria-pressed) en niet alleen als groene tekst.
// - /privacy bij 200 % tekst op 320 px schuift niet horizontaal (lange woorden breken af) en
//   de versieregel/voettekst halen contrast 4,5:1.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:offlinestand`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const gdaan = html.slice(html.indexOf("getElementById('gdaan').addEventListener"), html.indexOf("getElementById('sknoppen').addEventListener"));
assert.match(gdaan, /\.catch\(function\(e\)\{[\s\S]*e\.wacht[\s\S]*tekenGedaan\(\)/, "offline tik op geoefend werkt de knop bij");
const mschaal = html.slice(html.indexOf("getElementById('mschaal').addEventListener"), html.indexOf("getElementById('gdaan').addEventListener"));
assert.match(mschaal, /e\.wacht[\s\S]*tekenMeting\(\)/, "offline pijnscore tekent de gekozen stand");
const jur = await readFile(join(root, "public/juridisch.html"), "utf8");
assert.match(jur, /body\{[^}]*overflow-wrap:(break-word|anywhere)/, "/privacy breekt lange woorden af");
const zacht = (jur.match(/--zacht:#([0-9a-f]{6})/i) || [])[1];
const lum = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
assert.ok(zacht && (lum("f6f2e9") + 0.05) / (lum(zacht) + 0.05) >= 4.5, "/privacy versieregel en voettekst halen 4,5:1");
console.log("test-offline-stand: bron OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-offline-stand: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-offstand-"));
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
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = "Fysio Offline Stand";
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "offline-stand-ww", akkoord: true });
    const S = { "x-praktijk-sessie": (await claim.json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
      chosen: [{ n: "Squat", i: 0 }, { n: "Lunges", i: 1 }], kaartId: "" }, S)).json()).id;
    assert.ok(id);

    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.9.1" } });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept()); // dag uitzetten vraagt eerst (test:daguitvraag)
    const fouten = [];
    page.on("pageerror", (err) => fouten.push(String(err)));
    await page.goto(origin + "/k/" + id);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
    const stand = () => page.getAttribute("#gdaan", "aria-pressed");

    // online: geoefend aan, plus één oefening afgevinkt
    await page.click("#gdaan");
    await page.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
    await page.locator("#oefs .oefdone").first().click();
    await page.waitForFunction(() => document.querySelectorAll("#oefs .oefdone.aan").length === 1, null, { timeout: 5000 });
    await wacht(300);

    // offline: opnieuw tikken zet de dag zichtbaar uit, vinkjes mee
    await ctx.setOffline(true);
    await page.click("#gdaan");
    await page.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "false", null, { timeout: 5000 })
      .catch(async () => assert.fail("knop bleef " + await stand() + " na offline uitzetten"));
    assert.equal(await page.locator("#oefs .oefdone.aan").count(), 0, "vinkjes per oefening gaan mee uit");

    // offline pijnscore staat als gekozen
    await page.locator("#mschaal button[data-score='5']").click();
    await page.waitForFunction(() => /Opgeslagen op je telefoon/.test(document.getElementById("mdank").textContent), null, { timeout: 5000 });
    assert.equal(await page.getAttribute("#mschaal button[data-score='5']", "aria-pressed"), "true", "offline pijnscore is gekozen");

    // weer online: server en kaart zeggen hetzelfde
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForFunction((i) => localStorage.getItem("fp_wacht_" + i) === null, id, { timeout: 10000 });
    const kaart = (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json()).kaart;
    assert.equal((kaart.gedaan || []).length, 0, "dag is uit op de server, net als op het scherm");
    assert.equal(await stand(), "false");
    assert.equal((kaart.metingen || []).slice(-1)[0].s, 5, "pijnscore kwam aan");

    // /privacy bij 200 % tekst op een smalle telefoon
    const pp = await ctx.newPage();
    await pp.setViewportSize({ width: 320, height: 568 });
    await pp.goto(origin + "/privacy");
    await pp.addStyleTag({ content: "html{zoom:2}" });
    const breed = await pp.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(breed <= 322, "/privacy bij 200 % is " + breed + " px breed op 320");
    await pp.close();

    // offline aanzetten toont meteen aan
    await ctx.setOffline(true);
    await page.click("#gdaan");
    await page.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
    await ctx.setOffline(false);
    assert.deepEqual(fouten, []);
    console.log("test-offline-stand: OK");
  } catch (err) {
    console.error(uit.slice(-2000));
    throw err;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
