// Gebruikers-sweep 2026-11-12 18u (Karin, iPad): in het Team-venster haalde alleen × 44 px. Rolkeuze 32 px
// zonder naam, uitnodigvelden en knoppen 36 px, "wissen" 39x15 en "Nieuwe reservecodes" / "Stel opnieuw in"
// 16 px hoog. Op een aanraakscherm is nu alles in Team minstens 44 px, en de rolkeuze noemt de collega.
// Statisch (CSS en HTML), plus een meting in Chromium als Playwright er is (lokaal; CI heeft geen browser).
// `npm run test:teamtikdoelen`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(join(root, "public/v2.css"), "utf8");
const idx = await readFile(join(root, "public/index.html"), "utf8");
const grof = css.slice(css.indexOf("@media (pointer:coarse){html.v2 .tm-weg"));
assert.ok(grof.length > 0, "er is een blok voor aanraakschermen in Team");
const blok = grof.slice(0, grof.indexOf("}}") + 2);
assert.match(blok, /#ovTeam \.tm-lid select,html\.v2 #ovTeam \.tm-uitnodig input,html\.v2 #ovTeam \.tm-uitnodig select\{height:44px!important\}/, "rolkeuze en uitnodigvelden 44 px");
assert.match(blok, /#ovTeam \.modal \.btn\{height:44px\}/, "knoppen in Team 44 px");
assert.match(blok, /a\[data-tm2wis\],html\.v2 #tm_inhoud a\[data-stapact\]\{display:inline-flex;align-items:center;min-height:44px/, "losse links in Team 44 px");
assert.match(idx, /data-tmrol='"\+esc\(l\.id\)\+"' aria-label='Rol van "\+esc\(/, "de rolkeuze noemt de collega");

// meting in een browser met aanraakscherm, als die er is
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (pw) {
  const b = await pw.chromium.launch();
  const c = await b.newContext({ ...pw.devices["iPad (gen 7)"], deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.setContent(`<!doctype html><html class="v2"><head><style>${css}</style></head><body>
    <div id="ovTeam"><div class="modal"><div id="tm_inhoud">
      <div class="tm-lid"><div class="tm-naam"><b>Lisa</b><div>lisa@x.invalid · <a href="#" data-tm2wis="1">wissen</a></div></div>
        <select data-tmrol="1"><option>Therapeut</option></select><button class="btn tm-weg">×</button></div>
      <p><a href="#" data-stapact="reservecodes">Nieuwe reservecodes</a> · <a href="#" data-stapact="uit">Nieuwe telefoon? Stel opnieuw in</a></p>
      <div class="tm-uitnodig"><input id="tm_unaam"><input id="tm_uemail"><select id="tm_urol"><option>Therapeut</option></select><button class="btn" id="tm_udo">Nodig uit</button></div>
      <button class="btn" id="tm_sluit">Sluiten</button></div></div></div></body></html>`);
  const maten = await p.evaluate(() => [...document.querySelectorAll("#tm_inhoud a,#tm_inhoud select,#tm_inhoud input,#tm_inhoud button")]
    .map((e) => ({ wat: e.textContent.trim() || e.id || e.tagName, h: Math.round(e.getBoundingClientRect().height) })));
  await b.close();
  const klein = maten.filter((m) => m.h < 44);
  assert.deepEqual(klein, [], "alles in Team is op de iPad minstens 44 px hoog: " + JSON.stringify(maten));
  console.log("PASS Team-tikdoelen op een aanraakscherm (statisch + gemeten in Chromium, " + maten.length + " elementen)");
} else {
  console.log("PASS Team-tikdoelen op een aanraakscherm (statisch; geen Playwright, meting overgeslagen)");
}
