// De app in vier schermen (reviewlijst punt 14): Vandaag, Patiënten, Kaart maken en Praktijk.
// `npm run test:schermen`
//
// - de app opent op Kaart maken; wie Vandaag kiest, opent de volgende keer daar (seintjes en wie niet oefende)
// - Patiënten toont de kaarten van de praktijk, Praktijk het login- en accountblok en de tegels
// - "Openen" brengt de kaart in de editor (Kaart maken); zonder login opent de app daar ook
// - printen geeft altijd de kaart, op welk scherm je ook staat; V1 (de app op /) houdt één scherm
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /if\(window\.FYSIPLAN_V2\)\{\n    bouwZijbalk\(\);\n    bouwSchermen\(\);/, "alleen V2 krijgt de schermen");
assert.match(index, /function zetScherm\(naam\)\{\n    if\(!IS_V2\)return;/);

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-schermen-"));
const r0 = createServer(); await new Promise((r) => r0.listen(0, "127.0.0.1", r)); const port = r0.address().port; await new Promise((r) => r0.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
let app, uit = "";
const start = async () => {
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
};
const stop = async () => { if (app && app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };
let ip = 1;
const kop = (x = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++ & 255), ...x });
const post = (p, b, x) => fetch(origin + p, { method: "POST", headers: kop(x), body: JSON.stringify(b) });
let browser;
try {
  await start();
  const claim = await (await post("/api/praktijk/claim", { praktijk: "Fysio Scherm", wachtwoord: "scherm-wachtwoord-1", akkoord: true })).json();
  const A = { "x-praktijk-sessie": claim.sessie };
  const ids = {};
  for (const n of ["Truus", "Piet", "Fatima", "Jan", "Nieuw"]) {
    const r = await post("/api/kaarten", { praktijk: "Fysio Scherm", naam: n, client: { c_naam: n }, kaartId: "", chosen: [{ n: "Squat", i: 0 }] }, A);
    assert.equal(r.status, 200, uit.slice(-300));
    ids[n] = (await r.json()).id;
  }
  assert.equal((await post("/api/kaart/seintje", { id: ids.Truus, soort: "pijn" })).status, 200);
  assert.equal((await post("/api/kaart/seintje", { id: ids.Piet, soort: "vraag" })).status, 200);
  assert.equal((await post("/api/kaart/gedaan", { id: ids.Fatima, aan: true })).status, 200, "Fatima oefende vandaag");
  // vier kaarten zijn vijf dagen oud; "Nieuw" is net gemaakt en telt nog niet mee
  await stop();
  const kp = join(dataDir, "kaarten.json"); const k = JSON.parse(await readFile(kp, "utf8"));
  for (const m of Object.values(k)) for (const c of Object.values(m)) if (c.id !== ids.Nieuw) c.ts = Date.now() - 5 * 864e5;
  await writeFile(kp, JSON.stringify(k));
  await start();

  // CI heeft geen browser: dan alleen de regels en de server hierboven
  browserdeel: {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { console.log("test-schermen: geen Playwright, browserdeel overgeslagen"); break browserdeel; }
  browser = await chromium.launch();
  const maakCtx = async (sessie) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.1." + (ip++ & 255) } });
    await ctx.addInitScript(([s]) => { try {
      localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
      localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Scherm" }));
      if (s) localStorage.setItem("fp_praksessie", s);
    } catch {} }, [sessie]);
    return ctx;
  };
  const fouten = [];
  const p = await (await maakCtx(claim.sessie)).newPage();
  p.on("pageerror", (e) => fouten.push(String(e)));
  p.on("dialog", (d) => d.accept());
  await p.goto(origin + "/v2/app");
  await p.waitForSelector("#fpSchermen [data-scherm='vandaag']", { timeout: 15000 });
  await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute("data-scherm")), "maken", "eerste keer: Kaart maken");
  await p.click("#fpSchermen [data-scherm='vandaag']");
  await p.waitForFunction(() => document.documentElement.getAttribute("data-scherm") === "vandaag", null, { timeout: 5000 });
  // de volgende keer opent de app op het gekozen scherm
  await p.reload();
  await p.waitForFunction(() => document.documentElement.getAttribute("data-scherm") === "vandaag", null, { timeout: 15000 });
  await p.waitForSelector("#k_inbox .ib-item", { timeout: 8000 });
  await p.waitForSelector("#k_nietgeoefend .ib-item", { timeout: 8000 });
  assert.equal(await p.isVisible(".wrap"), false, "Vandaag: de editor staat uit beeld");
  assert.equal(await p.textContent("#ovKaarten .modal>h3"), "Vandaag");
  assert.equal(await p.locator("#k_inbox .ib-item").count(), 2, "twee seintjes");
  assert.equal(await p.textContent("#fs_tel"), "2", "het getal bij Vandaag");
  const niet = await p.locator("#k_nietgeoefend .ib-item b").allTextContents();
  assert.deepEqual(niet.sort(), ["Jan", "Piet", "Truus"], "niet geoefend: zonder Fatima (oefende) en zonder de nieuwe kaart: " + niet);
  assert.equal(await p.isVisible("#k_srv_lijst"), false, "Vandaag toont de kaartenlijst niet");
  assert.equal(await p.isVisible("#prakslot"), false, "ingelogd: het loginblok staat bij Praktijk");

  // printen geeft de kaart, ook vanaf Vandaag
  await p.emulateMedia({ media: "print" });
  assert.equal(await p.isVisible("#a4"), true, "de afdruk is de kaart");
  await p.emulateMedia({ media: "screen" });

  // Patiënten
  await p.click("#fpSchermen [data-scherm='patienten']");
  await p.waitForSelector("#k_srv_lijst [data-sopen]", { timeout: 8000 });
  assert.equal(await p.textContent("#ovKaarten .modal>h3"), "Patiënten");
  assert.equal(await p.locator("#k_srv_lijst [data-sopen]").count(), 5);
  assert.equal(await p.isVisible("#k_inbox"), false);
  assert.equal(await p.isVisible("#k_nietgeoefend"), false);
  assert.equal(await p.isVisible(".wrap"), false);

  // Praktijk
  await p.click("#fpSchermen [data-scherm='praktijk']");
  await p.waitForSelector("#k_praktijk .kp-tegel", { timeout: 5000 });
  assert.equal(await p.isVisible("#prakslot"), true, "Praktijk: login en account");
  assert.equal(await p.locator("#k_praktijk .kp-tegel").count(), 5);
  assert.equal(await p.isVisible("#k_srv_lijst"), false);
  assert.equal(await p.isVisible("#k_inbox"), false);
  await p.click("#k_praktijk [data-kp='team']");
  await p.waitForSelector("#ovTeam.on", { timeout: 5000 });
  await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => { if (o.id !== "ovKaarten") o.classList.remove("on"); }));

  // Vandaag → Openen: de kaart staat in de editor
  await p.click("#fpSchermen [data-scherm='vandaag']");
  await p.waitForSelector("#k_nietgeoefend [data-ngopen]", { timeout: 8000 });
  const welke = await p.getAttribute("#k_nietgeoefend [data-ngopen]", "data-ngopen");
  await p.click(`#k_nietgeoefend [data-ngopen='${welke}']`);
  await p.waitForFunction(() => document.documentElement.getAttribute("data-scherm") === "maken", null, { timeout: 8000 });
  assert.equal(await p.isVisible(".wrap"), true, "Kaart maken: de editor");
  assert.equal(await p.evaluate(() => document.getElementById("ovKaarten").classList.contains("on")), false);
  await p.waitForFunction(() => [...document.querySelectorAll("#mon .exh")].some((t) => t.textContent.trim()), null, { timeout: 8000 });
  assert.equal(await p.getAttribute("#fpSchermen [data-scherm='maken']", "aria-pressed"), "true");

  // de knop Kaarten in de editor opent nog steeds het zijpaneel
  await p.click("#kaartenBtn");
  await p.waitForSelector("#ovKaarten.on", { timeout: 5000 });
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute("data-scherm")), "maken");
  assert.equal(await p.isVisible(".wrap"), true);
  await p.click("#k_close");
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute("data-scherm")), "maken");

  // zonder login: de app opent op Kaart maken
  const q = await (await maakCtx("")).newPage();
  q.on("pageerror", (e) => fouten.push(String(e)));
  await q.goto(origin + "/v2/app");
  await q.waitForSelector("[data-add]", { timeout: 15000 });
  await q.waitForTimeout(1500);
  assert.equal(await q.evaluate(() => document.documentElement.getAttribute("data-scherm")), "maken", "zonder login: Kaart maken");
  assert.equal(await q.isVisible("#fpSchermen"), true);

  assert.deepEqual(fouten, [], "geen fouten");
  } // browserdeel
  console.log("test-schermen: ok (opent op Kaart maken en daarna op het gekozen scherm, Vandaag met seintjes en wie niet oefende, Patiënten, Praktijk, Openen naar de editor, printen geeft de kaart, zonder login Kaart maken)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  if (browser) await browser.close();
  await stop();
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
