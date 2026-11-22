// Gebruikers-sweep 2026-11-22 14u (Mark, desktop en iPad; open sinds 21-11):
// 1. uitleg van een eigen oefening stopte stil op 400 tekens, bij plakken midden in een woord: nu een teller
//    (aria-live) en een melding als niet alles paste;
// 2. een afspraak die de server weigert, zette de fout 4 s in de Bewaar-knop (72 → 333 px breed) en het veld
//    bleef zonder aria-invalid: nu een vaste foutregel (role=alert) onder het veld;
// 3. velden in het Deel-paneel waren op de iPad 38 px hoog met 12 px tekst, waardoor iOS bij elke tik inzoomt.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:uitlegafspraakipad`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const css = await readFile(join(root, "public/v2.css"), "utf8");
assert.match(idx, /<textarea id='eo_uitleg'[^>]*aria-describedby='eo_teller'/, "uitleg verwijst naar de teller");
assert.match(idx, /id='eo_teller' aria-live='polite'/, "teller wordt voorgelezen");
assert.match(idx, /ta\.addEventListener\('paste'/, "melding bij plakken die niet past");
const afs = (idx.match(/var af=e\.target\.closest\('\[data-safspraakopslaan\]'\);[\s\S]*?\n      return;\n    \}/) || [""])[0];
assert.ok(afs, "afspraak-handler gevonden");
assert.doesNotMatch(afs, /toonA\(d\.fout/, "fout niet meer in de knop");
assert.match(afs, /setAttribute\('aria-invalid','true'\)/, "veld krijgt aria-invalid");
assert.match(idx, /<small role='alert' data-saffout='/, "vaste foutregel onder het afspraakveld");
const coarse = css.split(/@media screen and \(pointer:coarse\)\{/).slice(1).join("\n");
assert.match(coarse, /#ovKaarten select[^{]*\{\s*font-size:16px!important;min-height:44px\}/, "velden in Kaarten 16 px en 44 px op aanraakschermen");
console.log("test-sweep-uitleg-afspraak-ipad (statisch): ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitlegafspraak-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.44." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Uitleg Afspraak";
const browser = await pw.chromium.launch();

async function openApp(ctxOpties, sessie) {
  const ctx = await browser.newContext({ locale: "nl-NL", ...ctxOpties });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { fouten.push("onverwacht venster: " + d.message()); d.dismiss(); });
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  return { ctx, page, fouten };
}

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "uitlegafspraak-wachtwoord-1", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Mark", client: { c_naam: "Mark" },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  // ---- desktop: afspraak die de server weigert ----
  const d = await openApp({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.7.44.200" } }, sessie);
  await d.page.click("#kaartenBtn");
  await d.page.waitForSelector(`[data-sdeel='${id}']`, { state: "visible", timeout: 8000 });
  await d.page.click(`[data-sdeel='${id}']`);
  const knop = d.page.locator(`[data-safspraakopslaan='${id}']`);
  await knop.waitFor({ state: "visible", timeout: 8000 });
  const label = (await knop.textContent()).trim();
  const breed = (await knop.boundingBox()).width;
  await d.page.evaluate((i) => { document.querySelector(`[data-safspraak='${i}']`).value = "2099-01-01T10:00"; }, id);
  await knop.click();
  await d.page.waitForFunction((i) => document.querySelector(`[data-saffout='${i}']`).textContent.trim() !== "", id, { timeout: 4000 });
  assert.equal((await knop.textContent()).trim(), label, "knop houdt zijn tekst");
  assert.ok(Math.abs((await knop.boundingBox()).width - breed) < 2, "knop verandert niet van breedte");
  assert.equal(await d.page.getAttribute(`[data-safspraak='${id}']`, "aria-invalid"), "true", "veld gemarkeerd als fout");
  await wacht(4500);
  assert.notEqual((await d.page.textContent(`[data-saffout='${id}']`)).trim(), "", "fout blijft staan tot je het opnieuw probeert");
  // geldige datum: fout weg, bewaard
  await d.page.evaluate((i) => { const t = new Date(Date.now() + 3 * 864e5); const z = (n) => String(n).padStart(2, "0");
    document.querySelector(`[data-safspraak='${i}']`).value = `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T10:00`; }, id);
  await knop.click();
  await d.page.waitForFunction((i) => document.querySelector(`[data-saffout='${i}']`).textContent.trim() === "", id, { timeout: 4000 });
  assert.equal(await d.page.getAttribute(`[data-safspraak='${id}']`, "aria-invalid"), null, "aria-invalid weg na bewaren");
  const kaart = (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json()).find((k) => k.id === id);
  assert.ok(kaart.afspraak && kaart.afspraak.t > Date.now(), "afspraak bewaard");
  await d.page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  // ---- desktop: uitleg van een eigen oefening ----
  await d.page.evaluate(() => { const b = document.getElementById("eigenOefBtn"); b.style.display = ""; b.click(); });
  await d.page.waitForSelector("#eo_uitleg", { state: "visible", timeout: 6000 });
  await d.page.fill("#eo_uitleg", "Ga rechtop staan.");
  assert.match(await d.page.textContent("#eo_teller"), /^17\/400 tekens$/, "teller telt mee");
  await d.page.fill("#eo_uitleg", "");
  await d.page.focus("#eo_uitleg");
  await d.page.evaluate(() => { const ta = document.getElementById("eo_uitleg"); const dt = new DataTransfer();
    dt.setData("text/plain", "Buig langzaam door de knieën en houd je rug recht. ".repeat(10));
    ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    ta.value = dt.getData("text/plain").slice(0, 400); ta.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste", bubbles: true })); });
  await wacht(50);
  assert.match(await d.page.textContent("#eo_teller"), /Niet alles paste/, "melding als de plaktekst te lang was");
  assert.deepEqual(d.fouten, [], "geen paginafouten (desktop)");
  await d.ctx.close();

  // ---- iPad: velden in het Deel-paneel 16 px en 44 px ----
  const t = await openApp({ ...pw.devices["iPad (gen 7)"], extraHTTPHeaders: { "x-forwarded-for": "10.7.44.201" } }, sessie);
  await t.page.click("#kaartenBtn");
  await t.page.waitForSelector(`[data-sdeel='${id}']`, { state: "visible", timeout: 8000 });
  await t.page.click(`[data-sdeel='${id}']`);
  await t.page.waitForSelector(`[data-safspraak='${id}']`, { state: "visible", timeout: 8000 });
  const maten = await t.page.evaluate((i) => [`[data-safspraak='${i}']`, `[data-safherhaal='${i}']`, `[data-sbeh='${i}']`].map((s) => {
    const el = document.querySelector(s); if (!el) return null;
    return { s, fs: parseFloat(getComputedStyle(el).fontSize), h: el.getBoundingClientRect().height };
  }).filter(Boolean), id);
  assert.ok(maten.length >= 2, "velden gevonden");
  for (const m of maten) {
    assert.ok(m.fs >= 16, "tekst ≥ 16 px (iOS zoomt anders in): " + JSON.stringify(m));
    assert.ok(m.h >= 43.5, "veld ≥ 44 px hoog: " + JSON.stringify(m));
  }
  assert.deepEqual(t.fouten, [], "geen paginafouten (iPad)");
  await t.ctx.close();
  console.log("test-sweep-uitleg-afspraak-ipad: ok");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
