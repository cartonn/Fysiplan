// Regressietest gebruikers-sweep 2026-11-16 (/k, iPhone SE en Pixel 7): wat de patiënt op de ene telefoon
// afvinkte, kwam op een kaart die op de andere telefoon al openstond niet binnen, ook niet na terugkomen.
// De ene zei "alles gedaan", de andere "3 van 4", en een tik op de oude stand zette een vinkje uit dat elders
// aan stond. Nu neemt de open kaart bij terugkomen het patiëntdeel van de server over (zonder herladen),
// behalve als er op deze telefoon nog tikken wachten.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:tweedetelefoonopen`
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
assert.match(html, /if\(inhoudSig\(d\.kaart\)===INHOUD_SIG\)\{neemPatientDeelOver\(d\);return;\}/, "zonder wijziging van de therapeut toch het patiëntdeel overnemen");
assert.match(html, /function neemPatientDeelOver\(d\)\{[\s\S]{0,200}Object\.keys\(leesWacht\(\)\)\.length\)return;/, "niet als er nog tikken wachten");
console.log("test-kaart-tweede-telefoon-open (statisch): ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-kaart-tweede-telefoon-open: geen Playwright, telefoondeel overgeslagen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tweedetel-"));
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
const wachtOp = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { if (await fn()) return true; await wacht(100); } return false; };
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.69.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Twee Telefoons";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "tweetel-wachtwoord", akkoord: true })).json()).sessie };
  const drie = [{ n: "Squat", i: 0 }, { n: "Lunge", i: 1 }, { n: "Brug", i: 2 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" }, chosen: drie, kaartId: "" }, S)).json()).id;
  assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");

  browser = await pw.chromium.launch();
  const open = async (toestel, n) => {
    const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.69.0." + n } });
    const p = await c.newPage();
    p.fouten = []; p.on("pageerror", (e) => p.fouten.push(e.message));
    p.laden = 0; p.on("load", () => { p.laden++; });
    await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
    await p.waitForSelector("#oefs .oefdone");
    return p;
  };
  const A = await open("iPhone SE", 1);
  const B = await open("Pixel 7", 2);
  const aan = (p) => p.evaluate(() => [...document.querySelectorAll("#oefs .oefdone")].map((b) => b.classList.contains("aan")));
  const terug = (p) => p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.deepEqual(await aan(A), [false, false, false], "A begint leeg");

  // B vinkt oefening 1 en 3 af
  for (const i of [0, 2]) {
    await B.evaluate((j) => document.querySelectorAll("#oefs .oefdone")[j].click(), i);
    await wacht(1000); // dagvink-rustperiode
  }
  assert.ok(await wachtOp(async () => JSON.stringify(await aan(B)) === JSON.stringify([true, false, true])), "B heeft 1 en 3 aan");
  await wachtOp(async () => (await B.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fp_wacht_")).length)) === 0);

  // A komt terug naar de kaart: ziet de vinkjes van B, zonder herladen
  const ladenA = A.laden;
  await terug(A);
  assert.ok(await wachtOp(async () => JSON.stringify(await aan(A)) === JSON.stringify([true, false, true])), "A ziet na terugkomen de vinkjes van B: " + JSON.stringify(await aan(A)));
  assert.equal(A.laden, ladenA, "A is niet herladen (overnemen, geen reload)");

  // A vinkt oefening 2 af: de server heeft alle drie, en B ziet ze na terugkomen ook
  await A.evaluate(() => document.querySelectorAll("#oefs .oefdone")[1].click());
  assert.ok(await wachtOp(async () => JSON.stringify(await aan(A)) === JSON.stringify([true, true, true])), "A: alle drie aan");
  await wachtOp(async () => (await A.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fp_wacht_")).length)) === 0);
  await terug(B);
  // B kwam al eens terug bij het laden (pageshow); de kaart kijkt hooguit eens per 30 s
  if (JSON.stringify(await aan(B)) !== JSON.stringify([true, true, true])) { await wacht(30500); await terug(B); }
  assert.ok(await wachtOp(async () => JSON.stringify(await aan(B)) === JSON.stringify([true, true, true])), "B ziet ook alle drie: " + JSON.stringify(await aan(B)));

  assert.deepEqual([...A.fouten, ...B.fouten], [], "geen paginafouten");
  console.log("test-kaart-tweede-telefoon-open: vinkjes van de andere telefoon komen op een open kaart binnen");
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
