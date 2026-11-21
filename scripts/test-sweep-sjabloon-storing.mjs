// Regressietest gebruikers-sweep 2026-11-21 10u (Mark, desktop + iPad):
// 1. HOOG: konden de eigen oefeningen van de praktijk niet laden (storing), dan zei het voorbeeld van een
//    teamsjabloon dat de eigen oefening "niet meer in de bibliotheek" stond, en zette "Op de kaart zetten" de
//    kaart er stil zonder die oefening op (6 van 7). Nu zegt het voorbeeld dat het laden even niet lukte, staan
//    de knoppen uit, en werkt "Probeer opnieuw" zodra de eigen oefeningen weer bereikbaar zijn.
// 2. MIDDEL: teamsjabloon delen of verwijderen bij een verlopen proef gaf een kale alert met een platte link;
//    nu dezelfde proefmelding als elders (toonProefVoorbij).
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:sjabloonstoring`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /function sjEigenKwijt\(s\)\{\s*return IS_V2&&EIGEN_STAND==='storing'/, "voorbeeld kent de storing");
assert.match(index, /if\(\(wat==='gebruik'\|\|wat==='erbij'\|\|wat==='aanpassen'\)&&sjEigenKwijt\(s\)\)return;/, "niet half op de kaart");
assert.match(index, /function pasSjabloonToe\(s,erbij\)\{\s*if\(!s\)return;[\s\S]{0,260}if\(sjEigenKwijt\(s\)\)/, "ook een dubbelklik in de lijst");
assert.match(index, /else if\(d\.proefVerlopen\)\{herstel\(\);toonProefVoorbij\(k\);\}/, "delen bij verlopen proef: proefmelding");
assert.match(index, /else if\(d\.proefVerlopen\)toonProefVoorbij\(k\);else alert\(d\.fout\|\|'Verwijderen is niet gelukt\.'\)/, "verwijderen bij verlopen proef: proefmelding");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-sjabloon-storing: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sjstoring-"));
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
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.47." + (ip++), ...extra }, body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(200, 1)]).toString("base64");
const P = "Fysio Sjabloon Storing";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "sjstoring-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  assert.equal((await post("/api/praktijk/oefeningen", { praktijk: P, naam: "Eigen plank Sjabtest", uitleg: "Rustig.", img: png }, S)).status, 200, "testopzet: eigen oefening");
  const rs = await post("/api/praktijk/sjablonen", { praktijk: P, naam: "Team eigen twee", oefeningen: [{ n: "Bruggen beginner" }, { n: "Eigen plank Sjabtest" }] }, S);
  assert.equal(rs.status, 200, "testopzet: teamsjabloon gedeeld");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.47.200" } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
  let storing = true;
  await ctx.route(/\/api\/praktijk\/oefeningen\?/, (route) => storing ? route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }) : route.continue());
  const page = await ctx.newPage();
  const fouten = [], meldingen = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { meldingen.push(d.message()); d.accept(); });
  await page.goto(origin + "/v2/app", { waitUntil: "load" });
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await wacht(1500);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#sjabBtn");
  let rij = null;
  for (let i = 0; i < 60 && !rij; i++) { rij = await page.$("xpath=//*[@data-sjsel][contains(., 'Team eigen twee')]"); if (!rij) await wacht(100); }
  assert.ok(rij, "teamsjabloon staat in de lijst");
  await rij.click();
  await wacht(200);
  const vb = await page.evaluate(() => {
    const el = document.getElementById("sj_voorbeeld");
    const g = el.querySelector("[data-sjdo='gebruik']");
    return { t: el.textContent, uit: !!(g && g.disabled), opnieuw: !!el.querySelector("[data-sjdo='herlaad']") };
  });
  assert.doesNotMatch(vb.t, /niet meer in de bibliotheek/, "zegt niet dat de eigen oefening weg is");
  assert.match(vb.t, /nu niet worden geladen/, "zegt dat het laden even niet lukte");
  assert.ok(vb.uit, "Op de kaart zetten staat uit");
  assert.ok(vb.opnieuw, "Probeer opnieuw staat er");
  await page.evaluate(() => document.querySelector("#sj_voorbeeld [data-sjdo='gebruik']").click());
  await wacht(300);
  assert.equal((await page.$$(".rm[data-rm]")).length, 0, "niets half op de kaart gezet");
  // dubbelklik in de lijst omzeilde de uit-knoppen (hertest Mark, iPad)
  await page.locator("xpath=//*[@data-sjsel][contains(., 'Team eigen twee')]").first().dblclick();
  await wacht(300);
  assert.equal((await page.$$(".rm[data-rm]")).length, 0, "ook niet met een dubbelklik in de lijst");

  // storing voorbij: Probeer opnieuw → beide oefeningen
  storing = false;
  await page.click("#sj_voorbeeld [data-sjdo='herlaad']");
  let klaar = false;
  for (let i = 0; i < 60 && !klaar; i++) { klaar = await page.evaluate(() => { const g = document.querySelector("#sj_voorbeeld [data-sjdo='gebruik']"); return !!(g && !g.disabled); }); if (!klaar) await wacht(100); }
  assert.ok(klaar, "na Probeer opnieuw staat de knop weer aan");
  assert.match(await page.textContent("#sj_voorbeeld"), /Eigen plank Sjabtest/, "eigen oefening in het voorbeeld");
  await page.click("#sj_voorbeeld [data-sjdo='gebruik']");
  for (let i = 0; i < 40 && (await page.$$(".rm[data-rm]")).length < 2; i++) await wacht(100);
  assert.equal((await page.$$(".rm[data-rm]")).length, 2, "beide oefeningen op de kaart");
  assert.ok(!meldingen.some((m) => /overgeslagen/.test(m)), "niets overgeslagen: " + meldingen.join(" | "));
  assert.deepEqual(fouten, []);
  console.log("test-sweep-sjabloon-storing: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
