// Gebruikers-sweep 2026-11-09 (Truus, iPhone SE, 200 % tekst): op /k werd de dosering afgeknipt
// ("15 herhali…") en de pagina 392 px breed op 320, zonder opzij te kunnen schuiven: .chip had
// white-space:nowrap in een .oef met overflow:hidden. Nu breken chip en naam af.
// Ook (Jayden, Pixel 7, Engelse kaart): na veel tikken op de pijnscore of PSK stond de Nederlandse
// servermelding (429 "Even te veel verzoeken…", 400 "Geef een score…") op de kaart. Nu alleen in het
// Nederlands de servertekst, anders de eigen vertaalde melding.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaart200taal`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /\.chip\{max-width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere/, "chip breekt af");
assert.match(kaartHtml, /\.naam\{overflow-wrap:anywhere\}/, "naam breekt af");
assert.doesNotMatch(kaartHtml, /dank\.textContent=\(?d(&&d)?\.fout\)?\|\|/, "geen kale servertekst (nl) als melding op /k");
// sinds 2026-11-09 18u via zetDank (rode foutopmaak), zelfde taalregel
assert.match(kaartHtml, /zetDank\(dank,\(TAAL==='nl'&&d\.fout\)\?d\.fout:tr\('mfout'\),'fout'\)/, "pijnscore: eigen taal");
assert.match(kaartHtml, /zetDank\(dank,\(TAAL==='nl'&&d&&d\.fout\)\?d\.fout:trpsk\('fout'\),'fout'\)/, "PSK: eigen taal");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("dosering 200 %: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-dosering200-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.2." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Dosering";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "dosering-wachtwoord", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus V.", client: { c_naam: "Truus V." },
    chosen: [{ n: "Mobilisatie rotatie rug", id: "fp_f17c3675b48db1ae", i: 0 }, { n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }],
    cells: { "xfp_f17c3675b48db1ae.0|r0|S": "2", "xfp_f17c3675b48db1ae.0|r0|H": "15", "xfp_f17c3675b48db1ae.0|r0|W": "30 sec vasthouden",
      "xfp_688499fde71e7575.0|r0|S": "3", "xfp_688499fde71e7575.0|r0|H": "12" }, kaartId: "" },
    { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");
  const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.2" } });
  const page = await ctx.newPage();
  await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  // overzicht: korte dosering in de rij; de uitgeschreven dosering (.chip) staat in de oefenstand
  await page.waitForSelector("#oefs .oef .dosis");
  // grote systeemtekst nagespeeld: elke lettergrootte verdubbeld
  await page.evaluate(() => {
    const els = [...document.querySelectorAll("body *")];
    const maten = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    els.forEach((e, i) => { e.style.fontSize = (maten[i] * 2) + "px"; });
  });
  await wacht(200);
  const meet = () => page.evaluate(() => {
    const vw = window.innerWidth, uit = [];
    for (const c of document.querySelectorAll("#oefs .oef .chip, #oefs .oef .dosis, #oefs .oef .naam")) {
      const oef = c.closest(".oef").getBoundingClientRect(), b = c.getBoundingClientRect();
      if (b.width && b.right > oef.right + 1) uit.push(c.textContent.trim() + " " + Math.round(b.right) + ">" + Math.round(oef.right));
    }
    return { vw, sw: document.documentElement.scrollWidth, uit };
  });
  const r = await meet();
  assert.deepEqual(r.uit, [], "dosering en naam binnen de oefening");
  assert.ok(r.sw <= r.vw + 1, `geen pagina breder dan het scherm: ${r.sw} op ${r.vw}`);
  // en in de oefenstand, waar de dosering groot en uitgeschreven staat
  await page.click("#oefs .oef .oefinfo");
  await page.waitForSelector("#oefs .oef.actief .chip");
  const r2 = await meet();
  assert.deepEqual(r2.uit, [], "oefenstand: dosering en naam binnen de oefening");
  assert.ok(r2.sw <= r2.vw + 1, `oefenstand: geen pagina breder dan het scherm: ${r2.sw} op ${r2.vw}`);
  await ctx.close();
  // Engelse kaart, server weigert de pijnscore met een Nederlandse 429
  const en = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", extraHTTPHeaders: { "x-forwarded-for": "10.7.9.3" } });
  const pe = await en.newPage();
  // 400 met Nederlandse servertekst: de eigen vertaalde foutmelding. (Een 429 gaat sinds
  // 2026-11-09 in de wachtrij met de melding "busy right now", zie test:kaartdruk.)
  await pe.route("**/api/kaart/meting", (r) => r.fulfill({ status: 400, contentType: "application/json",
    body: JSON.stringify({ ok: false, fout: "Geef een score van 0 tot 10. Wacht een paar minuten met verzoeken." }) }));
  await pe.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
  await pe.evaluate(() => document.querySelector("#mschaal button[data-score]").click());
  await pe.waitForFunction(() => (document.getElementById("mdank").textContent || "").trim().length > 0, null, { timeout: 5000 });
  const melding = (await pe.textContent("#mdank")).trim();
  assert.doesNotMatch(melding, /verzoeken|Wacht/, "geen Nederlandse servermelding op een Engelse kaart: " + melding);
  assert.match(melding, /Saving did not work/, "Engelse melding: " + melding);
  await pe.unroute("**/api/kaart/meting");
  await pe.route("**/api/kaart/meting", (r) => r.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "300" },
    body: JSON.stringify({ ok: false, fout: "Even te veel verzoeken achter elkaar. Wacht een paar minuten." }) }));
  await pe.evaluate(() => { document.getElementById("mdank").textContent = ""; document.querySelectorAll("#mschaal button[data-score]")[3].click(); });
  await pe.waitForFunction(() => (document.getElementById("mdank").textContent || "").trim().length > 0, null, { timeout: 5000 });
  const druk = (await pe.textContent("#mdank")).trim();
  assert.doesNotMatch(druk, /verzoeken|Wacht/, "429: geen Nederlandse servermelding: " + druk);
  assert.match(druk, /busy right now/, "429: Engelse wachtrijmelding: " + druk);
  await en.close();
  console.log("dosering 200 %: ok (chip en naam breken af op 320 px); Engelse kaart: Engelse foutmelding");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
