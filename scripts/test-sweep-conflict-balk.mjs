// Regressietest gebruikers-sweep 2026-11-15 18u (HOOG, Mark, iPad): dezelfde kaart open op desktop en iPad; de desktop
// bewaart eerst, de iPad krijgt een 409 (verouderd). De keuze "Open de nieuwste versie / Toch mijn versie bewaren" stond
// alleen als klein tekstje met links van 9 px hoog in het QR-vak van de verkleinde A4, ver van waar je bewerkt. Nu komt
// er ook een balk bovenin beeld met knoppen van minstens 44 px, die verdwijnt zodra de kaart weer bewaard is.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:conflictbalk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /toonQrHint\(vTekst,vKnoppen\);\s*toonConflictBalk\(vTekst,vKnoppen\);/, "409 verouderd toont ook de balk");
assert.match(index, /function toonConflictBalk\(tekst,knoppen\)\{[\s\S]{0,3000}?min-height:44px/, "knoppen van minstens 44 px");
assert.match(index, /zetConflictTop\(bar\);\s*bar\.style\.display='flex';/, "balk onder de kopbalk, niet over de schermknoppen");
assert.match(index, /hb\.parentNode\.insertBefore\(bar,hb\.nextSibling\)/, "balk in de pagina direct na de kopbalk (niet zwevend, vroeg in de tabvolgorde)");
assert.match(index, /#conflict_bar button:focus-visible\{outline:3px solid #B9E34B/, "zichtbare focusring op de donkere balk");
assert.match(index, /function toonQr\(id\)\{\s*\/\/[^\n]*\n\s*var cfb=document\.getElementById\('conflict_bar'\);if\(cfb\)cfb\.style\.display='none';/, "balk weg na bewaren");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-conflict-balk: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-conflictbalk-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.43." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Conflict Balk";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "conflict-balk-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  // /api/kaart geeft een eigen video als tijdelijke link (pad?k=&e=&s=); hier telt alleen het bewaarde pad
  const zonderLink = (v) => Object.fromEntries(Object.entries(v || {}).map(([a, b]) => [a, String(b).split("?")[0]]));
  const serverKaart = async () => { const j = await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json(); if (j && j.kaart && j.kaart.vids) j.kaart.vids = zonderLink(j.kaart.vids); return j; };

  const ctx = await browser.newContext({ ...pw.devices["iPad (gen 7)"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.43.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [], meldingen = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
  await page.click(`[data-sopen='${id}']`);
  await wacht(1500);
  await page.evaluate(() => { const x = document.getElementById("k_close"); if (x && x.offsetParent) x.click(); document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  const basis = (await serverKaart()).kaart.ts;
  assert.ok(basis, "versie van de kaart bekend");
  // desktop bewaart eerst
  const r2 = await post("/api/kaarten", { praktijk: P, naam: "Dirk", client: { c_naam: "Dirk", c_doel: "Traplopen zonder pijn" }, chosen, kaartId: id, basisTs: basis }, S);
  assert.equal(r2.status, 200, "desktop bewaart");
  // de iPad wijzigt daarna iets (oefening erbij) en krijgt een 409
  const antw = page.waitForResponse((r) => r.url().endsWith("/api/kaarten") && r.request().method() === "POST", { timeout: 15000 });
  await page.evaluate(() => { const b = document.querySelector("[data-add]"); if (b) b.click(); });
  assert.equal((await antw).status(), 409, "iPad krijgt verouderd");
  await page.waitForSelector("#conflict_bar", { state: "visible", timeout: 8000 });
  assert.match(await page.textContent("#conflict_bar"), /ander apparaat gewijzigd/);
  const maten = await page.$$eval("#conflict_bar button", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; }));
  assert.equal(maten.length, 3, "nieuwste, toch mijn versie, sluiten");
  for (const [t, w, h] of maten) assert.ok(w >= 44 && h >= 44, "tikdoel " + t + " " + w + "x" + h);
  const vak = await page.$eval("#conflict_bar", (b) => { const r = b.getBoundingClientRect(); return { top: r.top, right: r.right, vw: innerWidth }; });
  assert.ok(vak.top >= 0 && vak.top < 260 && vak.right <= vak.vw, "balk bovenin beeld, binnen het scherm");
  // sweep 2026-11-19 14u (Sanne): de balk lag over de kopbalk en blokkeerde de schermknoppen
  const vrij = await page.evaluate(() => {
    const hb = document.querySelector("header.topbar"), bar = document.getElementById("conflict_bar");
    const knoppen = [...document.querySelectorAll("#fpSchermen [data-scherm]")].filter((b) => b.offsetParent);
    return { onder: bar.getBoundingClientRect().top >= hb.getBoundingClientRect().bottom,
      klikbaar: knoppen.every((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && b.contains(el); }) };
  });
  assert.equal(vrij.onder, true, "balk staat onder de kopbalk");
  assert.equal(vrij.klikbaar, true, "schermknoppen blijven klikbaar met de balk open");
  const plek = await page.evaluate(() => { const b = document.getElementById("conflict_bar"); return { na: !!b.previousElementSibling && b.previousElementSibling.matches("header.topbar"), pos: getComputedStyle(b).position }; });
  assert.equal(plek.na, true, "balk staat in de pagina direct na de kopbalk");
  assert.equal(plek.pos, "sticky", "balk blijft bij scrollen in beeld zonder over de werkbalk te zweven");
  await page.evaluate(() => { const k = [...document.querySelectorAll("#fpSchermen [data-scherm]")].filter((b) => b.offsetParent).pop(); k.focus(); });
  let inBalk = false;
  for (let i = 0; i < 25 && !inBalk; i++) { await page.keyboard.press("Tab"); inBalk = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest("#conflict_bar")); }
  assert.equal(inBalk, true, "met Tab snel van de schermknoppen naar de balk");
  await page.focus("#conflict_bar [data-cfact='sluit']");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement !== document.body), true, "na sluiten geen focus op body");
  await page.evaluate(() => { document.getElementById("conflict_bar").style.display = "flex"; });
  // hertest Sanne: over de hele breedte (geen zwevend blok over de werkbalk bij scrollen) en focus terug naar het veld
  assert.equal(await page.evaluate(() => document.getElementById("conflict_bar").getBoundingClientRect().width >= document.documentElement.clientWidth - 2), true, "balk over de hele breedte");
  await page.focus("#c_doel");
  await page.click("#conflict_bar [data-cfact='sluit']");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "c_doel", "na sluiten met de muis focus terug in het veld waar je was");
  await page.evaluate(() => { document.getElementById("conflict_bar").style.display = "flex"; });
  // een veld dat focus krijgt terwijl het onder de balk ligt, schuift in beeld (WCAG 2.4.11; hertest Sanne)
  await page.evaluate(() => { document.activeElement.blur(); const v = document.getElementById("c_doel"), b = document.getElementById("conflict_bar");
    window.scrollBy(0, v.getBoundingClientRect().top - b.getBoundingClientRect().bottom + 20); });
  const onder = await page.evaluate(() => { const v = document.getElementById("c_doel").getBoundingClientRect(), b = document.getElementById("conflict_bar").getBoundingClientRect(); return v.top < b.bottom; });
  if (onder) {
    await page.focus("#c_doel");
    let vrijIn = false;
    for (let i = 0; i < 30 && !vrijIn; i++) { await wacht(50); vrijIn = await page.evaluate(() => document.getElementById("c_doel").getBoundingClientRect().top >= document.getElementById("conflict_bar").getBoundingClientRect().bottom); }
    assert.equal(vrijIn, true, "gefocust veld niet achter de balk");
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.tap("#conflict_bar [data-cfact='nieuwste']");
  await page.waitForSelector("#conflict_bar", { state: "hidden", timeout: 8000 });
  for (let i = 0; i < 100 && (await page.inputValue("#c_doel").catch(() => "")) !== "Traplopen zonder pijn"; i++) await wacht(50);
  assert.equal(await page.inputValue("#c_doel"), "Traplopen zonder pijn", "nieuwste versie van de desktop staat erin");
  assert.deepEqual(fouten, []);
  console.log("test-sweep-conflict-balk: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
