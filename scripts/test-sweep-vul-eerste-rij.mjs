// Gebruikers-sweep 2026-11-10.
// 1) Truus' therapeut: "Vul eerste rij" deed stil niets als de vakjes leeg waren, terwijl er
//    "3" en "10" in stonden (placeholders). De kaart ging zonder dosering naar de patiënt.
//    Nu: beide leeg = de getoonde 3 × 10; één vakje ingevuld = alleen dat vakje (zoals eerst).
// 2) Mark: na een geweigerde uitnodiging bleef de link van de vorige collega onder de fout staan.
// Code altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:vuleersterij`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");
assert.match(html, /if\(!s&&!h\)\{s=bs\.placeholder;h=bh\.placeholder;\}/, "lege vakjes = de getoonde startdosering");
assert.match(html, /uDo\.disabled=true;[\s\S]{0,400}var oudLk=document\.getElementById\('tm_link'\);if\(oudLk\)oudLk\.innerHTML='';/, "nieuwe uitnodiging wist eerst de oude link");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-vul-eerste-rij: geen Playwright, browserdeel overgeslagen"); }
if (!pw) { console.log("Vul eerste rij + uitnodiging (statisch): ok."); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vulrij-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let browser = null;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.73.0.1" } });
  await ctx.addInitScript(() => {
    localStorage.setItem("fysiplan_welkom_gezien", "1");
    localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
    localStorage.setItem("fysiplan_settings", JSON.stringify({ praktijk: "Fysio Rij" }));
  });
  const p = await ctx.newPage();
  const fouten = [];
  p.on("pageerror", (e) => fouten.push(e.message));
  p.on("dialog", (d) => d.dismiss().catch(() => {}));
  await p.goto(origin + "/v2/app", { waitUntil: "load" });
  await p.evaluate(() => document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")));
  await p.waitForSelector("button.add[data-add]");
  const ids = await p.evaluate(() => [...document.querySelectorAll("button.add[data-add]:not(.on)")].slice(0, 3).map((b) => b.dataset.add));
  for (const id of ids) { await p.click(`button.add[data-add="${id}"]`); await p.waitForTimeout(60); }
  await p.waitForSelector("#bulkdos #bd_do");
  const eersteRij = () => p.evaluate(() => [...document.querySelectorAll("#a4 input[data-k$='|r0|S'], #a4 input[data-k$='|r0|H']")].map((i) => i.value));
  assert.ok((await eersteRij()).every((v) => v === ""), "eerste rij leeg");
  // niets getypt: de getoonde 3 × 10
  await p.click("#bd_do");
  assert.deepEqual((await eersteRij()).slice(0, 6), ["3", "10", "3", "10", "3", "10"], "lege vakjes geven 3 × 10");
  // één vakje getypt en een nieuwe oefening: alleen dat vakje, de rest niet verzonnen
  const extra = await p.evaluate(() => document.querySelector("button.add[data-add]:not(.on)").dataset.add);
  await p.click(`button.add[data-add="${extra}"]`);
  await p.fill("#bd_s", "2");
  await p.click("#bd_do");
  const rij = await eersteRij();
  assert.deepEqual(rij.slice(0, 6), ["3", "10", "3", "10", "3", "10"], "al ingevulde vakjes blijven staan");
  assert.deepEqual(rij.slice(6, 8), ["2", ""], "alleen series ingevuld: herhalingen blijft leeg");
  assert.deepEqual(fouten, [], "geen scriptfouten");
  console.log("Vul eerste rij (browser): lege vakjes geven 3 × 10, één vakje alleen dat vakje, ingevulde vakjes blijven.");
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
