// Gebruikers-sweep 2026-11-16 06u (Sanne, desktop, alleen toetsenbord): knoppen die zichzelf even uitzetten terwijl
// ze iets ophalen (Test de QR, Inzage, Verder bij inloggen) laten de focus op <body> vallen. Het venster dat daarna
// opent, onthield dan geen opener, en na Esc of Klaar stond de focus nergens: de volgende Tab begon bovenaan de pagina.
// Nu onthoudt het venster de laatst gefocuste knop als opener, en keert de focus daar na sluiten naar terug.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:focusterugvenster`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /if\(!terug\|\|terug===document\.body\)terug=laatst;/, "venster valt terug op de laatst gefocuste knop");
assert.match(index, /document\.addEventListener\('focusin',function\(e\)\{if\(e\.target&&e\.target!==document\.body\)laatst=e\.target;\},true\);/, "laatste focus bijgehouden");
assert.match(index, /if\(document\.contains\(t\)&&zichtbaar\(t\)&&!t\.disabled\)\{try\{t\.focus\(\);\}catch\(e\)\{\}return;\}/, "terug naar een knop die weer aan staat");
console.log("test-sweep-focus-terug-venster: bron OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-focus-terug-venster: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-focusterug-"));
  const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
  const origin = "http://127.0.0.1:" + port;
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let uit = "";
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  let ip = 1;
  const post = (p, b) => fetch(origin + p, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.8.13." + (ip++ & 255) }, body: JSON.stringify(b) });
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    const P = "Fysio Focus Terug";
    const claim = await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "focus-terug-123", akkoord: true })).json();
    assert.ok(claim.sessie, uit.slice(-300));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.14.1" } });
    await ctx.addInitScript(([s, pr]) => { try {
      localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: pr }));
      localStorage.setItem("fp_praksessie", s);
    } catch {} }, [claim.sessie, P]);
    const p = await ctx.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(String(e)));
    p.on("dialog", (d) => d.accept(d.defaultValue() || "Truus"));
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("[data-add]", { timeout: 15000 });
    await p.waitForTimeout(800);
    await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    // zoals Test de QR in de proef en Inzage: de knop zet zichzelf uit terwijl hij ophaalt, en opent daarna een venster
    await p.evaluate(() => {
      const k = document.createElement("button"); k.type = "button"; k.id = "probeerKnop"; k.textContent = "Ophalen";
      document.querySelector(".wrap").prepend(k);
      k.addEventListener("click", () => {
        k.disabled = true;
        setTimeout(() => { k.disabled = false; document.getElementById("ovQrTest").classList.add("on"); }, 300);
      });
    });
    await p.focus("#probeerKnop");
    await p.keyboard.press("Enter");
    await p.waitForSelector("#ovQrTest.on", { timeout: 5000 });
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => document.getElementById("ovQrTest").contains(document.activeElement)), true, "focus in het QR-venster");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);
    assert.equal(await p.evaluate(() => document.getElementById("ovQrTest").classList.contains("on")), false, "Esc sluit het QR-venster");
    assert.equal(await p.evaluate(() => (document.activeElement || {}).id || document.activeElement.tagName), "probeerKnop", "focus terug op de knop die het venster opende");
    assert.deepEqual(fouten, [], "geen paginafouten");
    console.log("test-sweep-focus-terug-venster: browser OK (focus terug op de opener na Esc, ook als die even uit stond)");
  } catch (e) {
    console.error(uit.slice(-1500));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}
