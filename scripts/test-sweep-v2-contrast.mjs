// Gebruikers-sweep 2026-11-11 18u (Karin, beheerder, desktop en iPad): sinds het donkere V2-thema
// (Active Tech, #197) waren het Team-venster en het Kaarten-paneel bijna onleesbaar. De lichtblauwe
// naamblokken (--naamblok #eaf2fd) bleven licht terwijl de tekst wit werd (contrast ±1,1:1), de rolkeuze
// was wit op wit, het rolpilletje en het uitnodigformulier licht met lichte tekst.
// Nu krijgen naamblokken, rolpil, rolkeuze en uitnodigformulier in het donkere thema donkere vlakken.
// Broncontrole altijd (CI); het browserdeel (meet het contrast van alle zichtbare tekst in
// Kaarten en Team) alleen waar Playwright staat. `npm run test:v2contrast`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
// het donkere schermblok (na de Active Tech-kleuren) moet de lichte naamblokken overschrijven
const donker = css.slice(css.indexOf("--bg:#18343b"));
assert.ok(donker.length > 10, "donker thema gevonden");
assert.match(donker, /--naamblok:#[0-9a-f]{6}/i, "naamblok krijgt in het donkere thema een eigen kleur");
const nb = donker.match(/--naamblok:#([0-9a-f]{6})/i)[1];
const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
assert.ok(ratio("ffffff", nb) >= 4.5, "witte naam op het naamblok minstens 4,5:1, nu " + ratio("ffffff", nb).toFixed(2));

// proefformulier (Mark): een veld met een fout was witte tekst op #fffafa, het pijnseintje rood op petrol
const proef = await readFile(join(root, "public/proef.html"), "utf8");
const proefDonker = proef.slice(proef.indexOf("--bg:#18343b"));
const fout = proefDonker.match(/--fout:#([0-9a-f]{6})/i);
assert.ok(fout && ratio(fout[1], "20464f") >= 4.5, "foutkleur leesbaar op petrol");
const mis = proefDonker.match(/\.veld\.mis input\{background:#([0-9a-f]{6})/i);
assert.ok(mis && ratio("ffffff", mis[1]) >= 4.5, "getypte tekst in een foutveld leesbaar");
const alarm = proefDonker.match(/\.alarm\{background:#([0-9a-f]{6})/i);
assert.ok(alarm && ratio(fout[1], alarm[1]) >= 4.5, "alarmregel leesbaar");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("v2 contrast: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-contrast-"));
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
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.33." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Contrast";

// meet in de pagina: elke zichtbare tekst (ook in select/input) tegen de eerste niet-doorzichtige achtergrond
const meet = (sel) => {
  const rgb = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const achter = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255 }; };
  const slecht = [];
  const wortel = document.querySelector(sel);
  if (!wortel) return [{ fout: "geen " + sel }];
  for (const el of wortel.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || +st.opacity < 0.3) continue;
    let tekst = "";
    if (el.tagName === "SELECT") tekst = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : "";
    else if (el.tagName === "INPUT" && /^(text|email)$/.test(el.type)) tekst = el.value;
    else for (const n of el.childNodes) if (n.nodeType === 3) tekst += n.textContent;
    tekst = tekst.trim();
    if (!tekst) continue;
    const v = rgb(st.color), a = achter(el);
    if (!v) continue;
    const [x, y] = [L(v), L(a)].sort((p, q) => q - p);
    const c = (x + 0.05) / (y + 0.05);
    if (c < 3) slecht.push({ tekst: tekst.slice(0, 30), tag: el.tagName, cls: String(el.className).slice(0, 30), c: +c.toFixed(2) });
  }
  return slecht;
};

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "contrast-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  await post("/api/kaart/seintje", { id, soort: "vraag" });
  const inv = await post("/api/praktijk/team/uitnodigen", { naam: "Lotte", email: "lotte@example.org", rol: "therapeut" }, S);
  assert.equal(inv.status, 200, "collega uitgenodigd");

  for (const schema of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: schema, locale: "nl-NL",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.33.20" + (schema === "dark" ? 1 : 0) } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.dismiss());
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#kaartenBtn");
    await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
    await wacht(600);
    const k = await page.evaluate(meet, "#ovKaarten");
    assert.deepEqual(k, [], schema + ": Kaarten-paneel leesbaar (contrast ≥ 3:1): " + JSON.stringify(k));
    await page.evaluate(() => document.getElementById("ps_team").click());
    await page.waitForSelector("#ovTeam.on .tm-lid", { timeout: 8000 });
    await wacht(400);
    const t = await page.evaluate(meet, "#ovTeam");
    assert.deepEqual(t, [], schema + ": Team-venster leesbaar (contrast ≥ 3:1): " + JSON.stringify(t));
    await ctx.close();
  }
  console.log("v2 contrast: ok");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
