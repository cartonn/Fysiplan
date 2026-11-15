// Regressietest gebruikers-sweep 2026-11-15 06u (/k, Truus op iPhone SE, Jayden op Pixel 7): een dubbeltik op
// "Ik heb vandaag geoefend" zette de dag aan en meteen weer uit (lokaal is het antwoord er na een paar ms, dus het
// bezig-slot hield de tweede tik niet tegen). Met vinkjes erger: na "vinkjes weg?" → OK zette de tweede tik de dag
// weer aan, zonder de vinkjes. Nu telt een tweede echte tik binnen 0,45 s niet.
// CI heeft geen Playwright: de statische controle draait altijd, het telefoondeel alleen waar Playwright staat.
// `npm run test:dagvinkdubbel`
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
const kb = html.indexOf("getElementById('gdaan').addEventListener('click'");
const klik = html.slice(kb, html.indexOf("stuur('/api/kaart/gedaan'", kb));
assert.match(klik, /nu-knop\._tik<450/, "tweede tik binnen 0,45 s telt niet");
assert.match(klik, /e\.isTrusted/, "alleen echte tikken tellen voor de rustperiode");
console.log("test-sweep-dagvink-dubbeltik (statisch): ok");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {
  try { pw = createRequire("/opt/node22/lib/node_modules/")("playwright"); } catch {}
}
if (!pw) { console.log("test-sweep-dagvink-dubbeltik: geen Playwright, telefoondeel overgeslagen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-dagvinkdubbel-"));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.67.1." + (ip++), ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Dagvink";
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "dagvink-wachtwoord", akkoord: true })).json()).sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Lunge", i: 1 }, { n: "Brug", i: 2 }], kaartId: "" }, S)).json()).id;
  assert.match(String(id), /^[a-f0-9]{8,16}$/, "kaart gemaakt");
  const vandaagOpServer = async () => {
    const j = await (await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.67.2.1" } })).json();
    const k = j.kaart || j;
    const dag = new Date().toISOString().slice(0, 10);
    return (k.gedaan || []).some((g) => new Date(g.t).toISOString().slice(0, 10) === dag);
  };

  browser = await pw.chromium.launch();
  const c = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.67.0.1" } });
  const p = await c.newPage();
  const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
  await p.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
  await p.waitForSelector("#gdaan");
  const stand = () => p.evaluate(() => document.getElementById("gdaan").getAttribute("aria-pressed"));
  assert.equal(await stand(), "false", "dag staat uit");

  // 1. dubbeltik zonder vinkjes: de dag staat aan, op het scherm en op de server
  await p.tap("#gdaan"); await p.tap("#gdaan");
  await wacht(600);
  assert.equal(await stand(), "true", "dubbeltik: dag staat aan");
  assert.equal(await vandaagOpServer(), true, "dubbeltik: server heeft de dag");

  // 2. na de rustperiode werkt een gewone tik weer (uit)
  await wacht(400);
  await p.tap("#gdaan");
  await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "false");
  await wacht(300);
  assert.equal(await vandaagOpServer(), false, "losse tik zet de dag uit");

  // 3. met vinkjes: dag aan, dan dubbeltik met OK op de vraag → dag uit en blijft uit
  await wacht(800);
  for (const i of [0, 1]) { await p.evaluate((i) => document.querySelector(".oefdone[data-idx='" + i + "']").click(), i); await wacht(760); }
  if (await stand() !== "true") { await wacht(800); await p.tap("#gdaan"); }
  await p.waitForFunction(() => document.getElementById("gdaan").getAttribute("aria-pressed") === "true" && !document.getElementById("gdaan").dataset.bezig);
  await wacht(800);
  let vragen = 0;
  p.on("dialog", (d) => { vragen++; d.accept(); });
  await p.tap("#gdaan"); await p.tap("#gdaan");
  await wacht(800);
  assert.equal(vragen, 1, "één vraag");
  assert.equal(await stand(), "false", "na OK blijft de dag uit (de tweede tik zette hem niet terug aan)");
  assert.equal(await vandaagOpServer(), false, "server: dag uit");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("test-sweep-dagvink-dubbeltik (telefoon): ok");
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
