// Regressietest gebruikers-sweep 2026-11-21 02u (MIDDEL, Sanne, desktop; bestond sinds 2026-11-20):
// 1. Wie in Opm. een lange tekst plakt (10.000 tekens), hield ongemerkt ~110 tekens over, midden in een woord
//    ("…pijn bijhoude"); alleen een melding voor schermlezers en een flits van 700 ms. Nu stopt het plakken bij een
//    heel woord en staat er een zichtbare melding met hoeveel tekens niet pasten.
// 2. Een gedeelde kaart helemaal leeg gemaakt: de QR verdween zonder uitleg, de patiënt zag nog de oude oefeningen.
//    Nu zegt het QR-hoekje dat de patiënt nog de vorige versie ziet.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:leegenopm`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
const ins = index.match(/function insertPrintableText\(el,text\)\{[\s\S]*?\n  \}/);
assert.ok(ins, "insertPrintableText gevonden");
assert.match(ins[0], /replace\(\/\\S\*\$\/,''\)/, "plakken stopt bij een heel woord");
assert.match(index, /#printLimitStatus\.zichtbaar\{position:fixed/, "melding over een vol vak is zichtbaar");
assert.match(index, /@media print\{#printLimitStatus\{display:none/, "melding niet op de print");
assert.match(index, /if\(naam&&KAART_ID&&IS_V2\)toonQrHint\('Er staan geen oefeningen meer op deze kaart/, "lege gedeelde kaart legt uit");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-leeg-en-opm: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-leegopm-"));
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
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.45." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Leeg Opm";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "leegopm-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Bram", client: { c_naam: "Bram" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.45.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await wacht(1500);
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  for (let i = 0; i < 60 && (await page.inputValue("#c_naam").catch(() => "")) !== "Bram"; i++) await wacht(50);
  assert.equal(await page.inputValue("#c_naam"), "Bram", "kaart van Bram open in de editor");

  // 1. lange tekst plakken in Opm.
  const zin = "Elke dag rustig oefenen en de pijn bijhouden in het schema. ";
  const lang = zin.repeat(170).slice(0, 10000);
  await page.evaluate((t) => {
    const el = document.getElementById("c_opm"); el.focus(); el.setSelectionRange(0, 0);
    const dt = new DataTransfer(); dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, lang);
  const opm = await page.inputValue("#c_opm");
  assert.ok(opm.length > 20 && opm.length < lang.length, "deel geplakt: " + opm.length);
  assert.ok(lang.startsWith(opm), "begin van de tekst");
  assert.match(lang.slice(opm.length), /^\s/, "afgebroken bij een heel woord, niet midden in een woord: …" + opm.slice(-15));
  const melding = await page.evaluate(() => { const s = document.getElementById("printLimitStatus"); const r = s.getBoundingClientRect(); return { t: s.textContent, w: r.width, h: r.height }; });
  assert.ok(melding.w > 100 && melding.h > 20, "melding zichtbaar in beeld: " + JSON.stringify(melding));
  assert.match(melding.t, /tekens pasten niet/, "melding zegt dat er tekst wegviel");

  // 2. alle oefeningen van de gedeelde kaart halen
  for (let i = 0; i < 20 && (await page.$$(".rm[data-rm]")).length; i++) {
    await page.evaluate(() => document.querySelector(".rm[data-rm='0']").click());
    await wacht(150);
  }
  assert.equal((await page.$$(".rm[data-rm]")).length, 0, "kaart leeg");
  let qr = "";
  for (let i = 0; i < 80; i++) { qr = await page.evaluate(() => { const b = document.getElementById("qrBlok"); return b && b.offsetParent ? b.textContent : ""; }); if (/geen oefeningen meer/.test(qr)) break; await wacht(100); }
  assert.match(qr, /Je patiënt ziet nog de vorige versie/, "QR-hoekje legt uit wat de patiënt ziet");
  assert.deepEqual(fouten, []);
  console.log("test-sweep-leeg-en-opm: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
