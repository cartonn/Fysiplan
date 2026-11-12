// De thuiskaart kapt nooit een uitleg af (gebruikers-sweep 2026-11-12, Sanne). `npm run test:thuiskaartuitleg`
//
// Met "Groot lettertype" viel bij 10 van 12 oefeningen de uitleg midden in een regel weg, en ook
// zonder Groot bij "Achterkant benen rekken – voeten gekruist". Nu meet de app vóór het printen:
// eerst een kleiner beeld, dan een kleinere letter (bij Groot nooit onder 10,5 pt), anders minder
// oefeningen per vel. Hier: 12 oefeningen met de langste uitleg, met en zonder Groot; in de
// printweergave past elke uitleg in zijn vak en past elk vel op A4 (liggend).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
// broncontrole (ook zonder browser)
assert.match(index, /function pasThuiskaart\(el\)\{/, "de app meet of de uitleg past");
assert.match(index, /var ondergrens=\(groot\?10\.5:7\.5\)\*4\/3;/, "bij Groot niet kleiner dan 10,5 pt");
assert.match(index, /var aantallen=\[6,4,3,2,1\];/, "anders minder oefeningen per vel");
assert.match(index, /@media screen\{#thuiskaart\.tk-meet\{display:block;position:absolute;left:-10000px;/, "meten buiten beeld");
assert.match(index, /\n  \.tk-vel\{width:287mm;height:200mm;/, "de opmaak van het vel staat niet alleen in @media print");
assert.match(index, /\.tk-raster\.tk-per4\{grid-template-columns:repeat\(2,1fr\);grid-template-rows:repeat\(2,1fr\)\}/);

let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { console.log("test-thuiskaart-uitleg: geen Playwright, browserdeel overgeslagen"); process.exit(0); }

const oef = JSON.parse(await readFile(join(root, "public/oefeningen-v2.json"), "utf8"));
const VOETEN = "Achterkant benen rekken – voeten gekruist";
assert.ok(oef.some((o) => o.naam === VOETEN));
const langste = oef.filter((o) => o.naam !== VOETEN).map((o) => [String(o.uitleg || "").length, o.naam]).sort((a, b) => b[0] - a[0]).slice(0, 11).map((x) => x[1]);
const namen = [VOETEN, ...langste];

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tkuitleg-"));
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.1" } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} window.print = () => { window.__geprint = (window.__geprint || 0) + 1; }; });
  const p = await ctx.newPage();
  const fouten = [];
  p.on("pageerror", (e) => fouten.push(String(e)));
  p.on("dialog", (d) => d.accept());
  const sluit = () => p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  await p.goto(origin + "/v2/app");
  await p.waitForSelector("[data-add]", { timeout: 15000 });
  await sluit();
  for (const n of namen) {
    await p.fill("#search", n);
    const knop = p.locator(`[data-add][aria-label^="${n.replace(/"/g, '\\"')}:"]`).first();
    await knop.waitFor({ timeout: 5000 });
    await knop.click();
  }
  await p.fill("#search", "");
  await p.waitForFunction((n) => [...document.querySelectorAll("#mon .exh")].filter((t) => t.textContent.trim()).length === n, namen.length);
  // dosering op elke oefening: een regel extra per vak
  await p.evaluate(() => {
    const zet = (s, v) => document.querySelectorAll(s).forEach((e) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); });
    zet("#mon input[data-k$='|r0|S']", "3"); zet("#mon input[data-k$='|r0|H']", "12");
  });
  await p.fill("#c_naam", "Truus");

  let ronde = 0;
  for (const groot of [false, true]) {
    await p.emulateMedia({ media: "screen" });
    await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await p.click("#printBtn");
    await p.check("#pr_thuis");
    if (await p.isChecked("#pr_qr")) await p.uncheck("#pr_qr");
    if (groot) await p.check("#pr_groot"); else if (await p.isChecked("#pr_groot")) await p.uncheck("#pr_groot");
    await p.click("#pr_do");
    ronde++;
    await p.waitForFunction((r) => (window.__geprint || 0) === r, ronde, { timeout: 10000 });
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains("print-groot")), groot);
    await p.emulateMedia({ media: "print" });
    const m = await p.evaluate(() => {
      const mm = (px) => px * 25.4 / 96;
      const vellen = [...document.querySelectorAll("#thuiskaart .tk-vel")];
      return {
        vellen: vellen.map((v) => ({ n: v.querySelectorAll(".tk-oef").length, hoog: mm(v.getBoundingClientRect().height), breed: mm(v.getBoundingClientRect().width), over: v.scrollHeight > v.clientHeight + 1 })),
        oef: [...document.querySelectorAll("#thuiskaart .tk-oef")].map((o) => {
          const u = o.querySelector(".tk-uitleg");
          return { naam: o.querySelector(".tk-naam").textContent.replace(/^\d+\./, ""), sh: u.scrollHeight, ch: u.clientHeight, osh: o.scrollHeight, och: o.clientHeight,
            pt: parseFloat(getComputedStyle(u).fontSize) * 0.75, tekst: u.textContent };
        }),
      };
    });
    const wat = groot ? "met Groot" : "zonder Groot";
    assert.deepEqual(m.oef.map((o) => o.naam), namen, wat + ": alle oefeningen op de thuiskaart");
    const afgekapt = m.oef.filter((o) => o.sh > o.ch + 1 || o.osh > o.och + 1 || o.ch < 10);
    assert.deepEqual(afgekapt.map((o) => `${o.naam} (${o.sh}>${o.ch})`), [], wat + ": geen uitleg afgekapt");
    const voeten = m.oef.find((o) => o.naam === VOETEN);
    assert.match(voeten.tekst, /wissel de voeten\.?$/i, "de laatste zin staat erin");
    if (groot) assert.ok(m.oef.every((o) => o.pt >= 10.4), "Groot blijft groot: " + m.oef.map((o) => o.pt.toFixed(1)));
    else assert.ok(m.oef.every((o) => o.pt >= 7.4), "leesbaar: " + m.oef.map((o) => o.pt.toFixed(1)));
    assert.ok(m.vellen.every((v) => !v.over && v.hoog <= 210 && v.breed <= 297), wat + ": elk vel binnen A4: " + JSON.stringify(m.vellen));
    // en op papier: precies zoveel bladzijden als vellen (niets loopt over naar een extra blad)
    const pdf = await p.pdf({ landscape: true, format: "A4", printBackground: true, preferCSSPageSize: true });
    const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(paginas, m.vellen.length, wat + ": bladzijden = vellen");
    console.log(`  ${wat}: ${m.vellen.length} vellen (${m.vellen.map((v) => v.n).join("+")}), letter ${Math.min(...m.oef.map((o) => o.pt)).toFixed(1)}–${Math.max(...m.oef.map((o) => o.pt)).toFixed(1)} pt`);
  }
  await p.emulateMedia({ media: "screen" });
  assert.equal(await p.isVisible("#thuiskaart"), false, "op het scherm nooit zichtbaar");
  assert.deepEqual(fouten, []);
  console.log("test-thuiskaart-uitleg: ok (12 oefeningen met de langste uitleg, met en zonder Groot: niets afgekapt, alles binnen A4)");
} finally {
  if (browser) await browser.close();
  if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); }
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
