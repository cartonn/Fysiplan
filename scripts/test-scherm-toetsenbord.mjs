// Vandaag, Patiënten en Praktijk zijn schermen, geen vensters (gebruikers-sweep 2026-11-12, Sanne).
// `npm run test:schermtoetsenbord`
//
// - als scherm: geen role=dialog/aria-modal maar een gebied met de kop als naam, en geen Tab-val:
//   met Tab kom je bij de schermknoppen, Printen en terug uit het paneel
// - klik naast het paneel op een scherm laat het scherm staan (gaf een leeg scherm)
// - vanuit Kaart maken (knop Kaarten) blijft het een venster: dialoog, Tab blijft erin, kop "Kaarten",
//   klik ernaast sluit het
// - V1 (de app op /) houdt het venster zoals het was: alles hierboven hangt aan IS_V2 (broncontrole)
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
// broncontrole (ook zonder browser)
assert.match(index, /function paneelAlsScherm\(\)\{return IS_V2&&SCHERM!=='maken';\}/, "het paneel weet of het een scherm is");
assert.match(index, /function paneelRol\(\)\{\n    var m=document\.querySelector\('#ovKaarten \.modal'\);if\(!m\|\|!IS_V2\)return;/, "rol van het paneel per scherm, alleen V2");
assert.match(index, /function alsScherm\(ov\)\{return ov\.id==='ovKaarten'&&paneelAlsScherm\(\);\}/, "de Tab-val slaat het scherm over");
assert.match(index, /if\(stapel\[i\]\.ov\.classList\.contains\('on'\)&&!alsScherm\(stapel\[i\]\.ov\)\)return stapel\[i\]\.ov;/);
assert.match(index, /if\(ov\.id==='ovKaarten'&&paneelAlsScherm\(\)\)return;/, "klik naast het scherm doet niets");
assert.doesNotMatch(index, /if\(e\.target===ov\)ov\.classList\.remove\('on'\);/, "klik naast het paneel maakte het scherm leeg");
assert.match(index, /if\(IS_V2&&SCHERM==='maken'\)\{var kop=document\.querySelector\('#ovKaarten \.modal>h3'\);if\(kop\)kop\.textContent='Kaarten';\}/, "knop Kaarten zet de kop terug");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-schermtab-"));
const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
let app, uit = "", browser;
const stop = async () => { if (app && app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };
let ip = 1;
const kop = (x = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.3." + (ip++ & 255), ...x });
const post = (p, b, x) => fetch(origin + p, { method: "POST", headers: kop(x), body: JSON.stringify(b) });
try {
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claim = await (await post("/api/praktijk/claim", { praktijk: "Fysio Tab", wachtwoord: "tab-wachtwoord-123", akkoord: true })).json();
  const A = { "x-praktijk-sessie": claim.sessie };
  for (const n of ["Truus", "Piet"]) {
    const r = await post("/api/kaarten", { praktijk: "Fysio Tab", naam: n, client: { c_naam: n }, kaartId: "", chosen: [{ n: "Squat", i: 0 }] }, A);
    assert.equal(r.status, 200, uit.slice(-300));
    const id = (await r.json()).id;
    assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);
  }

  browserdeel: {
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { console.log("test-scherm-toetsenbord: geen Playwright, browserdeel overgeslagen"); break browserdeel; }
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.4.1" } });
  await ctx.addInitScript(([s]) => { try {
    localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
    localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Tab" }));
    localStorage.setItem("fp_praksessie", s);
  } catch {} }, [claim.sessie]);
  const fouten = [];
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fouten.push(String(e)));
  p.on("dialog", (d) => d.accept());
  await p.goto(origin + "/v2/app");
  await p.waitForSelector("#fpSchermen [data-scherm='vandaag']", { timeout: 15000 });
  await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  await p.click("#fpSchermen [data-scherm='vandaag']");
  await p.waitForSelector("#k_inbox .ib-item", { timeout: 8000 });
  await p.waitForTimeout(200);

  const rol = () => p.evaluate(() => {
    const m = document.querySelector("#ovKaarten .modal");
    const naam = m.getAttribute("aria-labelledby") && (document.getElementById(m.getAttribute("aria-labelledby")) || {}).textContent;
    return { role: m.getAttribute("role"), modal: m.getAttribute("aria-modal"), naam };
  });
  assert.deepEqual(await rol(), { role: "region", modal: null, naam: "Vandaag" }, "Vandaag is een gebied, geen dialoog");
  const waar = () => p.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "body";
    if (a.closest("#ovKaarten")) return "paneel";
    if (a.dataset && a.dataset.scherm) return "scherm:" + a.dataset.scherm;
    return a.id || a.tagName.toLowerCase();
  });
  // met Tab van Vandaag naar de andere schermknoppen en Printen
  await p.focus("#fpSchermen [data-scherm='vandaag']");
  const gezien = [];
  for (let i = 0; i < 60; i++) { await p.keyboard.press("Tab"); gezien.push(await waar()); }
  assert.equal(gezien[0], "scherm:patienten", "Tab na Vandaag: Patiënten, niet de val in het paneel: " + gezien.slice(0, 6));
  assert.ok(gezien.includes("scherm:praktijk"), "schermknop Praktijk bereikbaar");
  assert.ok(gezien.includes("printBtn"), "Printen bereikbaar: " + gezien.join(","));
  assert.ok(gezien.includes("paneel"), "het paneel zelf is ook bereikbaar");
  const eerstePaneel = gezien.indexOf("paneel");
  assert.ok(gezien.slice(eerstePaneel).some((w) => w !== "paneel"), "uit het paneel kom je met Tab weer verder: " + gezien.join(","));
  // Shift+Tab vanuit het paneel gaat terug naar de kopbalk
  await p.focus("#k_inbox button, #ovKaarten .modal button:not([hidden])");
  assert.equal(await waar(), "paneel");
  let terug = false;
  for (let i = 0; i < 40 && !terug; i++) { await p.keyboard.press("Shift+Tab"); terug = (await waar()) !== "paneel"; }
  assert.ok(terug, "Shift+Tab verlaat het paneel");

  // Patiënten: klik naast het paneel laat het scherm staan
  await p.click("#fpSchermen [data-scherm='patienten']");
  await p.waitForSelector("#k_srv_lijst [data-sopen]", { timeout: 8000 });
  assert.equal((await rol()).naam, "Patiënten");
  assert.equal((await rol()).role, "region");
  const box = await p.evaluate(() => { const o = document.getElementById("ovKaarten").getBoundingClientRect(), m = document.querySelector("#ovKaarten .modal").getBoundingClientRect(); return { x: Math.round((o.left + m.left) / 2), y: Math.round(m.top + 40) }; });
  assert.equal(await p.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [box.x, box.y]), "ovKaarten", "de klik valt naast het paneel");
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => document.getElementById("ovKaarten").classList.contains("on")), true, "Patiënten blijft staan");
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute("data-scherm")), "patienten");
  assert.equal(await p.isVisible("#k_srv_lijst"), true, "geen leeg scherm");
  // Praktijk idem
  await p.click("#fpSchermen [data-scherm='praktijk']");
  await p.waitForSelector("#k_praktijk .kp-tegel", { timeout: 5000 });
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(200);
  assert.equal(await p.isVisible("#k_praktijk"), true, "Praktijk blijft staan");
  assert.equal((await rol()).role, "region");

  // Kaart maken → knop Kaarten: een echt venster, met de kop Kaarten
  await p.click("#fpSchermen [data-scherm='maken']");
  await p.waitForFunction(() => document.documentElement.getAttribute("data-scherm") === "maken");
  await p.click("#kaartenBtn");
  await p.waitForSelector("#ovKaarten.on", { timeout: 5000 });
  await p.waitForTimeout(150);
  assert.deepEqual(await rol(), { role: "dialog", modal: "true", naam: "Kaarten" }, "vanuit de editor: venster Kaarten");
  for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); assert.equal(await waar(), "paneel", "Tab blijft in het venster"); }
  // klik naast het venster sluit het, zoals de sluitknop
  const naast = await p.evaluate(() => { const m = document.querySelector("#ovKaarten .modal").getBoundingClientRect(); return m.left > 40 ? { x: 20, y: 400 } : { x: innerWidth - 20, y: 400 }; });
  assert.equal(await p.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [naast.x, naast.y]), "ovKaarten");
  await p.mouse.click(naast.x, naast.y);
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => document.getElementById("ovKaarten").classList.contains("on")), false, "venster dicht");
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute("data-scherm")), "maken");
  assert.equal(await p.isVisible(".wrap"), true);
  // terug naar een scherm: weer een gebied
  await p.click("#fpSchermen [data-scherm='vandaag']");
  await p.waitForSelector("#k_inbox .ib-item", { timeout: 8000 });
  assert.equal((await rol()).role, "region");

  assert.deepEqual(fouten, [], "geen fouten");
  }
  console.log("test-scherm-toetsenbord: ok (schermen zonder dialoog of Tab-val, klik ernaast laat het scherm staan, Kaarten vanuit de editor blijft een venster)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  if (browser) await browser.close();
  await stop();
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
