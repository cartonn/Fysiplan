// Gebruikers-sweep 2026-11-08 (HOOG, Mark op iPad liggend): na de eerste keer "In de praktijk"
// onthield de app het kaart-id niet (saveServerCard nam het alleen over als het al gelijk
// was aan KAART_ID, en dat was nog leeg). Elke volgende opslag gaf dan een 409 "Er is al een
// kaart …" over de eigen kaart, en een daarna opgenomen eigen video kwam nooit bij de patiënt.
// Statisch deel draait altijd (CI heeft geen browser); het browserdeel alleen met Playwright.
// `npm run test:eerstedeling`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
const sv = index.match(/function saveServerCard\(naam,cb(?:,keuze)?\)\{[\s\S]*?\n  \}/);
assert.ok(sv, "saveServerCard gevonden");
assert.match(sv[0], /\(d\.id===KAART_ID\|\|!KAART_ID\)\)zetKaartId\(d\.id,d\.ts\)/, "eerste deling onthoudt het kaart-id");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-eerste-deling: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-eerstedeling-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" }, stdio: "ignore" });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.1" } });
    await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} });
    const p = await ctx.newPage();
    const meldingen = [];
    p.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("[data-add]", { timeout: 15000 });
    const sluit = () => p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    await sluit();
    await p.evaluate(() => { const e = document.getElementById("praktijk"); e.value = "Fysio Eerste Deling"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.click("#kaartenBtn");
    await p.waitForSelector("#ps_ww", { state: "visible", timeout: 5000 });
    await p.fill("#ps_ww", "geheim12345"); await p.check("#ps_vwo"); await p.click("#ps_do");
    await p.waitForSelector("#ps_do", { state: "detached", timeout: 5000 }).catch(() => {});
    await wacht(500); await sluit();
    await p.click("[data-add]");
    const deel = async () => {
      await p.evaluate(() => {
        const c = document.getElementById("c_naam"); c.value = "Anna"; c.dispatchEvent(new Event("input", { bubbles: true }));
        document.getElementById("k_naam").value = "Anna";
        document.getElementById("k_save_srv").click();
      });
      await p.waitForFunction(() => /gedeeld/.test(document.getElementById("k_result").textContent || ""), null, { timeout: 5000 }).catch(() => {});
    };
    await deel();
    const id = await p.evaluate(() => JSON.parse(localStorage.getItem("fysiplan_state") || "{}").kaartId || "");
    assert.match(id, /^[0-9a-f]{12}$/, "kaart-id onthouden na de eerste deling");
    // een wijziging (tweede oefening) en opnieuw "In de praktijk": werkt de eigen kaart bij
    await sluit();
    await p.locator("[data-add]").nth(1).click();
    await p.evaluate(() => { document.getElementById("k_result").textContent = ""; });
    await deel();
    assert.ok(!meldingen.some((m) => /Er is al een kaart/.test(m)), "geen 409 over de eigen kaart: " + meldingen.join(" | "));
    const r = await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.9.9.2" } });
    const k = await r.json();
    const n = ((k.kaart || k).chosen || []).length;
    assert.equal(n, 2, "de patiënt ziet de bijgewerkte kaart met 2 oefeningen: " + JSON.stringify(k).slice(0, 200));
    console.log("test-eerste-deling: id onthouden, tweede deling werkt de eigen kaart bij");
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
console.log("test-eerste-deling: OK");
