// Gebruikers-sweep 2026-11-18 14u (Karin, beheerder, iPad): na een rolwissel liep de open app van de collega
// onbeperkt achter. Alleen de knop Kaarten haalde de rol opnieuw op; terug naar het tabblad, wisselen tussen
// Vandaag en Praktijk of Team openen deed niets. Een net gepromoveerde collega zag Gegevens dicht en geen
// Activiteit, een teruggezette beheerder hield Activiteit, logo en profiel open. Nu ververst de rol bij
// terugkeer naar het tabblad, bij elke schermwissel en zodra Team hem kent. Ook: een geweigerde
// profielwijziging liet het adres op de A4 staan als de praktijk nog geen profiel op de server had.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:rolwissel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /addEventListener\('visibilitychange',function\(\)\{if\(document\.visibilityState==='visible'\)verversRol\(\);\}\)/,
  "terug naar het tabblad haalt de rol opnieuw op");
assert.match(index, /if\(!ov\.classList\.contains\('on'\)\)document\.getElementById\('kaartenBtn'\)\.click\(\);\s*else verversRol\(\);/,
  "een schermwissel met open paneel haalt de rol opnieuw op");
assert.match(index, /if\(d\.ik\)rolBijwerken\(!!d\.beheer\);/, "Team werkt de rol bij");
assert.match(index, /if\(d\.beheer\)rolBijwerken\(false\);profielTerug/, "een 403 op het profiel zet de rol op therapeut");
assert.match(index, /else\{\['adres','plaats','tel','email','website','logo'\]\.forEach\(function\(k\)\{SET\[k\]='';\}\)/,
  "zonder profiel op de server blijft geen geweigerd adres staan");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("rolwissel: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-rolwissel-"));
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
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.27." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.28." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Rolwissel";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "rolwissel-wachtwoord", akkoord: true })).json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@rolwissel.nl", wachtwoord: "karin-rol-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login beheerder");
  const S = ses(await eigen.json());
  const { link } = await (await post("/api/praktijk/team/uitnodigen", { email: "bas@rolwissel.nl", naam: "Bas", rol: "therapeut" }, S)).json();
  const token = new URL(link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: token, naam: "Bas", wachtwoord: "bas-rol-wachtwoord", regels: "1" })).status, 200, "Bas neemt aan");
  const L = ses(await (await post("/api/praktijk/login", { email: "bas@rolwissel.nl", wachtwoord: "bas-rol-wachtwoord", praktijk: P })).json());
  assert.ok(L["x-praktijk-sessie"], "Bas logt in");
  const basId = ((await (await get("/api/praktijk/team", S)).json()).leden || []).find((l) => /bas/i.test(l.email || l.naam)).id;
  const zetRol = async (rol) => assert.equal((await post("/api/praktijk/team/rol", { id: basId, rol }, S)).status, 200, "rol " + rol);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.6.29.7" } });
  await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("gezet", "1"); } } catch {} }, L["x-praktijk-sessie"]);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#fpSchermen [data-scherm='praktijk']");
  await page.waitForSelector("#ps_team", { state: "visible", timeout: 8000 });
  await page.waitForSelector("#k_praktijk [data-kpt='gegevens']", { timeout: 8000 });
  const stand = () => page.evaluate(() => ({
    dicht: document.querySelector("#k_praktijk [data-kpt='gegevens']").getAttribute("aria-disabled") === "true",
    act: !!document.getElementById("ps_acttoon")
  }));
  const wachtOp = async (beheer, wat) => {
    for (let i = 0; i < 40; i++) { const s = await stand(); if (s.dicht === !beheer && s.act === beheer) return; await wacht(100); }
    assert.deepEqual(await stand(), { dicht: !beheer, act: beheer }, wat);
  };
  await wachtOp(false, "Bas begint als therapeut");

  // 1) promotie, Bas komt terug naar het tabblad
  await zetRol("beheerder");
  await wacht(2100);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await wachtOp(true, "na terugkeer naar het tabblad ziet Bas de beheerrechten");

  // 2) terug naar therapeut, Bas wisselt van scherm (Vandaag → Praktijk) zonder Kaarten
  await zetRol("therapeut");
  await wacht(2100);
  await page.click("#fpSchermen [data-scherm='vandaag']");
  await page.click("#fpSchermen [data-scherm='praktijk']");
  await wachtOp(false, "na een schermwissel is Gegevens weer dicht en Activiteit weg");

  // 3) weer beheerder, Bas opent Team (geen wachttijd: Team kent de rol zelf)
  await zetRol("beheerder");
  await page.click("#ps_team");
  await page.waitForSelector("#ovTeam.on [data-tmrol]", { state: "visible", timeout: 8000 });
  await page.evaluate(() => document.getElementById("ovTeam").classList.remove("on"));
  await wachtOp(true, "na Team openen volgen de tegels de rol");

  // 4) geweigerd adres blijft niet op de A4 als de praktijk nog geen profiel heeft
  await zetRol("therapeut");
  const geweigerd = page.waitForResponse((r) => r.url().endsWith("/api/praktijken") && r.request().method() === "POST", { timeout: 8000 });
  await page.evaluate(() => {
    const a = document.getElementById("p_adres"); a.value = "Teststraat 1";
    a.dispatchEvent(new Event("input", { bubbles: true })); a.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal((await geweigerd).status(), 403, "server weigert het profiel");
  const adres = () => page.evaluate(() => document.getElementById("p_adres").value);
  for (let i = 0; i < 40 && (await adres()); i++) await wacht(100);
  assert.equal(await adres(), "", "geweigerd adres is weg");
  await wachtOp(false, "de 403 zet de tegels terug op therapeut");

  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("rolwissel: ok (tabblad, schermwissel, Team en 403 werken de rol bij; geweigerd adres weg)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
