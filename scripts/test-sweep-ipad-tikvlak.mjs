// Gebruikers-sweep 2026-11-18 14u (Mark en Karin, iPad): in Praktijk, Kaarten en Sjablonen waren de tikvlakken
// op een aanraakscherm te klein: Praktijk-blok 30 px, knoppen in Kaarten 32, Rapport/CSV 22, "Alleen mijn
// patiënten" 19, het kruisje van Sjablonen 30, de categorieën 30. Nu minstens 44 px op iPad staand en
// liggend; met muis (desktop) blijft het zoals het was.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:ipadtikvlak`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
const blok = css.slice(css.lastIndexOf("@media screen and (pointer:coarse){"));
for (const sel of ["#prakslot .ps-acties a{height:44px", "#ovKaarten .btn.primary{height:auto;min-height:44px", "#k_srv_csv", ".ib-mijn{min-height:44px",
  ".sjb-dicht{min-width:44px;min-height:44px", ".sjb-cat{min-height:44px", "[data-szwaarklaar]{min-width:44px;min-height:44px"]) {
  assert.ok(blok.includes(sel), "aanraakblok bevat " + sel);
}

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("ipad tikvlak: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tikvlak-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.37." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Tikvlak";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "tikvlak-wachtwoord", akkoord: true })).json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Mark Houder", email: "mark@tikvlak.nl", wachtwoord: "mark-tik-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login");
  const S = { "x-praktijk-sessie": (await eigen.json()).sessie };
  for (const naam of ["Ria", "Ben"]) {
    const r = await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
    assert.equal(r.status, 200, "kaart " + naam);
  }
  const toestellen = [["iPad staand", pw.devices["iPad (gen 7)"]], ["iPad liggend", pw.devices["iPad (gen 7) landscape"]], ["desktop", { viewport: { width: 1280, height: 800 } }]];
  for (const [toestel, opts] of toestellen) {
    const ctx = await browser.newContext({ ...opts, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.6.38." + (ip++) } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} }, S["x-praktijk-sessie"]);
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); }, P);
    await page.evaluate(() => document.getElementById("kaartenBtn").click());
    await page.waitForSelector("#ps_team", { state: "visible", timeout: 8000 });
    await page.waitForSelector("#k_srv_csv", { state: "visible", timeout: 8000 });
    const maten = await page.evaluate(() => {
      const zicht = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const sels = ["#prakslot .ps-acties a", "#ovKaarten .btn", "#k_srv_rap", "#k_srv_csv", ".ib-mijn"];
      return sels.flatMap((s) => [...document.querySelectorAll(s)].filter(zicht).map((el) => ({ s, t: (el.id || el.textContent.trim()).slice(0, 30),
        h: Math.round(el.getBoundingClientRect().height) })));
    });
    assert.ok(maten.some((m) => m.s === "#prakslot .ps-acties a"), toestel + ": Praktijk-blok gemeten");
    assert.ok(maten.filter((m) => m.s === "#ovKaarten .btn").length >= 4, toestel + ": knoppen in Kaarten gemeten");
    if (toestel === "desktop") {
      assert.ok(maten.find((m) => m.s === "#k_srv_csv").h < 30, "desktop: CSV blijft een klein knopje");
      assert.ok(maten.find((m) => m.s === "#prakslot .ps-acties a").h <= 32, "desktop: Praktijk-blok ongewijzigd");
    } else {
      assert.deepEqual(maten.filter((m) => m.h < 44), [], toestel + ": alles in Praktijk en Kaarten minstens 44 px");
      // tekst staat in het midden van een hogere knop, niet bovenaan
      const scheef = await page.evaluate(() => [...document.querySelectorAll("#ovKaarten .btn")].filter((b) => b.getBoundingClientRect().height > 0 && b.childElementCount === 0 && b.textContent.trim())
        .filter((b) => { const r = b.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(b); const t = g.getBoundingClientRect();
          return Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2) > 6; }).map((b) => b.textContent.trim()));
      assert.deepEqual(scheef, [], toestel + ": tekst in het midden van de knop");
      // Sjablonen: kruisje en categorieën
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.getElementById("sjabBtn").click(); });
      await page.waitForSelector("#ovSjab.on .sjb-cat", { timeout: 8000 });
      await wacht(600); // het venster schaalt even in
      const sj = await page.evaluate(() => [...document.querySelectorAll("#ovSjab .sjb-dicht, #ovSjab .sjb-cat")].filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({ t: el.textContent.trim().slice(0, 20), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) })));
      assert.ok(sj.length > 2, toestel + ": Sjablonen gemeten");
      assert.deepEqual(sj.filter((m) => m.h < 44 || m.w < 44), [], toestel + ": Sjablonen minstens 44 px");
    }
    assert.deepEqual(fouten, [], toestel + ": geen paginafouten");
    await ctx.close();
  }
  console.log("ipad tikvlak: ok (Praktijk, Kaarten, Rapport/CSV en Sjablonen 44 px op iPad staand en liggend, desktop ongewijzigd)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
