// Gebruikers-sweep 2026-11-13 22u (Karin, desktop + iPad, tweede context als collega Tom): een gewone
// collega (rol therapeut) zag op Praktijk "Team en logins: Collega's uitnodigen, rollen…" en de tegels
// "Proef en abonnement" en "Gegevens van de praktijk" alsof hij dat mocht. Pas na het hele formulier op
// /v2/gegevens (incl. tweede stap) kwam "Alleen een beheerder…". Nu zegt de tegel het vooraf en opent
// de gegevenstegel voor een collega niets. Het deel zonder browser draait altijd (CI heeft geen
// browser); met Playwright klikt het als collega en als beheerder. `npm run test:praktijktegels`
// Ook: de praktijkknop mét naam maar zonder login zet de focus in het inlogveld (sweep 2026-11-14 02u, Sanne).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const css = await readFile(join(root, "public/v2.css"), "utf8");

// 1. zonder browser: de teksten volgen de rol
{
  const a = idx.indexOf("function praktijkTegelTeksten(");
  assert.ok(a > 0, "praktijkTegelTeksten bestaat");
  const b = idx.indexOf("\n  function bouwPraktijkTegels(", a);
  assert.ok(b > a);
  const ctx = { PRAKSLOT: {} };
  vm.createContext(ctx);
  vm.runInContext(idx.slice(a, b) + ";this.t=praktijkTegelTeksten;", ctx);
  const tekst = (p) => { ctx.PRAKSLOT = p; return Object.fromEntries(ctx.t().map((x) => [x[0], { s: x[2], uit: !!x[4] }])); };
  const ther = tekst({ ingelogd: true, akkoord: { beheer: false } });
  assert.doesNotMatch(ther.team.s, /^Collega/, "collega: team-tegel belooft geen uitnodigen");
  assert.match(ther.team.s, /beheerder/);
  assert.match(ther.abon.s, /beheerder/);
  assert.match(ther.gegevens.s, /Alleen een beheerder/);
  assert.equal(ther.gegevens.uit, true, "collega: gegevenstegel opent niets");
  const beh = tekst({ ingelogd: true, akkoord: { beheer: true } });
  assert.match(beh.team.s, /^Collega’s uitnodigen/);
  assert.doesNotMatch(beh.gegevens.s, /beheerder/);
  assert.equal(beh.gegevens.uit, false);
  // niet ingelogd: zoals altijd (de rol is nog niet bekend)
  assert.equal(tekst({ ingelogd: false }).gegevens.uit, false);
  // na elke status opnieuw (rol pas na inloggen bekend)
  assert.match(idx, /rendPrakSlot\(\);\n\s*if\(document\.getElementById\('k_praktijk'\)\)bouwPraktijkTegels\(\);/);
  assert.match(css, /\.kp-tegel\[aria-disabled="true"\]\{cursor:default/);
  console.log("test-praktijktegels: zonder browser OK");
}

// 2. browser (optioneel)
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { try { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {} }
if (!pw) console.log("test-praktijktegels: geen Playwright, browserdeel overgeslagen");
else {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-ptegels-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "", MAIL_API_SLEUTEL: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = ""; app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  let ip = 1;
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.31.0." + (ip++), ...extra });
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = "Fysio Tegels Rol";
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "tegels-wachtwoord", akkoord: true })).json()).sessie };
    const B0 = { "x-praktijk-sessie": (await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@tegels.invalid", wachtwoord: "karin-wachtwoord", regels: true }, G)).json()).sessie };
    const u = await (await post("/api/praktijk/team/uitnodigen", { naam: "Tom", email: "tom@tegels.invalid", rol: "therapeut" }, B0)).json();
    assert.ok(u.ok, JSON.stringify(u));
    const aan = await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.31.1.1" },
      body: new URLSearchParams({ t: new URL(u.link).searchParams.get("t"), naam: "Tom", wachtwoord: "tom-wachtwoord", regels: "1" }).toString() });
    assert.ok(aan.status < 400);
    const login = async (email, ww) => (await (await post("/api/praktijk/login", { email, wachtwoord: ww })).json()).sessie;
    const open = async (sessie, n) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.31.9." + n } });
      await ctx.addInitScript(([t, pr]) => { try { if (!sessionStorage.getItem("al")) { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_praktijk", pr); sessionStorage.setItem("al", "1"); } } catch {} }, [sessie, P]);
      const page = await ctx.newPage();
      page.fouten = []; page.on("pageerror", (e) => page.fouten.push(String(e)));
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("#fpSchermen", { timeout: 15000 });
      await page.evaluate((pr) => { const p = document.getElementById("praktijk"); if (p && !p.value) { p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); } }, P);
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => { if (o.id !== "ovKaarten") o.classList.remove("on"); }); });
      await page.click('#fpSchermen [data-scherm="praktijk"]');
      await page.waitForFunction(() => document.documentElement.classList.contains("ps-in"), null, { timeout: 10000 });
      await page.waitForSelector("#k_praktijk", { state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      return page;
    };
    const tegel = (page, w) => page.locator(`#k_praktijk [data-kpt='${w}']`);
    const pt = await open(await login("tom@tegels.invalid", "tom-wachtwoord"), 1);
    assert.match(await tegel(pt, "gegevens").innerText(), /Alleen een beheerder/, "collega: gegevenstegel zegt het vooraf");
    assert.match(await tegel(pt, "team").innerText(), /doet een beheerder/);
    assert.equal(await tegel(pt, "gegevens").getAttribute("aria-disabled"), "true");
    const voor = pt.context().pages().length;
    await tegel(pt, "gegevens").click({ force: true });
    await wacht(400);
    assert.equal(pt.context().pages().length, voor, "collega: klik opent geen wispagina");
    const pb = await open(await login("karin@tegels.invalid", "karin-wachtwoord"), 2);
    assert.match(await tegel(pb, "team").innerText(), /Collega’s uitnodigen/, "beheerder: zoals altijd");
    assert.equal(await tegel(pb, "gegevens").getAttribute("aria-disabled"), null);
    // gebruikers-sweep 2026-11-14 02u (Sanne, toetsenbord): praktijkknop met naam maar niet ingelogd
    // zette de focus in "Huidige kaart opslaan als"; nu in het inlogveld
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.31.9.3" } });
    await ctx3.addInitScript((pr) => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_praktijk", pr); } catch {} }, P);
    const pu = await ctx3.newPage();
    pu.fouten = []; pu.on("pageerror", (e) => pu.fouten.push(String(e)));
    await pu.goto(origin + "/v2/app");
    await pu.waitForSelector("#zb_praktijk", { timeout: 15000 });
    await pu.evaluate((pr) => { const p = document.getElementById("praktijk"); if (p && !p.value) { p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); } }, P);
    await pu.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await wacht(800);
    await pu.focus("#zb_praktijk");
    await pu.keyboard.press("Enter");
    await pu.waitForFunction(() => /^ps_(email|ww)$/.test((document.activeElement || {}).id || ""), null, { timeout: 10000 })
      .catch(async () => assert.fail("focus na praktijkknop zonder login: " + await pu.evaluate(() => document.activeElement && document.activeElement.id)));
    await wacht(500);
    assert.match(await pu.evaluate(() => document.activeElement.id), /^ps_(email|ww)$/, "focus blijft in het inlogveld");
    assert.deepEqual([...pt.fouten, ...pb.fouten, ...pu.fouten], []);
    console.log("test-praktijktegels: browser OK");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await wacht(200);
    await rm(dataDir, { recursive: true, force: true });
  }
}
