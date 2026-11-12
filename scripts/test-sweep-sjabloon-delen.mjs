// Gebruikers-sweep 2026-11-12 (Sanne desktop, Mark iPad): "Delen met de praktijk" van een eigen
// behandelkaart.
// 1. Een dubbelklik op Delen landde met de tweede klik op "Verwijderen" ernaast (de knop werd smaller
//    door "Bezig…"); wie de vraag met OK beantwoordde, was de eigen kaart kwijt.
// 2. Nog eens delen met dezelfde naam overschreef het teamsjabloon stil; nu vraagt de app "Vervangen?"
//    en zegt na afloop wat er gebeurd is (de serverkant staat in test:gedeeldwerk).
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:sjabloondelen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /if\(Date\.now\(\)<\(SJ_STAAT\.deelKlikTot\|\|0\)\)return;/, "Verwijderen telt niet vlak na Delen");
assert.match(appHtml, /k\.style\.minWidth=k\.offsetWidth\+'px'/, "Delen-knop houdt zijn breedte tijdens Bezig…");
assert.match(appHtml, /else if\(d\.bestaat&&!vervang\)/, "bij een bestaand teamsjabloon eerst vragen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("sjabloon delen: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sjabloondelen-"));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Sjabloon Delen";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await fetch(origin + "/api/praktijk/claim", { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.7.3.1" },
    body: JSON.stringify({ praktijk: P, wachtwoord: "sjabloon-wachtwoord", akkoord: true }) })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const teamSjablonen = async () => (await (await fetch(origin + "/api/praktijk/sjablonen?praktijk=" + encodeURIComponent(P),
    { headers: { "x-praktijk-sessie": sessie, "x-forwarded-for": "10.7.3.2" } })).json()).sjablonen;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.3.9" } });
  await ctx.addInitScript(([t, pr]) => {
    try {
      localStorage.setItem("fp_praksessie", t);
      if (!localStorage.getItem("fysiplan_eigen_sjablonen"))
        localStorage.setItem("fysiplan_eigen_sjablonen", JSON.stringify([{ naam: "Knie na VKB", sub: "Jouw behandelkaart (alleen op dit apparaat)",
          oefeningen: [{ n: "Squat", s: "3", h: "10" }], persoonlijk: true }]));
    } catch {}
  }, [sessie, P]);
  const page = await ctx.newPage();
  const fouten = [], vragen = [];
  let antwoord = true;
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { vragen.push(d.type() + ": " + d.message()); d.type() === "confirm" ? (antwoord ? d.accept() : d.dismiss()) : d.accept(); });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  const kies = async () => {
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#sjabBtn");
    const rij = page.locator("#sj_lijst [data-sjsel]", { hasText: "Knie na VKB" }).first();
    await rij.waitFor({ state: "visible", timeout: 8000 });
    await rij.click();
    const deel = page.locator("[data-sjdo='deel']");
    await deel.waitFor({ state: "visible", timeout: 8000 });
    return deel;
  };

  // 1. dubbelklik op Delen: de tweede klik valt op dezelfde plek, maar verwijdert niets
  let deel = await kies();
  const box = await deel.boundingBox();
  const x = box.x + box.width - 3, y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await wacht(1500);
  assert.deepEqual(vragen.filter((v) => v.startsWith("confirm")), [], "geen vraag om de eigen kaart te verwijderen: " + JSON.stringify(vragen));
  const eigen = await page.evaluate(() => JSON.parse(localStorage.getItem("fysiplan_eigen_sjablonen") || "[]").map((s) => s.naam));
  assert.deepEqual(eigen, ["Knie na VKB"], "de eigen behandelkaart staat er nog");
  assert.deepEqual((await teamSjablonen()).map((s) => s.naam), ["Knie na VKB"], "gedeeld met de praktijk");
  assert.ok(vragen.some((v) => /^alert: Gedeeld: "Knie na VKB"/.test(v)), "de app bevestigt het delen: " + JSON.stringify(vragen));

  // 2. nog eens delen met dezelfde naam: eerst vragen; Annuleren laat het teamsjabloon staan
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem("fysiplan_eigen_sjablonen")); l[0].oefeningen = [{ n: "Lunge" }]; localStorage.setItem("fysiplan_eigen_sjablonen", JSON.stringify(l)); });
  vragen.length = 0; antwoord = false;
  deel = await kies();
  await deel.click();
  await wacht(1200);
  assert.equal(vragen.filter((v) => /^confirm: Er is al een teamsjabloon "Knie na VKB"/.test(v)).length, 1, "vraagt om vervangen: " + JSON.stringify(vragen));
  assert.equal((await teamSjablonen())[0].oefeningen[0].n, "Squat", "na Annuleren blijft de oude versie");
  // OK vervangt
  vragen.length = 0; antwoord = true;
  deel = await kies();
  await deel.click();
  await wacht(1200);
  assert.equal((await teamSjablonen())[0].oefeningen[0].n, "Lunge", "na OK staat de nieuwe versie bij de praktijk");
  assert.ok(vragen.some((v) => /is vervangen/.test(v)), "de app zegt dat het vervangen is: " + JSON.stringify(vragen));
  assert.deepEqual(fouten, []);
  console.log("sjabloon delen: ok (dubbelklik verwijdert niets, zelfde naam vraagt eerst)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
