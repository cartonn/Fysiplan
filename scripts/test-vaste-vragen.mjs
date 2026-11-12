// Vaste vragen per oefening in plaats van de vraaghulp (reviewlijst punt 13). `npm run test:vastevragen`
//
// 1. de regels (lib/vaste-vragen.js): standaardvragen in negen talen, controle op invoer, opslag
// 2. de echte server: alleen de eigen praktijk leest en schrijft haar vragen; de kaart krijgt de
//    standaardvragen en de eigen vragen van de oefeningen op die kaart, niet die van een andere
//    praktijk; "Alles wissen" en de download nemen ze mee
// 3. de kaart in de browser: de vragen staan op de kaart, de eigen vraag bij de oefening, in een
//    andere taal met de melding dat de praktijk hem in het Nederlands schreef
// 4. de app: het vraagtekentje bij een oefening opent het venster, bewaren werkt
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vv from "../lib/vaste-vragen.js";

const TALEN = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];

// ---- 1. de regels ----
{
  assert.ok(vv.STANDAARD.length >= 3 && vv.STANDAARD.length <= 6, "een paar standaardvragen");
  for (const s of vv.STANDAARD) for (const t of TALEN) {
    assert.ok(s.v[t] && s.v[t].length > 5, s.id + " vraag in " + t);
    assert.ok(s.a[t] && s.a[t].length > 20, s.id + " antwoord in " + t);
  }
  // geen getallen of dosering in de standaardantwoorden: dat bepaalt de fysiotherapeut
  for (const s of vv.STANDAARD) assert.doesNotMatch(s.a.nl, /\d/, s.id + ": geen getallen");
  assert.equal(vv.standaardIn("xx")[0].v, vv.STANDAARD[0].v.nl, "onbekende taal: Nederlands");

  assert.equal(vv.controleer("x").ok, false);
  assert.equal(vv.controleer([{ v: "Mag dit staand?", a: "" }]).ok, false, "geen antwoord");
  assert.equal(vv.controleer([{ v: "?", a: "Ja hoor." }]).ok, false, "te korte vraag");
  assert.equal(vv.controleer(Array.from({ length: 6 }, (_, i) => ({ v: "Vraag " + i, a: "Antwoord" }))).ok, false, "te veel");
  assert.equal(vv.controleer([{ v: "Mag dit staand?", a: "Ja." }, { v: "mag dit staand?", a: "Nee." }]).ok, false, "dubbel");
  const c = vv.controleer([{ v: "  Mag dit   staand?\u0007 ", a: "Ja, met\n\n  steun." }, { v: "", a: "" }, { v: "x".repeat(300), a: "y".repeat(900) }]);
  assert.equal(c.ok, true);
  assert.deepEqual(c.vragen[0], { v: "Mag dit staand?", a: "Ja, met\nsteun." }, "opgeschoond; lege regel overgeslagen");
  assert.equal(c.vragen[1].v.length, vv.MAX_VRAAG); assert.equal(c.vragen[1].a.length, vv.MAX_ANTWOORD);

  const o = {};
  assert.equal(vv.zet(o, "p1", " Squat ", [{ v: "Mag dit staand?", a: "Ja." }], "lid1", 1000), true);
  assert.deepEqual(o, { p1: { Squat: [{ v: "Mag dit staand?", a: "Ja.", t: 1000, door: "lid1" }] } });
  vv.zet(o, "p1", "Squat", [{ v: "Mag dit staand?", a: "Ja." }, { v: "Met schoenen?", a: "Mag." }], "lid2", 2000);
  assert.equal(o.p1.Squat[0].door, "lid1", "ongewijzigde vraag houdt maker en tijd");
  assert.equal(o.p1.Squat[1].door, "lid2");
  assert.deepEqual(vv.voorKaart(o, "p1", ["Squat", "Brug"]), { Squat: [{ v: "Mag dit staand?", a: "Ja." }, { v: "Met schoenen?", a: "Mag." }] }, "alleen vraag en antwoord");
  assert.deepEqual(vv.voorKaart(o, "p2", ["Squat"]), {}, "niet van een andere praktijk");
  assert.deepEqual(vv.voorKaart(o, "p1", ["__proto__", "constructor"]), {});
  vv.zet(o, "p1", "Squat", [], "lid1");
  assert.deepEqual(o, {}, "leeg = weg");
}

