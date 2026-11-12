// Gebruikers-sweep 2026-11-12 14u (Jayden, Pixel 7 en iPhone 14, trage lijn): bij "Hoe gaat het vergeleken
// met de start?" had elke knop een eigen bezig-slot. "Much worse" en 0,3 s later "Much better" gaven twee
// parallelle verzoeken; het laatst binnengekomen antwoord won, dus server én inbox hielden -2: precies
// omgekeerd. De PSK-schaal negeerde een tweede tik tijdens het opslaan stil (3 → 8 bewaarde 3), en zonder
// internet bleef bij herstel de oude keuze gemarkeerd. Nu per schaal één verzoek tegelijk en de laatste tik
// wint (zoals de pijnscore), en offline de nieuwe keuze zichtbaar.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:herstellaatstetik`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(k, /function laatsteTikWint\(verstuur\)\{/, "hulpfunctie: één verzoek per schaal, laatste tik wint");
assert.match(k, /var hsStuur=laatsteTikWint\(/, "herstel gebruikt hem");
assert.match(k, /var pskStuur=laatsteTikWint\(/, "PSK gebruikt hem");
assert.match(k, /K\.kaart\.ervaring=vandaagLokaal\(K\.kaart\.ervaring,score\);tekenHerstel\(\);/, "herstel offline: nieuwe keuze zichtbaar");
assert.doesNotMatch(k, /var b=e\.target\.closest\('\.sbtn'\);if\(!b\|\|b\.dataset\.bezig\)return;\s*var score=Number\(b\.dataset\.hs\)/, "geen bezig-slot per herstelknop meer");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("herstel laatste tik: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-herstel-tik-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.8." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Laatste Tik";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "laatste-tik-wachtwoord", akkoord: true })).json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay", client: { c_naam: "Jay" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const doel = await post("/api/kaart/psk-doel", { praktijk: P, id, activiteit: "Hardlopen" }, S);
  assert.equal(doel.status, 200, "PSK-doel gezet");

  const ctx = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block",
    extraHTTPHeaders: { "x-forwarded-for": "10.7.8.200" } });
  const p = await ctx.newPage();
  const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
  let herstel = 0, psk = 0;
  // het eerste verzoek is traag, het tweede snel: zonder volgorde wint het eerste (dat later binnenkomt)
  await p.route(/\/api\/kaart\/ervaring$/, async (r) => { herstel++; await wacht(herstel === 1 ? 2500 : 300); return r.continue(); });
  await p.route(/\/api\/kaart\/psk$/, async (r) => { psk++; await wacht(psk === 1 ? 2000 : 300); return r.continue(); });
  await p.goto(origin + "/k/" + id + "?taal=en");
  await p.waitForSelector("#hsknoppen .sbtn[data-hs]", { state: "attached", timeout: 15000 });
  const lees = async () => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: kop() })).json());
  const laatste = (l) => (l && l.length ? l[l.length - 1].s : null);

  // herstel: -2 en meteen +2
  await p.$eval('#hsknoppen .sbtn[data-hs="-2"]', (b) => b.click());
  await wacht(300);
  await p.$eval('#hsknoppen .sbtn[data-hs="2"]', (b) => b.click());
  assert.equal(await p.$eval('#hsknoppen .sbtn[data-hs="2"]', (b) => b.getAttribute("aria-pressed")), "true", "gekozen knop meteen zichtbaar");
  let srv = null;
  for (let i = 0; i < 120; i++) { srv = laatste(((await lees()).kaart || {}).ervaring); if (srv === 2 && herstel >= 2) break; await wacht(50); }
  await wacht(400);
  srv = laatste(((await lees()).kaart || {}).ervaring);
  assert.equal(srv, 2, "server bewaart de laatste tik (+2), niet -2");
  assert.equal(herstel, 2, "één verzoek tegelijk: precies twee verzoeken");
  assert.equal(await p.$eval('#hsknoppen .sbtn.aan', (b) => b.dataset.hs), "2", "scherm toont +2");

  // PSK: 3 en meteen 8
  await p.$eval('#pskschaal [data-psk="3"]', (b) => b.click());
  await wacht(300);
  await p.$eval('#pskschaal [data-psk="8"]', (b) => b.click());
  for (let i = 0; i < 120; i++) { if (laatste(((await lees()).kaart || {}).psk) === 8) break; await wacht(50); }
  await wacht(400);
  assert.equal(laatste(((await lees()).kaart || {}).psk), 8, "PSK: de tweede tik (8) wordt bewaard");
  assert.equal(psk, 2, "PSK: precies twee verzoeken");
  assert.equal(await p.$eval('#pskschaal button.aan', (b) => b.dataset.psk), "8", "PSK: scherm toont 8");

  // herstel offline: nieuwe keuze blijft gemarkeerd en gaat later mee
  await p.unroute(/\/api\/kaart\/ervaring$/);
  await ctx.setOffline(true);
  await p.$eval('#hsknoppen .sbtn[data-hs="1"]', (b) => b.click());
  await wacht(500);
  assert.equal(await p.$eval('#hsknoppen .sbtn.aan', (b) => b.dataset.hs), "1", "offline: de nieuwe keuze is gemarkeerd");
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 120; i++) { if (laatste(((await lees()).kaart || {}).ervaring) === 1) break; await wacht(100); }
  assert.equal(laatste(((await lees()).kaart || {}).ervaring), 1, "na online staat +1 op de server");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("herstel laatste tik: ok (herstel en PSK: laatste tik wint, offline nieuwe keuze)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
