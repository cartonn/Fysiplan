// De vier schermknoppen passen op elk scherm (gebruikers-sweep 2026-11-12, Mark).
// `npm run test:schermknoppen`
//
// Op een liggende iPad (1080 breed) liep het menu Vandaag/Patiënten/Kaart maken/Praktijk van het
// scherm (je zag "Pra" en een tik op Praktijk raakte Kaart maken); op 1280 werd de bovenbalk 6 px te
// breed zodra Vandaag een getal toonde; de knop Ideeën stond onder 1100 px zonder opmaak (grijs met
// witte tekst); en de schermknoppen waren 30 px hoog op een aanraakscherm.
// Hier, met een seintje zodat het getal bij Vandaag staat: geen horizontale scroll, alle vier knoppen
// helemaal in beeld en raakbaar (elementFromPoint in het midden is de knop zelf) op 1080×810, 810×1080,
// 1280×800 en 1100×800; de knop Ideeën leesbaar (contrast ≥ 4,5:1) onder 1100 px; op een aanraakscherm
// zijn de schermknoppen minstens 44 px hoog.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
// broncontrole (ook zonder browser)
assert.match(css, /@media screen and \(max-width:1099px\)\{\n  html\.v2 \.fp-schermen\{order:8;flex-basis:100%;/, "onder 1100 px een eigen rij voor de schermknoppen");
assert.doesNotMatch(css, /@media screen and \(max-width:920px\)\{\n  html\.v2 \.fp-schermen\{order:8/, "niet meer pas onder 920 px");
assert.match(css, /@media screen and \(pointer:coarse\)\{\n  html\.v2 \.fp-schermen button\{min-height:44px/, "44 px op een aanraakscherm");
assert.match(css, /html\.v2 \.fp-ideeknop\{[^}]*background:transparent;[^}]*color:#fff/, "Ideeën heeft ook onder 1100 px opmaak");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-schermknoppen-"));
const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
let app, uit = "", browser;
let ip = 1;
const kop = (x = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.5." + (ip++ & 255), ...x });
const post = (p, b, x) => fetch(origin + p, { method: "POST", headers: kop(x), body: JSON.stringify(b) });
// WCAG-contrast tussen twee kleuren (rgb/rgba, alfa over de achtergrond)
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
try {
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claim = await (await post("/api/praktijk/claim", { praktijk: "Fysiotherapie Breedveld en Partners", wachtwoord: "breed-wachtwoord-1", akkoord: true })).json();
  const r = await post("/api/kaarten", { praktijk: "Fysiotherapie Breedveld en Partners", naam: "Truus", client: { c_naam: "Truus" }, kaartId: "", chosen: [{ n: "Squat", i: 0 }] }, { "x-praktijk-sessie": claim.sessie });
  assert.equal(r.status, 200, uit.slice(-300));
  assert.equal((await post("/api/kaart/seintje", { id: (await r.json()).id, soort: "pijn" })).status, 200);

  browserdeel: {
  let pw;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-schermknoppen-breedte: geen Playwright, browserdeel overgeslagen"); break browserdeel; }
  browser = await pw.chromium.launch();
  const ipad = pw.devices["iPad (gen 7) landscape"];
  const maten = [
    { naam: "iPad liggend", opties: { ...ipad } },
    { naam: "iPad staand", opties: { ...pw.devices["iPad (gen 7)"] } },
    { naam: "1080×810", opties: { viewport: { width: 1080, height: 810 } } },
    { naam: "810×1080", opties: { viewport: { width: 810, height: 1080 } } },
    { naam: "1280×800", opties: { viewport: { width: 1280, height: 800 } } },
    { naam: "1100×800", opties: { viewport: { width: 1100, height: 800 } } },
    { naam: "1000×800", opties: { viewport: { width: 1000, height: 800 } } },
  ];
  const fouten = [];
  for (const m of maten) {
    const ctx = await browser.newContext({ ...m.opties, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.6." + (ip++ & 255) } });
    await ctx.addInitScript(([s]) => { try {
      localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysiotherapie Breedveld en Partners" }));
      localStorage.setItem("fp_praksessie", s);
    } catch {} }, [claim.sessie]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => fouten.push(m.naam + ": " + e));
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("#fpSchermen [data-scherm='vandaag']", { timeout: 15000 });
    await p.waitForFunction(() => { const t = document.getElementById("fs_tel"); return t && !t.hidden && t.textContent === "1"; }, null, { timeout: 10000 });
    await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    await p.waitForTimeout(300);
    const meet = () => p.evaluate(() => ({
      breed: innerWidth, scroll: document.documentElement.scrollWidth, kop: document.querySelector("header.topbar").scrollWidth,
      knoppen: [...document.querySelectorAll("#fpSchermen [data-scherm]")].map((b) => {
        const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const raak = document.elementFromPoint(x, y);
        return { scherm: b.dataset.scherm, l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height), raak: !!raak && b.contains(raak), heel: r.left >= 0 && r.right <= innerWidth + 0.5 && r.width > 0 };
      }),
      menu: (() => { const n = document.getElementById("fpSchermen"); return { scroll: n.scrollWidth, client: n.clientWidth }; })(),
      grof: matchMedia("(pointer:coarse)").matches,
    }));
    for (const scherm of ["maken", "vandaag"]) {
      if (scherm === "vandaag") { await p.click("#fpSchermen [data-scherm='vandaag']"); await p.waitForTimeout(400); }
      const x = await meet();
      const wat = `${m.naam} (${scherm})`;
      assert.ok(x.scroll <= x.breed, `${wat}: geen horizontale scroll (${x.scroll} > ${x.breed})`);
      assert.ok(x.kop <= x.breed, `${wat}: de bovenbalk past (${x.kop} > ${x.breed})`);
      assert.ok(x.menu.scroll <= x.menu.client + 1, `${wat}: het menu zelf schuift niet (${x.menu.scroll} > ${x.menu.client})`);
      for (const k of x.knoppen) {
        assert.ok(k.heel, `${wat}: ${k.scherm} helemaal in beeld (${k.l}–${k.r})`);
        assert.ok(k.raak, `${wat}: ${k.scherm} raakbaar in het midden`);
        if (x.grof) assert.ok(k.h >= 44, `${wat}: ${k.scherm} minstens 44 px hoog op een aanraakscherm (${k.h})`);
      }
    }
    // een tik op Praktijk is Praktijk
    await p.click("#fpSchermen [data-scherm='praktijk']");
    await p.waitForFunction(() => document.documentElement.getAttribute("data-scherm") === "praktijk", null, { timeout: 5000 });
    // de knop Ideeën: leesbaar op de bovenbalk
    const idee = await p.evaluate(() => {
      const b = document.getElementById("fpIdeeKnop"); if (!b || !b.offsetWidth) return null;
      const kleur = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      let el = b, bg = null;
      while (el) { const c = kleur(getComputedStyle(el).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) { bg = c.slice(0, 3); break; } el = el.parentElement; }
      const cs = getComputedStyle(b);
      return { fg: kleur(cs.color).slice(0, 3), bg, rand: cs.borderStyle };
    });
    if (idee) {
      const c = contrast(idee.fg, idee.bg);
      assert.ok(c >= 4.5, `${m.naam}: Ideeën leesbaar (contrast ${c.toFixed(2)}, ${idee.fg} op ${idee.bg})`);
      assert.notEqual(idee.rand, "outset", `${m.naam}: Ideeën zonder standaardknoprand`);
    }
    await ctx.close();
  }
  assert.deepEqual(fouten, [], "geen fouten");
  }
  console.log("test-schermknoppen-breedte: ok (vier schermknoppen in beeld en raakbaar op iPad liggend en staand, 1080, 810, 1000, 1100 en 1280 breed met een getal bij Vandaag; Ideeën leesbaar; 44 px op aanraakschermen)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  if (browser) await browser.close();
  if (app && app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); }
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
