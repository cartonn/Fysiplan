// Gebruikers-sweep 2026-11-23 (Sanne, desktop): op de thuiskaart koos de app per tegel een kleiner beeld,
// waardoor de titels in één rij 9 mm uit elkaar stonden (rijen 011, 001, 101 …), en "10." plakte tegen de
// titel. Nu krijgt een hele rij hetzelfde beeld. Hier: 12, 9 en 6 oefeningen, lange en korte uitleg om en
// om, met en zonder Groot; per rij staan de titels op dezelfde hoogte. `npm run test:thuiskaartrij`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /if\(rij\.some\(function\(o\)\{return o\.classList\.contains\('tk-veel'\);\}\)\)rij\.forEach/, "een hele rij krijgt hetzelfde beeld");
assert.match(index, /\.tk-naam \.tk-nr\{display:inline-block;min-width:6mm;margin-right:1mm;/, "ruimte tussen nummer en titel");

let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { console.log("test-thuiskaart-rij: geen Playwright, browserdeel overgeslagen"); process.exit(0); }

const oef = JSON.parse(await readFile(join(root, "public/oefeningen-v2.json"), "utf8"));
const opLengte = oef.filter((o) => o.naam && o.naam.length < 30 && !/["]/.test(o.naam)).map((o) => [String(o.uitleg || "").length, o.naam]).sort((a, b) => a[0] - b[0]);
// sommige oefeningen heten in de app anders (Nederlandse naam): wat niet te vinden is, wordt overgeslagen
const kort = opLengte.filter((x) => x[0] > 40).slice(0, 40).map((x) => x[1]);
const lang = opLengte.slice(-40).reverse().map((x) => x[1]);

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tkrij-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: "ignore" });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  browser = await chromium.launch();
  const fouten = [];
  let p;
  const nieuw = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.7" } });
    await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} window.print = () => { window.__geprint = (window.__geprint || 0) + 1; }; });
    p = await ctx.newPage();
    p.on("pageerror", (e) => fouten.push(String(e)));
    p.on("dialog", (d) => d.accept());
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("[data-add]", { timeout: 15000 });
    await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  };
  const zet = async (aantal) => {
  const pools = [lang.slice(), kort.slice()];
  let n = 0;
  while (n < aantal) {
    const naam = pools[n % 2].shift();
    assert.ok(naam, "genoeg oefeningen gevonden");
    await p.fill("#search", naam);
    const knop = p.locator(`[data-add][aria-label^="${naam.replace(/"/g, '\\"')}:"]`).first();
    try { await knop.waitFor({ timeout: 1500 }); } catch { continue; }
    await knop.click();
    n++;
  }
  await p.fill("#search", "");
  await p.waitForFunction((n) => [...document.querySelectorAll("#mon .exh")].filter((t) => t.textContent.trim()).length === n, aantal);
  // dosering op elke oefening: een regel extra per vak
  await p.evaluate(() => {
    const zet = (s, v) => document.querySelectorAll(s).forEach((e) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); });
    zet("#mon input[data-k$='|r0|S']", "3"); zet("#mon input[data-k$='|r0|H']", "12");
  });
  };

  let ronde = 0;
  const meet = async (groot) => {
    await p.emulateMedia({ media: "screen" });
    await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await p.click("#printBtn");
    await p.check("#pr_thuis");
    if (await p.isChecked("#pr_qr")) await p.uncheck("#pr_qr");
    if (groot) await p.check("#pr_groot"); else if (await p.isChecked("#pr_groot")) await p.uncheck("#pr_groot");
    await p.click("#pr_do");
    ronde++;
    await p.waitForFunction((r) => (window.__geprint || 0) === r, ronde, { timeout: 10000 });
    await p.emulateMedia({ media: "print" });
    return p.evaluate(() => [...document.querySelectorAll("#thuiskaart .tk-raster")].map((r) => {
      const rijen = {};
      [...r.querySelectorAll(".tk-oef")].forEach((o) => {
        const k = Math.round(o.getBoundingClientRect().top);
        const nr = o.querySelector(".tk-nr"), naam = o.querySelector(".tk-naam");
        (rijen[k] = rijen[k] || []).push({ titel: Math.round(naam.getBoundingClientRect().top), veel: o.classList.contains("tk-veel"),
          nrVol: nr.getBoundingClientRect().width - nr.scrollWidth });
      });
      return Object.values(rijen);
    }));
  };
  let gemeten = [];
  for (const n of [12, 9, 6]) {
    await nieuw(); ronde = 0;
    await zet(n);
    for (const groot of [false, true]) {
      const rasters = await meet(groot);
      const rijen = rasters.flat();
      const scheef = rijen.filter((rij) => Math.max(...rij.map((t) => t.titel)) - Math.min(...rij.map((t) => t.titel)) > 1);
      assert.deepEqual(scheef.map((rij) => rij.map((t) => (t.veel ? 1 : 0)).join("")), [], `${n} oefeningen ${groot ? "met" : "zonder"} Groot: titels per rij op één hoogte`);
      gemeten.push(`${n}${groot ? "G" : ""}: ${rijen.map((rij) => rij.map((t) => (t.veel ? 1 : 0)).join("")).join("/")}`);
    }
  }
  assert.deepEqual(fouten, []);
  console.log("test-thuiskaart-rij: ok (" + gemeten.join(", ") + ")");
} finally {
  if (browser) await browser.close();
  if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); }
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
