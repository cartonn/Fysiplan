// Gebruikers-sweep 2026-11-20 06u (Sanne, alleen toetsenbord): na "Naam wijzigen" in Kaarten
// tekende de lijst opnieuw met het Deel-paneel dicht en viel de focus op body, zodat Tab weer
// bovenaan begon. Nu klapt het paneel van die kaart weer open en staat de focus op "Naam wijzigen".
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:hernoemfocus`
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
assert.match(blok[0], /toonSrvKaarten\(\);deelOpenTerug\(hid,/, "na hernoemen gaat het Deel-paneel weer open");
assert.match(idx, /function deelOpenTerug\(id,knopSel\)\{/, "hulpfunctie deelOpenTerug bestaat");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("test-sweep-hernoem-focus: broncontrole groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-hernoemfocus-"));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.5." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Hernoemfocus";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "hernoemfocus-wachtwoord", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  for (const naam of ["Anna", "Bram"]) {
    assert.equal((await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).status, 200);
  }
  const namen = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json()).map((k) => k.naam);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.5" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => (d.type() === "prompt" ? d.accept("Bram K.") : d.dismiss()));
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  const deel = page.locator("#k_srv_lijst [data-sdeel][aria-label*='Bram']").first();
  await deel.waitFor({ state: "visible", timeout: 8000 });
  const id = await deel.getAttribute("data-sdeel");
  await deel.click();
  const hn = page.locator(`#deel_${id} [data-shernoem]`);
  await hn.waitFor({ state: "visible", timeout: 8000 });
  // met het toetsenbord, zoals Sanne
  await hn.focus();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 40 && !(await namen()).includes("Bram K."); i++) await wacht(100);
  assert.ok((await namen()).includes("Bram K."), "naam gewijzigd op de server");
  let stand = null;
  for (let i = 0; i < 50; i++) {
    stand = await page.evaluate((id) => {
      const db = document.getElementById("deel_" + id), a = document.activeElement;
      return { open: !!db && db.style.display !== "none", focus: a && a.matches ? a.matches("[data-shernoem]") && a.getAttribute("data-shernoem") === id : false,
        naam: a && a.getAttribute ? a.getAttribute("data-hnaam") : null, body: a === document.body };
    }, id);
    if (stand.open && stand.focus && stand.naam === "Bram K.") break;
    await wacht(100);
  }
  assert.ok(stand.open, "Deel-paneel van de hernoemde kaart weer open: " + JSON.stringify(stand));
  assert.ok(stand.focus, "focus terug op Naam wijzigen, niet op body: " + JSON.stringify(stand));
  assert.equal(stand.naam, "Bram K.", "knop draagt de nieuwe naam");
  assert.deepEqual(fouten, [], "geen paginafouten");
  await ctx.close();
  console.log("test-sweep-hernoem-focus: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
