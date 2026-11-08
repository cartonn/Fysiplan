// Gebruikers-sweep 2026-11-08 10u:
// 1. /k: een dubbeltik op "Gedaan" bij een oefening zette het vinkje aan en meteen weer uit
//    (de therapeut zag "niet gedaan"). Nu een bezig-slot per oefening.
// 2. /k: de voortgangsrij ("1 van 3 gedaan" + "Alles gedaan") schoof de pagina horizontaal
//    op een iPhone SE in het Turks en met de eigen knop "Grotere letters". Nu breekt de rij af.
// 3. App: verlopen proef + seintje beantwoorden sloot het venster alsof het gelukt was; de
//    melding stond achter het venster. Nu blijft het venster open met de reden.
// 4. App: dubbelklik op "In de praktijk" gaf een tweede POST en het valse alarm "intussen op
//    een ander apparaat gewijzigd". Nu een bezig-slot op de knop.
// 5. /k: "Te zwaar?" had in 6 talen Nederlandse bezig- en fouttekst.
// API en broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:dubbeltik`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /if\(od\)\{var oi=Number\(od\.dataset\.idx\);if\(OEF_SLOT\[oi\]\)return;OEF_SLOT\[oi\]=1;/, "bezig-slot per oefening");
assert.match(kaartHtml, /\.oefvoortgang\{display:flex;flex-wrap:wrap/, "voortgangsrij breekt af");
// 5. "Te zwaar?" toonde in fr, es, pl, tr, ar en uk Nederlandse tekst ("Versturen…", "Niet verstuurd")
for (const t of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"])
  assert.match(kaartHtml, new RegExp("\\n    " + t + ":\\{[^\\n]*zwaarbezig:'[^']+',zwaarmis:'[^']+'"), "te-zwaar-teksten in " + t);
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /else if\(d\.proefVerlopen\)\{toonProefVoorbij\(\);\s*fout\.innerHTML='<b>Niet verstuurd:<\/b>/, "seintje-venster blijft open met de reden");
assert.doesNotMatch(appHtml, /else if\(d\.proefVerlopen\)\{closeOv\('ovSein'\)/, "venster sluit niet meer bij een verlopen proef");
assert.match(appHtml, /var skn=this;if\(skn\.dataset\.bezig\)return;skn\.dataset\.bezig='1';\s*saveServerCard\(naam,function\(d\)\{\s*delete skn\.dataset\.bezig;/,
  "In de praktijk: bezig-slot");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-dubbeltik-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Dubbeltik";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "dubbeltik-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }, { n: "Lunge", i: 2 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const trouw = async () => (await (await get("/api/kaart?id=" + id)).json()).kaart.oefTrouw || {};

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch {}
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.9.9.1" } });
      const page = await ctx.newPage();
      await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await page.waitForSelector("#oefs .oefdone");
      const knop = page.locator("#oefs .oefdone").first();
      await knop.dblclick();
      await wacht(900);
      assert.equal(await knop.getAttribute("aria-pressed"), "true", "dubbeltik laat het vinkje aan");
      const t = await trouw();
      assert.equal((t.Squat || {}).n, 1, "server telt de oefening als gedaan: " + JSON.stringify(t));
      // na het slot kan de patiënt het vinkje gewoon weer weghalen
      await knop.click();
      await wacht(400);
      assert.equal(await knop.getAttribute("aria-pressed"), "false", "losse tik na het slot haalt het weg");
      await knop.click();
      await wacht(400);

      // breedte: Nederlands en Turks, gewone en grotere letters
      for (const taal of ["", "?taal=tr"]) {
        await page.goto(origin + "/k/" + id + taal, { waitUntil: "networkidle" });
        await page.waitForSelector("#oefs .oefdone");
        for (const groot of [false, true]) {
          await page.evaluate((g) => document.documentElement.classList.toggle("groot", g), groot);
          await wacht(150);
          const b = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth,
            r: (() => { const e = document.querySelector("#ovalles"); if (!e || !e.offsetParent) return null;
              const x = e.getBoundingClientRect(); return x.right; })() }));
          assert.ok(b.sw <= b.vw + 1, `geen horizontale scroll (${taal || "nl"}, groot=${groot}): ${b.sw} op ${b.vw}`);
          if (b.r !== null) assert.ok(b.r <= b.vw + 1, `"Alles gedaan" in beeld (${taal || "nl"}, groot=${groot}): ${b.r}`);
        }
      }
      await ctx.close();
    } finally { await browser.close(); }
    console.log("browserdeel: dubbeltik laat vinkje aan, voortgangsrij past op 320 px (nl, tr, groot)");
  } else console.log("browserdeel overgeslagen (geen Playwright)");
  console.log("test-sweep-dubbeltik-breedte: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
