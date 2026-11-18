// Gebruikers-sweep 2026-11-09 18u (Jayden, Pixel 7 en iPhone 14): bij een trage lijn gaf de pijnscore
// seconden lang geen teken van leven (elke volgende tik werd een extra verzoek), en een fout stond in
// dezelfde groene opmaak als "Opgeslagen, dank je". Nu een bezig-stand (aria-busy, tik genegeerd tot
// het antwoord er is) en een rode foutopmaak; ook bij herstel (PSK), ervaren herstel en seintjes.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:pijnscorebezig`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /\.mdank\.fout,\.sdank\.fout\{/, "foutopmaak bestaat");
assert.match(k, /function zetDank\(el,tekst,soort\)/, "zetDank bestaat");
assert.match(k, /var schaal=this;if\(schaal\.dataset\.bezig\)\{/, "pijnscore: bezig-slot");
assert.match(k, /MSCORE_NA=b;b\.classList\.add\('bezig'\);return;/, "pijnscore: laatste tik tijdens opslaan onthouden");
assert.match(k, /\.then\(verder,verder\);/, "pijnscore: onthouden tik na het antwoord nasturen");
assert.match(k, /var pskStuur=laatsteTikWint\(/, "PSK: één verzoek tegelijk, laatste tik wint");
assert.doesNotMatch(k, /dank\.textContent=\(TAAL==='nl'&&d\.fout\)\?d\.fout:tr\('mfout'\)/, "pijnscorefout via zetDank");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("pijnscore bezig: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-pijnbezig-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.6." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Bezig";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "bezig-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay", client: { c_naam: "Jay" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.6.200" } });
  const p = await ctx.newPage();
  let metingen = 0, modus = "traag";
  await p.route(/\/api\/kaart\/meting$/, async (r) => {
    metingen++;
    if (modus === "fout") return r.fulfill({ status: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, fout: "x" }) });
    await wacht(2500);
    return r.continue();
  });
  await p.goto(origin + "/k/" + id + "?taal=en");
  await p.waitForSelector("#mschaal button[data-score]", { timeout: 15000 });

  await p.click('#mschaal button[data-score="3"]');
  await wacht(200);
  const tijdens = await p.evaluate(() => ({ busy: document.getElementById("mschaal").getAttribute("aria-busy"),
    bezig: !!document.querySelector('#mschaal button[data-score="3"].bezig') }));
  assert.deepEqual(tijdens, { busy: "true", bezig: true }, "bezig-stand tijdens het opslaan");
  // 3 → 7 → 5 tijdens het opslaan: de laatste tik wint, als één extra verzoek na het antwoord
  // (gebruikers-sweep 2026-11-12 10u, Jayden: 2 → 7 → 3 bewaarde stil 2)
  await p.click('#mschaal button[data-score="7"]');
  await p.click('#mschaal button[data-score="5"]');
  assert.equal(metingen, 1, "tikken tijdens het opslaan geven niet meteen een extra verzoek");
  for (let i = 0; i < 160; i++) {
    const s = await p.evaluate(() => ({ busy: document.getElementById("mschaal").getAttribute("aria-busy"),
      aan: (document.querySelector("#mschaal button.aan") || {}).textContent || "" }));
    if (!s.busy && s.aan === "5") break;
    await wacht(50);
  }
  assert.equal(metingen, 2, "precies één nagestuurd verzoek voor de laatste tik");
  const pat = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json();
  const ms = (pat.kaart && pat.kaart.metingen) || pat.metingen || [];
  assert.equal(ms.length ? ms[ms.length - 1].s : null, 5, "server bewaart de laatste tik (5): " + JSON.stringify(ms));
  assert.equal(await p.evaluate(() => (document.querySelector("#mschaal button.aan") || {}).textContent), "5", "scherm toont 5 als gekozen");
  const ok = await p.evaluate(() => { const d = document.getElementById("mdank"); return { fout: d.classList.contains("fout"), kleur: getComputedStyle(d).color }; });
  assert.equal(ok.fout, false, "gelukt: geen foutopmaak");

  modus = "fout";
  await p.click('#mschaal button[data-score="4"]');
  await p.waitForFunction(() => document.getElementById("mdank").classList.contains("fout"), null, { timeout: 8000 });
  const fout = await p.evaluate(() => { const d = document.getElementById("mdank"); return { t: d.textContent, kleur: getComputedStyle(d).color }; });
  assert.notEqual(fout.kleur, ok.kleur, "fout in een andere kleur dan gelukt");
  assert.match(fout.t, /did not work|try again/i, "Engelse foutmelding: " + fout.t);
  console.log("pijnscore bezig: ok (bezig-stand, één verzoek, rode foutopmaak)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
