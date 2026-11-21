// Gebruikers-sweep 2026-11-21 22u (Karin, desktop + iPad, tweede context als collega): herladen tijdens de
// eigen leesrem (429 op /api/praktijk/status) liet PRAKSLOT op "niet ingelogd". De zijbalk zei "Open Kaarten
// om in te loggen", een gewone therapeut zag de beheerteksten en een open Gegevens-tegel, de Team-tegel zei
// "Log eerst in … dat staat hierboven" (er stond niets), en na de rem herstelde de app niet vanzelf.
// Nu: rol onbekend tijdens de storing (geen beheerteksten, Gegevens dicht), een eerlijke zin, en één nieuwe
// poging na Retry-After. Het deel zonder browser draait altijd; met Playwright het echte scherm.
// `npm run test:prakslotstoring`
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

// 1. zonder browser: tijdens een storing (rol onbekend) geen beheerteksten en Gegevens dicht
{
  const ps = idx.indexOf("function prakStoring(");
  assert.ok(ps > 0, "prakStoring bestaat");
  const psEind = idx.indexOf("\n", ps);
  const a = idx.indexOf("function praktijkTegelTeksten(");
  const b = idx.indexOf("\n  function bouwPraktijkTegels(", a);
  assert.ok(a > 0 && b > a);
  const ctx = { PRAKSLOT: {} };
  vm.createContext(ctx);
  vm.runInContext(idx.slice(ps, psEind) + "\n" + idx.slice(a, b) + ";this.t=praktijkTegelTeksten;", ctx);
  const tekst = (p) => { ctx.PRAKSLOT = p; return Object.fromEntries(ctx.t().map((x) => [x[0], { s: x[2], uit: !!x[4] }])); };
  const st = tekst({ storing: 429, bekend: false, ingelogd: false });
  assert.doesNotMatch(st.team.s, /^Collega/, "storing: geen beheertekst op Team");
  assert.match(st.team.s, /niet uitgelogd/, "storing: zegt dat je niet uitgelogd bent");
  assert.equal(st.gegevens.uit, true, "storing: Gegevens dicht");
  assert.doesNotMatch(st.gegevens.s, /^Alles downloaden, of alles wissen/);
  // eenmaal bekend telt een latere mislukte controle niet: dan de bekende rol
  const bek = tekst({ storing: 429, bekend: true, ingelogd: true, akkoord: { beheer: true } });
  assert.match(bek.team.s, /^Collega’s uitnodigen/);
  assert.match(idx, /PRAKSLOT\.storing=typeof code==='number'\?code:'net';/, "catch onthoudt de storing");
  assert.match(idx, /PRAKSLOT_WACHT=setTimeout\(function\(\)\{PRAKSLOT_WACHT=0;if\(prakStoring\(\)\)toonPrakSlot\(PRAKSLOT\.pr\);\}/, "één nieuwe poging");
  console.log("test-prakslotstoring: zonder browser OK");
}

// 2. browser (optioneel)
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { try { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {} }
if (!pw) console.log("test-prakslotstoring: geen Playwright, browserdeel overgeslagen");
else {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-prakslotstoring-"));
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
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.32.0." + (ip++), ...extra });
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = "Fysio Slot Storing";
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "storing-wachtwoord", akkoord: true })).json()).sessie };
    const B0 = { "x-praktijk-sessie": (await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@storing.invalid", wachtwoord: "karin-wachtwoord", regels: true }, G)).json()).sessie };
    const u = await (await post("/api/praktijk/team/uitnodigen", { naam: "Tom", email: "tom@storing.invalid", rol: "therapeut" }, B0)).json();
    assert.ok(u.ok, JSON.stringify(u));
    const aan = await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.32.1.1" },
      body: new URLSearchParams({ t: new URL(u.link).searchParams.get("t"), naam: "Tom", wachtwoord: "tom-wachtwoord", regels: "1" }).toString() });
    assert.ok(aan.status < 400);
    const sessie = (await (await post("/api/praktijk/login", { email: "tom@storing.invalid", wachtwoord: "tom-wachtwoord" })).json()).sessie;
    assert.ok(sessie, "Tom ingelogd");

    for (const [naam, opties] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["iPad", { ...pw.devices["iPad Pro 11"] }]]) {
      const ctx = await browser.newContext({ ...opties, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.32.9." + (naam === "iPad" ? 2 : 1) } });
      const rn = (await readFile(join(root, "public/release-notes.js"), "utf8")).match(/var version='([^']+)'/)[1];
      await ctx.addInitScript(([t, pr, v]) => { try { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_praktijk", pr); localStorage.setItem("fysiplan_release_seen", v); } catch {} }, [sessie, P, rn]);
      let rem = true, geweigerd = 0;
      await ctx.route("**/api/praktijk/status*", (route) => {
        if (rem) { geweigerd++; return route.fulfill({ status: 429, headers: { "content-type": "application/json", "retry-after": "6" }, body: JSON.stringify({ ok: false, error: "Even te veel verzoeken." }) }); }
        return route.continue();
      });
      const page = await ctx.newPage();
      const fouten = []; page.on("pageerror", (e) => fouten.push(String(e)));
      const meldingen = []; page.on("dialog", (d) => { meldingen.push(d.message()); d.dismiss().catch(() => {}); });
      await page.goto(origin + "/v2/app", { waitUntil: "load" });
      await page.waitForSelector("#fpSchermen", { timeout: 15000 });
      await page.evaluate((pr) => { const p = document.getElementById("praktijk"); if (p && !p.value) { p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); } }, P);
      // zoals een echte collega: Kaarten openen haalt de status op (dat verzoek krijgt de 429)
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
      await page.click("#kaartenBtn");
      await page.waitForFunction(() => /Even niet te controleren/.test((document.getElementById("zb_pstat") || {}).textContent || ""), null, { timeout: 8000 })
        .catch(async () => assert.fail(naam + ": zijbalk tijdens de rem: " + await page.textContent("#zb_pstat")));
      assert.ok(geweigerd > 0, naam + ": de status kreeg een 429");
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
      await page.click('#fpSchermen [data-scherm="praktijk"]');
      await page.waitForSelector("#k_praktijk", { state: "visible", timeout: 10000 });
      const team = page.locator("#k_praktijk [data-kpt='team']"), geg = page.locator("#k_praktijk [data-kpt='gegevens']");
      assert.doesNotMatch(await team.innerText(), /Collega’s uitnodigen, rollen/, naam + ": geen beheertekst voor een collega");
      assert.equal(await geg.getAttribute("aria-disabled"), "true", naam + ": Gegevens dicht");
      await team.click();
      await wacht(300);
      assert.ok(meldingen.length && /niet uitgelogd/.test(meldingen.at(-1)) && !/hierboven/.test(meldingen.at(-1)), naam + ": Team-tegel: " + meldingen.at(-1));
      // de rem is voorbij: zonder herladen komt de app vanzelf goed
      rem = false;
      await page.waitForFunction(() => document.documentElement.classList.contains("ps-in"), null, { timeout: 15000 })
        .catch(() => assert.fail(naam + ": app herstelt niet vanzelf na de rem"));
      await page.waitForFunction(() => /beveiligd/.test(document.getElementById("zb_pstat").textContent), null, { timeout: 5000 });
      await page.waitForFunction(() => /doet een beheerder/.test(document.querySelector("#k_praktijk [data-kpt='team']").innerText), null, { timeout: 5000 });
      assert.deepEqual(fouten, [], naam + ": geen paginafouten");
      await ctx.close();
      console.log("test-prakslotstoring: " + naam + " OK");
    }
    console.log("test-prakslotstoring: browser OK");
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
