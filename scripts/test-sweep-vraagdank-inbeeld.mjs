// Gebruikers-sweep 2026-11-20 06u (Truus, iPhone SE, 200 % tekst): na "Ik heb een vraag" kwam de
// bevestiging "Verstuurd …" onder de onderrand van het scherm te staan. Truus zag de knop donker
// worden, maar niet dat haar vraag bij de praktijk was. Nu schuift de melding na een tik op een
// seintje in beeld als hij onder (of boven) de rand valt. Achtergrondmeldingen uit de wachtrij
// schuiven niets (geen sprongen terwijl de patiënt leest).
// Bronnencontrole draait altijd (CI); het browserdeel alleen als Playwright er is.
// `npm run test:vraagdankinbeeld`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");

// ---- bron: zetDank kan in beeld schuiven, alleen de seintjes-tik vraagt dat ----
assert.match(k, /function zetDank\(el,tekst,soort,inBeeld\)\{[\s\S]*?if\(inBeeld\)toonInBeeld\(el\);/, "zetDank schuift op verzoek in beeld");
const handler = k.slice(k.indexOf("document.getElementById('sknoppen').addEventListener('click'"));
const blok = handler.slice(0, handler.indexOf("seinKetting=seinKetting.catch"));
const aanroepen = blok.match(/zetDank\([^;]*?\)(?=[;}])/g) || [];
assert.ok(aanroepen.length >= 5, "de seintjes-handler zet meldingen: " + aanroepen.length);
for (const a of aanroepen) assert.match(a, /,true\)$/, "elke melding na een seintjes-tik komt in beeld: " + a);
assert.match(k, /\.sdank\{scroll-margin-bottom:\d+px\}/, "ruimte onder de melding (beginschermbalk)");
assert.doesNotMatch(k, /\.wacht'\)\.forEach\(function\(d\)\{zetDank\(d,tekst,soort,true\)/, "de wachtrij schuift niet");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("vraagdank in beeld: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vraagdank-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
const bij = (c) => { if (uit.length < 20000) uit += c; };
app.stdout.on("data", bij);
app.stderr.on("data", bij);
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.31." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Vraagdank";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "vraagdank-wachtwoord", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk geclaimd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  for (const motion of ["reduce", "no-preference"]) {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", reducedMotion: motion,
      extraHTTPHeaders: { "x-forwarded-for": "10.7.31." + (100 + ip++) } });
    const p = await ctx.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(String(e)));
    await p.goto(origin + "/k/" + id);
    for (let i = 0; i < 200; i++) {
      if (await p.evaluate(() => { const w = document.getElementById("wrap"); return !!w && w.style.display === "block"; })) break;
      await wacht(50);
    }
    await wacht(500);
    // 200 % tekst, en de vraagknop helemaal onderaan in beeld: daar tikt Truus
    await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await wacht(300);
    await p.evaluate(() => {
      const b = document.querySelector('#sknoppen .sbtn[data-soort="vraag"]');
      const r = b.getBoundingClientRect();
      window.scrollBy(0, r.bottom - window.innerHeight + 4);
    });
    await wacht(300);
    const voor = await p.evaluate(() => {
      const r = document.querySelector('#sknoppen .sbtn[data-soort="vraag"]').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: window.innerHeight };
    });
    assert.ok(voor.bottom <= voor.h && voor.top >= 0, "vraagknop in beeld vóór de tik: " + JSON.stringify(voor));
    await p.click('#sknoppen .sbtn[data-soort="vraag"]');
    let stand = null;
    for (let i = 0; i < 60; i++) {
      stand = await p.evaluate(() => {
        const d = document.getElementById("sdank");
        const r = d.getBoundingClientRect();
        return { tekst: d.textContent, zichtbaar: d.style.display === "block", top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight };
      });
      if (stand.zichtbaar && stand.tekst && stand.bottom <= stand.h + 1 && stand.top >= -1) break;
      await wacht(50);
    }
    assert.ok(stand.zichtbaar && /verstuurd/i.test(stand.tekst), "bevestiging gezet (" + motion + "): " + JSON.stringify(stand));
    assert.ok(stand.bottom <= stand.h + 1 && stand.top >= -1, "bevestiging staat in beeld bij 200 % (" + motion + "): " + JSON.stringify(stand));
    assert.deepEqual(fouten, [], "geen paginafouten");
    await ctx.close();
  }
  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  console.log("vraagdank in beeld: ok (na 'Ik heb een vraag' bij 200 % staat 'Verstuurd' in beeld)");
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
