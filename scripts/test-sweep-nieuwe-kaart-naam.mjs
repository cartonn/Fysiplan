// Gebruikers-sweep 2026-11-09 (Sanne, desktop): kaart "Joke" open → Kaarten → typ "Piet B." →
// In de praktijk → OK (nieuwe kaart, eigen QR). De editor stond daarna op Piets kaart-id maar
// het naamveld en de QR bleven "Joke": elke volgende autosave gaf 409 "Er is al een kaart Joke"
// en "Ja, die kaart bijwerken" zette de editor stil terug op Jokes kaart.
// Nu volgt het naamveld de nieuwe kaart (volgNieuweKaart).
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:nieuwekaartnaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /keuze==='nieuw'\)\{zetKaartId\(d\.id,d\.ts\);volgNieuweKaart\(naam,d\);/, "nieuwe kaart: editor volgt de naam");
assert.match(appHtml, /function volgNieuweKaart\(naam,d\)\{[\s\S]{0,400}cn\.value=nw;/, "volgNieuweKaart zet het naamveld");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("nieuwe kaart naam: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-nieuwekaart-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Nieuwe Kaart";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "nieuwe-kaart-wachtwoord", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const kaarten = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json());

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.3.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], vragen = [], antwoorden = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { vragen.push(d.type() + ": " + d.message()); d.type() === "confirm" ? d.accept() : d.dismiss(); });
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/kaarten") antwoorden.push(r.status());
  });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  // Jokes kaart: één oefening, naam, autosave
  await page.evaluate(() => {
    document.querySelector("[data-add]").click();
    const cn = document.getElementById("c_naam"); cn.value = "Joke"; cn.dispatchEvent(new Event("input", { bubbles: true })); cn.blur();
  });
  for (let i = 0; i < 60 && (await kaarten()).length < 1; i++) await wacht(100);
  const [joke] = await kaarten();
  assert.equal(joke && joke.naam, "Joke", "Jokes kaart gedeeld");

  // Kaarten → "Piet B." → In de praktijk → OK = nieuwe kaart
  await page.click("#kaartenBtn");
  await page.fill("#k_naam", "Piet B.");
  await page.click("#k_save_srv");
  for (let i = 0; i < 60 && (await kaarten()).length < 2; i++) await wacht(100);
  assert.deepEqual((await kaarten()).map((k) => k.naam).sort(), ["Joke", "Piet B."], "twee kaarten");
  assert.ok(vragen.some((v) => v.startsWith("confirm") && v.includes("nieuwe kaart")), "vraag nieuwe kaart of naam: " + JSON.stringify(vragen));
  assert.equal(await page.inputValue("#c_naam"), "Piet B.", "naamveld volgt de nieuwe kaart");

  // verder bewerken voor Piet: autosave lukt (geen 409) en landt op Piets kaart
  antwoorden.length = 0;
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.querySelectorAll("[data-add]")[1].click(); });
  for (let i = 0; i < 60 && !antwoorden.length; i++) await wacht(100);
  await wacht(400);
  assert.ok(antwoorden.length >= 1, "autosave na bewerken");
  assert.ok(antwoorden.every((s) => s === 200), "autosaves 200: " + JSON.stringify(antwoorden));
  const na = await kaarten();
  const piet = na.find((k) => k.naam === "Piet B."), jokeNa = na.find((k) => k.naam === "Joke");
  assert.notEqual(piet.id, jokeNa.id, "eigen QR voor Piet");
  assert.equal(jokeNa.ts, joke.ts, "Jokes kaart niet aangeraakt");
  assert.deepEqual(fouten, []);
  console.log("nieuwe kaart naam: ok (naamveld volgt, autosave 200, Joke ongemoeid)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
