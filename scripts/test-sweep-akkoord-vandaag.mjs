// Gebruikers-sweep 2026-11-12 22u en 2026-11-13 (Karin, beheerder): nieuwe voorwaarden en een nieuwe
// verwerkersovereenkomst waren alleen te zien in het blok op het scherm Praktijk. De app opent met een
// login op Vandaag, dus een beheerder zag niet dat de praktijk opnieuw akkoord moest geven.
// Nu: een stip op de knop Praktijk en een melding op Vandaag/Patiënten met "Naar Praktijk"; alleen
// voor een beheerder (een collega kan niets doen). Na akkoord verdwijnen stip en melding.
// Deel 1 draait zonder browser (CI); deel 2 alleen met Playwright. `npm run test:akkoordvandaag`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const css = await readFile(join(root, "public/v2.css"), "utf8");

// ---- deel 1: tekenAkkoordWijs met een kleine nep-DOM ----
{
  const a = idx.indexOf("function tekenAkkoordWijs(");
  assert.ok(a > 0, "tekenAkkoordWijs bestaat");
  const b = idx.indexOf("\n  function tekenAkkoord(", a);
  assert.ok(b > a);
  assert.match(idx.slice(b, b + 120), /tekenAkkoordWijs\(\)/, "tekenAkkoord roept tekenAkkoordWijs aan");
  const maak = (tag) => ({
    tag, kids: [], attrs: {}, parentNode: null, id: "", className: "", textContent: "", innerHTML: "", title: "",
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.kids.push(c); return c; },
    insertBefore(c) { c.parentNode = this; this.kids.unshift(c); return c; },
    removeChild(c) { this.kids = this.kids.filter((x) => x !== c); c.parentNode = null; },
    querySelector(s) { return s === ".fs-ak" ? this.kids.find((k) => k.className.includes("fs-ak")) || null : null; },
    addEventListener() {}, get firstChild() { return this.kids[0] || null; }
  });
  const knop = maak("button"), blok = maak("div");
  const zoekId = (id) => (id === "k_srv" ? blok : blok.kids.find((k) => k.id === id) || (id === "k_akwijs_ga" ? maak("button") : null));
  const ctx = {
    IS_V2: true, PRAKSLOT: {}, SCHERM_GEKOZEN: false, zetScherm() {}, localStorage: { setItem() {} },
    document: { querySelector: (s) => (s.includes('data-scherm="praktijk"') ? knop : null), getElementById: zoekId, createElement: maak }
  };
  vm.createContext(ctx);
  vm.runInContext(idx.slice(a, b) + ";this.wijs=tekenAkkoordWijs;", ctx);
  const zet = (p) => { ctx.PRAKSLOT = p; ctx.wijs(); };
  zet({ ingelogd: true, akkoord: { nodig: true, beheer: true } });
  assert.ok(knop.querySelector(".fs-ak"), "beheerder: stip op Praktijk");
  assert.match(knop.attrs["aria-label"] || "", /akkoord nodig/);
  const w = zoekId("k_akwijs");
  assert.ok(w, "beheerder: melding op Vandaag/Patiënten");
  assert.match(w.innerHTML, /bijgewerkt/);
  assert.match(w.innerHTML, /Naar Praktijk/);
  zet({ ingelogd: true, akkoord: { nodig: true, beheer: true, wijzigingen: [{ stuk: "av" }] } });
  assert.match(zoekId("k_akwijs").innerHTML, /algemene voorwaarden zijn bijgewerkt/, "alleen de voorwaarden: zegt dat");
  assert.equal(knop.kids.length, 1, "geen dubbele stip");
  assert.equal(blok.kids.length, 1, "geen dubbele melding");
  zet({ ingelogd: true, akkoord: { nodig: false, beheer: true } });
  assert.equal(knop.querySelector(".fs-ak"), null, "na akkoord: stip weg");
  assert.equal(knop.attrs["aria-label"], undefined);
  assert.equal(zoekId("k_akwijs"), null, "na akkoord: melding weg");
  zet({ ingelogd: true, akkoord: { nodig: true, beheer: false } });
  assert.equal(knop.querySelector(".fs-ak"), null, "collega: geen stip");
  assert.equal(zoekId("k_akwijs"), null, "collega: geen melding");
  ctx.IS_V2 = false;
  zet({ ingelogd: true, akkoord: { nodig: true, beheer: true } });
  assert.equal(zoekId("k_akwijs"), null, "v1 blijft ongemoeid");
  assert.match(css, /html\.v2\[data-scherm="maken"\] #k_akwijs,html\.v2\[data-scherm="praktijk"\] #k_akwijs\{display:none\}/);
  assert.match(css, /#k_akwijs \.btn\{min-height:44px/);
  console.log("test-akkoordvandaag: zonder browser OK");
}

// ---- deel 2: echte app, oude akkoordversie ----
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-akkoordvandaag: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const src = await readFile(join(root, "server.js"), "utf8");
  const AV = src.match(/const AV_VERSIE = "([0-9-]+)"/)[1];
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-akvandaag-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const start = () => {
    const s = spawn(process.execPath, ["server.js"], {
      cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    s.uit = ""; s.stdout.on("data", (c) => { s.uit += c; }); s.stderr.on("data", (c) => { s.uit += c; });
    return s;
  };
  let ip = 1;
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.0." + (ip++), ...extra });
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
  const accPad = join(dataDir, "praktijk-accounts.json");
  const P = "Fysio Akkoord Vandaag", SL = "fysio akkoord vandaag";
  let app = start();
  try {
    await klaar();
    const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "akkoord-wachtwoord", akkoord: true })).json()).sessie };
    const B0 = { "x-praktijk-sessie": (await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@akv.nl", wachtwoord: "karin-wachtwoord", regels: true }, G)).json()).sessie };
    const uit = await (await post("/api/praktijk/team/uitnodigen", { naam: "Tom", email: "tom@akv.nl", rol: "therapeut" }, B0)).json();
    const aan = await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.1.1" },
      body: new URLSearchParams({ t: new URL(uit.link).searchParams.get("t"), naam: "Tom", wachtwoord: "tom-wachtwoord", regels: "1" }).toString() });
    assert.ok(aan.status < 400);
    app.kill(); await wacht(250);
    const alle = JSON.parse(await readFile(accPad, "utf8"));
    alle[SL].akkoord = { ...alle[SL].akkoord, av: "2026-01-01" };
    await writeFile(accPad, JSON.stringify(alle));
    app = start(); await klaar();
    const login = async (email, ww) => (await (await post("/api/praktijk/login", { email, wachtwoord: ww })).json()).sessie;
    const browser = await pw.chromium.launch();
    try {
      const open = async (sessie, n) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.9." + n } });
        await ctx.addInitScript(([t, pr]) => { try { if (!sessionStorage.getItem("al")) { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_praktijk", pr); sessionStorage.setItem("al", "1"); } } catch {} }, [sessie, P]);
        const page = await ctx.newPage();
        page.fouten = []; page.on("pageerror", (e) => page.fouten.push(String(e)));
        await page.goto(origin + "/v2/app");
        await page.waitForSelector("#fpSchermen", { timeout: 15000 });
        await page.evaluate((pr) => { const p = document.getElementById("praktijk"); if (p && !p.value) { p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); } }, P);
        await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => { if (o.id !== "ovKaarten") o.classList.remove("on"); }); });
        await page.click('#fpSchermen [data-scherm="vandaag"]');
        return page;
      };
      // collega: niets
      const pt = await open(await login("tom@akv.nl", "tom-wachtwoord"), 1);
      await pt.waitForFunction(() => document.documentElement.classList.contains("ps-in"), null, { timeout: 10000 });
      await wacht(300);
      assert.equal(await pt.locator("#k_akwijs").count(), 0, "collega ziet geen melding");
      assert.equal(await pt.locator("#fpSchermen .fs-ak").count(), 0, "collega ziet geen stip");
      // beheerder: melding + stip, knop gaat naar het akkoord
      const pb = await open(await login("karin@akv.nl", "karin-wachtwoord"), 2);
      await pb.waitForSelector("#k_akwijs", { state: "visible", timeout: 10000 });
      assert.ok(await pb.locator('#fpSchermen [data-scherm="praktijk"] .fs-ak').isVisible(), "stip op Praktijk");
      const h = await pb.locator("#k_akwijs_ga").boundingBox();
      assert.ok(h.height >= 44, "knop minstens 44 px: " + h.height);
      if (process.env.SCREENSHOT_DIR) await pb.screenshot({ path: join(process.env.SCREENSHOT_DIR, "akkoord-vandaag.png") });
      await pb.click('#fpSchermen [data-scherm="patienten"]');
      assert.ok(await pb.locator("#k_akwijs").isVisible(), "ook op Patiënten");
      await pb.click("#k_akwijs_ga");
      assert.equal(await pb.evaluate(() => document.documentElement.getAttribute("data-scherm")), "praktijk");
      await pb.waitForSelector("#ps_akkoord", { state: "visible", timeout: 5000 });
      assert.equal(await pb.locator("#k_akwijs").isVisible(), false, "op Praktijk staat het blok zelf, niet de melding");
      assert.equal(await pb.evaluate(() => document.activeElement && document.activeElement.id), "ps_akvink", "focus op het vinkje");
      await pb.check("#ps_akvink");
      await pb.click("#ps_akdo");
      await pb.waitForSelector("#ps_akkoord", { state: "hidden", timeout: 5000 });
      assert.equal(await pb.locator("#fpSchermen .fs-ak").count(), 0, "stip weg na akkoord");
      assert.equal(await pb.locator("#k_akwijs").count(), 0, "melding weg na akkoord");
      assert.equal(JSON.parse(await readFile(accPad, "utf8"))[SL].akkoord.av, AV);
      assert.deepEqual([...pt.fouten, ...pb.fouten], []);
    } finally { await browser.close(); }
    console.log("test-akkoordvandaag: browser OK");
  } catch (e) {
    console.error(app.uit.slice(-2000));
    throw e;
  } finally {
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
console.log("PASS nieuwe voorwaarden zichtbaar op Vandaag en Patiënten voor een beheerder, met stip op Praktijk");
