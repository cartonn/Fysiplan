// Gebruikers-sweep 2026-11-18 18u (Karin, beheerder, desktop): haalde Karin een collega uit het team terwijl
// diens app openstond, dan bleef na een schermwissel de kaartenlijst van de praktijk staan (patiëntnamen,
// Deel/Openen/Rapport) en gaf "Exporteer (CSV)" nog alle kaarten met patiëntlinks als bestand, uit de oude lijst
// in de app. Nu bouwt de app de lijst opnieuw op zodra de server zegt dat je niet meer ingelogd bent, en maakt de
// CSV-knop geen bestand meer uit oude gegevens na een 401/403.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:uitteam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /var uitgelogd=PRAKSLOT\.bekend&&PRAKSLOT\.ingelogd&&!d\.ingelogd/, "status merkt dat je niet meer ingelogd bent");
assert.match(index, /if\(uitgelogd\)\{SRV_KAART=\{\};SRV_SIGNALEN=\{\};[^\n]*toonSrvKaarten\(\);/, "dan de lijst opnieuw opbouwen");
// sweep 2026-11-19 (Karin): daarna sprongen de Praktijk-tegels naar de beheerteksten en bleef de proefbalk van de praktijk staan
assert.match(index, /if\(PROEF&&PROEF\.elders\)\{PROEF=null;var pb=document\.getElementById\('proefBalk'\);if\(pb\)pb\.hidden=true;\}\}/, "proefbalk van de praktijk weg");
assert.match(index, /var uit=!!\(typeof PRAKSLOT!=='undefined'&&PRAKSLOT&&PRAKSLOT\.bekend&&PRAKSLOT\.geclaimd&&!PRAKSLOT\.ingelogd\);\s*if\(uit\)return \[/, "uitgelogd: eigen tegelteksten");
assert.match(index, /if\(vers&&vers\.geweigerd\)\{[^\n]*return;\}/, "geen CSV uit oude gegevens na een weigering");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("uit team: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitteam-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-20000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-20000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.37." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.38." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// wachten met een lus rond evaluate (zie de testles over waitForFunction)
const tot = async (pg, fn, wat, ms = 10000) => { for (let t = 0; t < ms; t += 150) { if (await pg.evaluate(fn)) return; await wacht(150); } assert.fail(wat); };
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Uitteam";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "uitteam-wachtwoord", akkoord: true })).json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Beheer", email: "beheer@uitteam.test", wachtwoord: "beheer-uit-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login beheerder");
  const S = ses(await eigen.json());
  const { link } = await (await post("/api/praktijk/team/uitnodigen", { email: "cor@uitteam.test", naam: "Cor", rol: "therapeut" }, S)).json();
  const token = new URL(link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: token, naam: "Cor", wachtwoord: "cor-uit-wachtwoord", regels: "1" })).status, 200, "Cor neemt aan");
  const L = ses(await (await post("/api/praktijk/login", { email: "cor@uitteam.test", wachtwoord: "cor-uit-wachtwoord", praktijk: P })).json());
  assert.ok(L["x-praktijk-sessie"], "Cor logt in");
  const k = await post("/api/kaarten", { praktijk: P, naam: "Henk", client: { c_naam: "Henk" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
  assert.equal(k.status, 200, "kaart Henk gedeeld");
  const corId = ((await (await get("/api/praktijk/team", S)).json()).leden || []).find((l) => /cor/i.test(l.email || l.naam)).id;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", acceptDownloads: true,
    extraHTTPHeaders: { "x-forwarded-for": "10.6.39.7" } });
  await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("gezet", "1"); } } catch {} }, L["x-praktijk-sessie"]);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await tot(page, () => /Henk/.test(document.getElementById("k_srv_lijst").textContent), "lijst met Henk");
  assert.ok(await page.$("#k_srv_csv"), "CSV-knop staat er zolang Cor in het team zit");

  // CSV-knop terwijl Cor net verwijderd is: geen bestand uit de oude lijst
  assert.equal((await post("/api/praktijk/team/verwijder", { id: corId, gedeeld: "uit" }, S)).status, 200, "Cor uit het team");
  let download = false;
  page.on("download", () => { download = true; });
  await page.click("#k_srv_csv");
  await tot(page, () => !/Henk/.test(document.getElementById("k_srv_lijst").textContent), "lijst leeg na CSV");
  await wacht(500);
  assert.equal(download, false, "geen CSV met de kaarten na verwijderen");

  // schermwissel na het verwijderen: de lijst blijft leeg, de inlogvraag staat er
  await wacht(2100);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await wacht(800);
  const lijst = await page.evaluate(() => document.getElementById("k_srv_lijst").textContent);
  assert.doesNotMatch(lijst, /Henk/, "geen patiëntnamen meer: " + lijst);
  assert.equal(await page.evaluate(() => { const b = document.getElementById("k_srv_csv"); return !!b && b.offsetParent !== null; }), false, "geen zichtbare CSV-knop meer");
  assert.deepEqual(fouten, [], "geen paginafouten");

  // ook de route via status: een tweede open app (zonder CSV-klik) ruimt de lijst op na een schermwissel
  const L2 = ses(await (await post("/api/praktijk/login", { email: "beheer@uitteam.test", wachtwoord: "beheer-uit-wachtwoord", praktijk: P })).json());
  const { link: link2 } = await (await post("/api/praktijk/team/uitnodigen", { email: "lies@uitteam.test", naam: "Lies", rol: "therapeut" }, L2)).json();
  const t2 = new URL(link2).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: t2, naam: "Lies", wachtwoord: "lies-uit-wachtwoord", regels: "1" })).status, 200, "Lies neemt aan");
  const LL = ses(await (await post("/api/praktijk/login", { email: "lies@uitteam.test", wachtwoord: "lies-uit-wachtwoord", praktijk: P })).json());
  const liesId = ((await (await get("/api/praktijk/team", L2)).json()).leden || []).find((l) => /lies/i.test(l.email || l.naam)).id;
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.6.39.8" } });
  await ctx2.addInitScript((t) => { try { if (!sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("gezet", "1"); } } catch {} }, LL["x-praktijk-sessie"]);
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => fouten.push(String(e)));
  await p2.goto(origin + "/v2/app");
  await p2.waitForSelector("[data-add]", { timeout: 15000 });
  await p2.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await p2.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await p2.click("#kaartenBtn");
  await tot(p2, () => /Henk/.test(document.getElementById("k_srv_lijst").textContent), "lijst Lies");
  assert.equal((await post("/api/praktijk/team/verwijder", { id: liesId, gedeeld: "uit" }, L2)).status, 200, "Lies uit het team");
  await wacht(2100);
  await p2.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await tot(p2, () => !/Henk/.test(document.getElementById("k_srv_lijst").textContent), "lijst Lies leeg na schermwissel");
  // Praktijk-scherm: geen beheerteksten alsof Lies alles mag (sweep 2026-11-19, Karin)
  await p2.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); const b = document.querySelector("#fpSchermen [data-scherm='praktijk']"); if (b) b.click(); });
  await tot(p2, () => !!document.getElementById("k_praktijk"), "praktijktegels");
  const tegels = await p2.evaluate(() => document.getElementById("k_praktijk").textContent);
  assert.doesNotMatch(tegels, /betalen en opzeggen\.|Collega\u2019s uitnodigen, rollen|Alles downloaden, of alles wissen/, "geen beheerteksten: " + tegels);
  assert.match(tegels, /Log eerst in/, "tegels zeggen: eerst inloggen");
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("uit team: ok (lijst en CSV weg zodra de collega uit het team is)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
