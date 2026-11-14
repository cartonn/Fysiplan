// Gebruikers-sweep 2026-11-14 18u (Sanne, desktop): "Naam wijzigen" in het kaartenoverzicht nam een
// volledige naam zonder vraag over, zodat die naar de server en /k ging; Printen, Delen en Test de QR
// stellen dan eerst de roepnaam voor. Nu toetst de app ook de NIEUWE naam en stelt de roepnaam voor.
// Dubbelklik op "Naam wijzigen" gaf twee vragen en twee POST's: nu één.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:hernoemvolledig`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const blok = idx.match(/var hn=e\.target\.closest\('\[data-shernoem\]'\);[\s\S]*?\n      return;\n    \}/);
assert.ok(blok, "hernoem-handler gevonden");
assert.match(blok[0], /if\(hn\.dataset\.bezig\)return;[\s\S]*?prompt\(/, "bezig-slot vóór de vraag");
assert.match(blok[0], /if\(IS_V2&&naamLijktVolledig\(nieuw\)\)\{[\s\S]{0,300}kaartLabelVan\(nieuw\)/, "nieuwe naam getoetst, roepnaam voorgesteld");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-hernoem-volledig: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-hernoemvolledig-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.4." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Hernoem";
const VOLLEDIG = "Truus van Dam";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "hernoem-wachtwoord", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  assert.equal((await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).status, 200);
  const namen = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json()).map((k) => k.naam);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.4" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], vragen = [], posts = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  // eerste vraag: de therapeut typt de volledige naam; tweede vraag (het voorstel): OK
  page.on("dialog", (d) => {
    vragen.push(d.message());
    if (d.type() !== "prompt") return d.dismiss();
    if (/lijkt een volledige naam/.test(d.message())) return d.accept(d.defaultValue());
    return d.accept(VOLLEDIG);
  });
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/kaart/naam")) posts.push(r.postData()); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  const deel = page.locator("#k_srv_lijst [data-sdeel]").first();
  await deel.waitFor({ state: "visible", timeout: 8000 });
  await deel.click();
  const hn = page.locator("[data-shernoem]").first();
  await hn.waitFor({ state: "visible", timeout: 8000 });
  await hn.dblclick();
  for (let i = 0; i < 40 && !(await namen()).includes("Truus D."); i++) await wacht(100);
  await wacht(800);
  assert.deepEqual(await namen(), ["Truus D."], "roepnaam op de server, geen volledige naam");
  assert.equal(posts.length, 1, "één POST bij dubbelklik: " + JSON.stringify(posts));
  assert.equal(vragen.filter((v) => /lijkt een volledige naam/.test(v)).length, 1, "één keer het roepnaamvoorstel: " + JSON.stringify(vragen));
  assert.ok(!posts.some((p) => /van Dam/.test(p || "")), "volledige naam niet verstuurd");
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-hernoem-volledig: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
