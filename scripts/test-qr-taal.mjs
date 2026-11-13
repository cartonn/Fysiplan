// Gebruikers-sweep 2026-11-08 (MIDDEL, Sanne → Truus): de geprinte QR, "Bekijk zelf hoe je
// patiënt hem ziet", "Kopieer link" en "Test de QR op je telefoon" namen de gekozen
// patiënttaal niet mee (alleen WhatsApp/e-mail kregen ?taal=..). Een Engelstalige
// patiënt kreeg via de geprinte QR dus een Nederlandse kaart. Nu bouwen ze de link met
// kaartUrl() en tekent de QR opnieuw zodra de taal in Kaarten → Deel wijzigt.
// Statisch deel draait altijd (CI heeft geen browser); het browserdeel alleen met Playwright.
// `npm run test:qrtaal`
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
const tq = index.match(/function toonQr\(id\)\{[\s\S]*?var url=([^;]+);/);
assert.ok(tq, "toonQr gevonden");
assert.equal(tq[1], "kaartUrl(id)", "QR op de kaart met de gekozen patiënttaal");
const qt = index.match(/ensureQr\(function\(\)\{\s*var url=([^;]+);\s*var svg=qrSvg\(d\.id,220\)/);
assert.ok(qt, "QR-testvenster gevonden");
assert.equal(qt[1], "kaartUrl(d.id)", "QR-testvenster met de gekozen patiënttaal");
assert.match(index, /b\.innerHTML=qrSvg\(id,120\)/, "QR op de kaart via qrSvg");
// Capaciteit en V1-compatibiliteit worden met de echte helper getest in test-qr-lang-domein.mjs.
// op fysiplan.nl past de link met taal in de QR (versie 3, niveau M: 42 tekens)
{
  const vm = await import("node:vm");
  const sandbox = { window: {} };
  vm.runInNewContext(await readFile(join(root, "public/qr.js"), "utf8"), sandbox);
  assert.ok(sandbox.window.FYSIQR.svg("https://fysiplan.nl/k/abcdef123456?taal=en", 120), "productielink met ?taal=en past in de QR");
}
assert.match(index, /s\.dataset\.staal===KAART_ID\)\{[^}]*toonQr\(KAART_ID\)/, "taal wisselen tekent de QR op de kaart opnieuw");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-qr-taal: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-qrtaal-"));
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.8.1" } });
    await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} window.print = () => { window.__geprint = (window.__geprint || 0) + 1; }; });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("[data-add]", { timeout: 15000 });
    const sluit = () => p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    await sluit();
    await p.evaluate(() => { const e = document.getElementById("praktijk"); e.value = "Fysio QR-taal"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.click("#kaartenBtn");
    await p.waitForSelector("#ps_ww", { state: "visible", timeout: 5000 });
    await p.fill("#ps_ww", "geheim12345"); await p.check("#ps_vwo"); await p.click("#ps_do");
    await p.waitForSelector("#ps_do", { state: "detached", timeout: 5000 }).catch(() => {});
    await wacht(500); await sluit();
    await p.click("[data-add]"); await p.fill("#c_naam", "Jayden");
    await p.click("#printBtn"); await p.click("#pr_do");
    await p.waitForFunction(() => (window.__geprint || 0) === 1, null, { timeout: 5000 });
    const link = () => p.evaluate(() => { const a = document.querySelector("#qrBlok a[href*='/k/']"); return a ? a.getAttribute("href") : ""; });
    const svgKlopt = () => p.evaluate(() => {
      const a = document.querySelector("#qrBlok a[href*='/k/']");
      const svg = document.querySelector("#qrBlok svg");
      if (!(a && svg && window.FYSIQR)) return false;
      const href = a.getAttribute("href"), kaal = href.replace(/\?.*$/, "");
      const verwacht = FYSIQR.svg(href, 120) || FYSIQR.svg(href, 120, true) || FYSIQR.svg(kaal, 120);
      const d = svg.querySelector("path") && svg.querySelector("path").getAttribute("d");
      return !!d && verwacht.includes('d="' + d + '"');
    });
    assert.match(await link(), /\/k\/[0-9a-f]+$/, "Nederlands: kale kaartlink");
    // taal in Kaarten → Deel op Engels: QR op de kaart volgt meteen
    await p.click("#kaartenBtn");
    await p.waitForSelector("[data-staal]", { state: "attached", timeout: 8000 });
    // de keuzelijst zit in het ingeklapte deelpaneel: zelfde change-event als een klik
    await p.evaluate(() => { const s = document.querySelector("[data-staal]"); s.value = "en"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await wacht(200); await sluit();
    assert.match(await link(), /\/k\/[0-9a-f]+\?taal=en$/, "na taalkeuze: QR-link met ?taal=en");
    assert.ok(await svgKlopt(), "de QR codeert de link met ?taal=en (of de kale link als die niet past)");
    // opnieuw printen: de QR blijft Engels
    await p.click("#printBtn"); await p.click("#pr_do");
    await p.waitForFunction(() => (window.__geprint || 0) === 2, null, { timeout: 5000 });
    assert.match(await link(), /\?taal=en$/, "geprinte QR in de taal van de patiënt");
    console.log("test-qr-taal: QR op de kaart en in de print neemt de patiënttaal mee");
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
console.log("test-qr-taal: OK");
