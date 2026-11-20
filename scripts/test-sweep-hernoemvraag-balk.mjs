// Regressietest gebruikers-sweep 2026-11-20 18u (MIDDEL, Sanne, desktop + toetsenbord): na het wijzigen van de
// roepnaam van een gedeelde kaart ("Dirk" → "Dirck") vraagt de server (409 hernoemVraag) of het een nieuwe patiënt is
// of een verbeterde naam. Die vraag stond alleen als tekst van 8,5 px met links van 83x16 px in het QR-hoekje van de
// verkleinde A4: geen role=alert, 8 Tabs van het naamveld, en na Enter op "naam verbeteren" viel de focus op body.
// Nu staat de vraag ook in de balk bovenin beeld (knoppen van 44 px, role=alert) en gaat de focus daarna terug naar
// het veld waar je was. Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:hernoemvraagbalk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
const blok = index.match(/if\(d\.hernoemVraag\)\{[\s\S]*?return true;\s*\}/);
assert.ok(blok, "hernoemVraag-blok gevonden");
assert.match(blok[0], /toonConflictBalk\(hTekst,hKnoppen\)/, "hernoemvraag ook in de balk bovenin beeld");
assert.match(index, /#conflict_bar[\s\S]{0,4000}?e\.key!=='Escape'/, "Escape sluit de balk");
assert.match(index, /function qrActie\(a\)\{[\s\S]{0,900}?uitBalk[\s\S]{0,500}?tf\.focus\(\)/, "na een keuze in de balk focus terug, niet op body");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-hernoemvraag-balk: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-hernoemvraag-"));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.44." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Hernoemvraag";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "hernoemvraag-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.44.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  if (process.env.DBG) page.on("response", (r) => { if (r.url().includes("/api/")) console.log("RESP", r.request().method(), r.url().replace(origin, ""), r.status()); });
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await wacht(1500);
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  for (let i = 0; i < 60 && (await page.inputValue("#c_naam").catch(() => "")) !== "Dirk"; i++) await wacht(50);
  assert.equal(await page.inputValue("#c_naam"), "Dirk", "kaart van Dirk open in de editor");

  // roepnaam verbeteren en met Tab verder: de server vraagt eerst
  await page.fill("#c_naam", "Dirck");
  await page.keyboard.press("Tab");
  await page.waitForSelector("#conflict_bar", { state: "visible", timeout: 20000 });
  assert.match(await page.textContent("#conflict_bar"), /verbeter je alleen de naam/);
  assert.equal(await page.getAttribute("#conflict_bar", "role"), "alert", "schermlezer meldt de vraag");
  const maten = await page.$$eval("#conflict_bar button", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; }));
  assert.equal(maten.length, 3, "nieuwe kaart, naam verbeteren, sluiten");
  for (const [t, w, h] of maten) assert.ok(w >= 44 && h >= 44, "tikdoel " + t + " " + w + "x" + h);

  // Escape in de balk sluit hem (hertest Sanne), focus niet op body; daarna de balk weer tonen voor de keuze
  await page.focus("#conflict_bar [data-cfact='nieuwkaart']");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#conflict_bar", { state: "hidden", timeout: 4000 });
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), "BODY", "na Escape geen focus op body");
  await page.evaluate(() => { document.getElementById("conflict_bar").style.display = "flex"; });

  // met het toetsenbord kiezen: "Zelfde patiënt, naam verbeteren"
  await page.focus("#conflict_bar [data-cfact='hernoem']");
  const ok = page.waitForResponse((r) => r.url().endsWith("/api/kaarten") && r.request().method() === "POST" && r.status() === 200, { timeout: 15000 });
  await page.keyboard.press("Enter");
  await ok;
  await page.waitForSelector("#conflict_bar", { state: "hidden", timeout: 8000 });
  const focus = await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  assert.notEqual(focus, "BODY", "na de keuze geen focus op body");
  assert.notEqual(focus, "c_naam", "niet in het naamveld: daar wacht het delen op");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest("#conflict_bar")), false, "focus niet in de verborgen balk");
  const k = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json();
  assert.equal(k.kaart.client.c_naam, "Dirck", "zelfde kaart (zelfde QR) heeft de verbeterde naam");

  // dezelfde naam opnieuw: de balk komt niet bij elke autosave terug
  await wacht(500);
  assert.equal(await page.isVisible("#conflict_bar"), false);
  assert.deepEqual(fouten, []);
  console.log("test-sweep-hernoemvraag-balk: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
