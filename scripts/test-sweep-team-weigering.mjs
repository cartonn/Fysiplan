// Gebruikers-sweep 2026-11-16 06u (Karin, beheerder, desktop): een tweede beheerder zette Karin op therapeut terwijl
// zij Team open had. Haar volgende klik (collega verwijderen, rol wijzigen) werd door de server netjes geweigerd
// (403), maar de zin verdween meteen: Team werd opnieuw getekend en wiste de melding. Daarna stond de focus op body.
// Nu tekent Team eerst opnieuw en toont daarna de weigering, en houdt het opnieuw tekenen de focus in het venster.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:teamweigering`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.doesNotMatch(index, /msg\(r\.fout\|\|'Dat lukte niet\.'\);laadTeam\(\);/, "weigering niet vóór het opnieuw tekenen tonen");
assert.match(index, /laadTeam\(function\(\)\{if\(!r\.ok\)msg\(r\.fout\|\|'Dat lukte niet\.'\);\}\);/, "weigering na het opnieuw tekenen");
assert.match(index, /el\.innerHTML=h;\s*if\(fWas\)/, "Team zet de focus terug na opnieuw tekenen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("team weigering: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-teamweiger-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.17." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.18." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Teamweigering";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "rolkeuze-wachtwoord", akkoord: true })).json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@weiger.nl", wachtwoord: "karin-rol-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login beheerder");
  const S = ses(await eigen.json());
  const { link } = await (await post("/api/praktijk/team/uitnodigen", { email: "lisa@weiger.nl", naam: "Lisa", rol: "therapeut" }, S)).json();
  const token = new URL(link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: token, naam: "Lisa", wachtwoord: "lisa-rol-wachtwoord", regels: "1" })).status, 200, "Lisa neemt aan");
  const rolLisa = async () => ((await (await get("/api/praktijk/team", S)).json()).leden || []).find((l) => /lisa/i.test(l.email || l.naam)).rol;
  assert.equal(await rolLisa(), "therapeut");

  // Lisa wordt (met bevestiging van Karin, via de API) tweede beheerder
  assert.equal((await post("/api/praktijk/team/rol", { id: ((await (await get("/api/praktijk/team", S)).json()).leden || []).find((l) => /lisa/i.test(l.email || l.naam)).id, rol: "beheerder" }, S)).status, 200);
  assert.equal(await rolLisa(), "beheerder");
  const L = ses(await (await post("/api/praktijk/login", { email: "lisa@weiger.nl", wachtwoord: "lisa-rol-wachtwoord", praktijk: P })).json());
  assert.ok(L["x-praktijk-sessie"], "Lisa logt in");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.6.19.7" } });
  await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("gezet", "1"); } } catch {} }, S["x-praktijk-sessie"]);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector("#ps_team", { state: "visible", timeout: 8000 });
  await page.click("#ps_team");
  await page.waitForSelector("#ovTeam.on [data-tmweg]", { state: "visible", timeout: 8000 });
  await wacht(500);

  // Lisa zet Karin op therapeut terwijl Karin Team open heeft
  const karinId = ((await (await get("/api/praktijk/team", L)).json()).leden || []).find((l) => /karin/i.test(l.email || l.naam)).id;
  assert.equal((await post("/api/praktijk/team/rol", { id: karinId, rol: "therapeut" }, L)).status, 200, "Lisa maakt Karin therapeut");

  // Karin wil Lisa verwijderen: tweemaal met de toets (bevestiging na een pauze)
  await page.focus("#ovTeam [data-tmweg]");
  await page.keyboard.press("Enter");
  await wacht(900);
  const antw = page.waitForResponse((r) => r.url().includes("/api/praktijk/team/verwijder"));
  await page.keyboard.press("Enter");
  assert.equal((await antw).status(), 403, "server weigert");
  await page.waitForFunction(() => (document.getElementById("tm_msg") || {}).textContent, null, { timeout: 5000 }).catch(() => {});
  await wacht(600);
  const msg = await page.evaluate(() => (document.getElementById("tm_msg") || {}).textContent || "");
  assert.ok(msg.trim().length > 10, "de weigering blijft zichtbaar staan, was: '" + msg + "'");
  assert.notEqual(await page.evaluate(() => document.activeElement === document.body), true, "focus niet op body na opnieuw tekenen");
  assert.equal(await page.evaluate(() => document.getElementById("ovTeam").contains(document.activeElement)), true, "focus blijft in Team");
  assert.equal(await rolLisa(), "beheerder", "Lisa is er nog");
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("team weigering: ok (weigering blijft staan na opnieuw tekenen, focus blijft in Team)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
