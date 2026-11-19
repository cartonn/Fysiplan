// Regressietest gebruikers-sweep 2026-11-19 18u (Karin, beheerder, desktop + iPad): een tweede apparaat dat al open
// stond vóór de praktijk een profiel had, wijzigde de telefoon en er gebeurde niets: upsertPraktijk stopte stil
// bij een leeg adres. De print op dat apparaat toonde het nieuwe nummer, /k het oude. Nu haalt de app eerst het
// serverprofiel op en vult de lege velden aan; heeft de server nog geen adres, dan zegt de app wat ontbreekt.
// CI heeft geen Playwright: de statische controle en de serverstap draaien altijd, de browserstap alleen waar Playwright staat.
// `npm run test:profielleegadres`
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
const fn = (html.match(/function upsertPraktijk\(\)\{[\s\S]*?\n  \}/) || [""])[0];
assert.ok(fn, "upsertPraktijk bestaat");
assert.doesNotMatch(fn, /!p\.adres\.trim\(\)\)return;/, "een leeg adres stopt niet meer stil");
assert.match(fn, /fetch\('api\/praktijken',PGET\(\)\)/, "bij een leeg adres eerst het serverprofiel ophalen");
assert.match(fn, /profielMelding\('Vul ook het adres/, "zonder adres op de server zeggen wat ontbreekt");
assert.match(html, /function profielMelding\(tekst\)\{/, "één meldregel onder het profiel");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-profielleeg-"));
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
const bewaar = (c) => { uit = (uit + c).slice(-4000); };
app.stdout.on("data", bewaar);
app.stderr.on("data", bewaar);
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.67.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
let browser = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Leeg", wachtwoord: "praktijk-wachtwoord", akkoord: true })).json());
  const K = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@leeg.nl", wachtwoord: "karin-wachtwoord", regels: true }, G)).json());
  assert.ok(K["x-praktijk-sessie"], "beheerder heeft een sessie");
  assert.equal((await (await get("/api/praktijken", K)).json()).length, 0, "nog geen profiel op de server");
  console.log("test-profiel-leeg-adres (statisch + server): ok");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-profiel-leeg-adres: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const fouten = [];
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.67.2.1" } });
    await c.addInitScript((s) => {
      if (sessionStorage.getItem("klaar")) return; sessionStorage.setItem("klaar", "1");
      localStorage.setItem("fp_praksessie", s);
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Leeg" }));
      localStorage.setItem("fysiplan_welkom_gezien", "1");
    }, K["x-praktijk-sessie"]);
    const B = await c.newPage();
    B.on("pageerror", (e) => fouten.push(e.message));
    await B.goto(origin + "/v2/app", { waitUntil: "load" });
    await wacht(800);
    const melding = () => B.evaluate(() => { const m = document.getElementById("p_msg"); return m && m.style.display !== "none" ? m.textContent : ""; });

    // 1. nog geen profiel op de server: telefoon invullen zonder adres -> zichtbare melding
    await B.fill("#p_tel", "030-1111111");
    await B.press("#p_tel", "Tab");
    let m = "";
    for (let i = 0; i < 60 && !m; i++) { m = await melding(); if (!m) await wacht(100); }
    assert.match(m, /Vul ook het adres/, "zonder adres zegt de app wat ontbreekt");

    // 2. intussen bewaart de desktop het profiel; de iPad (niet herladen) wijzigt de telefoon
    assert.equal((await post("/api/praktijken", { praktijk: "Fysio Leeg", adres: "Deskstraat 1", plaats: "Breda", tel: "030-2222222", email: "", website: "" }, K)).status, 200);
    await B.fill("#p_tel", "030-5555555");
    await B.press("#p_tel", "Tab");
    let srv = null;
    for (let i = 0; i < 80; i++) { srv = (await (await get("/api/praktijken", K)).json())[0]; if (srv && srv.tel === "030-5555555") break; await wacht(100); }
    assert.equal(srv.tel, "030-5555555", "telefoon van het tweede apparaat is bewaard");
    assert.equal(srv.adres, "Deskstraat 1", "adres van de desktop blijft staan");
    assert.equal(srv.plaats, "Breda", "plaats van de desktop blijft staan");
    for (let i = 0; i < 40 && (await B.inputValue("#p_adres")) !== "Deskstraat 1"; i++) await wacht(100);
    assert.equal(await B.inputValue("#p_adres"), "Deskstraat 1", "tweede apparaat toont nu het adres van de server");
    assert.equal(await melding(), "", "de melding is weg");
    // de patiëntkaart krijgt hetzelfde profiel als de print
    assert.deepEqual(fouten, [], "geen scriptfouten");
    console.log("test-profiel-leeg-adres (browser): ok");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
