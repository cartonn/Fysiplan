// Regressietest gebruikers-sweep 2026-11-12 14u (Karin en Mark, desktop en iPad; open sinds 2026-11-11 22u): een collega met rol
// therapeut wijzigde het praktijktelefoonnummer op de A4. De server weigerde terecht (403, alleen een beheerder), maar het scherm
// zweeg en het nummer bleef in fysiplan_settings staan, dus zijn geprinte kaart toonde een nummer dat de patiënt op /k niet ziet.
// Nu: een melding bij de velden, de kaart zet het profiel van de praktijk terug, en een therapeut ziet geen logoknop.
// Zelfde run (Karin): een dubbelklik op × in Team verwijderde een collega zonder echte bevestiging.
// CI heeft geen Playwright: de serverstap en de statische controle draaien altijd, de browserstap alleen waar Playwright staat.
// `npm run test:profieltherapeut`
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
assert.match(html, /if\(d\.beheer(\|\|d\.website)?\)\{profielTerug\(d\.fout\);return;\}/, "een 403 van het praktijkprofiel wordt afgehandeld");
assert.match(html, /PRAKSLOT\.akkoord\.beheer===false/, "de logoknop kijkt naar de rol");
assert.match(html, /if\(Date\.now\(\)-Number\(btn\.dataset\.zekerT\|\|0\)<700\)return;/, "bevestiging van verwijderen telt pas na een pauze");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-profieltherapeut-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.66.0." + (ip++), ...extra });
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
  await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.66.1.1" },
    body: new URLSearchParams({ t: token, naam: "Joost", wachtwoord: "joost-wachtwoord", regels: "1" }).toString() });
  const J = ses(await (await post("/api/praktijk/login", { email: "joost@collega.nl", wachtwoord: "joost-wachtwoord" })).json());
  // server: een therapeut die het nummer wijzigt krijgt 403 met beheer:true en een zin; het profiel blijft
  const weiger = await post("/api/praktijken", { ...profiel, tel: "06-99999999" }, J);
  assert.equal(weiger.status, 403, "therapeut mag het profiel niet wijzigen");
  const wd = await weiger.json();
  assert.equal(wd.beheer, true); assert.match(wd.fout, /beheerder/);
  assert.equal((await (await get("/api/praktijken", J)).json())[0].tel, "030-7654321", "profiel ongewijzigd");
  console.log("test-profiel-therapeut (server + statisch): ok");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-profiel-collega: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const nieuw = async (s, n) => {
      const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.66.2." + n } });
      await c.addInitScript(([s]) => {
        if (sessionStorage.getItem("klaar")) return; sessionStorage.setItem("klaar", "1");
        localStorage.setItem("fp_praksessie", s);
        localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Collega" }));
        localStorage.setItem("fysiplan_welkom_gezien", "1");
      }, [s]);
      const p = await c.newPage();
      p.fouten = []; p.on("pageerror", (e) => p.fouten.push(e.message));
      await p.goto(origin + "/v2/app", { waitUntil: "networkidle" });
      for (let i = 0; i < 80 && (await p.inputValue("#p_tel")) !== "030-7654321"; i++) await wacht(100);
      assert.equal(await p.inputValue("#p_tel"), "030-7654321", "profiel staat op de kaart");
      return p;
    };
    const p = await nieuw(J["x-praktijk-sessie"], 1);
    // logoknop: niet voor een therapeut (status komt na het laden)
    let zicht = true;
    for (let i = 0; i < 60 && (zicht = await p.isVisible("#logoBtn")); i++) await wacht(100);
    assert.equal(zicht, false, "therapeut ziet geen knop om het logo te wijzigen");
    await p.fill("#p_tel", "06-99999999");
    await p.press("#p_tel", "Tab");
    let terug = "";
    for (let i = 0; i < 80 && (terug = await p.inputValue("#p_tel")) !== "030-7654321"; i++) await wacht(100);
    assert.equal(terug, "030-7654321", "geweigerd nummer wordt teruggezet");
    const msg = await p.textContent("#p_msg");
    assert.match(msg, /Alleen een beheerder/, "melding zegt wie het wel mag");
    assert.ok(await p.isVisible("#p_msg"), "melding is zichtbaar");
    const fs = parseFloat(await p.$eval("#p_msg", (e) => getComputedStyle(e).fontSize));
    assert.ok(fs >= 12, "melding is leesbaar (" + fs + " px)");
    const lokaal = JSON.parse(await p.evaluate(() => localStorage.getItem("fysiplan_settings")));
    assert.equal(lokaal.tel, "030-7654321", "het geweigerde nummer blijft niet op dit apparaat staan");
    await p.reload({ waitUntil: "networkidle" });
    assert.equal(await p.inputValue("#p_tel"), "030-7654321", "na herladen het nummer van de praktijk");
    assert.deepEqual(p.fouten, [], "geen scriptfouten (therapeut)");
    // gedeeld praktijkwachtwoord uit (zoals elke nieuwe praktijk sinds #222): verwijderen gaat dan direct
    assert.equal((await post("/api/praktijk/team/gedeeld-uit", { uit: true }, S)).status, 200, "gedeeld wachtwoord uit");
    // de beheerder ziet de logoknop wel
    const b = await nieuw(S["x-praktijk-sessie"], 2);
    let bz = false;
    for (let i = 0; i < 60 && !(bz = await b.isVisible("#logoBtn")); i++) await wacht(100);
    assert.equal(bz, true, "beheerder ziet de logoknop");
    // Team: een dubbelklik op × verwijdert de collega niet meer meteen (gebruikers-sweep 2026-11-12 14u, Karin)
    await b.click("#kaartenBtn");
    await b.waitForSelector("#ps_team", { state: "visible", timeout: 8000 });
    await b.evaluate(() => document.getElementById("ps_team").click());
    await b.waitForSelector("[data-tmweg]", { timeout: 8000 });
    assert.match(await b.getAttribute("[data-tmweg]", "aria-label"), /Joost verwijderen/, "knop noemt wie er weg gaat");
    await b.dblclick("[data-tmweg]");
    await wacht(900);
    const team1 = await (await get("/api/praktijk/team", S)).json();
    assert.ok(team1.leden.some((l) => l.email === "joost@collega.nl"), "dubbelklik verwijdert de collega niet");
    assert.equal(await b.textContent("[data-tmweg]"), "Zeker verwijderen?", "knop vraagt om bevestiging");
    await b.click("[data-tmweg]");
    // deze praktijk heeft nog het gedeelde praktijkwachtwoord: dan kiest de beheerder eerst bewust
    try { await b.waitForSelector("[data-tmkeus='laten']", { timeout: 3000 }); await b.click("[data-tmkeus='laten']"); } catch {}
    let weg = false;
    for (let i = 0; i < 60 && !weg; i++) { await wacht(100); weg = !(await (await get("/api/praktijk/team", S)).json()).leden.some((l) => l.email === "joost@collega.nl"); }
    assert.ok(weg, "een bewuste tweede klik verwijdert de collega wel");
    assert.deepEqual(b.fouten, [], "geen scriptfouten (beheerder)");
    console.log("test-profiel-therapeut (browser): ok");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
