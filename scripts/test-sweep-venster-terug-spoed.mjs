// Gebruikers-sweep 2026-11-09: vensters in /v2/app waren met alleen het toetsenbord niet te
// gebruiken. De focus bleef achter het venster (Tab liep door de pagina erachter), Escape sloot
// niets, er was geen role="dialog" en na sluiten stond de focus nergens. Nu: elk .ov is een
// dialoog met naam, de focus gaat erin en blijft erin, Escape sluit via de eigen sluitknop
// en de focus keert terug naar de knop waarmee het venster openging.
// Ook /k (Jayden, Pixel 7 en iPhone 14): de terugknop met een open foto (lightbox) verliet de
// kaart. Nu sluit terug alleen de foto, en sluiten met × laat geen extra geschiedenisstap achter.
// En /k (Truus, iPhone SE): de spoedregel zei "Bel de praktijk" terwijl de praktijk geen nummer had.
// Nu zonder nummer "Bel je huisarts", met nummer een tel-link van 44 px in de regel zelf.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:vensterterug`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /\(function vensterToetsenbord\(\)\{/, "venster-toetsenbordlaag aanwezig");
assert.match(appHtml, /m\.setAttribute\('role','dialog'\);m\.setAttribute\('aria-modal','true'\);/, "role=dialog + aria-modal");
assert.match(appHtml, /if\(e\.key==='Escape'\)\{/, "Escape sluit");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /history\.pushState\(\{fplb:1\},''\)/, "lightbox zet een geschiedenisstap");
assert.match(kaartHtml, /window\.addEventListener\('popstate'/, "terugknop sluit de lightbox");
assert.match(kaartHtml, /var TSPOED_ZONDER=\{nl:'Wacht niet op een antwoord\. Bel je huisarts\. Bij nood: 112\.'/, "spoedregel zonder praktijknummer");
assert.match(appHtml, /obs\.observe\(document\.body,\{childList:true\}\);/, "ook later gemaakte vensters");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("venster-toetsenbord: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-venster-"));
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

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const browser = await pw.chromium.launch();
  try {
    for (const [naam, opties] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["iPad staand", pw.devices["iPad (gen 7)"]]]) {
      const ctx = await browser.newContext({ ...opties, extraHTTPHeaders: { "x-forwarded-for": "10.9.7." + (naam.length) } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/v2/app", { waitUntil: "networkidle" });
      const binnen = (id) => page.evaluate((id) => document.getElementById(id).contains(document.activeElement), id);
      const open = (id) => page.evaluate((id) => document.getElementById(id).classList.contains("on"), id);

      // het welkom opent vanzelf bij een nieuwe gebruiker
      await page.waitForSelector("#ovWelkom.on");
      await wacht(100);
      assert.ok(await binnen("ovWelkom"), naam + ": focus in het welkom");
      const dlg = await page.evaluate(() => {
        const m = document.querySelector("#ovWelkom .modal");
        const kop = document.getElementById(m.getAttribute("aria-labelledby") || "-");
        return { role: m.getAttribute("role"), modal: m.getAttribute("aria-modal"), naam: kop ? kop.textContent.trim() : "" };
      });
      assert.equal(dlg.role, "dialog", naam + ": role=dialog");
      assert.equal(dlg.modal, "true", naam + ": aria-modal");
      assert.ok(dlg.naam.length > 3, naam + ": venster heeft een naam");
      await page.keyboard.press("Escape");
      assert.equal(await open("ovWelkom"), false, naam + ": Escape sluit het welkom (Zelf ontdekken)");

      for (const [knop, ov] of [["kaartenBtn", "ovKaarten"], ["clearBtn", "ovWis"]]) {
        await page.focus("#" + knop);
        await page.keyboard.press("Enter");
        await page.waitForSelector("#" + ov + ".on");
        await wacht(100);
        assert.ok(await binnen(ov), naam + ": focus gaat " + ov + " in");
        for (let i = 0; i < 25; i++) {
          await page.keyboard.press("Tab");
          assert.ok(await binnen(ov), naam + ": Tab blijft in " + ov + " (stap " + (i + 1) + ")");
        }
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press("Shift+Tab");
          assert.ok(await binnen(ov), naam + ": Shift+Tab blijft in " + ov);
        }
        await page.keyboard.press("Escape");
        assert.equal(await open(ov), false, naam + ": Escape sluit " + ov);
        await wacht(50);
        assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), knop, naam + ": focus terug op " + knop);
      }
      assert.deepEqual(fouten, [], naam + ": geen scriptfouten");
      await ctx.close();
    }
    // /k: terugknop met open foto
    const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.9.8.1", ...extra }, body: JSON.stringify(body) });
    const P = "Fysio Terugknop";
    const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "terugknop-wachtwoord", akkoord: true })).json()).sessie;
    assert.ok(sessie, "praktijk beveiligd");
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay T.", client: { c_naam: "Jay T." },
      chosen: [{ n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
    assert.ok(id, "kaart gedeeld");
    for (const toestel of ["Pixel 7", "iPhone 14"]) {
      const ctx = await browser.newContext({ ...pw.devices[toestel], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.9." + toestel.length } });
      const page = await ctx.newPage();
      await page.goto(origin + "/privacy", { waitUntil: "domcontentloaded" });
      await page.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
      const foto = page.locator("#oefs .oef img").first();
      await foto.click();
      await page.waitForSelector("#lightbox.open");
      await page.goBack();
      await wacht(150);
      assert.match(page.url(), new RegExp("/k/" + id), toestel + ": terug met open foto blijft op de kaart");
      assert.equal(await page.locator("#lightbox.open").count(), 0, toestel + ": terug sluit de foto");
      await foto.click();
      await page.waitForSelector("#lightbox.open");
      await page.click("#lbsluit");
      await wacht(150);
      assert.match(page.url(), new RegExp("/k/" + id), toestel + ": sluiten met × blijft op de kaart");
      await page.goBack();
      await wacht(150);
      assert.match(page.url(), /\/privacy/, toestel + ": daarna gaat terug gewoon naar de vorige pagina");
      await page.goForward();
      await page.waitForSelector("#sspoed");
      const spoed = await page.textContent("#sspoed");
      assert.doesNotMatch(spoed, /practice/i, toestel + ": zonder nummer geen 'bel de praktijk': " + spoed);
      assert.match(spoed, /GP.*112/, toestel + ": wel huisarts en 112");
      assert.equal(await page.locator("#sspoed a.spoedtel").count(), 0);
      await ctx.close();
    }
    // met telefoonnummer: tel-link in de spoedregel
    assert.equal((await post("/api/praktijken", { praktijk: P, adres: "Teststraat 1", tel: "010-1234567" }, { "x-praktijk-sessie": sessie })).status, 200, "profiel met nummer");
    {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.99" } });
      const page = await ctx.newPage();
      await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      const a = page.locator("#sspoed a.spoedtel");
      assert.equal(await a.getAttribute("href"), "tel:0101234567", "tel-link in de spoedregel");
      assert.match(await page.textContent("#sspoed"), /Bel de praktijk|Call the practice/, "met nummer: bel de praktijk");
      const box = await a.boundingBox();
      assert.ok(box && box.height >= 44, "tel-link minstens 44 px hoog: " + JSON.stringify(box));
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log("venster-toetsenbord: ok (desktop en iPad: focus erin, focus-val, Escape, focus terug, role=dialog; /k terugknop sluit de foto, spoedregel met en zonder nummer)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
