// Gebruikers-sweep 2026-11-19 06u (Jayden, Pixel 7 + iPhone 14): op /k ging "vooruit" na "terug" mis.
// Oefening + foto open, terug (foto dicht, goed), vooruit: de oefening sloot en je stond op het overzicht,
// daarna kostte het drie keer terug (twee lege stappen) om van de kaart af te komen. Ook vooruit na terug
// uit een oefening opende niets en liet een lege stap achter.
// Nu: een stap van een oefening onthoudt welke oefening (i) en opent die weer; een "vooruit" naar een foto
// die al dicht is wordt stil teruggenomen, zodat de oefening open blijft en er geen lege stappen zijn.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:terugvooruit`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /history\.pushState\(\{fpoef:1,i:i\},''\)/, "oefenstap onthoudt de oefening");
assert.match(kaartHtml, /if\(st&&st\.fplb\)\{STIL_TERUG=true;/, "vooruit naar een dichte foto wordt stil teruggenomen");
assert.match(kaartHtml, /if\(st&&st\.fpoef&&SESSIE<0\)\{/, "vooruit naar een oefenstap opent die oefening");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("terugvooruit: broncontrole ok (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-venster-"));
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
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.9.18.1", ...extra }, body: JSON.stringify(body) });
  const P = "Fysio Vooruit";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "vooruit-wachtwoord", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Jay V.", client: { c_naam: "Jay V." },
    chosen: [{ n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 0 }, { n: "Abroller", id: "fp_ba8ecef1edfecd32", i: 1 }], kaartId: "" }, { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");
  const browser = await pw.chromium.launch();
  try {
    for (const toestel of ["Pixel 7", "iPhone 14"]) {
      const ctx = await browser.newContext({ ...pw.devices[toestel], serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.9.19." + toestel.length } });
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/privacy", { waitUntil: "domcontentloaded" });
      await page.goto(origin + "/k/" + id + "?taal=en", { waitUntil: "networkidle" });
      const stand = () => page.evaluate(() => ({ url: location.pathname, sessie: !!document.body && document.body.classList.contains("sessie"),
        lb: !!document.querySelector("#lightbox.open"), sessie2: 0,
        actief: Array.from(document.querySelectorAll("#oefs .oef")).findIndex((o) => o.classList.contains("actief")) }));
      const stap = async (fn) => { await fn(); await wacht(250); return stand(); };
      // A: oefening + foto, terug, vooruit -> oefening blijft open; daarna 2x terug = van de kaart af
      const foto = page.locator("#oefs .oef img").first();
      await foto.click();
      await page.waitForSelector("body.sessie #oefs .oef.actief img");
      await foto.click();
      await page.waitForSelector("#lightbox.open");
      let s = await stap(() => page.goBack());
      assert.ok(s.sessie && !s.lb, toestel + ": terug sluit alleen de foto " + JSON.stringify(s));
      s = await stap(() => page.goForward());
      assert.ok(s.sessie, toestel + ": vooruit laat de oefening open " + JSON.stringify(s));
      s = await stap(() => page.goBack());
      assert.ok(!s.sessie && s.url.startsWith("/k/"), toestel + ": terug gaat naar het overzicht (geen lege stap) " + JSON.stringify(s));
      s = await stap(() => page.goBack());
      assert.equal(s.url, "/privacy", toestel + ": nog een keer terug = van de kaart af");
      // B: tweede oefening open, terug, vooruit -> dezelfde oefening weer open
      await page.goForward();
      await page.waitForSelector("#oefs .oef img");
      await wacht(300);
      await page.locator("#oefs .oef img").nth(1).click();
      await page.waitForSelector("body.sessie");
      const welke = (await stand()).actief;
      s = await stap(() => page.goBack());
      assert.ok(!s.sessie, toestel + ": terug sluit de oefening");
      s = await stap(() => page.goForward());
      assert.ok(s.sessie && s.actief === welke, toestel + ": vooruit opent dezelfde oefening weer " + JSON.stringify(s) + " verwacht " + welke);
      s = await stap(() => page.goBack());
      assert.ok(!s.sessie && s.url.startsWith("/k/"), toestel + ": terug naar het overzicht");
      s = await stap(() => page.goBack());
      assert.equal(s.url, "/privacy", toestel + ": en dan van de kaart af, zonder lege stap");
      assert.deepEqual(fouten, [], toestel + ": geen scriptfouten");
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log("terugvooruit: ok (Pixel 7 en iPhone 14: vooruit na terug opent de oefening weer, geen lege terugstappen)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
