// Regressietest gebruikers-sweep 2026-11-11 02u (/k, patiëntkaart):
// - Jayden (Pixel 7/iPhone 14): bleef de kaart over middernacht open, dan stond "Ik heb vandaag geoefend" nog aan
//   van gisteren; de eerste tik van de nieuwe dag stuurde `aan:false` en die oefendag ging verloren.
// - Jayden: koos de patiënt een andere taal dan die in de link (?taal=en), dan sprong de kaart bij elke QR-scan
//   terug naar de taal van de link.
// - Truus (iPhone SE, 200 % tekst): de oefenstand toonde alleen het beeld; de compacte stand `@media (max-height:26em)`
//   springt bij grote letters niet aan (media-em = 16 px). Nu zet zetKrap() body.krap.
// - Sanne (desktop → /k): haalde de praktijk na het delen een oefening weg, dan schoven de vinkjes van vandaag
//   naar een andere oefening (bewaard per positie). Nu met de naam erbij.
// - Truus: herstelknoppen gaven hun keuze niet door aan een schermlezer (aria-pressed).
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:dagwisseltaal`
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
assert.match(html, /visibilitychange',function\(\)\{if\(document\.hidden\)\{[^}]*\}else dagWissel\(\);\}/, "terug naar de kaart tekent opnieuw bij een nieuwe dag");
assert.match(html, /setInterval\(dagWissel,/, "ook een kaart die open blijft merkt de nieuwe dag");
assert.match(html, /getElementById\('gdaan'\)\.addEventListener\('click',function\(\)\{\s*dagWissel\(\);/, "de oefendag-knop kijkt eerst naar de datum van vandaag");
assert.match(html, /function alles\(\)\{getekendDag=dagStr\(Date\.now\(\)\);/, "alles() onthoudt de getekende dag");
assert.match(html, /fp_taalkeus_'\+id,JSON\.stringify\(\{link:q,keus:sel\.value\}\)/, "eigen taalkeuze bij deze link wordt bewaard");
assert.match(html, /kz&&kz\.link===q&&isTaal\(kz\.keus\)\?kz\.keus:q/, "eigen taalkeuze wint van dezelfde link");
assert.match(html, /body\.krap \.oef\.actief \.fotoknop img\{max-height:34vh\}/, "grote letters: compacte oefenstand");
assert.match(html, /classList\.toggle\('krap',window\.innerHeight\/r<26\)/, "body.krap volgt de lettergrootte, niet de media-em");
assert.match(html, /done=naarHuidig\(s\.done,s\.n\)/, "vinkjes volgen de oefening, niet de positie");
assert.match(html, /idx:naarHuidig\(s\.idx,s\.n\)/, "te zwaar volgt de oefening");
assert.match(html, /b\.classList\.toggle\('aan',aan\);b\.setAttribute\('aria-pressed'/, "herstelknoppen met aria-pressed");
console.log("test-kaart-dagwissel-taal (statisch): dagwissel, taalkeuze, grote letters en aria-pressed staan erin");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-dagwissel-taal: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-dagwissel-"));
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
    const ctx = async (toestel, ip, extra = {}) => browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": ip }, ...extra });

    // kaart van een praktijk (geen demo: die vult zelf oefendagen in)
    let ip = 1;
    const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.63.1." + (ip++), ...extra }, body: JSON.stringify(body) });
    const P = "Fysio Dagwissel";
    const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "dagwissel-wachtwoord", akkoord: true })).json()).sessie };
    const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" },
      chosen: [{ n: "Squat", i: 0 }, { n: "Lunge", i: 1 }], kaartId: "" }, S)).json()).id;
    assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

    // 1) dagwissel: gisteren aangetikt, kaart blijft open; de eerste tik van vandaag moet de dag AAN zetten
    {
      const c = await ctx("Pixel 7", "10.63.0.1");
      const p = await c.newPage();
      const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
      const verzonden = [];
      await p.route((u) => u.pathname === "/api/kaart/gedaan", async (r) => {
        const body = JSON.parse(r.request().postData() || "{}");
        verzonden.push(body.aan);
        const nu = await p.evaluate(() => Date.now());
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, gedaan: body.aan ? [{ t: nu }] : [] }) });
      });
      await p.clock.install({ time: new Date("2026-11-09T21:00:00") });
      await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await p.waitForSelector("#gdaan");
      assert.equal(await p.evaluate(() => document.getElementById("gdaan").getAttribute("aria-pressed")), "false");
      await p.evaluate(() => document.getElementById("gdaan").click());
      await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true");
      // nacht voorbij, de kaart bleef open; terug naar het tabblad
      await p.clock.setSystemTime(new Date("2026-11-10T08:00:00"));
      await p.evaluate(() => window.dispatchEvent(new Event("focus")));
      assert.equal(await p.evaluate(() => document.getElementById("gdaan").getAttribute("aria-pressed")), "false", "nieuwe dag: de knop staat weer uit");
      // nog een nacht, nu zonder focus-gebeurtenis: de tik zelf kijkt naar de datum
      await p.clock.setSystemTime(new Date("2026-11-11T08:00:00"));
      await p.evaluate(() => document.getElementById("gdaan").click());
      await p.waitForFunction(() => !document.getElementById("gdaan").dataset.bezig);
      assert.deepEqual(verzonden, [true, true], "elke eerste tik van een dag registreert die dag (aan:true)");
      assert.equal(await p.evaluate(() => document.getElementById("gdaan").getAttribute("aria-pressed")), "true");
      assert.deepEqual(fouten, [], "geen scriptfouten");
      await c.close();
    }

    // 2) taalkeuze van de patiënt blijft bij dezelfde link, een andere link-taal wint wel
    {
      const c = await ctx("iPhone 14", "10.63.0.2");
      const p = await c.newPage();
      await p.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
      await p.waitForFunction(() => document.documentElement.lang === "en");
      await p.selectOption("#taalsel", "nl");
      await p.waitForFunction(() => document.documentElement.lang === "nl");
      await p.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
      await p.waitForSelector("#gdaan");
      assert.equal(await p.evaluate(() => document.documentElement.lang), "nl", "zelfde link opnieuw: eigen keuze Nederlands blijft");
      assert.equal(await p.evaluate(() => document.getElementById("laden_tekst").textContent), "Je kaart wordt geladen…", "laadtekst volgt de eigen keuze");
      await p.goto(origin + "/k/" + id + "?taal=de", { waitUntil: "networkidle" });
      await p.waitForSelector("#gdaan");
      assert.equal(await p.evaluate(() => document.documentElement.lang), "de", "nieuwe link met een andere taal wint");
      // terug naar de taal van de link wist de eigen keuze
      await p.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
      await p.waitForSelector("#gdaan");
      await p.selectOption("#taalsel", "en");
      assert.equal(await p.evaluate((k) => localStorage.getItem(k), "fp_taalkeus_" + id), null, "keuze gelijk aan de link: niets bewaard");
      await c.close();
    }

    // 3) grote letters op een iPhone SE: naam en begin van de uitleg in het eerste scherm van de oefenstand
    {
      const c = await ctx("iPhone SE", "10.63.0.3");
      await c.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "html{font-size:200% !important}"; document.head.appendChild(s); }); });
      const p = await c.newPage();
      await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await p.waitForSelector("#startknop");
      await p.evaluate(() => window.dispatchEvent(new Event("resize")));
      assert.ok(await p.evaluate(() => document.body.classList.contains("krap")), "200 % op iPhone SE: compacte stand");
      await p.evaluate(() => document.getElementById("startknop").click());
      await p.waitForFunction(() => document.body.classList.contains("sessie"));
      await wacht(300);
      const m = await p.evaluate(() => {
        const o = document.querySelector(".oef.actief"), n = o.querySelector(".naam"), b = document.querySelector(".sbalk");
        return { naamOnder: n.getBoundingClientRect().bottom, balkBoven: b.getBoundingClientRect().top, h: innerHeight };
      });
      assert.ok(m.naamOnder <= m.balkBoven, `naam van de oefening staat boven de vaste balk (${Math.round(m.naamOnder)} ≤ ${Math.round(m.balkBoven)})`);
      await c.close();
      // gewone letters: geen compacte stand
      const c2 = await ctx("iPhone SE", "10.63.0.4");
      const p2 = await c2.newPage();
      await p2.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await p2.waitForSelector("#startknop");
      assert.ok(!(await p2.evaluate(() => document.body.classList.contains("krap"))), "100 %: geen compacte stand");
      await c2.close();
    }
    // 4) Sanne: patiënt vinkt Brug af, de praktijk haalt daarna Squat weg; alleen Brug blijft afgevinkt
    {
      const id2 = (await (await post("/api/kaarten", { praktijk: P, naam: "Anna", client: { c_naam: "Anna" },
        chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }, { n: "Plank", i: 2 }], kaartId: "" }, S)).json()).id;
      const c = await ctx("iPhone SE", "10.63.0.5");
      const p = await c.newPage();
      await p.goto(origin + "/k/" + id2, { waitUntil: "networkidle" });
      await p.waitForSelector('#oefs .oefdone[data-idx="1"]');
      await p.click('#oefs .oefdone[data-idx="1"]');
      await p.waitForFunction(() => document.querySelector('#oefs .oefdone[data-idx="1"]').getAttribute("aria-pressed") === "true");
      await wacht(1500);
      const r = await post("/api/kaarten", { praktijk: P, naam: "Anna", client: { c_naam: "Anna" },
        chosen: [{ n: "Brug", i: 1 }, { n: "Plank", i: 2 }], kaartId: id2 }, S);
      assert.equal(r.status, 200, "praktijk haalt Squat weg");
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForSelector('#oefs .oefdone[data-idx="1"]');
      const aan = await p.evaluate(() => [...document.querySelectorAll("#oefs .oef")].filter((o) => o.querySelector(".oefdone").getAttribute("aria-pressed") === "true").map((o) => o.querySelector(".naam").textContent.trim()));
      assert.equal(aan.length, 1, "één oefening afgevinkt: " + aan.join(", "));
      assert.match(aan[0], /Brug/, "het vinkje staat bij Brug");
      await c.close();
    }
    console.log("test-kaart-dagwissel-taal: nieuwe dag, taalkeuze en grote letters werken op Pixel 7, iPhone 14 en iPhone SE");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
