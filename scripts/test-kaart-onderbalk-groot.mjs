// Regressietest gebruikers-sweep 2026-11-11 14u/18u (Truus, 72, iPhone SE met 200 % tekst en "A A"):
// in de oefenstand viel de pijl "volgende" buiten beeld, en bij een lang woord ("tegenovergestelde" in Dead bug)
// werd de pagina breder dan het scherm en stond "Gedaan" er half naast.
// Oorzaak: body.krap .srij en .sstatus zijn flex-items met min-width:auto, en /k had geen overflow-wrap op body.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:onderbalkgroot`
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
assert.match(html, /body\{[^}]*overflow-wrap:break-word/, "lange woorden breken af in plaats van de pagina te verbreden");
assert.match(html, /body\.krap \.srij,body\.krap \.sstatus\{min-width:0\}/, "onderbalk krimpt mee bij grote letters");
assert.match(html, /body\.krap \.appbanner\{display:none !important\}/, "tip 'Zet op beginscherm' bedekt bij grote letters de kaart niet");
assert.match(html, /html\.groot \.lightbox \.demobeeld\{width:min\(420px,calc\(\(100vw - 60px\) \/ 1\.16\)/, "vergrote foto past bij A A");
console.log("test-kaart-onderbalk-groot (statisch): onderbalk, lange woorden, tip en vergrote foto passen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-onderbalk-groot: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-onderbalk-"));
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
    for (const [toestel, groot, aa] of [["iPhone SE", "200%", true], ["iPhone SE", "100%", true], ["iPhone SE", "200%", false], ["Pixel 7", "200%", true]]) {
      const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.63.0.1" } });
      // tekstgrootte van de telefoon nabootsen vóór zetKrap() draait (zoals een telefooninstelling)
      await c.addInitScript((g) => { const zet = () => { const s = document.createElement("style"); s.textContent = "html{font-size:" + g + " !important}"; document.documentElement.appendChild(s); };
        if (document.documentElement) zet(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); zet(); } }).observe(document, { childList: true }); }, groot);
      if (aa) await c.addInitScript(() => { try { localStorage.setItem("fp_groot", "1"); } catch {} });
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      await p.waitForSelector("#startknop", { state: "visible" });
      const tag = toestel + " " + groot + (aa ? " + A A" : "");
      assert.equal(await p.evaluate(() => document.documentElement.classList.contains("groot")), aa, tag + ": A A staat goed");
      await p.click("#startknop");
      await p.waitForSelector("#sessiebalk:not([hidden])");
      // lang woord zoals in Dead bug, in de uitleg van de oefening die open staat
      await p.evaluate(() => { const o = document.querySelector(".oef.actief"); const s = document.createElement("p"); s.textContent = "Breng je arm naar de tegenovergestelde knie, rustig en gecontroleerd."; o.appendChild(s); });
      await wacht(100);
      const m = await p.evaluate(() => {
        const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
        return { breed: innerWidth, hoog: innerHeight, sw: document.documentElement.scrollWidth, vorige: r("svorige"), klaar: r("sklaar"), volgende: r("svolgende") };
      });
      assert.equal(m.sw, m.breed, tag + ": pagina niet breder dan het scherm (" + m.sw + " > " + m.breed + ")");
      for (const k of ["vorige", "klaar", "volgende"]) {
        assert.ok(m[k].l >= -0.5 && m[k].r <= m.breed + 0.5, tag + ": " + k + " binnen beeld in de breedte " + JSON.stringify(m[k]));
        assert.ok(m[k].b <= m.hoog + 0.5, tag + ": " + k + " binnen beeld in de hoogte " + JSON.stringify(m[k]));
      }
      assert.ok(m.klaar.w >= 88, tag + ": Gedaan blijft een flinke knop (" + m.klaar.w + " px)");
      // de knop zelf: tekst past
      assert.ok(await p.evaluate(() => { const b = document.getElementById("sklaar"); return b.scrollWidth <= b.clientWidth + 1; }), tag + ": tekst Gedaan past in de knop");
      // terug naar een afgevinkte oefening: "Volgende", pijl en "Toch niet gedaan" in beeld
      await p.evaluate(() => document.getElementById("sklaar").click());
      await wacht(800);
      await p.evaluate(() => document.getElementById("svorige").click());
      await wacht(500);
      const m2 = await p.evaluate(() => {
        const r = (id) => { const e = document.getElementById(id); if (!e || e.closest("[hidden]")) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, b: b.bottom }; };
        return { breed: innerWidth, hoog: innerHeight, sw: document.documentElement.scrollWidth, volgende: r("svolgende"), klaar: r("sklaar"), toch: r("songedaan") };
      });
      assert.equal(m2.sw, m2.breed, tag + ": afgevinkte oefening niet breder dan het scherm");
      for (const k of ["volgende", "klaar", "toch"]) if (m2[k]) assert.ok(m2[k].l >= -0.5 && m2[k].r <= m2.breed + 0.5 && m2[k].b <= m2.hoog + 0.5, tag + ": " + k + " in beeld op een afgevinkte oefening " + JSON.stringify(m2[k]));
      // vergrote foto: niets steekt rechts uit
      if (await p.$(".oef.actief .fotoknop")) {
        await p.evaluate(() => document.querySelector(".oef.actief .fotoknop").click());
        await wacht(600);
        const uit = await p.evaluate(() => [...document.querySelectorAll("#lightbox, #lightbox *")].filter((e) => !e.closest("[hidden]") && getComputedStyle(e).display !== "none")
          .map((e) => e.getBoundingClientRect()).filter((q) => q.width && (q.right > innerWidth + 1 || q.left < -1)).length);
        assert.equal(uit, 0, tag + ": vergrote foto binnen beeld");
      }
      assert.deepEqual(fouten, [], tag + ": geen scriptfouten");
      await c.close();
    }
    console.log("test-kaart-onderbalk-groot: vorige, Gedaan en volgende binnen beeld op iPhone SE en Pixel 7, ook bij 200 % + A A");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
