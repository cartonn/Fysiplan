// Regressietest gebruikers-sweep 2026-11-22 22u (MIDDEL, Jayden, Pixel 7 + iPhone 14):
// het ingevulde schema op /k is op het scherm een tabel die opzij scrolt. Bij Print/PDF scrolde er
// niets: alleen oefening 1–3 kwamen op papier, plus de zin "Veeg opzij voor alle oefeningen".
// Nu staat op papier dezelfde tabel in stukken van vier oefeningen onder elkaar, zonder de veegzin.
// Ook: de pijnknoppen 0 en 10 noemen de schaal ("0 = geen pijn"), niet alleen het cijfer (Truus).
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:schemaprint`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /class="schemaprint"/, "printversie van het schema");
assert.match(kaart, /\.schemawrap,\.schemahint\{display:none !important\}/, "scrolltabel en veegzin niet op papier");
assert.match(kaart, /schaal\.setAttribute\('aria-describedby','ml0 ml10'\)/, "pijnschaal beschreven");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-schema-print: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-schemaprint-"));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 10;
  const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.47." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Schema Print";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "schemaprint-wachtwoord-1", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const ids = ["fp_688499fde71e7575", "fp_ba8ecef1edfecd32", "fp_a0a18c0c13673d38", "fp_7b07f346644f9c17", "fp_f17c3675b48db1ae", "fp_7dc1478e2b3c17b0"];
  const chosen = ids.map((id) => ({ n: "Oefening " + id.slice(-4), id, i: 0 }));
  const cells = {}; const rows = { r0: "17-11", r1: "20-11" };
  ids.forEach((id, k) => { for (const rk of ["r0", "r1"]) { cells[`x${id}.0|${rk}|S`] = "3"; cells[`x${id}.0|${rk}|H`] = String(10 + k); } });
  const r = await post("/api/kaarten", { praktijk: P, naam: "Jayden", client: { c_naam: "Jayden" }, chosen, rows, cells, kaartId: "" }, { "x-praktijk-sessie": sessie });
  const d = await r.json();
  assert.ok(d.id, "kaart gedeeld: " + JSON.stringify(d));

  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.47.200" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  await page.goto(origin + "/k/" + d.id, { waitUntil: "load" });
  await page.waitForSelector(".schemablok", { state: "attached", timeout: 15000 });

  const pijn = await page.evaluate(() => [...document.querySelectorAll("#mschaal button")].map((b) => b.getAttribute("aria-label")));
  assert.equal(pijn.length, 11, "elf pijnknoppen");
  assert.match(pijn[0], /0 = geen pijn/, "knop 0 noemt de schaal: " + pijn[0]);
  assert.match(pijn[10], /10 = ergste pijn/, "knop 10 noemt de schaal: " + pijn[10]);
  assert.equal(pijn[5], "5");

  const scherm = await page.evaluate(() => ({ print: getComputedStyle(document.querySelector(".schemaprint")).display, wrap: getComputedStyle(document.querySelector(".schemawrap")).display }));
  assert.equal(scherm.print, "none", "printtabel niet op het scherm");
  assert.notEqual(scherm.wrap, "none", "scrolltabel wel op het scherm");

  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: 718, height: 1000 }); // ~A4-breedte binnen de marges
  const papier = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const tabellen = [...document.querySelectorAll(".schemaprint table")];
    return {
      w, n: tabellen.length,
      breed: tabellen.map((t) => Math.round(t.getBoundingClientRect().right)),
      koppen: tabellen.map((t) => [...t.querySelectorAll("thead tr:first-child th[colspan]")].map((th) => th.textContent.trim())),
      cellen: tabellen.map((t) => [...t.querySelectorAll("tbody td:not(.dat)")].filter((td) => td.textContent).length),
      wrap: getComputedStyle(document.querySelector(".schemawrap")).display,
      hint: getComputedStyle(document.querySelector(".schemahint")).display,
      zichtbaar: getComputedStyle(document.querySelector(".schemaprint")).display
    };
  });
  assert.equal(papier.zichtbaar, "block", "printtabel op papier");
  assert.equal(papier.wrap, "none", "scrolltabel niet op papier");
  assert.equal(papier.hint, "none", "geen veegzin op papier");
  assert.equal(papier.n, 2, "zes oefeningen = twee stukken van max. vier");
  assert.deepEqual(papier.koppen.map((k) => k.length), [4, 2]);
  assert.match(papier.koppen[1][1], /^6\. /, "doornummering: " + papier.koppen[1][1]);
  assert.deepEqual(papier.cellen, [16, 8], "alle ingevulde cellen op papier");
  for (const b of papier.breed) assert.ok(b <= papier.w + 1, `tabel past op de pagina (${b} > ${papier.w})`);
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("test-sweep-schema-print: ok (schema in stukken van vier op papier, pijnschaal benoemd)");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  await browser.close();
  app.kill();
}
