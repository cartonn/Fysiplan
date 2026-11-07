// Patiëntkant (stap 4 van "rollen, dossier en opslag").
// - Privacyregel zegt in elke taal wat we bewaren en dat de kaart vanzelf verdwijnt.
// - Vaste spoedregel onder de seintjes (bel praktijk of huisarts, 112), in elke taal.
// - Zonder internet blijft wat de patiënt aantikt op de telefoon staan en gaat het
//   vanzelf mee zodra er weer internet is (wachtrij per kaart).
// - "Mijn gegevens": wat er bewaard wordt, tot wanneer, downloaden en wissen van de telefoon.
// - De patiëntroute geeft "verloopt" ook voor een lopende kaart, maar nog steeds geen
//   interne velden.
// Statisch + API altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:patientkant`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = process.cwd();
const TALEN = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];

// ---- statisch: teksten in alle talen ----
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const lees = (naam) => {
  const m = html.match(new RegExp("var " + naam + "=(\\{[\\s\\S]*?\\n?\\});\\n"));
  assert.ok(m, naam + " staat in kaart.html");
  return vm.runInNewContext("(" + m[1] + ")");
};
const TSPOED = lees("TSPOED"), TWACHT = lees("TWACHT"), TMG = lees("TMG"), TPRIV = lees("TPRIV"), TOFF = lees("TOFF");
for (const t of TALEN) {
  assert.ok(TSPOED[t] && /112/.test(TSPOED[t][1]), "spoedregel met 112: " + t);
  assert.ok(TWACHT[t] && TWACHT[t].een && /\{n\}/.test(TWACHT[t].n) && TWACHT[t].ok, "wachtrijteksten: " + t);
  for (const k of ["kop", "wat", "l1", "l2", "l3", "hoelang", "tot", "waar", "dos", "dl", "wis", "zeker", "gewist"]) assert.ok(TMG[t] && TMG[t][k], "Mijn gegevens " + k + ": " + t);
  assert.match(TMG[t].tot, /\{d\}/, "bewaardatum: " + t);
  assert.ok(TPRIV[t] && TPRIV[t].b, "tweede privacyzin: " + t);
  assert.ok(TOFF[t], "offline-tekst: " + t);
}
for (const pad of ["meting", "gedaan", "seintje", "psk", "ervaring"]) assert.match(html, new RegExp("stuur\\('/api/kaart/" + pad + "'"), pad + " gaat via de wachtrij");
assert.match(html, /zetInWacht\('\/api\/kaart\/oefzwaar'/, "te zwaar gaat via de wachtrij");
// geen vrije tekst naar de praktijk (MDR): de seintjes blijven vaste knoppen
assert.doesNotMatch(html, /id="seinveld"|<textarea[^>]*sein/);

// ---- server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-patientkant-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`; // localhost: service worker mag
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Patientkant";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "patient-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  assert.ok(id);

  const pat = await (await get("/api/kaart?id=" + id)).json();
  assert.ok(pat.kaart.verloopt > Date.now() + 30 * 86400000, "lopende kaart: bewaardatum mee voor Mijn gegevens");
  for (const intern of ["naam", "dossier", "inboxGezien", "contact", "seintje", "notitie", "behandelaar", "bekeken"]) {
    assert.ok(!(intern in pat.kaart), "patiëntroute lekt " + intern + " niet");
  }
  console.log("test-patientkant: statisch + API OK");

  // ---- browser ----
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-patientkant: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ ...pw.devices["iPhone 13"], locale: "nl-NL", acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.6.9.1" } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/k/" + id);
      await page.waitForFunction(() => getComputedStyle(document.getElementById("wrap")).display === "block", null, { timeout: 15000 });
      assert.match(await page.textContent("#privtekst"), /alleen je voornaam/);
      assert.match(await page.textContent("#sspoed"), /Spoed\?.*112/);
      assert.ok(await page.isVisible("#mgblok"));
      await page.click("#mgblok summary");
      assert.match(await page.textContent("#mg_tot"), /Blijft bewaard tot minstens \d+ \w+ \d{4}/);
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#mg_dl")]);
      const pakket = JSON.parse(await readFile(await dl.path(), "utf8"));
      assert.equal(pakket.kaart.id, id);
      if (process.env.SCREENSHOT_DIR) await page.locator("#mgblok").screenshot({ path: join(process.env.SCREENSHOT_DIR, "patient-mijn-gegevens.png") });

      // offline: pijnscore en seintje blijven op de telefoon
      await ctx.setOffline(true);
      await page.locator("#mschaal button[data-score='8']").click();
      await page.waitForFunction(() => /Opgeslagen op je telefoon/.test(document.getElementById("mdank").textContent), null, { timeout: 5000 });
      assert.ok(await page.isVisible("#mnudge"), "hoge pijn offline: toch de rustige nudge");
      await page.click("#sknoppen .sbtn[data-soort='vraag']");
      await page.waitForFunction(() => /Opgeslagen op je telefoon/.test(document.getElementById("sdank").textContent), null, { timeout: 5000 });
      assert.match(await page.textContent("#wachtrij"), /2 keer opgeslagen/);
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, "patient-wachtrij.png") });
      assert.equal((await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json()).kaarten.length, 0, "nog niets bij de praktijk");

      // weer online: alles gaat vanzelf mee
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForFunction(() => /Verstuurd/.test(document.getElementById("wachtrij").textContent), null, { timeout: 8000 });
      const ib = await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json();
      const items = (ib.kaarten.find((k) => k.id === id) || { items: [] }).items.map((i) => i.soort).sort();
      assert.deepEqual(items, ["pijn", "seintje"], "pijnscore en seintje kwamen alsnog binnen");
      assert.equal(await page.evaluate((i) => localStorage.getItem("fp_wacht_" + i), id), null);

      // wissen van de telefoon
      page.once("dialog", (d) => d.accept());
      await page.click("#mg_wis");
      await page.waitForSelector("#mg_weg", { state: "visible", timeout: 5000 });
      const over = await page.evaluate((i) => Object.keys(localStorage).filter((k) => k.endsWith(i)), id);
      assert.deepEqual(over, [], "geen kaartgegevens meer in localStorage");
      assert.deepEqual(fouten, []);
    } finally { await browser.close(); }
  }
  console.log("test-patientkant: OK");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
