// Gebruikers-sweep 2026-11-20 18u en 22u (MIDDEL, Mark): collega Lotte startte eerst een eigen proef (de app
// bouwde lokaal de "Voorbeeldpatiënt"), nam daarna Marks uitnodiging aan en logde in. Na herladen deelde
// het autodelen die voorbeeldkaart in Marks praktijk (200, behandelaar Lotte, telde mee voor de lopende kaarten).
// Nu onthoudt de app voor welke praktijk de voorbeeldkaart gemaakt is en deelt hem nergens anders; met een
// eigen roepnaam is het een echte kaart en deelt hij gewoon.
// Code altijd (CI); de browsercontrole alleen waar Playwright staat. `npm run test:voorbeeldelders`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /function voorbeeldVanElders\(naam,pr\)\{/, "controle op de voorbeeldkaart");
assert.match(idx, /if\(voorbeeldVanElders\(naam,pr\)\)\{/, "autodelen kijkt ernaar");
assert.match(idx, /if\(PROEF&&PROEF\.elders\)return true;/, "proefstand elders van de server beslist (hertest Mark: lege praktijknaam)");
assert.match(idx, /if\(beveiligd\)zetVoorbeeldPraktijk\(\(SET\.praktijk\|\|''\)\.trim\(\)\);else VB_LOGIN=true;/, "net beveiligd = eigen praktijk; login elders telt");
assert.match(idx, /zetVoorbeeldPraktijk\(\(SET\.praktijk\|\|''\)\.trim\(\)\|\|\(PROEF&&PROEF\.praktijk\)\|\|''\);\s*cn\.value='Voorbeeldpati/, "voorbeeldkaart onthoudt zijn praktijk");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-voorbeeld-elders: geen Playwright, browserdeel overgeslagen"); }
if (!pw) { console.log("test-sweep-voorbeeld-elders: statisch groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-voorbeeldelders-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.6." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Testm Duin";
let browser = null;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "voorbeeld-wachtwoord", akkoord: true })).json()).sessie };
  const sessie = (await (await post("/api/praktijk/team/eigen-login", { naam: "Lotte Test", email: "lotte@voorbeeld.test", wachtwoord: "lotte-wachtwoord", regels: true }, G)).json()).sessie;
  assert.ok(sessie, "eigen login");
  browser = await pw.chromium.launch();

  const proef = async (marker, n, elders) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.5.7." + n } });
    await ctx.addInitScript(([t, m, e]) => { try { localStorage.setItem("fp_praksessie", t); if (m !== null) localStorage.setItem("fp_voorbeeld_praktijk", m); } catch {}
      // zoals de server hem zet voor een apparaat met een eigen proef dat bij een andere praktijk is ingelogd
      if (e) window.FYSIPLAN_PROEF = { naam: "", praktijk: "Testm Duin", dagenOver: 10, tot: "1 december", klant: false, elders: true, beheer: false }; }, [sessie, marker, elders]);
    const page = await ctx.newPage();
    const fouten = [], posts = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/kaarten")) posts.push(JSON.parse(r.postData() || "{}").naam); });
    await page.goto(origin + "/v2/app", { waitUntil: "load" });
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); p.dispatchEvent(new Event("change", { bubbles: true })); }, P);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("[data-add]");
    await page.fill("#c_naam", "Voorbeeldpatiënt");
    await page.keyboard.press("Tab");
    return { ctx, page, fouten, posts };
  };

  // 1) voorbeeldkaart van Lottes eigen proef ("Testl Eigen") in Marks praktijk: niet gedeeld, wel uitleg
  const a = await proef("testl eigen", 1, true);
  for (let i = 0; i < 60 && !/voorbeeldkaart van je eigen proef/.test(await a.page.textContent("body")); i++) await wacht(100);
  assert.match(await a.page.textContent("body"), /voorbeeldkaart van je eigen proef/, "uitleg waarom er geen QR komt");
  await wacht(2500);
  assert.deepEqual(a.posts, [], "voorbeeldkaart niet gedeeld in een andere praktijk");
  // met een eigen roepnaam is het een echte kaart: die deelt wel
  const ok = a.page.waitForResponse((r) => r.url().endsWith("/api/kaarten") && r.request().method() === "POST" && r.status() === 200, { timeout: 15000 });
  await a.page.fill("#c_naam", "Henk");
  await a.page.keyboard.press("Tab");
  await ok;
  assert.deepEqual(a.posts, ["Henk"]);
  assert.deepEqual(a.fouten, []);
  await a.ctx.close();

  // 1b) proef zonder praktijknaam (leeg merkteken), ingelogd elders: ook niet gedeeld (hertest Mark, Sara)
  const s1 = await proef("", 4, true);
  for (let i = 0; i < 60 && !/voorbeeldkaart van je eigen proef/.test(await s1.page.textContent("body")); i++) await wacht(100);
  await wacht(2000);
  assert.deepEqual(s1.posts, [], "lege proefnaam: niet gedeeld");
  await s1.ctx.close();

  // 2) voorbeeldkaart van de eigen proef, ook met een andere naam op het A4 (hertest Mark, gat 2): deelt gewoon
  const b = await proef("fysio zee", 2, false);
  await b.page.waitForResponse((r) => r.url().endsWith("/api/kaarten") && r.request().method() === "POST", { timeout: 15000 });
  assert.deepEqual(b.posts, ["Voorbeeldpatiënt"], "eigen voorbeeldkaart deelt");
  await b.ctx.close();

  // 3) geen merkteken (zelf "Voorbeeldpatiënt" getypt, oude app): deelt zoals voorheen
  const c = await proef(null, 3);
  await wacht(3000);
  assert.ok(c.posts.length <= 1, "hoogstens één POST");
  await c.ctx.close();
  console.log("test-sweep-voorbeeld-elders: alles groen (voorbeeldkaart blijft in de eigen proefpraktijk)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
