// Regressietest gebruikers-sweep 2026-11-14 22u en 2026-11-15 02u (Mark, iPad): een collega die op een nieuw apparaat
// inlogde met de praktijknaam in kleine letters ("fysio duinrand"), hield die kleine letters in het praktijkveld, de kop
// en op het A4, terwijl de server de naam geeft zoals de praktijk hem schreef. psIngelogd() gebruikte d.praktijk niet.
// Nu neemt de app de naam van de server over, maar alleen bij dezelfde naam op hoofdletters na (of een leeg veld).
// CI heeft geen Playwright: de serverstap en de statische controle draaien altijd, de browserstap alleen waar
// Playwright staat. `npm run test:praktijknaamlogin`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/index.html"), "utf8");
const blok = html.slice(html.indexOf("function psIngelogd("), html.indexOf("function prakSlotActie("));
assert.match(blok, /d\.praktijk/, "psIngelogd gebruikt de praktijknaam van de server");
assert.match(blok, /toLowerCase\(\)===eigenNaam\.toLowerCase\(\)/, "alleen bij dezelfde naam op hoofdletters na");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-praktijknaamlogin-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.66.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
let browser = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Duinrand", wachtwoord: "praktijk-wachtwoord", akkoord: true })).json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Mark Houder", email: "mark@duinrand.test", wachtwoord: "mark-wachtwoord", regels: true }, G)).json());
  const uitn = await (await post("/api/praktijk/team/uitnodigen", { email: "eva@duinrand.test", naam: "Eva", rol: "therapeut" }, S)).json();
  const token = new URL(uitn.link).searchParams.get("t");
  await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.66.1.1" },
    body: new URLSearchParams({ t: token, naam: "Eva", wachtwoord: "eva-wachtwoord", regels: "1" }).toString() });
  const d = await (await post("/api/praktijk/login", { praktijk: "fysio duinrand", email: "eva@duinrand.test", wachtwoord: "eva-wachtwoord" })).json();
  assert.equal(d.ok, true, "collega logt in met kleine letters");
  assert.equal(d.praktijk, "Fysio Duinrand", "server geeft de naam zoals de praktijk hem schreef");
  console.log("test-praktijknaam-login (server + statisch): ok");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-praktijknaam-login: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.66.2.1" } });
    // nieuw apparaat van Eva: alleen de praktijknaam, in kleine letters getikt
    await c.addInitScript(() => {
      if (sessionStorage.getItem("klaar")) return; sessionStorage.setItem("klaar", "1");
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "fysio duinrand" }));
      localStorage.setItem("fysiplan_welkom_gezien", "1");
    });
    const p = await c.newPage();
    const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
    await p.goto(origin + "/v2/app", { waitUntil: "load" });
    await p.waitForFunction(() => { const k = document.getElementById("ps_do"); return k && k.dataset.act === "login"; }, null, { timeout: 8000 });
    await p.evaluate(() => {
      document.getElementById("ps_email").value = "eva@duinrand.test";
      document.getElementById("ps_ww").value = "eva-wachtwoord";
      document.getElementById("ps_do").click();
    });
    await p.waitForFunction(() => document.documentElement.classList.contains("ps-in"), null, { timeout: 8000 });
    await p.waitForFunction(() => document.getElementById("praktijk").value === "Fysio Duinrand", null, { timeout: 5000 });
    const bewaard = await p.evaluate(() => JSON.parse(localStorage.getItem("fysiplan_settings")).praktijk);
    assert.equal(bewaard, "Fysio Duinrand", "de naam van de server wordt onthouden");
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => document.documentElement.classList.contains("ps-in"), null, { timeout: 8000 });
    assert.equal(await p.inputValue("#praktijk"), "Fysio Duinrand", "na herladen de naam van de praktijk");
    assert.deepEqual(fouten, [], "geen scriptfouten");
    console.log("test-praktijknaam-login (browser): ok");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
