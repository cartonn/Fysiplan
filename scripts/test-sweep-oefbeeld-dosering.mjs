// Regressietest gebruikers-sweep 2026-11-22 18u.
// - Truus (72, iPhone SE): in de oefenstand met "A A" stonden de doseringscijfers 34 px (staand) en 74 px (liggend)
//   onder de onderbalk, liggend zonder A A 20 px: het beeld had een vaste hoogte in vh en zoom:1.16 rekent die mee.
//   Nu krimpt het beeld (pasOefBeeld) tot naam en dosering boven de onderbalk staan.
// - Sanne (desktop): "Er is al een kaart …" stond alleen als 8,5 px-tekst in het QR-hoekje; nu ook de balk bovenin.
// - Jayden (Engels): kromme zinnen op /k en in de download ("exercise(s)", "— strong!", "W = weight", "More pain").
// - Karin (beheerder): twee collega's met dezelfde naam kregen dezelfde aria-labels en "Zeker: Tom Jansen verwijderen?".
// CI heeft geen Playwright: de statische controles draaien altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:oefbeelddosering`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
const index = await readFile(join(root, "public/index.html"), "utf8");

// statisch: oefenstand past het beeld aan
assert.match(kaart, /function pasOefBeeld\(\)/, "pasOefBeeld bestaat");
assert.match(kaart, /zetVideoTop\(\);pasOefBeeld\(\);/, "onderbalk-meting past ook het beeld aan");
assert.match(kaart, /if\(typeof pasOefBeeld==='function'\)pasOefBeeld\(\);\}/, "zetKrap (A A, tekstgrootte, draaien) past het beeld aan");
// statisch: bestaande kaart ook in de balk bovenin
assert.match(index, /if\(BESTAAT_GEMELD!==String\(naam\|\|''\)\.toLowerCase\(\)\)\{[^}]*toonConflictBalk\(bTekst,bKnoppen\);\}/, "bestaat → conflictbalk");
// statisch: Engelse zinnen
for (const oud of ["exercise(s)", "— strong!", "W = weight", "does not exist (anymore)", "weekly, 1 more time'", "this moves later",
  "That did not work right now", "The check of the general explanation", "pijn:'More pain'", "'worse','the same','better'"]) {
  assert.ok(!kaart.includes(oud), "oude Engelse zin staat er nog: " + oud);
}
assert.ok(kaart.includes("seinW:{vraag:'I have a question',pijn:'It hurts too much',goed:'It’s going well'}"), "download gebruikt de knopteksten");
// statisch: naamgenoten in Team
assert.match(index, /var lidLabel=\(l\.naam&&naamTel\[/, "label met e-mail bij een dubbele naam");
assert.ok(index.includes("aria-label='Rol van \"+esc(lidLabel||'collega')+\"'"), "rolkeuze gebruikt het label");
assert.ok(index.includes("data-naam='\"+esc(lidLabel)+\"' aria-label='\"+esc(lidLabel+\" verwijderen\")+\"'"), "verwijderknop gebruikt het label");
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.ok(css.includes("html.v2 :is(input:not([type=checkbox],[type=radio],[type=file],[type=range],[type=color]),select,textarea):not(#a4 *){"), "iPad: velden buiten de A4 op 16 px");
console.log("test-sweep-oefbeeld-dosering (statisch): beeld past, bestaat-balk, Engelse zinnen, naamgenoten in Team");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-oefbeeld-dosering: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefbeeld-"));
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
    let gemeten = 0;
    for (const [stand, vp] of [["staand", { width: 320, height: 568 }], ["liggend", { width: 568, height: 320 }]]) for (const aa of [false, true]) {
      const tag = "iPhone SE " + stand + (aa ? " + A A" : "");
      const c = await browser.newContext({ ...pw.devices["iPhone SE"], viewport: vp, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.65.0.1" } });
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      if (aa) await p.click("#grootBtn");
      await wacht(300);
      await p.click("#startknop");
      await p.waitForSelector("#sessiebalk:not([hidden])");
      for (let i = 0; i < 3; i++) {
        await wacht(600);
        await p.evaluate(() => scrollTo(0, 0));
        await wacht(150);
        const m = await p.evaluate(() => {
          const a = document.querySelector(".oef.actief");
          const img = a && a.querySelector(".fotoknop img");
          const cijfers = a ? [...a.querySelectorAll(".chips .chip b")].map((x) => x.getBoundingClientRect()).filter((r) => r.height > 0) : [];
          return { img: img && img.complete ? img.getBoundingClientRect().height : 0, cijfer: cijfers.length ? Math.max(...cijfers.map((r) => r.bottom)) : null,
            balk: document.getElementById("sessiebalk").getBoundingClientRect().top, naam: a && a.querySelector(".naam").textContent };
        });
        if (m.cijfer != null && m.img > 0) {
          gemeten++;
          assert.ok(m.cijfer <= m.balk + 1, tag + " (" + m.naam + "): dosering " + Math.round(m.cijfer - m.balk) + " px onder de onderbalk");
          assert.ok(m.img >= 60, tag + ": beeld blijft zichtbaar (" + Math.round(m.img) + " px)");
        }
        await p.evaluate(() => { const v = document.getElementById("svolgende"); if (v && !v.disabled) v.click(); });
      }
      // terug naar de lijst: geen verkleind beeld blijft hangen
      await p.evaluate(() => document.getElementById("sterug").click());
      await wacht(300);
      const rest = await p.evaluate(() => [...document.querySelectorAll("#oefs .oef:not(.actief) .fotoknop img")].filter((i) => i.style.maxHeight).length);
      assert.equal(rest, 0, tag + ": verkleining blijft niet op de lijst staan");
      assert.deepEqual(fouten, [], tag + ": geen fouten in de pagina");
      await c.close();
    }
    assert.ok(gemeten >= 4, "minstens vier oefeningen met beeld en dosering gemeten (" + gemeten + ")");
    console.log("test-sweep-oefbeeld-dosering (telefoon): dosering boven de onderbalk, staand en liggend, met en zonder A A (" + gemeten + " metingen)");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
