// De thuiskaart als tweede afdruk (reviewlijst punt 12). `npm run test:thuiskaart`
//
// - het printvenster van V2 heeft de keuze Thuiskaart; V1 (de app op /) niet
// - zes oefeningen per vel, met beeld, naam, dosering in woorden, uitleg en vakjes per dag
// - de QR-code staat op het eerste vel als de kaart er een heeft, anders nergens
// - bij het printen is alleen de thuiskaart te zien, niet de trainingslog; daarna weer de gewone afdruk
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /id="pr_thuis_rij" hidden/, "de keuze staat standaard verborgen (V1)");
assert.match(index, /function bouwThuiskaart\(\)/);
// V1 (de app op /) houdt het printvenster zoals het was: alleen V2 zet de keuze aan
assert.match(index, /'printBtn'\)\.addEventListener\('click',function\(\)\{\n    if\(IS_V2\)\{\n      document\.getElementById\('pr_thuis_rij'\)\.hidden=false;/, "alleen V2 toont de keuze");
assert.match(index, /var thuis=IS_V2&&document\.getElementById\('pr_thuis'\)\.checked;/, "alleen V2 print een thuiskaart");

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-thuiskaart-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: "ignore" });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.8.1" } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} window.print = () => {
    window.__geprint = (window.__geprint || 0) + 1;
    // op het moment van printen moeten de beelden van de thuiskaart er zijn
    const b = [...document.querySelectorAll("#thuiskaart img")];
    window.__beeldenKlaar = b.every((i) => i.complete && i.naturalWidth > 0);
  }; });
  // de beelden komen traag binnen: printen mag pas als ze er zijn
  await ctx.route(/\/images\//, async (route) => { await wacht(250); await route.continue(); });
  const p = await ctx.newPage();
  const fouten = [];
  p.on("pageerror", (e) => fouten.push(String(e)));
  p.on("dialog", (d) => d.accept());
  const sluit = () => p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  await p.goto(origin + "/v2/app");
  await p.waitForSelector("[data-add]", { timeout: 15000 });
  await sluit();
  // zeven oefeningen: twee vellen
  for (let i = 0; i < 7; i++) await p.evaluate((n) => { const b = document.querySelectorAll("[data-add]")[n]; b.click(); }, i);
  await p.waitForFunction(() => document.querySelectorAll("#mon .exh").length && [...document.querySelectorAll("#mon .exh")].filter((t) => t.textContent.trim()).length === 7);
  const zet = (sel, w) => p.evaluate(([s, v]) => { const e = document.querySelectorAll(s)[0]; e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, [sel, w]);
  await zet("#mon input[data-k$='|r0|S']", "3");
  await zet("#mon input[data-k$='|r0|H']", "12");
  await p.evaluate(() => { const l = [...document.querySelectorAll("#mon input[data-k$='|r0|H']")]; l[1].value = "30 sec"; l[1].dispatchEvent(new Event("input", { bubbles: true })); const w = [...document.querySelectorAll("#mon input[data-k$='|r0|W']")]; w[1].value = "rood elastiek"; w[1].dispatchEvent(new Event("input", { bubbles: true })); });
  await p.fill("#c_naam", "Truus");
  const namen = await p.evaluate(() => [...document.querySelectorAll("#mon .exh")].map((t) => t.textContent.trim()).filter(Boolean));

  // 1) zonder QR-code
  await p.click("#printBtn");
  assert.ok(await p.isVisible("#pr_thuis_rij"), "V2: de keuze Thuiskaart staat in het printvenster");
  await p.check("#pr_thuis");
  if (await p.isChecked("#pr_qr")) await p.uncheck("#pr_qr");
  await p.click("#pr_do");
  await p.waitForFunction(() => (window.__geprint || 0) === 1, null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains("print-thuis")), true);
  assert.equal(await p.evaluate(() => window.__beeldenKlaar), true, "pas geprint toen de beelden er waren");
  const tk = await p.evaluate(() => [...document.querySelectorAll("#thuiskaart .tk-vel")].map((v) => ({
    kop: v.querySelector(".tk-kop").textContent,
    qr: !!v.querySelector(".tk-qr svg"),
    oef: [...v.querySelectorAll(".tk-oef")].map((o) => ({
      naam: o.querySelector(".tk-naam").textContent, dos: (o.querySelector(".tk-dos") || {}).textContent || "",
      uitleg: o.querySelector(".tk-uitleg").textContent, beeld: !!o.querySelector(".tk-beeld img, .tk-beeld svg"),
      geladen: [...o.querySelectorAll(".tk-beeld img")].every((i) => i.complete && i.naturalWidth > 0), vakjes: o.querySelectorAll(".tk-vink i").length
    }))
  })));
  assert.deepEqual(tk.map((v) => v.oef.length), [6, 1], "zes per vel: " + JSON.stringify(tk.map((v) => v.oef.length)));
  assert.deepEqual(tk.flatMap((v) => v.oef.map((o) => o.naam.replace(/^\d+\./, ""))), namen, "zelfde oefeningen in dezelfde volgorde");
  assert.equal(tk[0].oef[0].dos, "3 series van 12 herhalingen");
  assert.equal(tk[0].oef[1].dos, "30 sec, weerstand: rood elastiek");
  assert.equal(tk[0].oef[2].dos, "", "geen dosering: geen regel");
  assert.ok(tk.flatMap((v) => v.oef).every((o) => o.beeld && o.geladen && o.vakjes === 7), "beeld geladen en een week vakjes: " + JSON.stringify(tk));
  assert.ok(tk.flatMap((v) => v.oef).filter((o) => o.uitleg.length > 20).length >= 6, "uitleg uit de bibliotheek");
  assert.match(tk[0].kop, /Thuiskaart voor Truus/);
  assert.ok(tk.every((v) => !v.qr), "geen QR-code als die niet gekozen is");

  // bij het printen: alleen de thuiskaart, twee vellen
  await p.emulateMedia({ media: "print" });
  assert.equal(await p.isVisible("#a4"), false, "de trainingslog print niet mee");
  assert.equal(await p.isVisible("#thuiskaart"), true);
  const pdf = await p.pdf({ landscape: true, format: "A4", printBackground: true, preferCSSPageSize: true });
  const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(paginas, 2, "twee vellen: " + paginas);
  if (process.env.THUISKAART_PDF) await writeFile(process.env.THUISKAART_PDF, pdf);
  await p.emulateMedia({ media: "screen" });
  assert.equal(await p.isVisible("#thuiskaart"), false, "op het scherm nooit zichtbaar");
  await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains("print-thuis")), false, "na het printen weer de gewone afdruk");

  // 2) met QR-code: praktijk beveiligen, dan de QR op het eerste vel
  await p.evaluate(() => { const e = document.getElementById("praktijk"); e.value = "Fysio Thuistest"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await p.click("#kaartenBtn");
  await p.waitForSelector("#ps_ww", { state: "visible", timeout: 5000 });
  await p.fill("#ps_ww", "geheim12345"); await p.check("#ps_vwo"); await p.click("#ps_do");
  await p.waitForSelector("#ps_do", { state: "detached", timeout: 5000 }).catch(() => {});
  await wacht(500); await sluit();
  await p.click("#printBtn");
  await p.check("#pr_thuis");
  await p.check("#pr_qr");
  await p.click("#pr_do");
  await p.waitForFunction(() => (window.__geprint || 0) === 2, null, { timeout: 10000 });
  const qr = await p.evaluate(() => [...document.querySelectorAll("#thuiskaart .tk-vel")].map((v) => !!v.querySelector(".tk-qr svg")));
  assert.deepEqual(qr, [true, false], "QR-code op het eerste vel");
  // de gewone trainingslog werkt nog
  await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await p.click("#printBtn");
  await p.check("#pr_uitgebreid");
  await p.uncheck("#pr_qr");
  await p.click("#pr_do");
  await p.waitForFunction(() => (window.__geprint || 0) === 3, null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains("print-thuis")), false);
  await p.emulateMedia({ media: "print" });
  assert.equal(await p.isVisible("#a4"), true, "trainingslog print zoals altijd");
  await p.emulateMedia({ media: "screen" });
  assert.deepEqual(fouten, []);

  console.log("test-thuiskaart: ok (zes per vel, dosering in woorden, uitleg, vakjes, QR op het eerste vel, alleen de thuiskaart op papier, V1 ongewijzigd)");
} finally {
  await browser.close();
  app.kill();
  await new Promise((r) => app.once("exit", r)).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
