// Regressietest 2026-11-07 (Ahmed: "de printknop doet niets"). Met QR-code aan bewaart
// Print / PDF eerst de kaart. Weigerde de server (roepnaam bestaat al, niet ingelogd,
// oudere versie) of was de roepnaam leeg (elke kaart heette dan "Kaart <datum>", dus de
// tweede van die dag botste), dan sloot het venster en stond er hooguit een kleine hint
// op de A4: er gebeurde niets zichtbaars. Nu blijft het venster open met de reden, een
// knop om het op te lossen en altijd "Print zonder QR-code".
// Statisch deel draait altijd; het browserdeel alleen waar Playwright staat.
// `npm run test:printknop`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /id="pr_melding"/, "printvenster heeft een meldingvak");
const h = index.match(/getElementById\('pr_do'\)\.addEventListener\('click',function\(\)\{[\s\S]*?\n  \}\);\n/);
assert.ok(h, "pr_do-afhandeling gevonden");
for (const k of ["d.bestaat", "d.login", "d.verouderd"]) {
  assert.match(h[0], new RegExp(k.replace(".", "\\.") + "\\)\\{prMelding"), `${k}: melding in het venster`);
}
assert.doesNotMatch(h[0], /toonDeelWeigering/, "weigering sluit het venster niet meer met alleen een hint op de A4");
assert.match(h[0], /!cn\.value\.trim\(\)\)\{\s*prMelding/, "lege roepnaam wordt in het venster gevraagd");
assert.match(index, /data-pract='zonderqr'/, "altijd een uitweg: Print zonder QR-code");

const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-printknop: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-print-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" }, stdio: "ignore" });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.7.1" } });
    await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} window.print = () => { window.__geprint = (window.__geprint || 0) + 1; }; });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("[data-add]", { timeout: 15000 });
    const sluit = () => p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    const geprint = () => p.evaluate(() => window.__geprint || 0);
    await sluit();
    await p.evaluate(() => { const e = document.getElementById("praktijk"); e.value = "Fysio Printtest"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.click("#kaartenBtn");
    await p.waitForSelector("#ps_ww", { state: "visible", timeout: 5000 });
    await p.fill("#ps_ww", "geheim12345"); await p.check("#ps_vwo"); await p.click("#ps_do");
    await p.waitForSelector("#ps_do", { state: "detached", timeout: 5000 }).catch(() => {});
    await wacht(500); await sluit();
    await p.click("[data-add]");
    // 1: lege roepnaam -> vraag in het venster, daarna printen
    await p.click("#printBtn"); await p.click("#pr_do");
    await p.waitForSelector("#pr_naam", { state: "visible", timeout: 3000 });
    assert.ok(await p.isVisible("#ovPrint"), "venster blijft open bij lege roepnaam");
    await p.fill("#pr_naam", "Jan K."); await p.click("[data-pract='naam']");
    await p.waitForFunction(() => (window.__geprint || 0) === 1, null, { timeout: 5000 });
    // 2: nieuwe kaart met een bestaande roepnaam -> melding, dan zonder QR printen
    await p.click("#clearBtn"); await p.click("#wis_alles"); await wacht(300);
    await p.click("[data-add]"); await p.fill("#c_naam", "Jan K.");
    await p.click("#printBtn"); await p.click("#pr_do");
    await p.waitForSelector("#pr_melding:not([hidden])", { timeout: 5000 });
    assert.match(await p.textContent("#pr_melding"), /Er is al een kaart/, "bestaande roepnaam staat in het venster");
    assert.equal(await geprint(), 1, "nog niet geprint");
    await p.click("[data-pract='zonderqr']");
    await p.waitForFunction(() => (window.__geprint || 0) === 2, null, { timeout: 5000 });
    assert.ok(!(await p.isVisible("#ovPrint")), "venster dicht na printen");
    console.log("test-printknop: venster toont de reden en print daarna (lege roepnaam, bestaande roepnaam)");
    // 3: niet ingelogd bij een beveiligde praktijk -> QR-code staat uit, printen werkt meteen
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.7.2" } });
    await ctx2.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} window.print = () => { window.__geprint = (window.__geprint || 0) + 1; }; });
    const q = await ctx2.newPage();
    q.on("dialog", (d) => d.accept());
    await q.goto(origin + "/v2/app");
    await q.waitForSelector("[data-add]", { timeout: 15000 });
    await q.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); const e = document.getElementById("praktijk"); e.value = "Fysio Printtest"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await q.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await q.click("[data-add]");
    await q.click("#printBtn");
    await q.waitForSelector("#pr_melding:not([hidden])", { timeout: 5000 });
    assert.equal(await q.isChecked("#pr_qr"), false, "niet ingelogd: QR-code staat uit");
    assert.match(await q.textContent("#pr_melding"), /niet ingelogd/, "uitleg hoe je de QR-code wel krijgt");
    await q.click("#pr_do");
    await q.waitForFunction(() => (window.__geprint || 0) === 1, null, { timeout: 5000 });
    await ctx2.close();
    console.log("test-printknop: niet ingelogd print meteen, zonder QR-code");
  } finally { await browser.close(); app.kill(); }
}
console.log("test-printknop: ok");
