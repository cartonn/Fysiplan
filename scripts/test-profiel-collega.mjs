// Regressietest gebruikers-sweep 2026-11-11 14u (Karin, beheerder, desktop): een collega die op een nieuw
// apparaat inlogde, kreeg adres, telefoon en logo van de praktijk nooit op de kaart. loadPraktijken() vroeg
// /api/praktijken op zonder praktijksessie, en de server geeft een v2-praktijk alleen met sessie het eigen
// profiel. Nu met de sessie, opnieuw na het inloggen, en lege velden worden aangevuld uit het profiel.
// CI heeft geen Playwright: de serverstap en de statische controle draaien altijd, de browserstap alleen waar
// Playwright staat. `npm run test:profielcollega`
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
assert.match(html, /fetch\('api\/praktijken',PGET\(\)\)/, "praktijkprofiel wordt met de praktijksessie opgehaald");
assert.match(html, /renderPrakSelect\(\);vulUitProfiel\(\);/, "lege velden worden uit het profiel aangevuld");
assert.match(html, /if\(t&&typeof window\.fpLaadPraktijken==='function'\)window\.fpLaadPraktijken\(\);/, "na inloggen wordt het profiel opgehaald");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-profielcollega-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.65.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
let browser = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Collega", wachtwoord: "praktijk-wachtwoord", akkoord: true })).json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@collega.nl", wachtwoord: "karin-wachtwoord", regels: true }, G)).json());
  const profiel = { praktijk: "Fysio Collega", adres: "Dorpsstraat 7", plaats: "Zeist", tel: "030-7654321", email: "info@collega.nl", website: "https://collega.nl" };
  assert.equal((await post("/api/praktijken", profiel, S)).status, 200, "beheerder bewaart het profiel");
  const uitn = await (await post("/api/praktijk/team/uitnodigen", { email: "joost@collega.nl", naam: "Joost", rol: "therapeut" }, S)).json();
  const token = new URL(uitn.link).searchParams.get("t");
  await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.65.1.1" },
    body: new URLSearchParams({ t: token, naam: "Joost", wachtwoord: "joost-wachtwoord", regels: "1" }).toString() });
  const J = ses(await (await post("/api/praktijk/login", { email: "joost@collega.nl", wachtwoord: "joost-wachtwoord" })).json());
  // server: met sessie het eigen profiel, zonder sessie niets (zo blijft het)
  assert.deepEqual(await (await get("/api/praktijken")).json(), [], "zonder sessie geen profielen");
  const metJ = await (await get("/api/praktijken", J)).json();
  assert.equal(metJ.length, 1); assert.equal(metJ[0].adres, "Dorpsstraat 7", "collega krijgt met sessie het eigen profiel");
  console.log("test-profiel-collega (server + statisch): ok");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-profiel-collega: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.65.2.1" } });
    // nieuw apparaat van Joost: alleen praktijknaam en sessie, en een eigen telefoonnummer dat hij al intikte
    await c.addInitScript(([s]) => {
      if (sessionStorage.getItem("klaar")) return; sessionStorage.setItem("klaar", "1");
      localStorage.setItem("fp_praksessie", s);
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Collega", tel: "06-11112222" }));
      localStorage.setItem("fysiplan_welkom_gezien", "1");
    }, [J["x-praktijk-sessie"]]);
    const p = await c.newPage();
    const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
    await p.goto(origin + "/v2/app", { waitUntil: "networkidle" });
    await p.waitForFunction(() => (document.getElementById("p_adres") || {}).value === "Dorpsstraat 7", null, { timeout: 8000 });
    assert.equal(await p.inputValue("#p_plaats"), "Zeist", "plaats uit het profiel");
    assert.equal(await p.inputValue("#p_tel"), "06-11112222", "wat al op dit apparaat stond blijft staan");
    await p.reload({ waitUntil: "networkidle" });
    assert.equal(await p.inputValue("#p_adres"), "Dorpsstraat 7", "na herladen bewaard");
    assert.deepEqual(fouten, [], "geen scriptfouten");
    console.log("test-profiel-collega (browser): ok");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