// ---- 2. de echte server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vastevragen-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$|DATABASE)/.test(k)) delete env[k];
let uit = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
let browser;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const claimA = await (await post("/api/praktijk/claim", { praktijk: "Fysio Vraag", wachtwoord: "vraag-wachtwoord-1", akkoord: true })).json();
  const A = ses(claimA);
  const B = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Buren", wachtwoord: "buren-wachtwoord-1", akkoord: true })).json());
  const PA = { praktijk: "Fysio Vraag" };

  // zonder login: niets
  let r = await get("/api/praktijk/vragen?praktijk=" + encodeURIComponent("Fysio Vraag"));
  assert.equal(r.status, 401, "lezen zonder login");
  r = await post("/api/praktijk/vragen", { ...PA, oef: "Squat", vragen: [{ v: "Mag dit staand?", a: "Ja." }] });
  assert.equal(r.status, 401, "schrijven zonder login");
  // met de login van een andere praktijk komt het bij die praktijk terecht, nooit bij deze
  r = await post("/api/praktijk/vragen", { ...PA, oef: "Squat", vragen: [{ v: "Mag dit staand?", a: "Ja." }] }, B);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys((await (await get("/api/praktijk/vragen?praktijk=" + encodeURIComponent("Fysio Buren"), B)).json()).eigen), ["Squat"]);
  assert.equal((await post("/api/praktijk/vragen", { praktijk: "Fysio Buren", oef: "Squat", vragen: [] }, B)).status, 200);

  r = await get("/api/praktijk/vragen?praktijk=" + encodeURIComponent("Fysio Vraag"), A);
  let d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.standaard.length, vv.STANDAARD.length);
  assert.deepEqual(d.eigen, {}, "niets van de buren");

  r = await post("/api/praktijk/vragen", { ...PA, oef: "Squat", vragen: [{ v: "Mag ik dit ook met een stoel achter me doen?", a: "Ja, zet een stoel achter je als steun." }] }, A);
  d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.eigen.Squat[0].v, "Mag ik dit ook met een stoel achter me doen?");
  r = await post("/api/praktijk/vragen", { ...PA, oef: "Squat", vragen: [{ v: "Mag dit?", a: "" }] }, A);
  assert.equal(r.status, 400, "zonder antwoord geweigerd");
  r = await post("/api/praktijk/vragen", { ...PA, oef: "", vragen: [] }, A);
  assert.equal(r.status, 400, "zonder oefening geweigerd");
  r = await post("/api/praktijk/vragen", { ...PA, oef: "Brug", vragen: [{ v: "Hoe hoog?", a: "Zo hoog als prettig is." }] }, A);
  assert.equal(r.status, 200);
  r = await post("/api/praktijk/vragen", { ...PA, oef: "Brug", vragen: [] }, A);
  assert.deepEqual(Object.keys((await r.json()).eigen), ["Squat"], "lege lijst haalt de oefening weg");
  const opgeslagen = JSON.parse(await readFile(join(dataDir, "vaste-vragen.json"), "utf8"));
  assert.equal(Object.keys(opgeslagen).length, 1, "op schijf bewaard");

  // de kaart van de patiënt
  r = await post("/api/kaarten", { praktijk: "Fysio Vraag", naam: "Truus", client: { c_naam: "Truus" }, kaartId: "", chosen: [{ n: "Squat", i: 0 }, { n: "Lunge", i: 0 }] }, A);
  assert.equal(r.status, 200, "kaart: " + uit.slice(-300));
  const kaartId = (await r.json()).id;
  r = await post("/api/kaarten", { praktijk: "Fysio Buren", naam: "Piet", client: { c_naam: "Piet" }, kaartId: "", chosen: [{ n: "Squat", i: 0 }] }, B);
  const burenId = (await r.json()).id;
  const k = (await (await get("/api/kaart?id=" + kaartId)).json()).kaart;
  assert.equal(k.vasteVragen.standaard.length, vv.STANDAARD.length, "standaardvragen in alle talen");
  assert.ok(TALEN.every((t) => k.vasteVragen.standaard[0].v[t]));
  assert.deepEqual(k.vasteVragen.eigen, { Squat: [{ v: "Mag ik dit ook met een stoel achter me doen?", a: "Ja, zet een stoel achter je als steun." }] }, "alleen vraag en antwoord, alleen deze oefeningen");
  assert.doesNotMatch(JSON.stringify(k.vasteVragen.eigen), /"door"|"t":/, "geen maker of tijd naar de patiënt");
  const kb = (await (await get("/api/kaart?id=" + burenId)).json()).kaart;
  assert.deepEqual(kb.vasteVragen.eigen, {}, "de buren zien de vragen van een andere praktijk niet");

  // de download van de praktijk neemt ze mee
  const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.5.100." + (ip++ & 255) }, body: new URLSearchParams(velden).toString() });
  r = await formulier("/v2/gegevens/download", { praktijk: "Fysio Vraag", wachtwoord: "vraag-wachtwoord-1" });
  assert.equal(r.status, 200, "download");
  assert.equal(JSON.parse(await r.text()).vasteVragen.Squat[0].a, "Ja, zet een stoel achter je als steun.", "download neemt de vragen mee");

  // de praktijk ziet de wijziging in haar activiteit
  const act = await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent("Fysio Vraag"), A)).text();
  assert.match(act, /vragen-aangepast/, "activiteit");

  // ---- 3. de kaart in de browser ----
  // CI heeft geen browser: dan alleen de regels en de server hierboven
  browserdeel: {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { console.log("test-vaste-vragen: geen Playwright, browserdeel overgeslagen"); break browserdeel; }
  browser = await chromium.launch();
  const fouten = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.5.200.1" } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fouten.push(String(e)));
  await p.goto(origin + "/k/" + kaartId);
  await p.waitForSelector("#vvkop:not([hidden])", { timeout: 15000 });
  assert.equal(await p.textContent("#vvkop"), "Vragen over je oefeningen");
  assert.equal(await p.locator("#vvkaart details").count(), vv.STANDAARD.length);
  await p.click("#vvkaart details summary");
  assert.match(await p.textContent("#vvkaart details p"), /pijngrens/);
  const eigenBlok = p.locator("#oefs .oef[data-oidx='0'] .oefvragen");
  assert.match(await eigenBlok.textContent(), /Vragen van je praktijk.*stoel achter me/s, "de eigen vraag bij de oefening");
  assert.equal(await p.locator("#oefs .oef[data-oidx='1'] .oefvragen details").count(), 0, "geen eigen vragen bij een andere oefening");
  assert.equal(await p.isVisible("#vraagkop"), false, "geen vrije vraag naar een AI-dienst");
  if (process.env.VV_SCHERM) {
    await p.locator("#vvkop").scrollIntoViewIfNeeded(); await p.screenshot({ path: process.env.VV_SCHERM + "-kaart.png" });
    await p.click("#startknop"); await p.click("#oefs .oef[data-oidx='0'] .oefvragen summary");
    await p.locator("#oefs .oef[data-oidx='0'] .oefvragen").scrollIntoViewIfNeeded(); await p.screenshot({ path: process.env.VV_SCHERM + "-oefening.png" });
  }
  // in het Engels: standaardvragen vertaald, de eigen vraag in het Nederlands met een melding
  await p.evaluate((id) => { localStorage.setItem("fp_taal", "en"); localStorage.removeItem("fp_taalkeus_" + id); }, kaartId);
  await p.reload();
  await p.waitForSelector("#vvkop:not([hidden])", { timeout: 15000 });
  assert.equal(await p.textContent("#vvkop"), "Questions about your exercises");
  assert.match(await p.textContent("#vvkaart"), /What do I do if the exercise hurts\?/);
  const blokEn = await eigenBlok.innerHTML();
  assert.match(blokEn, /lang="nl"/);
  assert.match(blokEn, /Your practice wrote this in Dutch\./);
  assert.deepEqual(fouten, [], "geen fouten op de kaart");

  // ---- 4. de app ----
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.5.200.2" } });
  await ctxA.addInitScript(([s]) => { try {
    localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
    localStorage.setItem("fp_praksessie", s);
  } catch {} }, [claimA.sessie]);
  const a = await ctxA.newPage();
  const foutenA = [];
  a.on("pageerror", (e) => foutenA.push(String(e)));
  a.on("dialog", (dl) => dl.accept());
  await a.goto(origin + "/v2/app");
  await a.waitForSelector("[data-add]", { timeout: 15000 });
  await a.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  await a.evaluate(() => { const e = document.getElementById("praktijk"); if (e) { e.value = "Fysio Vraag"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } });
  await a.evaluate(() => document.querySelectorAll("[data-add]")[0].click());
  await a.waitForSelector("#a4 [data-vvid='0']", { state: "attached", timeout: 5000 });
  await a.evaluate(() => document.querySelector("#a4 [data-vvid='0']").click());
  await a.waitForSelector("#ovVasteVragen.on #vv_form:not([style*='none'])", { timeout: 5000 });
  assert.match(await a.textContent("#vv_std"), /pijngrens/, "de vaste vragen staan in het venster");
  if (process.env.VV_SCHERM) await a.screenshot({ path: process.env.VV_SCHERM + "-app.png" });
  const naam = await a.evaluate(() => document.getElementById("vv_titel").textContent);
  await a.fill("#vv_rijen .vv-v", "Mag ik dit op een zachte mat doen?");
  await a.fill("#vv_rijen .vv-a", "Liever op een stevige ondergrond.");
  await a.click("#vv_bewaar");
  await a.waitForSelector("#ovVasteVragen:not(.on)", { state: "attached", timeout: 5000 });
  await a.waitForSelector("#a4 [data-vvid='0'].aan", { state: "attached", timeout: 5000 });
  const lijst = await (await get("/api/praktijk/vragen?praktijk=" + encodeURIComponent("Fysio Vraag"), A)).json();
  const oefNaam = naam.replace(/^Vragen bij “|”$/g, "");
  assert.equal(lijst.eigen[oefNaam][0].a, "Liever op een stevige ondergrond.", "bewaard bij de praktijk");
  assert.deepEqual(foutenA, [], "geen fouten in de app");

  // "Alles wissen" neemt de vragen mee
  r = await formulier("/v2/gegevens/wissen", { praktijk: "Fysio Vraag", wachtwoord: "vraag-wachtwoord-1", zeker: "WISSEN" });
  assert.ok(r.status < 400, "wissen: " + r.status);
  const na = JSON.parse(await readFile(join(dataDir, "vaste-vragen.json"), "utf8"));
  assert.deepEqual(na, {}, "na alles wissen geen vragen meer");

  } // browserdeel
  console.log("test-vaste-vragen: ok (standaardvragen in 9 talen, eigen vragen per oefening, alleen de eigen praktijk, op de kaart en in de app)");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await new Promise((r) => app.once("exit", r)).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
