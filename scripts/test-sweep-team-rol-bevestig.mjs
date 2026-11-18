// Gebruikers-sweep 2026-11-14 22u (Karin, beheerder, desktop): bij het openen van Team stond de focus op
// de rolkeuze van de eerste collega. Eén pijltoets omlaag wijzigde de keuze en die ging meteen naar
// /api/praktijk/team/rol: de collega was zonder bevestiging beheerder (download, WISSEN, teambeheer).
// Nu: het venster zet de eerste focus nooit op een keuzelijst, en een rolwissel vraagt eerst
// bevestiging; bij Annuleren springt de keuze terug en gaat er niets naar de server.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:teamrolbevestig`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /var oudeRol=sel\.value;\s*sel\.addEventListener\('change',function\(\)\{[\s\S]{0,500}if\(!confirm\(vraag\)\)\{sel\.value=oudeRol;return;\}/,
  "rolwissel vraagt bevestiging en zet terug bij Annuleren");
assert.doesNotMatch(index, /\/INPUT\|SELECT\|TEXTAREA\/\.test\(el\.tagName\)/, "eerste focus van een venster is geen keuzelijst");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("team rol bevestigen: ok (bron)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-teamrol-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.7." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.8." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Rolkeuze";

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "rolkeuze-wachtwoord", akkoord: true })).json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@rol.nl", wachtwoord: "karin-rol-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login beheerder");
  const S = ses(await eigen.json());
  const { link } = await (await post("/api/praktijk/team/uitnodigen", { email: "lisa@rol.nl", naam: "Lisa", rol: "therapeut" }, S)).json();
  const token = new URL(link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: token, naam: "Lisa", wachtwoord: "lisa-rol-wachtwoord", regels: "1" })).status, 200, "Lisa neemt aan");
  const rolLisa = async () => ((await (await get("/api/praktijk/team", S)).json()).leden || []).find((l) => /lisa/i.test(l.email || l.naam)).rol;
  assert.equal(await rolLisa(), "therapeut");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.6.9.7" } });
  await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("gezet", "1"); } } catch {} }, S["x-praktijk-sessie"]);
  const page = await ctx.newPage();
  const fouten = [], vragen = [];
  let rolPosts = 0, antwoord = false;
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => { vragen.push(d.message()); antwoord ? d.accept() : d.dismiss(); });
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/praktijk/team/rol")) rolPosts++; });
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await page.click("#kaartenBtn");
  await page.waitForSelector("#ps_team", { state: "visible", timeout: 8000 });
  await page.click("#ps_team");
  await page.waitForSelector("#ovTeam.on [data-tmrol]", { state: "visible", timeout: 8000 });
  await wacht(800);
  assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), "SELECT", "focus staat niet op de rolkeuze");

  // 1) Annuleren: niets naar de server, keuze terug op Therapeut
  await page.selectOption("#ovTeam [data-tmrol]", "beheerder");
  await wacht(500);
  assert.equal(vragen.length, 1, "één bevestigingsvraag");
  assert.match(vragen[0], /beheerder maken\?/, "de vraag noemt wat er gebeurt");
  assert.equal(rolPosts, 0, "geannuleerd: geen rolwissel naar de server");
  assert.equal(await page.inputValue("#ovTeam [data-tmrol]"), "therapeut", "keuze springt terug");
  assert.equal(await rolLisa(), "therapeut", "Lisa is nog therapeut");

  // 2) Bevestigen: wel naar de server
  antwoord = true;
  await page.selectOption("#ovTeam [data-tmrol]", "beheerder");
  for (let i = 0; i < 50 && (await rolLisa()) !== "beheerder"; i++) await wacht(100);
  assert.equal(rolPosts, 1, "bevestigd: één rolwissel");
  assert.equal(await rolLisa(), "beheerder", "Lisa is na bevestiging beheerder");
  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("team rol bevestigen: ok (geen focus op de rolkeuze, Annuleren laat de rol staan, bevestigen wisselt)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
