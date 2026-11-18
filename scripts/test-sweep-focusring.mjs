// Gebruikers-sweep 2026-11-13 14u (Sanne, desktop 1280, alleen toetsenbord): in de V2-app kregen gewone knoppen
// (.btn: "Eigen oefening", "Printen", "Test de QR", Deel/Openen) geen zichtbare focus, omdat de schaduw van
// `html.v2 .btn` de focusring van de app overschreef. De ring zelf (limoen op 27 % dekking) haalde op het
// lichte werkvlak en in de kopbalk ±1,4:1. Het roepnaamveld op de A4 had helemaal geen ring (hertest Sanne). Nu een ondoorzichtige outline, donker petrol op licht, limoen in
// de kopbalk, minstens 3:1 tegen de achtergrond.
// Broncontrole altijd (CI); het browserdeel (Tab door Kaart maken en meet de ring) alleen waar Playwright staat.
// `npm run test:focusring`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---- bron: de laatste --ring en --focus zijn ondoorzichtig en halen 3:1 ----
const laatste = (re) => { let m, r = null; const g = new RegExp(re, "gi"); while ((m = g.exec(css))) r = m; return r; };
const ring = laatste("html\\.v2\\{[^}]*--ring:0 0 0 3px #([0-9a-f]{6,8})");
assert.ok(ring, "--ring gevonden");
assert.equal(ring[1].length, 6, "--ring zonder doorzichtigheid, nu #" + ring[1]);
for (const vlak of ["ffffff", "e9f0ec", "e1ebe5", "f1f6f3"]) assert.ok(ratio(ring[1], vlak) >= 3, "ring op #" + vlak + " minstens 3:1, nu " + ratio(ring[1], vlak).toFixed(2));
const kop = laatste("html\\.v2 header\\.topbar\\{--focus:#([0-9a-f]{6})");
assert.ok(kop && ratio(kop[1], "18343b") >= 3, "focus in de kopbalk minstens 3:1");
assert.match(css, /html\.v2 :is\([^)]*button[^)]*\):focus-visible\{outline:3px solid var\(--focus\)/, "elke knop krijgt een outline bij focus");

// ---- browser: Tab door Kaart maken, elke knop met focus heeft een zichtbare ring ----
let playwright = null;
try { playwright = createRequire(import.meta.url)("playwright"); } catch {
  try { playwright = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!playwright) { console.log("PASS focusring (bron; geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

async function vrijePoort() { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-focusring-"));
const port = await vrijePoort();
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "" };
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: "ignore" });
const browser = await playwright.chromium.launch();
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_wn_gezien", "9"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/v2/app`);
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  const gemeten = [];
  for (const sel of ["#printBtn", "#eigenOefBtn", "header.topbar .btn", ".btn:not(.primary)", "#c_naam"]) {
    const el = page.locator(sel).filter({ visible: true }).first();
    if (!(await el.count())) continue;
    await page.keyboard.press("Tab"); // zet de browser in toetsenbordstand
    await el.focus();
    const r = await el.evaluate((e) => {
      const s = getComputedStyle(e);
      let bg = null, n = e.parentElement;
      while (n && !bg) { const b = getComputedStyle(n).backgroundColor; if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") bg = b; n = n.parentElement; }
      return { fv: e.matches(":focus-visible"), stijl: s.outlineStyle, breed: parseFloat(s.outlineWidth), kleur: s.outlineColor, bg: bg || "rgb(255, 255, 255)", id: e.id || e.className };
    });
    gemeten.push(r);
  }
  assert.ok(gemeten.length >= 2, "knoppen gevonden: " + JSON.stringify(gemeten));
  const hex = (rgb) => rgb.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("");
  for (const r of gemeten) {
    assert.ok(r.fv, "focus-visible op " + r.id);
    assert.equal(r.stijl, "solid", "zichtbare outline op " + r.id + ": " + JSON.stringify(r));
    assert.ok(r.breed >= 2, "outline minstens 2 px op " + r.id + ": " + JSON.stringify(r));
    assert.ok(ratio(hex(r.kleur), hex(r.bg)) >= 3, "ring op " + r.id + " minstens 3:1, nu " + ratio(hex(r.kleur), hex(r.bg)).toFixed(2));
  }
  console.log("PASS focusring: " + gemeten.length + " knoppen met zichtbare ring (≥ 3:1), ook in de kopbalk");
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
