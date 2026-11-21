// Regressietest gebruikers-sweep 2026-11-21 06u (MIDDEL, Jayden, Pixel 7): een kaartlink in hoofdletters
// (/k/D8CF810E497B) of met een schuine streep erachter gaf "Card not found", terwijl QR-scanners en mailapps een
// link soms zo doorgeven. Nu gaat de kaart naar de gewone link, met dezelfde taal.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaartlinkhoofd`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /\\\/\?\$\/i\);\s*if\(kl\)\{location\.replace\('\/k\/'\+kl\[1\]\.toLowerCase\(\)\+location\.search\+location\.hash\);return;\}/,
  "kaart.html stuurt een link in hoofdletters of met / erachter door naar de gewone link");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-kaartlink-hoofdletters: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-kaartlink-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.47." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Kaartlink";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "kaartlink-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const chosen = [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }];
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Bram", client: { c_naam: "Bram" }, chosen, kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "en-GB", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.47.200" } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  for (const pad of ["/k/" + id.toUpperCase() + "?taal=en", "/k/" + id + "/?taal=en", "/k/" + id.toUpperCase() + "/?taal=en"]) {
    await page.goto(origin + pad, { waitUntil: "load" });
    for (let i = 0; i < 100 && new URL(page.url()).pathname !== "/k/" + id; i++) await wacht(50);
    const u = new URL(page.url());
    assert.equal(u.pathname, "/k/" + id, pad + " gaat naar de gewone link");
    assert.equal(u.searchParams.get("taal"), "en", pad + " houdt de taal");
    let tekst = "";
    for (let i = 0; i < 100; i++) { tekst = await page.evaluate(() => document.body.innerText); if (/Bruggen|Bridg/i.test(tekst)) break; await wacht(100); }
    assert.doesNotMatch(tekst, /Card not found|Kaart niet gevonden/, pad + " toont de kaart");
    assert.match(tekst, /Bruggen|Bridg/i, pad + " toont de oefening");
  }
  // een onzin-id blijft netjes "niet gevonden", zonder doorsturen in een rondje
  await page.goto(origin + "/k/ZZZZZZZZZZZZ", { waitUntil: "load" });
  await wacht(800);
  assert.equal(new URL(page.url()).pathname, "/k/ZZZZZZZZZZZZ");
  assert.deepEqual(fouten, []);
  console.log("test-sweep-kaartlink-hoofdletters: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
