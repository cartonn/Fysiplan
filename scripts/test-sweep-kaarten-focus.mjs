// Gebruikers-sweep 2026-11-18 06u (Sanne en Mark (Beantwoorden bij een seintje), desktop, alleen toetsenbord): na × naar prullenbak, Rond af,
// Gearchiveerd, Terughalen, Prullenbak, Herstellen en Definitief verwijderen in Kaarten stond de focus op <body>;
// de volgende Tab sprong naar "Huidige kaart opslaan als" onder de lijst. Nu zet kaartFocusTerug() de focus
// na het hertekenen op een logische knop in Kaarten.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaartenfocus`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /function kaartFocusTerug\(sels\)\{/, "hulpje voor focus terug in Kaarten");
assert.ok((index.match(/kaartFocusTerug\(\[/g) || []).length >= 7, "alle zeven lijstacties en Beantwoorden zetten de focus terug");
console.log("test-sweep-kaarten-focus: bron OK");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-kaarten-focus: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartenfocus-"));
  const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
  const origin = "http://127.0.0.1:" + port;
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let uit = "";
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  let ip = 1;
  const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.21." + (ip++ & 255), ...extra });
  const post = (p, b, extra) => fetch(origin + p, { method: "POST", headers: kop(extra), body: JSON.stringify(b) });
  const browser = await pw.chromium.launch();
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    const P = "Fysio Kaarten Focus";
    const claim = await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "kaarten-focus-123", akkoord: true })).json();
    assert.ok(claim.sessie, uit.slice(-300));
    const S = { "x-praktijk-sessie": claim.sessie };
    for (const naam of ["Piet B.", "Kees D.", "Anna"]) {
      const r = await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
      assert.equal(r.status, 200, "kaart " + naam);
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.22.1" } });
    await ctx.addInitScript(([s, pr]) => { try {
      localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: pr }));
      localStorage.setItem("fp_praksessie", s);
    } catch {} }, [claim.sessie, P]);
    const p = await ctx.newPage();
    const fouten = [];
    p.on("pageerror", (e) => fouten.push(String(e)));
    p.on("dialog", (d) => d.accept(d.defaultValue() || ""));
    await p.goto(origin + "/v2/app");
    await p.waitForSelector("[data-add]", { timeout: 15000 });
    await p.waitForTimeout(800);
    await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    await p.click("#kaartenBtn");
    await p.waitForSelector("#k_srv_lijst [data-sopen]", { timeout: 10000 });
    const focus = () => p.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return "BODY";
      return a.id ? "#" + a.id : (a.getAttribute("aria-label") || a.textContent || a.tagName).trim();
    });
    const binnenKaarten = () => p.evaluate(() => !!document.activeElement && document.activeElement !== document.body &&
      !!document.activeElement.closest("#ovKaarten"));
    const naActie = async (sel, wat) => {
      await p.focus(sel);
      await p.keyboard.press("Enter");
      let f = "BODY";
      for (let i = 0; i < 40; i++) { await p.waitForTimeout(100); f = await focus(); if (f !== "BODY" && await binnenKaarten()) { await p.waitForTimeout(250); f = await focus(); break; } }
      assert.notEqual(f, "BODY", wat + ": focus niet op body");
      assert.ok(await binnenKaarten(), wat + ": focus blijft in Kaarten (" + f + ")");
      return f;
    };
    // × naar prullenbak
    await naActie("#k_srv_lijst [data-sdel]", "× naar prullenbak");
    // Rond af: via het Deel-paneel als de knop daar staat, anders rechtstreeks
    await p.evaluate(() => { const d = document.querySelector("#k_srv_lijst [data-sdeel],#k_srv_lijst [data-sdeelopen]"); if (d) d.click(); });
    await p.waitForTimeout(300);
    const heeftArch = await p.locator("#k_srv_lijst [data-sarch]").count();
    if (heeftArch) {
      assert.equal(await naActie("#k_srv_lijst [data-sarch]", "Rond af"), "#k_srv_arch", "na Rond af op Gearchiveerd");
      assert.equal(await naActie("#k_srv_arch", "Gearchiveerd"), "#k_srv_arch", "na Gearchiveerd op de schakelaar");
      await p.waitForSelector("#k_srv_lijst [data-sherstel]", { timeout: 5000 });
      await naActie("#k_srv_lijst [data-sherstel]", "Terughalen");
    } else console.log("test-sweep-kaarten-focus: geen Rond af-knop gevonden, archief overgeslagen");
    // Prullenbak openen, Herstellen, en (na nog een ×) Definitief verwijderen
    await p.waitForSelector("#k_prullenbak > button", { timeout: 5000 });
    await naActie("#k_prullenbak > button", "Prullenbak openen");
    await p.waitForSelector("#k_prullenbak [data-prulherstel]", { timeout: 5000 });
    await naActie("#k_prullenbak [data-prulherstel]", "Herstellen");
    await p.waitForSelector("#k_srv_lijst [data-sdel]", { timeout: 5000 });
    await naActie("#k_srv_lijst [data-sdel]", "× opnieuw");
    await p.waitForSelector("#k_prullenbak > button", { timeout: 5000 });
    await naActie("#k_prullenbak > button", "Prullenbak opnieuw");
    await p.waitForSelector("#k_prullenbak [data-pruldef]", { timeout: 5000 });
    await naActie("#k_prullenbak [data-pruldef]", "Definitief verwijderen");
    assert.deepEqual(fouten, [], "geen paginafouten");
    console.log("test-sweep-kaarten-focus: browser OK (focus blijft in Kaarten na alle lijstacties)");
  } catch (e) {
    console.error(uit.slice(-1500));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}
