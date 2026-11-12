// Regressietest gebruikers-sweep 2026-11-11 22u (Mark, iPad zonder camera): /o liep dood met
// "Dat lukte niet · Geen toegang tot de camera" en geen enkele knop. Nu: "Camera opnieuw proberen"
// en "Kies een video uit je galerij" (mp4, mov of webm, max. 60 MB) die dezelfde upload gebruikt.
// CI heeft geen Playwright: de statische controle draait altijd, het browserdeel alleen waar Playwright staat.
// `npm run test:opnamegeencamera`
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
assert.match(html, /vraagCamera\('environment',opnameUI,function\(\)\{geenCamera\(/, "geweigerde camera loopt niet dood");
assert.match(html, /<input type='file' id='kies' accept='video\/mp4,video\/webm,video\/quicktime/, "video kiezen uit de galerij");
assert.match(html, /id='nogmaals'>Camera opnieuw proberen/, "camera opnieuw proberen");
console.log("test-opname-geen-camera (statisch): /o zonder camera biedt galerij en opnieuw proberen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-opname-geen-camera: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opname-"));
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
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.64.0.1", ...extra }, body: JSON.stringify(body) });
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Geen Camera", wachtwoord: "praktijk-wachtwoord", akkoord: true });
    assert.equal(claim.status, 200);
    const sessie = (await claim.json()).sessie;
    const nieuwToken = async () => { const r = await post("/api/opname/start", { doel: "kaart" }, { "x-praktijk-sessie": sessie }); assert.equal(r.status, 200); return (await r.json()).token; };
    browser = await pw.chromium.launch();
    // nep-mp4: 'ftyp' op positie 4 en groter dan 10 kB, zoals de server controleert
    const mp4 = Buffer.alloc(20 * 1024); mp4.write("ftypisom", 4, "latin1");

    for (const [toestel, mime, naam] of [["iPad (gen 7)", "video/quicktime", "IMG_0001.MOV"], ["iPhone SE", "video/mp4", "oefening.mp4"]]) {
      const token = await nieuwToken();
      // geen camerarechten: getUserMedia faalt, zoals op een apparaat zonder camera of na weigeren
      const c = await browser.newContext({ ...pw.devices[toestel], extraHTTPHeaders: { "x-forwarded-for": "10.64.1.1" } });
      await c.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("geen camera", "NotFoundError")); });
      const p = await c.newPage();
      const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/o/" + token);
      await p.waitForSelector("#kies", { state: "attached" });
      const tag = toestel;
      for (const id of ["kieslabel", "nogmaals"]) {
        const h = await p.evaluate((i) => document.getElementById(i).getBoundingClientRect().height, id);
        assert.ok(h >= 44, tag + ": " + id + " minstens 44 px (" + h + ")");
      }
      // verkeerd bestand: nette melding, niets verstuurd
      await p.setInputFiles("#kies", { name: "notitie.txt", mimeType: "text/plain", buffer: Buffer.from("hallo") });
      assert.match(await p.textContent("#gcmsg"), /Kies een video/, tag + ": tekstbestand geweigerd");
      // echte (nep-)video uit de galerij
      await p.setInputFiles("#kies", { name: naam, mimeType: mime, buffer: mp4 });
      await p.waitForSelector("text=Video verstuurd", { timeout: 10000 });
      const st = await (await fetch(origin + "/api/opname/status?token=" + token, { headers: { "x-forwarded-for": "10.64.2.1" } })).json();
      assert.equal(st.klaar, true, tag + ": het beeldscherm ziet de video");
      assert.deepEqual(fouten, [], tag + ": geen scriptfouten");
      await c.close();
    }
    console.log("test-opname-geen-camera: zonder camera een video uit de galerij verstuurd op iPad en iPhone SE");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
