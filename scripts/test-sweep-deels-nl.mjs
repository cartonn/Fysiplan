// Gebruikers-sweep 2026-11-18 18u (Jayden, Pixel 7 / iPhone 14, Engels): mislukte de vertaling, dan stond in
// het overzicht een Engelse kaart met Nederlandse oefennamen, zonder één woord uitleg; in de oefenstand stond
// de melding pas ná de Nederlandse uitleg, op een iPhone 14 onder de vouw. Nu staat bovenaan de oefeningen één
// melding in de taal van de patiënt, krijgen niet-vertaalde namen en het doel lang="nl", en staat de melding
// bij de uitleg vóór de Nederlandse tekst. Met een geslaagde vertaling verschijnt de melding niet.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:deelsnl`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /id="deelsNl" role="note" hidden/, "meldingsregel bovenaan de oefeningen");
for (const t of ["en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) assert.match(k, new RegExp("DEELS_NL=\\{[^}]*" + t + ":'[^']{10,}"), "melding in " + t);
assert.match(k, /<div class="naam" dir="auto"'\+nlAttr\(x\.n\)\+'>/, "naam krijgt lang=nl als hij niet vertaald is");
const blok = k.slice(k.indexOf("function oefUitlegBlok"), k.indexOf("function oefUitlegBlok") + 900);
assert.ok(blok.indexOf("NIET_VERTAALD[TAAL]") < blok.indexOf("uitlegZinnen(vt(o.uitleg))"), "melding vóór de Nederlandse uitleg");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("deels nl: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-deelsnl-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.18." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Deels";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "deels-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden", c_doel: "Terug naar voetbal" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  const open = async (antwoord) => {
    const ctx = await browser.newContext({ ...pw.devices["iPhone 14"], locale: "en-GB", serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.18." + (200 + ip++) } });
    const p = await ctx.newPage();
    await p.route(/\/api\/kaart\/vertaal/, (r) => r.fulfill(antwoord));
    await p.goto(origin + "/k/" + id + "?taal=en");
    await p.waitForSelector(".oef .naam", { timeout: 15000 });
    await wacht(300);
    return { ctx, p };
  };

  // 1. vertaling mislukt (503): melding bovenaan, naam en doel lang=nl
  {
    const { ctx, p } = await open({ status: 503, headers: { "content-type": "application/json" }, body: '{"ok":false}' });
    const r = await p.evaluate(() => {
      const m = document.getElementById("deelsNl");
      const naam = document.querySelector(".oef .naam");
      const doel = [...document.querySelectorAll("#clientblok .rij span")].find((x) => /voetbal/.test(x.textContent));
      return { zicht: !!m && !m.hidden && m.getBoundingClientRect().height > 0, tekst: m ? m.textContent : "", top: m ? m.getBoundingClientRect().top : 9e9,
        naamLang: naam.getAttribute("lang"), naam: naam.textContent, doelLang: doel ? doel.getAttribute("lang") : null };
    });
    assert.ok(r.zicht, "melding zichtbaar in het overzicht");
    assert.match(r.tekst, /not available in English/, "melding in het Engels: " + r.tekst);
    assert.ok(r.top < 844, "melding op het eerste scherm (top " + r.top + ")");
    assert.equal(r.naam, "Bruggen beginner");
    assert.equal(r.naamLang, "nl", "niet-vertaalde naam lang=nl");
    assert.equal(r.doelLang, "nl", "doel van de therapeut lang=nl");
    // oefenstand: melding staat vóór de Nederlandse uitleg
    await p.locator(".oef .fotoknop").first().click();
    await p.waitForSelector("body.sessie .oef.actief .oefuitleg", { timeout: 8000 });
    const volg = await p.evaluate(() => {
      const b = document.querySelector(".oef.actief .oefuitleg");
      const kids = [...b.children];
      return { noot: kids.findIndex((x) => x.classList.contains("nietvertaald")), nl: kids.findIndex((x) => x.getAttribute("lang") === "nl") };
    });
    assert.ok(volg.noot > -1 && volg.nl > -1 && volg.noot < volg.nl, "melding vóór de Nederlandse uitleg: " + JSON.stringify(volg));
    await ctx.close();
  }

  // 2. vertaling geslaagd: geen melding, naam Engels zonder lang=nl
  {
    const body = JSON.stringify({ ok: true, teksten: { "Bruggen beginner": "Bridge, beginner" }, nagelezen: [] });
    const { ctx, p } = await open({ status: 200, headers: { "content-type": "application/json" }, body });
    const r = await p.evaluate(() => ({ hidden: document.getElementById("deelsNl").hidden,
      naam: document.querySelector(".oef .naam").textContent, lang: document.querySelector(".oef .naam").getAttribute("lang") }));
    assert.equal(r.naam, "Bridge, beginner", "vertaalde naam");
    assert.equal(r.hidden, true, "geen melding als de namen vertaald zijn");
    assert.equal(r.lang, null, "vertaalde naam zonder lang=nl");
    await ctx.close();
  }
  console.log("deels nl: ok (melding bovenaan bij mislukte vertaling, lang=nl, melding vóór de uitleg)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
