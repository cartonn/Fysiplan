// Gebruikers-sweep 2026-11-13 18u (Karin, iPad staand én liggend): de kopbalk toonde onder 1100 px
// nergens bij welke praktijk en als wie je was ingelogd (het praktijkvak stond alleen vanaf 1100 px),
// en staand stond "Ideeën" links van het logo. Nu staat het praktijkvak compact naast het logo,
// daarna Ideeën en Printen. Het CSS-deel draait altijd (CI heeft geen browser); met Playwright
// meet het ook op iPad staand en liggend. `npm run test:ipadkop`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(join(root, "public", "v2.css"), "utf8");

// 1. CSS: onder 1100 px staat het praktijkvak aan, met de opmaak van naam en status
const blokken = [...css.matchAll(/@media screen and \(max-width:1099px\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
const smal = blokken.join("\n");
assert.match(smal, /html\.v2 \.zb-praktijk\{[^}]*display:flex/, "praktijkvak zichtbaar onder 1100 px");
assert.match(smal, /html\.v2 \.zb-ptekst b\{[^}]*text-overflow:ellipsis/, "lange praktijknaam wordt ingekort");
assert.match(css, /@media screen and \(max-width:1099px\) and \(pointer:coarse\)\{\s*html\.v2 \.zb-praktijk,html\.v2 \.fp-ideeknop\{min-height:44px\}/,
  "op een aanraakscherm 44 px hoog");

// 2. Browser (optioneel): iPad staand en liggend
let playwright = null;
try { playwright = createRequire(import.meta.url)("playwright"); } catch {}
if (!playwright) {
  try { playwright = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!playwright) {
  console.log("PASS praktijkvak in de kopbalk onder 1100 px (CSS; geen Playwright, browserdeel overgeslagen)");
  process.exit(0);
}

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-ipadkop-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
  ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV") delete kind[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

const { chromium, devices } = playwright;
const browser = await chromium.launch();
try {
  let n = 1;
  for (const [naam, dev] of [["iPad staand", devices["iPad (gen 7)"]], ["iPad liggend", devices["iPad (gen 7) landscape"]]]) {
    const ctx = await browser.newContext({ ...dev, deviceScaleFactor: 1, extraHTTPHeaders: { "x-forwarded-for": "10.83.0." + n++ } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("#zb_praktijk", { state: "attached" });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, rechts: b.right, zicht: getComputedStyle(e).display !== "none" && b.width > 0 }; };
      return { breed: innerWidth, merk: r("header.topbar .brand"), pk: r("#zb_praktijk"), idee: r("#fpIdeeKnop"), print: r("#printBtn"),
        naam: (document.getElementById("zb_pnaam") || {}).textContent || "" };
    });
    assert.ok(m.pk && m.pk.zicht, naam + ": praktijkvak zichtbaar");
    assert.ok(m.pk.h >= 44, naam + ": praktijkvak 44 px hoog (" + m.pk.h + ")");
    assert.ok(m.pk.rechts <= m.breed, naam + ": praktijkvak binnen het scherm");
    assert.ok(m.merk.x < m.pk.x, naam + ": praktijk rechts van het logo");
    assert.ok(Math.abs(m.pk.y - m.merk.y) < 30, naam + ": praktijk op de rij van het logo");
    assert.ok(m.idee.x > m.merk.x, naam + ": Ideeën niet meer links van het logo");
    assert.ok(m.print.rechts <= m.breed, naam + ": Printen binnen het scherm");
    assert.ok(m.naam.length > 0, naam + ": praktijkvak noemt de praktijk of 'Je praktijk'");
    assert.deepEqual(fouten, [], naam + ": geen fouten op de pagina");
    await ctx.close();
  }
  // desktop met toetsenbord: "Je praktijk – Vul je praktijknaam in" brengt je naar het naamveld,
  // niet naar "Huidige kaart opslaan als" in Kaarten (gebruikers-sweep 2026-11-13 18u, Sanne)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.83.0.9" } });
    const page = await ctx.newPage();
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("#zb_praktijk");
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
    const stat = await page.textContent("#zb_pstat");
    assert.match(stat, /praktijknaam/, "zonder praktijknaam vraagt het vak erom: " + stat);
    await page.focus("#zb_praktijk");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ actief: document.activeElement && document.activeElement.id,
      kaarten: document.getElementById("ovKaarten").classList.contains("on") }));
    assert.equal(r.actief, "praktijk", "focus in het praktijknaamveld");
    assert.equal(r.kaarten, false, "Kaarten gaat niet open");
    await page.keyboard.type("Fysio Testlaan");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    assert.equal(await page.inputValue("#praktijk"), "Fysio Testlaan");
    assert.notEqual(await page.inputValue("#k_naam"), "Fysio Testlaan", "praktijknaam wordt geen kaartnaam");
    await ctx.close();
  }
  console.log("PASS praktijkvak in de kopbalk op iPad staand en liggend, Ideeën na het logo, focus naar praktijknaam");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
