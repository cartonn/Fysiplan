// Regressietest gebruikers-sweep 2026-11-16 (/o op telefoon): met een WERKENDE camera kon je geen video
// kiezen die je al had (het galerijveld stond alleen op het scherm "Geen camera"). Nu staat onder de camera
// "Of kies een video die je al hebt": zelfde controle en upload, opnemen staat uit tijdens het versturen,
// de camera gaat uit als de video binnen is, en tijdens een opname is de keuze weg.
// CI heeft geen Playwright: de statische controle draait altijd, het browserdeel alleen waar Playwright staat.
// `npm run test:opnamegalerij`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/opname.html"), "utf8");
const ui = html.slice(html.indexOf("function opnameUI(){"), html.indexOf("function wissel(){"));
assert.ok(ui.length > 50, "opnameUI gevonden");
assert.match(ui, /galerijHTML\('Of kies een video die je al hebt'\)/, "camera-scherm biedt de galerij als tweede keus");
assert.match(ui, /bindGalerij\(/, "galerij in het camera-scherm doet echt iets");
console.log("test-opname-galerij-camera (statisch): camera-scherm biedt ook een bestaande video");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-opname-galerij-camera: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opname-gal-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://localhost:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.65.0.1", ...extra }, body: JSON.stringify(body) });
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Galerij Camera", wachtwoord: "praktijk-wachtwoord", akkoord: true });
    assert.equal(claim.status, 200);
    const sessie = (await claim.json()).sessie;
    const nieuwToken = async () => { const r = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": sessie }); assert.equal(r.status, 200); return (await r.json()).token; };
    browser = await pw.chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const mp4 = Buffer.alloc(20 * 1024); mp4.write("ftypisom", 4, "latin1");

    for (const [toestel, mime, bestand] of [["iPhone SE", "video/quicktime", "IMG_0002.MOV"], ["Pixel 7", "video/mp4", "oefening.mp4"]]) {
      const token = await nieuwToken();
      const c = await browser.newContext({ ...pw.devices[toestel], permissions: ["camera", "microphone"], extraHTTPHeaders: { "x-forwarded-for": "10.65.1.1" } });
      // bijhouden of de camera na het versturen echt uit gaat
      await c.addInitScript(() => {
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        window.__sporen = [];
        navigator.mediaDevices.getUserMedia = (c) => orig(c).then((s) => { window.__sporen.push(...s.getTracks()); return s; });
      });
      const p = await c.newPage();
      const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/o/" + token);
      await p.waitForSelector("#knop");
      await p.waitForSelector("#kies", { state: "attached" });
      const tag = toestel;
      const h = await p.evaluate(() => document.getElementById("kieslabel").getBoundingClientRect().height);
      assert.ok(h >= 44, tag + ": galerijknop minstens 44 px (" + h + ")");
      const past = await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
      assert.ok(past, tag + ": camera-scherm met galerijknop past zonder scrollen");
      const zicht = await p.evaluate(() => { const r = document.getElementById("kieslabel").getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
      assert.ok(zicht, tag + ": galerijknop in beeld");
      // tijdens een opname is de keuze weg, daarna terug via Opnieuw
      await p.click("#knop");
      assert.equal(await p.isVisible("#kieslabel"), false, tag + ": geen galerij tijdens opnemen");
      await wacht(700);
      await p.click("#knop");
      await p.waitForSelector("#opnieuw");
      await p.click("#opnieuw");
      await p.waitForSelector("#kies", { state: "attached" });
      // verkeerd bestand: nette melding, niets verstuurd
      await p.setInputFiles("#kies", { name: "notitie.txt", mimeType: "text/plain", buffer: Buffer.from("hallo") });
      assert.match(await p.textContent("#gcmsg"), /Kies een video/, tag + ": tekstbestand geweigerd");
      await p.setInputFiles("#kies", { name: bestand, mimeType: mime, buffer: mp4 });
      await p.waitForSelector("text=Video verstuurd", { timeout: 10000 });
      const st = await (await fetch(origin + "/api/opname/status?token=" + token, { headers: { "x-forwarded-for": "10.65.2.1" } })).json();
      assert.equal(st.klaar, true, tag + ": het beeldscherm ziet de video");
      const live = await p.evaluate(() => window.__sporen.filter((t) => t.readyState === "live").length);
      assert.equal(live, 0, tag + ": camera en microfoon zijn uit na het versturen");
      assert.deepEqual(fouten, [], tag + ": geen scriptfouten");
      await c.close();
    }
    console.log("test-opname-galerij-camera: met werkende camera een bestaande video verstuurd op iPhone SE en Pixel 7");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
