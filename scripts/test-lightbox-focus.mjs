// Regressietest gebruikers-sweep 2026-11-19 22u (Truus, iPhone SE, toetsenbord/schermlezer): in de vergrote foto op /k
// bleef de focus op de knop achter de donkere laag, en Tab bediende "Te zwaar?", "Vorige", "Gedaan" en "Volgende"
// eronder. Het venster had role="dialog" zonder aria-modal. Nu gaat de focus naar Sluiten, blijft Tab in het venster
// en komt de focus na Esc of Sluiten terug op de fotoknop.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:lightboxfocus`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /id="lightbox" role="dialog" aria-modal="true"/, "lightbox is een modaal venster");
assert.match(kaartHtml, /document\.getElementById\('lbsluit'\)\.focus\(\)/, "focus naar Sluiten bij openen");
assert.match(kaartHtml, /e\.key==='Tab'&&lbox\.classList\.contains\('open'\)/, "Tab blijft in de vergrote foto");
assert.match(kaartHtml, /if\(was\)lbFocusTerug\(\);/, "focus terug na sluiten");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("lightboxfocus: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-lbfocus-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.69.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Lightbox Focus";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "lightbox-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus V.", client: { c_naam: "Truus V." },
    chosen: [{ n: "360 graden ademhaling – eerste fase rustig", id: "fp_8d4fb0f3f39ab16e", i: 0 }, { n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }],
    kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");

  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.69.9.1" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
    const knop = page.locator("#oefs .oef .fotoknop").first();
    await knop.waitFor();
    await knop.click();
    await page.waitForSelector("body.sessie #oefs .oef.actief img");
    const groot = page.locator("#oefs .oef.actief .fotoknop");
    await groot.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector("#lightbox.open");
    const actief = () => page.evaluate(() => { const a = document.activeElement; return { id: a && a.id, inLb: !!(a && a.closest && a.closest("#lightbox")), foto: !!(a && a.closest && a.closest(".oef.actief .fotoknop")) }; });
    let a = null;
    for (let i = 0; i < 30; i++) { a = await actief(); if (a.inLb) break; await wacht(50); }
    assert.equal(a.id, "lbsluit", "focus staat op Sluiten");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      a = await actief();
      assert.ok(a.inLb, "Tab blijft in de vergrote foto (stap " + i + ")");
    }
    await page.keyboard.press("Escape");
    await wacht(200);
    assert.equal(await page.locator("#lightbox.open").count(), 0, "Esc sluit");
    a = await actief();
    assert.ok(a.foto, "focus terug op de fotoknop");
    assert.deepEqual(fouten, [], "geen scriptfouten");
    await ctx.close();
  } finally { await browser.close(); }
  console.log("lightboxfocus: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
