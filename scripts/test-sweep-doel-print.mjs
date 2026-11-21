// Regressietest gebruikers-sweep 2026-11-21 10u (HOOG, Sanne, desktop; bestond sinds 2026-11-13):
// Doel mag 500 tekens zijn (de digitale kaart toont ze allemaal), maar op papier stond ~150 tekens, stil
// afgekapt midden in een zin; bij een gescrold vak kwam er een stuk uit het midden op papier.
// Nu krijgt de print een kopie die bij een heel woord stopt met "…", markeert het scherm het vak en zegt
// een melding dat het doel niet heel op papier past. Een doel dat zonder typen verandert (andere kaart,
// nieuwe kaart) komt ook in de printkopie.
// Ook: na "Openen" in Patiënten (toetsenbord) stond de focus op body; nu op de geopende kaart (#a4).
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:doelprint`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /<textarea id="c_doel"[^>]*><\/textarea><div class="print-text-value doel" data-print-for="c_doel"/, "Doel heeft een printkopie");
assert.match(index, /#a4 \.box textarea#c_doel\{display:none!important\}|textarea\.print-limited,#a4 \.box textarea#c_doel\{display:none!important\}/, "op papier de kopie, niet het (gescrolde) vak");
assert.match(index, /function doelPrintTekst\(el\)/, "printtekst voor Doel");
assert.match(index, /function render\(\)\{[^}]*printKopieBij\(\)/, "render werkt de printkopieën bij");
assert.match(index, /a\.setAttribute\('aria-label','Kaart '\+String\((d\.kaart\.)?naam/, "na Openen gaat de focus naar de kaart");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-doel-print: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-doelprint-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.46.1" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  const zin = "Over zes weken weer zonder pijn de trap op en af lopen, en twee keer per week een half uur wandelen met de kleinkinderen. ";
  const doel = zin.repeat(5).slice(0, 500).trim();
  await page.fill("#c_doel", doel);
  assert.equal(await page.inputValue("#c_doel"), doel, "het hele doel blijft in het veld (de digitale kaart toont het)");
  // gescrold vak: op papier telt toch het begin
  await page.evaluate(() => { const el = document.getElementById("c_doel"); el.scrollTop = el.scrollHeight; });
  const scherm = await page.evaluate(() => {
    const el = document.getElementById("c_doel"); const s = document.getElementById("printLimitStatus"); const r = s.getBoundingClientRect();
    return { mark: el.classList.contains("print-overflow"), title: el.title, melding: s.textContent, w: r.width, h: r.height };
  });
  assert.ok(scherm.mark, "vak gemarkeerd als langer dan de print");
  assert.match(scherm.melding, /doel past niet helemaal op de print/i, "melding zegt het: " + scherm.melding);
  assert.ok(scherm.w > 100 && scherm.h > 20, "melding zichtbaar");
  assert.match(scherm.title, /digitale kaart toont het hele doel/);

  await page.emulateMedia({ media: "print" });
  const papier = await page.evaluate(() => {
    const el = document.getElementById("c_doel"); const px = document.querySelector('[data-print-for="c_doel"]');
    return { vak: getComputedStyle(el).display, kopie: getComputedStyle(px).display, tekst: px.textContent, past: px.scrollHeight <= px.clientHeight + 1, h: px.clientHeight };
  });
  assert.equal(papier.vak, "none", "het vak zelf niet op papier");
  assert.equal(papier.kopie, "block", "de kopie wel");
  assert.ok(papier.h > 40, "kopie heeft de hoogte van het vak: " + papier.h);
  assert.ok(papier.past, "kopie past in het vak");
  assert.match(papier.tekst, / …$/, "eindigt met …: " + papier.tekst.slice(-30));
  const kern = papier.tekst.replace(/ …$/, "");
  assert.ok(kern.length > 60 && doel.startsWith(kern), "begin van het doel, niet het midden: " + kern.slice(0, 40));
  assert.match(doel.slice(kern.length), /^[\s,.]/, "stopt bij een heel woord: …" + kern.slice(-15));
  // beforeprint terwijl de print-stijl al actief is (hertest Sanne): de kopie blijft ingekort
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  assert.equal(await page.textContent('[data-print-for="c_doel"]'), papier.tekst, "beforeprint in print-stijl laat de kopie staan");
  await page.emulateMedia({ media: "screen" });

  // kort doel: geen … en geen markering
  await page.fill("#c_doel", "Trap op zonder pijn.");
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.textContent('[data-print-for="c_doel"]'), "Trap op zonder pijn.");
  assert.equal(await page.evaluate(() => document.getElementById("c_doel").classList.contains("print-overflow")), false);
  await page.emulateMedia({ media: "screen" });

  // doel verandert zonder typen (zoals bij een andere kaart openen): de printkopie volgt bij de volgende render
  await page.evaluate(() => { document.getElementById("c_doel").value = "Nieuw doel van een andere kaart."; });
  await page.click("[data-add]");
  await wacht(300);
  assert.equal(await page.textContent('[data-print-for="c_doel"]'), "Nieuw doel van een andere kaart.", "geen oud doel op papier");
  // Openen in Patiënten met het toetsenbord: focus op de geopende kaart, niet op body
  let ip = 10;
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.46." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Doel Print";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "doelprint-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Bram", client: { c_naam: "Bram" }, chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.46.200" } });
  await ctx2.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => fouten.push(String(e)));
  p2.on("dialog", (d) => d.accept());
  await p2.goto(origin + "/v2/app", { waitUntil: "load" });
  await p2.waitForSelector("[data-add]", { timeout: 15000 });
  await p2.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await p2.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await p2.click("#kaartenBtn");
  await p2.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await p2.focus(`[data-sopen='${id}']`);
  await p2.keyboard.press("Enter");
  let f = "";
  for (let i = 0; i < 60; i++) { f = await p2.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)); if (f === "a4") break; await wacht(100); }
  assert.equal(f, "a4", "focus na Openen op de kaart");
  assert.equal(await p2.inputValue("#c_naam"), "Bram", "kaart van Bram open");
  await ctx2.close();
  assert.deepEqual(fouten, []);
  console.log("test-sweep-doel-print: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
