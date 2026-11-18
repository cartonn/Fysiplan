// Gebruikers-sweep 2026-11-16 10u.
// - Jayden (Pixel 7, Engelse kaart): de oefenmomenten-agenda heette "oefenmomenten.ics" en de download van My data
//   "fysiplan-mijn-gegevens.txt"; nu in de taal van de kaart. Een oude "lukte nu niet"-melding bleef staan naast de
//   uitleg dat je eerst een dag kiest.
// - Sanne (desktop): een lange kaartnaam zonder spaties liep in Kaarten over de knoppen en buiten het venster.
//   Na de CSV-export (knop staat even uit) viel de focus naar body.
// Broncontrole en serverdeel altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:naamenbestand`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.equal((index.match(/<div class='srv-naam' style='flex:1;min-width:120px;overflow-wrap:anywhere'><b>"\+esc\(c\.naam\)/g) || []).length, 2, "kaartnaam breekt af in Kaarten (actief en afgerond)");
assert.match(index, /xb\.disabled=false;xb\.textContent=xbTekst;if\(xbFocus&&document\.contains\(xb\)\)try\{xb\.focus\(\);\}catch\(e\)\{\}/, "focus terug op de CSV-knop");
assert.match(kaart, /a\.download=mgBestand\(mt\);/, "My data-bestand in de taal van de kaart");
assert.match(kaart, /var oudM=this\.parentNode\.querySelector\('\.agmelding'\);if\(oudM\)oudM\.remove\(\);alert\(tr\('agleeg'\)\)/, "oude agendamelding weg");
console.log("test-sweep-naam-en-bestand: bron OK");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-naambestand-"));
const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let uit = "";
app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.16." + (ip++ & 255), ...extra });
const post = (p, b, extra) => fetch(origin + p, { method: "POST", headers: kop(extra), body: JSON.stringify(b) });
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-naam-en-bestand: geen Playwright, browserdeel overgeslagen"); }
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const P = "Fysio Naam Bestand";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "naam-bestand-123", akkoord: true })).json()).sessie;
  assert.ok(sessie, uit.slice(-300));
  const S = { "x-praktijk-sessie": sessie };
  const lang = "Zeerlangenaamzonderspatieszodatdezedoorlooptoverdeknoppenheen1234567890";
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: lang, client: { c_naam: lang }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart bewaard");
  const naam = async (taal) => (await fetch(origin + "/api/kaart/agenda?id=" + id + "&dagen=MO&tijd=09:00" + (taal ? "&taal=" + taal : ""), { headers: kop() })).headers.get("content-disposition");
  assert.match(await naam("en"), /filename="exercise-reminders\.ics"/);
  assert.match(await naam("nl"), /filename="oefenmomenten\.ics"/);
  assert.match(await naam(""), /filename="oefenmomenten\.ics"/);
  assert.match(await naam("__proto__"), /filename="oefenmomenten\.ics"/);
  console.log("test-sweep-naam-en-bestand: server OK (agenda-bestand per taal)");

  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      // Jayden: My data en de agendamelding op een Engelse kaart
      const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], serviceWorkers: "block", acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.8.17.1" } });
      const p = await ctx.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(String(e)));
      p.on("dialog", (d) => d.accept());
      await p.goto(origin + "/k/" + id + "?taal=en");
      await p.waitForSelector("#agbtn", { state: "attached", timeout: 15000 });
      const dlNaam = await p.evaluate(() => new Promise((res) => {
        const orig = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (this.download) { HTMLAnchorElement.prototype.click = orig; res(this.download); return; } return orig.call(this); };
        const k = [...document.querySelectorAll("button,a")].find((b) => /Download my data/i.test(b.textContent));
        if (!k) res("geen knop"); else k.click();
        setTimeout(() => res("geen download"), 4000);
      }));
      assert.equal(dlNaam, "fysiplan-my-data.txt");
      await p.evaluate(() => { const d = document.querySelector("details:has(#agdagen)"); if (d) d.open = true; });
      await p.evaluate(() => { const m = document.createElement("p"); m.className = "agmelding"; m.textContent = "That did not work right now"; document.getElementById("agbtn").parentNode.appendChild(m); });
      await p.evaluate(() => document.querySelectorAll("#agdagen button.aan").forEach((b) => b.click()));
      await p.evaluate(() => document.getElementById("agbtn").click());
      assert.equal(await p.evaluate(() => document.getElementById("agbtn").parentNode.querySelectorAll(".agmelding").length), 0, "oude melding weg");
      assert.deepEqual(fouten, [], "geen paginafouten op /k");

      // Sanne: lange naam in Kaarten en focus na CSV
      const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", acceptDownloads: true, extraHTTPHeaders: { "x-forwarded-for": "10.8.17.2" } });
      await d.addInitScript(([s, pr]) => { try {
        localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
        localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: pr })); localStorage.setItem("fp_praksessie", s);
      } catch {} }, [sessie, P]);
      const q = await d.newPage();
      q.on("pageerror", (e) => fouten.push(String(e)));
      await q.goto(origin + "/v2/app");
      await q.waitForSelector("[data-add]", { timeout: 15000 });
      await q.waitForTimeout(600);
      await q.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
      await q.click("#kaartenBtn");
      await q.waitForSelector(`[data-sdeel='${id}']`, { state: "visible", timeout: 8000 });
      const maat = await q.evaluate((kid) => {
        const knop = document.querySelector(`[data-sdeel='${kid}']`);
        const rij = knop.parentNode; const naamEl = rij.querySelector(".srv-naam b");
        const m = document.querySelector("#ovKaarten .modal");
        const n = naamEl.getBoundingClientRect(), r = rij.getBoundingClientRect();
        return { naamRechts: n.right, rijRechts: r.right, scroll: m.scrollWidth - m.clientWidth };
      }, id);
      assert.ok(maat.naamRechts <= maat.rijRechts + 1, "naam blijft binnen de rij: " + JSON.stringify(maat));
      assert.ok(maat.scroll <= 1, "venster scrolt niet horizontaal: " + JSON.stringify(maat));
      await q.focus("#k_srv_csv");
      const dl = q.waitForEvent("download", { timeout: 8000 });
      await q.keyboard.press("Enter");
      await dl;
      await q.waitForFunction(() => !document.getElementById("k_srv_csv").disabled, null, { timeout: 5000 });
      assert.equal(await q.evaluate(() => document.activeElement && document.activeElement.id), "k_srv_csv", "focus terug op de CSV-knop");
      assert.deepEqual(fouten, [], "geen paginafouten");
      console.log("test-sweep-naam-en-bestand: browser OK (My data en agenda-melding EN, lange naam in Kaarten, focus na CSV)");
    } finally { await browser.close(); }
  }
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
console.log("test-sweep-naam-en-bestand: OK");
