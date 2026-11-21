// Regressietest gebruikers-sweep 2026-11-21 22u (/k, Jayden op Pixel 7 en iPhone 14): paste de therapeut
// de kaart aan, dan laadde de open kaart bij terugkomen stil opnieuw en stond de patiënt weer bovenaan,
// met de uitgeklapte blokken dicht en zonder uitleg. Na de oefenstand staat history.scrollRestoration op
// 'manual', dus de browser herstelde de plek niet. Nu onthoudt de kaart de plek en de open blokken in de
// tab, zet ze na het laden terug en zegt kort "Je kaart is bijgewerkt".
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:herlaadplek`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const check = html.slice(html.indexOf("function inhoudCheck(){"), html.indexOf("function herlaadStil(){"));
assert.ok(check.length > 100, "inhoudCheck gevonden");
assert.match(check, /if\(!magHerladen\(\)\)\{inhoudLaatst=0;return;\}\s*herlaadStil\(\);/, "gewijzigde kaart herlaadt via herlaadStil");
assert.match(html, /sessionStorage\.setItem\(PLEK_SLEUTEL/, "plek en open blokken worden onthouden");
assert.match(html, /style\.display='block';herstelPlek\(\);\}/, "na het tonen van de kaart komt de plek terug");
for (const taal of ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"]) {
  assert.match(html, new RegExp("\\n  " + taal + ":\\{bijgewerkt:'[^']+'"), "melding in het " + taal);
}
console.log("test-sweep-herlaad-plek (statisch): ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {
  try { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!pw) { console.log("test-sweep-herlaad-plek: geen Playwright, telefoondeel overgeslagen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-herlaadplek-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.69.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Herlaadplek";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "herlaadplek-wachtwoord", akkoord: true })).json()).sessie };
  const zes = ["Squat", "Lunge", "Brug", "Plank", "Kuitheffen", "Zijplank"].map((n, i) => ({ n, i }));
  const bewaar = (chosen) => post("/api/kaarten", { praktijk: P, naam: "Jay", client: { c_naam: "Jay" }, chosen, kaartId: id }, S);
  let id = "";
  id = (await (await bewaar(zes)).json()).id;
  assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

  browser = await pw.chromium.launch();
  for (const toestel of ["Pixel 7", "iPhone 14"]) {
    const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.69.0." + (toestel === "Pixel 7" ? 1 : 2) } });
    const p = await c.newPage();
    const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
    let laden = 0; p.on("load", () => { laden++; });
    await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
    await p.waitForSelector("#oefs .oefdone");
    const wachtOp = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await fn().catch(() => false)) return true; await wacht(100); } return false; };

    // eerst de oefenstand open en dicht: daarna staat scrollRestoration op 'manual' (de oorzaak)
    await p.click("#startknop");
    await p.waitForFunction(() => getComputedStyle(document.getElementById("sterug")).display !== "none");
    await p.click("#sterug");
    await wacht(400);
    assert.equal(await p.evaluate(() => history.scrollRestoration), "manual", toestel + ": oefenstand zet scrollRestoration op manual");

    // een blok uitklappen en halverwege de kaart gaan staan
    const blok = await p.evaluate(() => {
      const dd = [...document.querySelectorAll("#wrap details")];
      const i = dd.findIndex((d) => !d.open && d.offsetParent);
      if (i > -1) dd[i].open = true;
      return i;
    });
    assert.ok(blok > -1, toestel + ": er is een dichtgeklapt blok");
    const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    assert.ok(max > 800, toestel + ": de kaart is lang genoeg om te scrollen (" + max + ")");
    const doel = Math.round(max * 0.6);
    await p.evaluate((y) => window.scrollTo(0, y), doel);
    await wacht(200);
    const voorY = await p.evaluate(() => scrollY);

    // de therapeut zet een oefening minder op de kaart; de patiënt komt terug naar het tabblad
    await wacht(31000 - 0); // inhoudCheck kijkt hooguit eens per 30 s
    const r = await bewaar(zes.slice(0, 5));
    assert.equal(r.status, 200, await r.clone().text());
    const n = laden;
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    assert.ok(await wachtOp(async () => laden > n && (await p.evaluate(() => document.querySelectorAll("#oefs .oefdone").length)) === 5), toestel + ": kaart herladen met vijf oefeningen");
    await wacht(1200);
    const na = await p.evaluate((b) => ({ y: scrollY, open: !!document.querySelectorAll("#wrap details")[b]?.open, melding: (() => { const m = document.getElementById("bijgewerkt"); return !!m && !m.hidden && m.textContent; })() }), blok);
    assert.ok(na.y > 300, toestel + ": niet terug naar boven gesprongen (y=" + na.y + ", was " + voorY + ")");
    assert.ok(Math.abs(na.y - voorY) < 400, toestel + ": ongeveer op dezelfde plek (y=" + na.y + ", was " + voorY + ")");
    assert.ok(na.open, toestel + ": uitgeklapt blok blijft open");
    assert.equal(na.melding, "Je kaart is bijgewerkt.", toestel + ": korte melding");
    const vak = await p.evaluate(() => { const b = document.getElementById("bijgewerkt").getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth }; });
    assert.ok(vak.l >= 0 && vak.r <= vak.w, toestel + ": melding past op het scherm");
    // een gewone herlaad (zelf) gebruikt de onthouden plek niet nog eens
    assert.equal(await p.evaluate(() => sessionStorage.getItem("fpPlek")), null, toestel + ": plek is na gebruik gewist");
    assert.deepEqual(fouten, [], toestel + ": geen paginafouten");
    await c.close();
    await bewaar(zes);
    console.log("test-sweep-herlaad-plek: " + toestel + " ok (y " + voorY + " → " + na.y + ")");
  }
  console.log("test-sweep-herlaad-plek: ok");
} catch (e) {
  console.error(log.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  const weg = new Promise((r) => app.once("exit", r));
  app.kill();
  await weg;
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
}
