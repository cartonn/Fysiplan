// Regressietest gebruikers-sweep 2026-11-21 06u:
// 1. (MIDDEL, Mark, desktop + iPad) Met een bestaande sessie de praktijknaam intypen en dan in Kaarten een kaart met
//    een eigen oefening openen: de app kende die eigen oefening nog niet, gaf "Niet meer in de oefeningenlijst
//    (overgeslagen)" en het volgende delen haalde de oefening ook van de patiëntkaart af. Nu haalt de app eerst de
//    eigen oefeningen van de praktijk op en opent de kaart dan heel.
// 2. (HOOG, Sanne, desktop) TYPEN in een vol Opm.-vak liet een half woord plus tientallen spaties op de print staan
//    ("…na het oefene" + 61 spaties). Nu gaat het halve woord weg met een melding, en spaties achteraan tellen
//    alleen als er daarna nog iets past.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:typeneigen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /function metEigenOefeningen\(d\)\{/, "kaart openen haalt eerst de eigen oefeningen");
for (const plek of ["function openSrvKaart", "function openNieuwsteVersie", "kopie:'+kp.dataset.skopie"]) {
  const i = index.indexOf(plek);
  assert.ok(i > 0, plek + " gevonden");
  assert.match(index.slice(i, i + 900), /\.then\(metEigenOefeningen\)/, plek + " wacht op de eigen oefeningen");
}
assert.match(index, /het halve woord \\u201c'\+halfWoord/, "melding noemt het weggehaalde halve woord");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-typen-en-eigen: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-typeneigen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.46." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(200, 1)]).toString("base64");
const P = "Fysio Typen Eigen";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "typeneigen-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const r = await post("/api/praktijk/oefeningen", { praktijk: P, naam: "Eigen plank Typtest", uitleg: "Rustig.", img: png }, S);
  assert.equal(r.status, 200, "testopzet: eigen oefening");
  const eigen = (await r.json()).oefeningen.find((o) => o.naam === "Eigen plank Typtest");
  assert.ok(eigen && /^po_/.test(eigen.id), "eigen oefening heeft een vast id");
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }, { n: eigen.naam, id: eigen.id, i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Bram", client: { c_naam: "Bram" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.46.200" } });
  // een bestaande sessie, maar de praktijknaam staat nog niet in de editor (zoals bij Mark)
  // "Nieuw in Fysiplan" opent 1,2 s na het laden als er niets open staat; deze test sluit de vensters zelf en
  // klikte daarna soms net tegen dat venster aan (wisselvallig). Hier geldt de versie als gezien.
  const rn = (await readFile(join(root, "public/release-notes.js"), "utf8")).match(/var version='([^']+)'/)[1];
  await ctx.addInitScript(([t, v]) => { try { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_release_seen", v); } catch {} }, [sessie, rn]);
  const page = await ctx.newPage();
  const fouten = [], meldingen = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  // de bibliotheek haalt de eigen oefeningen erbij zodra de praktijknaam er staat (Mark: ook het voorbeeld van een teamsjabloon)
  let inLijst = false;
  for (let i = 0; i < 60 && !inLijst; i++) { inLijst = await page.evaluate(() => /Eigen plank Typtest/.test(document.getElementById("list").textContent)); if (!inLijst) await wacht(100); }
  assert.ok(inLijst, "eigen oefening staat in de bibliotheek na het invullen van de praktijknaam");
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  for (let i = 0; i < 80 && (await page.inputValue("#c_naam").catch(() => "")) !== "Bram"; i++) await wacht(50);
  assert.equal(await page.inputValue("#c_naam"), "Bram", "kaart van Bram open in de editor");
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  assert.ok(!meldingen.some((m) => /overgeslagen/.test(m)), "geen oefening overgeslagen: " + meldingen.join(" | "));
  assert.equal((await page.$$(".rm[data-rm]")).length, 2, "beide oefeningen staan op de kaart, ook de eigen");

  // 2. typen tot het Opm.-vak vol is
  await page.click("#c_opm");
  await page.evaluate(() => { const el = document.getElementById("c_opm"); el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
  const zin = "Let op linkerknie bij traplopen en hurken, rustig opbouwen en pijn bijhouden in het schriftje elke avond na het oefenen. ";
  await page.keyboard.type(zin.repeat(4), { delay: 0 });
  await page.keyboard.type("          ", { delay: 0 });
  const opm = await page.inputValue("#c_opm");
  assert.ok(opm.length > 20, "er staat tekst: " + opm.length);
  assert.ok(opm.length < zin.length * 4, "het vak raakte vol");
  assert.doesNotMatch(opm, /\s{2,}$/, "geen rij spaties achteraan: " + JSON.stringify(opm.slice(-12)));
  const woorden = new Set(zin.replace(/[,.]/g, "").split(/\s+/).filter(Boolean));
  const laatste = opm.trim().replace(/[,.]$/, "").split(/\s+/).pop();
  assert.ok(woorden.has(laatste), "eindigt op een heel woord, niet op een half: …" + opm.slice(-20));
  const t = await page.evaluate(() => document.getElementById("printLimitStatus").textContent);
  assert.match(t, /is vol/, "melding dat het vak vol is");
  // doortypen na de melding plakt niets aan het laatste woord (hertest Sanne: "het.fenen")
  await page.keyboard.type("n. Extra", { delay: 0 });
  assert.equal(await page.inputValue("#c_opm"), opm, "vol vak blijft zoals het was");
  // midden in de tekst typen: smalle letters glippen er niet tussen (hertest Sanne: "heel vi bij")
  const midden = opm.indexOf(" bij ") + 1;
  assert.ok(midden > 0, "testopzet: 'bij' staat in de tekst");
  await page.evaluate((m) => { const el = document.getElementById("c_opm"); el.focus(); el.setSelectionRange(m, m); }, midden);
  await page.keyboard.type("heel voorzichtig ", { delay: 0 });
  const na = await page.inputValue("#c_opm");
  const woordenNa = na.replace(/[,.]/g, "").split(/\s+/).filter(Boolean);
  for (const w of woordenNa) assert.ok(woorden.has(w) || w === "heel" || w === "voorzichtig", "geen half woord midden in de tekst: '" + w + "' in …" + na.slice(Math.max(0, midden - 20), midden + 30));
  assert.deepEqual(fouten, []);
  console.log("test-sweep-typen-en-eigen: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
