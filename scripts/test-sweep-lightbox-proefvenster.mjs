// Gebruikers-sweep 2026-11-08 22u:
// 1. /k-lightbox op een iPhone SE (staand, ook liggend en bij 200 %): de foto viel boven het scherm weg,
//    de witte oefennaam stond over de uitleg, de onderkant was onbereikbaar en er was geen sluitknop.
//    Nu: scrollbaar, naam boven de foto in de gewone volgorde, sluitknop van 44 px.
// 2. /k in het Arabisch: een Nederlandse oefennaam kwam in RTL te staan ("graden 360"). Nu dir="auto".
// 3. App, verlopen proef: Bewaar bij afspraak, behandelaar, doelactiviteit en notitie in het
//    Kaarten-venster weigerde stil (melding alleen in de proefbalk áchter het venster, of 1,6 s als
//    knoptekst). Nu een blijvende melding naast de knop, in het venster.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:lightbox`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
const appHtml = await readFile(join(root, "public/index.html"), "utf8");

// 1 + 2: lightbox en leesrichting
assert.match(kaartHtml, /\.lightbox\{[^}]*overflow-y:auto/, "lightbox scrollt");
assert.match(kaartHtml, /\.lightbox\{[^}]*justify-content:safe center/, "lightbox centreert veilig");
assert.doesNotMatch(kaartHtml, /\.lightbox \.lbnaam\{position:absolute/, "naam niet meer over de uitleg");
assert.match(kaartHtml, /<button type="button" class="lbsluit" id="lbsluit" aria-label="Sluiten">/, "sluitknop");
assert.match(kaartHtml, /\.lbsluit\{[^}]*width:44px;height:44px/, "sluitknop 44 px");
assert.match(kaartHtml, /<div class="naam" dir="auto">/, "oefennaam met eigen leesrichting");
assert.match(kaartHtml, /<th colspan="3" dir="auto">/, "schemakop met eigen leesrichting");
assert.match(kaartHtml, /id="lbnaam" dir="auto"/, "lightboxnaam met eigen leesrichting");

// 3: verlopen proef in het Kaarten-venster nooit stil
assert.match(appHtml, /function toonProefVoorbij\(anker,stil\)\{/, "toonProefVoorbij kent een anker");
assert.match(appHtml, /querySelectorAll\('\.ov\.on \.modal'\)/, "melding ook in een open venster");
assert.match(appHtml, /if\(d\.proefVerlopen\)\{toonProefVoorbij\(null,true\);return;\}\s*laatsteDeel='';/, "automatische opslag zet geen melding in een venster");
assert.match(appHtml, /rij\.parentNode\.insertBefore\(maakPV\(\),rij\.nextSibling\)/, "melding onder de rij, het veld blijft breed");
assert.match(appHtml, /if\(o\.defaultSelected\)sel\.value=o\.value;\}\);toonProefVoorbij\(sel\);/, "oefendoel springt terug bij een verlopen proef");
for (const [knop, toon] of [["af", null], ["ps", "toonP"], ["bh", "toonB"], ["nt", "toonN"]]) {
  assert.match(appHtml, new RegExp("toonProefVoorbij\\(" + knop + "\\)"), "melding naast de knop: " + knop);
  if (toon) assert.match(appHtml, new RegExp("else if\\(d\\.proefVerlopen\\)toonProefVoorbij\\(" + knop + "\\);else " + toon + "\\("), "geen knoptekst van 1,6 s: " + knop);
}

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("lightbox/proefvenster: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-lightbox-"));
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
const P = "Fysio Lightbox";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "lightbox-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus V.", client: { c_naam: "Truus V." },
    chosen: [{ n: "360 graden ademhaling – eerste fase rustig", id: "fp_8d4fb0f3f39ab16e", i: 0 }, { n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }],
    kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  const browser = await pw.chromium.launch();
  try {
    // (200 % is hier niet na te bootsen: een mobiele viewport van 160 px rekt mee met de bredere pagina)
    for (const [naam, opties] of [["iPhone SE", { locale: "nl-NL" }], ["iPhone SE en", { locale: "en-GB" }],
      ["iPhone 14 liggend ar", { viewport: { width: 844, height: 390 }, taal: "ar" }]]) {
      const { taal, ...rest } = opties;
      const ctx = await browser.newContext({ ...pw.devices[naam.startsWith("iPhone 14") ? "iPhone 14" : "iPhone SE"], ...rest,
        extraHTTPHeaders: { "x-forwarded-for": "10.8.9." + (ip++) } });
      const page = await ctx.newPage();
      await page.goto(origin + "/k/" + id + (taal ? "?taal=" + taal : ""), { waitUntil: "networkidle" });
      const foto = page.locator("#oefs .oef img").first();
      await foto.waitFor();
      // eerste tik opent de oefening, een tik op het grote beeld daarna de vergroting
      await foto.click();
      await page.waitForSelector("body.sessie #oefs .oef.actief img");
      await foto.click();
      await page.waitForSelector("#lightbox.open");
      await wacht(400);
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const lb = document.getElementById("lightbox");
        return { foto: r("#lbfoto"), naam: r("#lbnaam"), uitleg: r("#lbuitleg"), sluit: r("#lbsluit"), h: innerHeight,
          scrollH: lb.scrollHeight, clientH: lb.clientHeight, overflow: getComputedStyle(lb).overflowY,
          naamDir: getComputedStyle(document.querySelector("#oefs .naam")).direction };
      });
      assert.ok(m.foto.top >= 0, naam + ": foto begint in beeld (" + m.foto.top + ")");
      assert.ok(m.naam.bottom <= m.foto.top + 1, naam + ": naam boven de foto, niet over de uitleg");
      assert.ok(m.sluit.width >= 44 && m.sluit.height >= 44, naam + ": sluitknop 44 px");
      if (m.scrollH > m.clientH) {
        assert.equal(m.overflow, "auto", naam + ": lightbox scrolt");
        await page.evaluate(() => { const lb = document.getElementById("lightbox"); lb.scrollTop = lb.scrollHeight; });
        const onder = await page.evaluate(() => document.getElementById("lbuitleg").getBoundingClientRect().bottom);
        assert.ok(onder <= m.h + 1, naam + ": onderkant van de uitleg bereikbaar (" + onder + " > " + m.h + ")");
      }
      if (taal === "ar") assert.equal(m.naamDir, "ltr", "Nederlandse oefennaam blijft links-naar-rechts op een Arabische kaart");
      await page.click("#lbsluit");
      await wacht(200);
      assert.equal(await page.locator("#lightbox.open").count(), 0, naam + ": sluitknop sluit");
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log("lightbox/proefvenster: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
