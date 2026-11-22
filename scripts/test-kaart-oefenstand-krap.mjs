// Regressietest gebruikers-sweep 2026-11-22 10u (Truus, 72, iPhone SE met 200 % tekst, "A A" en geen internet):
// in de oefenstand op een oefening die al gedaan is bleef tussen kop- en onderbalk 21 px over (offlinebalk 116 px,
// kop 169 px met "Oefening 1 van / 4", statusregel 170 px op drie regels), en zette ze 200 % of "A A" aan terwijl
// de kaart al open stond, dan bleef body.krap uit (zetKrap draaide alleen bij laden en resize): −3 px, "Volge/nde".
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:oefenstandkrap`
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
assert.match(html, /if\(document\.documentElement\.classList\.contains\('groot'\)\)r\*=1\.16;/, "zetKrap rekent de zoom van A A mee");
assert.match(html, /new ResizeObserver\(function\(\)\{zetKrap\(\);\}\)\.observe\(remMaat\)/, "zetKrap volgt een andere tekstgrootte zonder resize");
assert.match(html, /classList\.toggle\('groot',aan\);\s*zetKrap\(\);/, "A A zet krap meteen goed");
assert.match(html, /body\.krap \.sstatus\{display:block;/, "statusregel is bij grote letters één tekstregel");
assert.match(html, /body\.sessie\.krap #offlijn \.offkort\{display:inline\}/, "korte offlinetekst in de oefenstand");
console.log("test-kaart-oefenstand-krap (statisch): krap volgt tekstgrootte en A A, compacte kop, status en offlinebalk");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-oefenstand-krap: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefkrap-"));
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
    // [toestel, 200 % al vóór openen?, A A, offline]
    const gevallen = [["iPhone SE", true, true, true], ["iPhone SE", false, true, true], ["iPhone SE", false, false, false], ["iPhone SE", true, false, true], ["Pixel 7", false, true, true]];
    for (const [toestel, vooraf, aa, offline] of gevallen) {
      const tag = toestel + (vooraf ? " 200 % vooraf" : " 200 % terwijl open") + (aa ? " + A A" : "") + (offline ? " + offline" : "");
      const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.64.0.1" } });
      if (vooraf) await c.addInitScript(() => { const zet = () => { const s = document.createElement("style"); s.id = "tg"; s.textContent = "html{font-size:200% !important}"; document.documentElement.appendChild(s); };
        if (document.documentElement) zet(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); zet(); } }).observe(document, { childList: true }); });
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      await p.waitForSelector("#startknop", { state: "visible" });
      await p.click("#startknop");
      await p.waitForSelector("#sessiebalk:not([hidden])");
      // eerste oefening afvinken en terug ernaartoe: de statusregel "Vandaag gedaan · Toch niet gedaan" staat er
      await p.evaluate(() => document.getElementById("sklaar").click());
      await wacht(700);
      await p.evaluate(() => document.getElementById("svorige").click());
      await wacht(400);
      assert.ok(await p.evaluate(() => !document.getElementById("sstatus").hidden), tag + ": oefening staat als gedaan");
      if (offline) { await c.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event("offline"))); await wacht(200); }
      if (!vooraf) await p.evaluate(() => { const s = document.createElement("style"); s.textContent = "html{font-size:200% !important}"; document.head.appendChild(s); });
      if (aa) await p.evaluate(() => document.getElementById("grootBtn").click());
      await wacht(400);
      await p.evaluate(() => scrollTo(0, 0));
      await wacht(200);
      const m = await p.evaluate(() => {
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height }; };
        const off = document.getElementById("offlijn");
        return { krap: document.body.classList.contains("krap"), hoog: innerHeight, breed: innerWidth, sw: document.documentElement.scrollWidth,
          kop: r(document.getElementById("sessiekop")), balk: r(document.getElementById("sessiebalk")), status: r(document.getElementById("sstatus")),
          naam: r(document.querySelector(".oef.actief .naam")), off: off && off.style.display !== "none" ? r(off) : null,
          toch: r(document.getElementById("songedaan")), volgendeBreekt: (() => { const b = document.getElementById("sklaar"); return b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().height > 70; })() };
      });
      assert.ok(m.krap, tag + ": body.krap staat aan");
      if (offline) assert.ok(m.off, tag + ": offlinebalk in beeld");
      const vrij = m.balk.t - Math.max(m.kop.b, m.off ? m.off.b : 0);
      assert.ok(vrij >= 120, tag + ": genoeg ruimte tussen kop- en onderbalk (" + Math.round(vrij) + " px) " + JSON.stringify(m));
      assert.ok(m.naam && m.naam.t < m.balk.t - 20 && m.naam.t >= m.kop.b - 1, tag + ": oefennaam in beeld tussen de balken " + JSON.stringify(m));
      assert.ok(m.status.h <= 100, tag + ": statusregel niet hoger dan twee regels (" + m.status.h + " px)");
      assert.ok(m.toch.r <= m.breed + 0.5 && m.toch.h >= 43.5, tag + ": Toch niet gedaan in beeld en 44 px hoog " + JSON.stringify(m.toch));
      assert.equal(m.sw, m.breed, tag + ": pagina niet breder dan het scherm");
      assert.ok(!m.volgendeBreekt, tag + ": tekst Volgende breekt niet af");
      // "Vandaag gedaan" en "Overzicht" blijven zichtbaar (hertest Truus: alleen een vinkje naast "Toch niet gedaan" was verwarrend)
      assert.ok(await p.evaluate(() => ["sstatusTxt", "sterugTxt"].every((i) => { const e = document.getElementById(i); const b = e.getBoundingClientRect(); return e.textContent.length > 3 && b.width > 20 && b.right <= innerWidth + 0.5; })), tag + ": Vandaag gedaan en Overzicht zichtbaar");
      if (offline) assert.ok(await p.evaluate(() => { const k = document.querySelector("#offlijn .offkort"); return k && k.getBoundingClientRect().height > 0 && getComputedStyle(document.querySelector("#offlijn .offlang")).display === "none"; }), tag + ": korte offlinetekst helemaal zichtbaar");
      assert.deepEqual(fouten, [], tag + ": geen scriptfouten");
      await c.close();
    }
    // 100 % op een gewone telefoon: niets verandert (geen krap, status en kop zoals voorheen)
    const c = await browser.newContext({ ...pw.devices["iPhone 14"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.64.0.2" } });
    const p = await c.newPage();
    await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
    await p.click("#startknop");
    await p.waitForSelector("#sessiebalk:not([hidden])");
    assert.ok(await p.evaluate(() => !document.body.classList.contains("krap") && getComputedStyle(document.getElementById("sstatus")).display !== "block" && getComputedStyle(document.getElementById("sstip")).display !== "none"), "iPhone 14 100 %: geen krap, gewone kop en status");
    await c.close();
    console.log("test-kaart-oefenstand-krap: bij 200 %, A A en offline op een gedane oefening staat de naam tussen de balken, ook als de tekstgrootte verandert terwijl de kaart open is");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
