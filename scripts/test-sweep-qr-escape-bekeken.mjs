// Gebruikers-sweep 2026-11-23 (Sanne, desktop):
// 1. "Test de QR" bij een praktijk zonder login opent Kaarten met daarin Beveiligen. De eerste Escape sloot
//    alleen Beveiligen; Kaarten bleef open met de focus in het naamveld onderaan. Nu gaat Kaarten mee dicht
//    en komt de focus terug op "Test de QR".
// 2. "Open op deze computer" door de ingelogde praktijk zette de kaart op "bekeken"; de nooit-geopend-triage
//    klopte dan niet meer. Een bezoek met een geldige sessie van de eigen praktijk telt niet mee.
// Deel 2 en de broncontrole draaien zonder browser (CI); deel 1 alleen als Playwright er is.
// `npm run test:qrescape`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /openEigenLogin\('nieuw',\{kaartenDicht:kaartenDicht,terug:vanKnop\}\)/, "openBeveiligen geeft door of Kaarten vanzelf openging");
assert.match(appHtml, /if\(nieuw&&opts\.kaartenDicht\)\{\s*NA_BEVEILIG=null;closeOv\('ovKaarten'\);[\s\S]{0,700}?tk\.focus\(\)/, "Annuleren/Escape sluit dan ook Kaarten");

const vrijePoort = async () => { const r = createServer(); await new Promise((x) => r.listen(0, "127.0.0.1", x)); const p = r.address().port; await new Promise((x) => r.close(x)); return p; };
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function startServer(extraEnv) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-qrescape-"));
  const port = await vrijePoort();
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = "";
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  return { origin, uit: () => uit, async stop() {
    if (app.exitCode === null && app.signalCode === null) { const w = new Promise((r) => app.once("exit", r)); app.kill(); await Promise.race([w, wacht(5000)]); }
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } };
}

// ---- 2. bekeken: de eigen praktijk telt niet ----
{
  const srv = await startServer({});
  try {
    let ip = 1;
    const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.11." + (ip++), ...extra });
    const P = "Fysio Bekeken Eigen";
    const G = { "x-praktijk-sessie": (await (await fetch(srv.origin + "/api/praktijk/claim", { method: "POST", headers: kop(), body: JSON.stringify({ praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true }) })).json()).sessie };
    assert.ok(G["x-praktijk-sessie"], "praktijk beveiligd");
    const id = (await (await fetch(srv.origin + "/api/kaarten", { method: "POST", headers: kop(G), body: JSON.stringify({ praktijk: P, naam: "Mo", client: { c_naam: "Mo" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }) })).json()).id;
    assert.ok(id, "kaart gedeeld");
    const bekeken = async () => (await (await fetch(srv.origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(G) })).json()).find((k) => k.id === id).bekeken;
    assert.equal((await fetch(srv.origin + "/k/" + id, { headers: kop(G) })).status, 200);
    assert.equal(await bekeken(), 0, "de praktijk zelf opent de kaart: niet bekeken");
    assert.equal((await fetch(srv.origin + "/k/" + id, { headers: kop({ "user-agent": "Mozilla/5.0 (iPhone)" }) })).status, 200);
    assert.ok(await bekeken() > 0, "de patiënt opent de kaart: bekeken");
    console.log("bekeken door de eigen praktijk telt niet: ok");
  } catch (e) { console.error(srv.uit().slice(-1500)); throw e; } finally { await srv.stop(); }
}

// ---- 1. Escape na Test de QR (browser) ----
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("Escape na Test de QR: overgeslagen (geen Playwright)"); }
else {
  const srv = await startServer({ EIGEN_LOGIN_VERPLICHT: "aan", PROEF_VERPLICHT: "uit" });
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.6.12.1" } });
    await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch (e) {} });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.dismiss());
    await page.goto(srv.origin + "/v2/app?praktijk=" + encodeURIComponent("Fysio Escape Test"), { waitUntil: "load" });
    await page.waitForTimeout(1200);
    if (await page.locator(".ov.on").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    if (await page.locator("#praktijk").count()) await page.evaluate(() => { const p = document.getElementById("praktijk"); if (p && !p.value) { p.value = "Fysio Escape Test"; p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); } });
    await page.fill("#search", "squat"); await page.waitForTimeout(400);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
    await page.fill("#c_naam", "Mo"); await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.getElementById("pb_qr"); b.focus(); b.click(); }); // knop staat in de proefbalk
    await page.waitForTimeout(2500);
    const open = () => page.evaluate(() => [...document.querySelectorAll(".ov.on")].map((o) => o.id));
    assert.ok((await open()).includes("ovEigenLogin"), "Beveiligen staat open na Test de QR: " + (await open()));
    await page.keyboard.press("Escape"); await page.waitForTimeout(700);
    assert.deepEqual(await open(), [], "één Escape: Beveiligen én Kaarten dicht");
    // de proefbalk staat zonder proef verborgen, dus de focus kan hier niet terug op de knop zelf;
    // wel nooit meer in het (dichte) Kaarten-paneel, zoals eerst #k_naam
    assert.equal(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest("#ovKaarten"))), false, "focus niet in Kaarten");
    console.log("Escape na Test de QR: ok");
  } catch (e) { console.error(srv.uit().slice(-1500)); throw e; } finally { await browser.close(); await srv.stop(); }
}
