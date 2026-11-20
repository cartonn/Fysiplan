// Gebruikers-sweep 2026-11-20 14u (Jayden, Pixel 7; Truus, iPhone SE): de praktijk wist een kaart terwijl
// die op de telefoon open staat. Daarna zei de pijnscore "Saving did not work, please try again in a
// moment", het herstel net zo, en "I did my exercises today" zei niets; opnieuw proberen heeft nooit zin.
// En de open kaart merkte het wissen bij terugkomen niet (inhoudCheck stopte stil bij een 404).
// Nu zeggen pijnscore, herstel en oefendag dat het niet aankwam en dat je de praktijk belt of mailt, en
// herlaadt de open kaart bij terugkomen naar de melding "Kaart niet gevonden".
// Het statische deel draait altijd (CI heeft geen browser); met Playwright ook in een telefoon.
// `npm run test:kaartgewist`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /zetDank\(dank,d\.kwijt\?trw\('kwijt'\)/, "pijnscore leest kwijt");
assert.match(kaart, /zetDank\(dank,d&&d\.kwijt\?trw\('kwijt'\):trh\('fout'\)/, "herstel leest kwijt");
assert.equal((kaart.match(/else if\(d&&d\.kwijt\)zetDank\(document\.getElementById\('mdank'\),trw\('kwijt'\)/g) || []).length, 2, "oefendag (knop en snelle weg) leest kwijt");
assert.match(kaart, /if\(st===404\)\{oefWeg\(zidx,false,trw\('kwijt'\)\);return;\}/, "te zwaar: bij 404 geen 'tik opnieuw'");
assert.match(kaart, /zetDank\(dank,d&&d\.kwijt\?trw\('kwijt'\):\(TAAL==='nl'&&d&&d\.fout\)\?d\.fout:trpsk\('fout'\)/, "doelactiviteit leest kwijt");
assert.match(kaart, /if\(r\.status===404\)return \{weg:true\};/, "inhoudCheck herkent een gewiste kaart");
assert.match(kaart, /if\(wq&&wq\.classList\.contains\('fout'\)&&wq\.style\.display==='block'\)return;\s*if\(wachtBezig\|\|Object\.keys\(leesWacht\(\)\)\.length\)/, "niet herladen over de melding dat wachtende tikken niet aankwamen");
assert.match(kaart, /SESSIE=-1;tekenSessie\(\);[\s\S]{0,300}setTimeout\(inhoudCheck,0\)/, "na de oefenstand meteen nakijken wat de therapeut veranderde");

let playwright = null;
for (const van of [import.meta.url, "/opt/node22/lib/node_modules/"]) {
  try { playwright = createRequire(van)("playwright"); break; } catch {}
}
if (!playwright) {
  console.log("PASS gewiste kaart op /k (statisch; geen Playwright, browserdeel overgeslagen)");
  process.exit(0);
}

const ID = "0e5a0e5a9abc";
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gewist-"));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio gewist": { jayden: { id: ID, praktijk: "Fysio Gewist", naam: "Jayden",
  ts: Date.now(), taal: "en", chosen: [{ n: "Squat", id: "", i: 0 }, { n: "Lunges", id: "", i: 1 }],
  rows: {}, cells: {}, vids: {} } } }));
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
const wachtOp = async (page, fn, arg, ms = 5000) => {
  const eind = Date.now() + ms;
  for (;;) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; if (Date.now() > eind) return null; await wacht(100); }
};
const { chromium, devices } = playwright;
const browser = await chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const ctx = await browser.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1, serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.6.9.2" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  await page.goto(origin + "/k/" + ID + "?taal=en");
  await page.waitForSelector("#mschaal button");
  await page.evaluate(() => document.querySelectorAll(".ov.on,.lb.on").forEach((o) => o.classList.remove("on")));
  // de praktijk wist de kaart: de server antwoordt 404 zoals lib/patient-routes.js
  const weg = { status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, fout: "Kaart niet gevonden." }) };
  for (const pad of ["meting", "ervaring", "gedaan"]) await page.route("**/api/kaart/" + pad, (r) => r.fulfill(weg));
  const kwijt = /Not received.*call or email your practice/;

  await page.evaluate(() => document.querySelectorAll("#mschaal button")[3].click());
  const m = await wachtOp(page, () => { const d = document.getElementById("mdank"); return d.style.display === "block" && d.textContent; });
  assert.match(String(m), kwijt, "pijnscore op een gewiste kaart: " + m);
  await page.evaluate(() => { const d = document.getElementById("mdank"); d.style.display = "none"; d.textContent = ""; });

  await page.evaluate(() => document.getElementById("gdaan").click());
  const g = await wachtOp(page, () => { const d = document.getElementById("mdank"); return d.style.display === "block" && d.textContent; });
  assert.match(String(g), kwijt, "oefendag op een gewiste kaart: " + g);
  assert.ok(await page.evaluate(() => document.getElementById("mdank").classList.contains("fout")), "als fout getoond");

  await page.evaluate(() => document.querySelector("#hsknoppen .sbtn").click());
  const h = await wachtOp(page, () => { const d = document.getElementById("hsdank"); return d && d.style.display === "block" && d.textContent; });
  assert.match(String(h), kwijt, "herstel op een gewiste kaart: " + h);

  // terugkomen op een open, gewiste kaart: herladen naar "Card not found"
  await page.route("**/api/kaart?id=*", (r) => r.fulfill(weg));
  await page.evaluate(() => { document.querySelectorAll("textarea,input[type=text]").forEach((v) => { v.value = ""; }); });
  await Promise.all([page.waitForEvent("load", { timeout: 8000 }), page.evaluate(() => window.dispatchEvent(new Event("focus")))]);
  const f = await wachtOp(page, () => { const d = document.getElementById("fout"); return d && d.style.display !== "none" && d.textContent; }, null, 8000);
  assert.ok(f, "na terugkomen staat de melding dat de kaart er niet meer is");
  assert.deepEqual(fouten, []);
  await ctx.close();
  console.log("PASS gewiste kaart op /k: pijnscore, oefendag en herstel zeggen dat het niet aankwam; open kaart herlaadt");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
