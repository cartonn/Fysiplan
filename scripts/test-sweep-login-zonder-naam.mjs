// Regressietest gebruikers-sweep 2026-11-21 22u (Mark, iPad): op een tweede apparaat met een iets andere
// praktijknaam zei Kaarten "Deze praktijk is nog niet beveiligd… Beveiligen" en daarna "Start eerst je gratis
// proef"; de eigenaar kwam niet bij inloggen, terwijl de server bij e-mail en wachtwoord de praktijk zelf vindt.
// Nu: "Ik heb al een login" (ook in de naamvraag zonder praktijknaam), en bij een login van een andere praktijk
// een knop "Inloggen bij …" in plaats van alleen de zin "Vul die praktijknaam in". En (Mark, zelfde run) de fout bij
// Team → uitnodigen schuift in beeld in plaats van onderaan het venster te blijven.
// CI heeft geen Playwright: de broncontrole draait altijd, het browserdeel alleen waar Playwright staat.
// `npm run test:loginzondernaam`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(join(root, "public/index.html"), "utf8");
const vraag = index.match(/function toonPraktijknaamVraag\(blok\)\{[\s\S]*?\n  \}\n/);
assert.ok(vraag, "toonPraktijknaamVraag gevonden");
assert.match(vraag[0], /id='k_pr_login'/, "de naamvraag heeft 'Ik heb al een login'");
assert.doesNotMatch(vraag[0], /beveilig je hem met een wachtwoord/, "geen verouderde zin over een praktijkwachtwoord");
assert.match(index, /function inlogZonderNaam\(blok\)\{/, "inloggen zonder praktijknaam bestaat");
const actie = index.match(/function prakSlotActie\(\)\{[\s\S]*?\n  \}\n/);
assert.ok(actie, "prakSlotActie gevonden");
assert.match(actie[0], /PRAKSLOT\.alLogin\?'':PRAKSLOT\.pr/, "'Ik heb al een login' stuurt geen praktijknaam mee");
assert.match(actie[0], /psKiesKnoppen\(d\.kies\)/, "bij een login van een andere praktijk volgt een keuzeknop");
assert.match(index, /var msg=function\(t\)\{var m=document\.getElementById\('tm_msg'\);[^\n]*scrollIntoView/, "een melding in Team schuift in beeld");

const require = createRequire(import.meta.url);
let pw = null;
try { pw = require("playwright"); } catch { console.log("test-sweep-login-zonder-naam: geen Playwright, browserdeel overgeslagen (broncontrole draaide wel)"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-loginzondernaam-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", PROEF_VERPLICHT: "", EIGEN_LOGIN_VERPLICHT: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit = "";
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.71.0." + (ip++), ...extra }, body: JSON.stringify(body) });
  const browser = await pw.chromium.launch();
  const releaseVersie = ((await readFile(join(root, "public/release-notes.js"), "utf8")).match(/version='([^']+)'/) || [])[1] || "";
  const nieuweContext = async (n) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.71.9." + n } });
    await c.addInitScript((v) => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", v); } catch {} }, releaseVersie);
    return c;
  };
  const openApp = async (page, naam) => {
    await page.goto(origin + "/v2/app", { waitUntil: "load" });
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((n) => { const p = document.getElementById("praktijk"); p.value = n; p.dispatchEvent(new Event("input", { bubbles: true })); }, naam);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#kaartenBtn");
  };
  const logIn = async (page) => {
    await page.waitForSelector("#ps_email", { state: "visible", timeout: 5000 });
    assert.equal((await page.textContent("#ps_do")).trim(), "Inloggen");
    await page.fill("#ps_email", "mark@voorbeeld.test");
    await page.fill("#ps_ww", "mark-wachtwoord");
    await page.click("#ps_do");
  };
  const isIngelogd = async (page, wat) => {
    await page.waitForFunction(() => document.documentElement.classList.contains("ps-in"), null, { timeout: 8000 })
      .catch(async () => { throw new Error(wat + ": niet ingelogd; status: " + (await page.textContent("#ps_status")) + " / " + (await page.textContent("#ps_msg"))); });
    assert.equal(await page.inputValue("#praktijk"), "Fysio Duinrand", wat + ": de naam van de praktijk komt op de kaart");
  };
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Duinrand", wachtwoord: "duinrand-wachtwoord", akkoord: true });
    assert.equal(claim.status, 200, "praktijk beveiligd");
    const ses = (await claim.json()).sessie;
    const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Mark Test", email: "mark@voorbeeld.test", wachtwoord: "mark-wachtwoord", regels: true }, { "x-praktijk-sessie": ses });
    assert.equal(eigen.status, 200, "eigen login voor Mark");
    assert.equal((await post("/api/praktijk/claim", { praktijk: "Praktijk Ander", wachtwoord: "ander-wachtwoord", akkoord: true })).status, 200);

    // 1. tweede apparaat met een andere schrijfwijze: "nog niet beveiligd", maar wel "Ik heb al een login"
    const c1 = await nieuweContext(1); const p1 = await c1.newPage();
    await openApp(p1, "Duinrand");
    await p1.waitForFunction(() => /nog niet beveiligd/.test(document.getElementById("ps_status").textContent), null, { timeout: 5000 });
    await p1.click("#ps_allogin");
    assert.equal(await p1.isVisible("#ps_vwolab"), false, "geen akkoordvinkje bij inloggen");
    await logIn(p1);
    await isIngelogd(p1, "andere schrijfwijze");
    // 4. (Mark, zelfde run) een fout bij Team → uitnodigen stond onderaan het venster, buiten beeld
    await p1.setViewportSize({ width: 1024, height: 600 });
    await p1.click("#ps_team");
    await p1.waitForSelector("#tm_udo", { state: "visible", timeout: 8000 });
    await p1.fill("#tm_unaam", "Collega Een");
    await p1.fill("#tm_uemail", "geen-adres");
    await p1.click("#tm_udo");
    await p1.waitForFunction(() => (document.getElementById("tm_msg").textContent || "").trim().length > 0, null, { timeout: 5000 });
    await wacht(400);
    const r = await p1.evaluate(() => { const b = document.getElementById("tm_msg").getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, focus: document.activeElement && document.activeElement.id }; });
    assert.ok(r.top >= 0 && r.bottom <= r.h, "foutmelding bij uitnodigen staat in beeld (" + JSON.stringify(r) + ")");
    assert.equal(r.focus, "tm_uemail", "de focus staat op het e-mailveld");
    await c1.close();

    // 2. zonder praktijknaam: de naamvraag heeft dezelfde weg
    const c2 = await nieuweContext(2); const p2 = await c2.newPage();
    await openApp(p2, "");
    await p2.waitForSelector("#k_pr_login", { state: "visible", timeout: 5000 });
    const h = await p2.evaluate(() => document.getElementById("k_pr_login").getBoundingClientRect().height);
    assert.ok(h >= 44, "link 'Ik heb al een login' is minstens 44 px hoog (" + h + ")");
    await p2.click("#k_pr_login");
    assert.equal(await p2.$("#k_pr_vraag"), null, "de naamvraag maakt plaats voor het inloggen");
    // zonder e-mail: een duidelijke vraag, geen verzoek
    await p2.fill("#ps_ww", "mark-wachtwoord");
    await p2.click("#ps_do");
    assert.match(await p2.textContent("#ps_msg"), /e-mailadres/, "zonder e-mail vraagt de app erom");
    await logIn(p2);
    await isIngelogd(p2, "zonder naam");
    await c2.close();

    // 3. de naam van een ándere beveiligde praktijk op het scherm: bewust kiezen met een knop
    const c3 = await nieuweContext(3); const p3 = await c3.newPage();
    await openApp(p3, "Praktijk Ander");
    await p3.waitForFunction(() => /Log in/.test(document.getElementById("ps_status").textContent), null, { timeout: 5000 });
    await logIn(p3);
    await p3.waitForSelector("#ps_kies button", { timeout: 5000 });
    assert.equal(await p3.evaluate(() => document.documentElement.classList.contains("ps-in")), false, "niet stil bij de andere praktijk");
    assert.equal((await p3.textContent("#ps_kies button")).trim(), "Inloggen bij Fysio Duinrand");
    await p3.click("#ps_kies button");
    await isIngelogd(p3, "gekozen praktijk");
    await c3.close();

    assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
    console.log("test-sweep-login-zonder-naam: inloggen met e-mail zonder exacte praktijknaam, zonder naam en via de keuzeknop");
  } catch (e) {
    console.error(uit.slice(-2000));
    throw e;
  } finally {
    await browser.close();
    app.kill();
    await wacht(200);
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}
