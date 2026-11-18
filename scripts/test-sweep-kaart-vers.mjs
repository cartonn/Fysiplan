// Regressietest gebruikers-sweep 2026-11-15 10u (/k, Truus op iPhone SE): een open kaart haalde wat de
// therapeut aanpaste nooit op. Een nieuwe oefening, een andere dosering of een antwoord op "Ik heb een vraag"
// verscheen pas na zelf herladen; na tien uur kwam alleen de nieuwe video binnen, bij de oude dosering.
// Nu laadt de kaart bij terugkomen opnieuw als de inhoud van de therapeut veranderde, behalve als de
// patiënt net iets typt (of in een oefening of foto zit).
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:kaartvers`
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
assert.match(html, /function inhoudCheck\(\)/, "kaart kijkt of de inhoud veranderde");
assert.match(html, /addEventListener\('visibilitychange',function\(\)\{if\(document\.hidden\)\{[^}]*\}else terugGekomen\(\);\}\)/, "bij terugkomen naar het tabblad");
assert.match(html, /'chosen','rows','cells','doel','pskDoel','afspraak','antwoord'/, "oefeningen, dosering, doel, afspraak en antwoord tellen mee");
assert.match(html, /x!=='img'/, "tijdelijke links tellen niet mee (anders herlaadt de kaart steeds)");
console.log("test-sweep-kaart-vers (statisch): ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {
  try { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!pw) { console.log("test-sweep-kaart-vers: geen Playwright, telefoondeel overgeslagen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartvers-"));
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
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.68.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Kaartvers";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "kaartvers-wachtwoord", akkoord: true })).json()).sessie };
  const drie = [{ n: "Squat", i: 0 }, { n: "Lunge", i: 1 }, { n: "Brug", i: 2 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: drie, kaartId: "" }, S)).json()).id;
  assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

  browser = await pw.chromium.launch();
  const c = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.68.0.1" } });
  const p = await c.newPage();
  const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
  let laden = 0; p.on("load", () => { laden++; });
  await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  await p.waitForSelector("#oefs .oefdone");
  const aantal = () => p.evaluate(() => document.querySelectorAll("#oefs .oefdone").length);
  assert.equal(await aantal(), 3, "drie oefeningen");
  const terug = () => p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const wachtOp = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await fn()) return true; await wacht(100); } return false; };

  const voor = laden;
  // 2. therapeut voegt een oefening toe en beantwoordt een vraag: na terugkomen staat het er
  let r = await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: [...drie, { n: "Plank", i: 3 }], kaartId: id }, S);
  assert.equal(r.status, 200, await r.clone().text());
  r = await post("/api/kaart/antwoord", { praktijk: P, id, tekst: "Doe de brug rustig aan." }, S);
  assert.equal(r.status, 200, await r.clone().text());
  await terug();
  assert.ok(await wachtOp(async () => laden > voor && (await aantal().catch(() => 0)) === 4), "na terugkomen vier oefeningen");
  await p.waitForSelector("#atekst");
  assert.match(await p.textContent("#atekst"), /brug rustig aan/, "antwoord van de therapeut staat er");

  // 1. niets veranderd: terugkomen laadt niet opnieuw
  { const n = laden; await terug(); await wacht(1200); assert.equal(laden, n, "zonder wijziging geen herladen"); }

  // 3. de patiënt typt iets: dan niet herladen, ook niet als er weer iets veranderde
  const ta = await p.$("#vraagveld");
  console.log("tekstveld op de kaart:", !!ta);
  if (ta) {
    await p.evaluate(() => { const t = document.querySelector("#vraagveld"); t.value = "Mag ik ook fietsen?"; });
    await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: drie, kaartId: id }, S);
    const nu = laden;
    await wacht(31000); // hooguit eens per 30 s
    await terug(); await wacht(1500);
    assert.equal(laden, nu, "met tekst in een veld niet herladen");
    assert.equal(await p.evaluate(() => document.querySelector("#vraagveld").value), "Mag ik ook fietsen?", "getypte tekst blijft staan");
  }

  assert.deepEqual(fouten, [], "geen paginafouten");
  console.log("test-sweep-kaart-vers: ok");
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
