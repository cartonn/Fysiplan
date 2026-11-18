// Regressietest gebruikers-sweep 2026-11-13 02u (Truus, 72, iPhone SE met 200 % tekst en "A A"):
// de veiligheidszin "Neem pijn serieus … overleg met je fysiotherapeut." viel rechts weg, en een
// vaste vraag ("Ik heb een dag overgeslagen. Moet ik dat inhalen?") maakte de pagina 16 px breder,
// waardoor het "+" van de uitklapvraag uit beeld viel. Oorzaak: tekst in een flexbox met min-width:auto.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:veiliggroot`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(html, /#veiligTxt\{min-width:0;overflow-wrap:break-word/, "de veiligheidszin krimpt mee en breekt af");
assert.match(html, /\.vvlijst summary>span\{min-width:0;overflow-wrap:break-word/, "een vaste vraag krimpt mee en breekt af");
assert.match(html, /<summary'\+l\+'><span>'\+esc\(x\.v\)\+'<\/span><\/summary>/, "de vraag staat in een eigen span");
console.log("test-kaart-veilig-groot (statisch): veiligheidszin en vaste vragen krimpen mee");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-kaart-veilig-groot: geen Playwright, telefoondeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-veilig-"));
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
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    browser = await pw.chromium.launch();
    for (const [toestel, groot, aa] of [["iPhone SE", "200%", true], ["iPhone SE", "100%", false], ["Pixel 7", "200%", true]]) {
      const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.65.0.1" } });
      await c.addInitScript((g) => { const zet = () => { const s = document.createElement("style"); s.textContent = "html{font-size:" + g + " !important}"; document.documentElement.appendChild(s); };
        if (document.documentElement) zet(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); zet(); } }).observe(document, { childList: true }); }, groot);
      if (aa) await c.addInitScript(() => { try { localStorage.setItem("fp_groot", "1"); } catch {} });
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      await p.waitForSelector("#veiligTxt", { state: "attached" });
      await wacht(500);
      const tag = toestel + " " + groot + (aa ? " + A A" : "");
      const m = await p.evaluate(() => {
        const v = document.getElementById("veilig").getBoundingClientRect(), t = document.getElementById("veiligTxt").getBoundingClientRect();
        const vv = [...document.querySelectorAll(".vvlijst summary")];
        return { breed: innerWidth, sw: document.documentElement.scrollWidth, vRechts: v.right, tRechts: t.right, tekst: document.getElementById("veiligTxt").textContent,
          vragen: vv.length, teBreed: vv.filter((s) => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().right > innerWidth + 0.5).length };
      });
      assert.ok(m.tekst.length > 20, tag + ": er staat een veiligheidszin");
      assert.equal(m.sw, m.breed, tag + ": pagina niet breder dan het scherm (" + m.sw + " > " + m.breed + ")");
      assert.ok(m.tRechts <= m.vRechts + 0.5, tag + ": veiligheidszin binnen het gele blok (" + m.tRechts + " > " + m.vRechts + ")");
      assert.ok(m.vragen > 0, tag + ": de demokaart heeft vaste vragen");
      assert.equal(m.teBreed, 0, tag + ": elke vaste vraag past, met het + in beeld");
      assert.deepEqual(fouten, [], tag + ": geen scriptfouten");
      await c.close();
    }
    console.log("test-kaart-veilig-groot: veiligheidszin en vaste vragen passen op iPhone SE en Pixel 7, ook bij 200 % + A A");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
