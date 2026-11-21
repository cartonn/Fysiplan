// Regressietest gebruikers-sweep 2026-11-21 02u (MIDDEL, Truus, iPhone SE liggend 568×320): in de oefenstand liep
// de eigen video van de therapeut over de hele breedte (16:10, ~355 px hoog) terwijl de onderbalk al op ~240 px
// begon: de helft van de video en de bediening lagen onder "Gedaan", en na scrollen verdween de sluitknop.
// Nu is een liggende video bij weinig hoogte maximaal 40vh hoog, net als de avatarvideo.
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:videoliggend`
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const kaart = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaart, /@media \(max-height:26em\)\{[\s\S]{0,600}?\.vhouder\.open>video:not\(\.avatar\),\.oef\.actief>\.vhouder\.open>iframe\{[^}]*height:clamp\(64px,calc\(100vh - var\(--sbalk-h,0px\) - var\(--vtop/, "liggende video laag bij weinig hoogte");
assert.match(kaart, /@media \(orientation:landscape\)\{body\.krap \.oef\.actief>\.vhouder\.open>video:not\(\.avatar\),body\.krap \.oef\.actief>\.vhouder\.open>iframe\{[^}]*height:clamp\(64px,calc\(100vh - var\(--sbalk-h,0px\) - var\(--vtop/, "ook bij grote letters");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-video-liggend: geen Playwright, browserdeel overgeslagen (statische controle draaide wel)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-videoliggend-"));
// een echte, afspeelbare liggende video (16:10) zodat de speler zijn eigen maat krijgt
const mp4 = join(dataDir, "liggend.mp4");
const ff = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=480x300:rate=25:duration=4", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-movflags", "+faststart", "-y", mp4]);
if (ff.status !== 0) { console.log("test-sweep-video-liggend: geen ffmpeg, browserdeel overgeslagen (statische controle draaide wel)"); await rm(dataDir, { recursive: true, force: true }); process.exit(0); }
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.46." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const P = "Fysio Video Liggend";
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "videoliggend-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const { token } = await (await post("/api/opname/start", { doel: "kaart" }, S)).json();
  const video = await readFile(mp4);
  const upR = await fetch(origin + "/api/opname/upload?token=" + token, {
    method: "POST", headers: { "content-type": "video/mp4", "x-forwarded-for": "10.7.46.99" }, body: video });
  const upJ = await upR.json().catch(() => ({}));
  const pad = upJ.video;
  assert.ok(pad, "opname geüpload: " + upR.status + " " + JSON.stringify(upJ));
  const r = await post("/api/kaarten", { praktijk: P, naam: "Truus", kaartId: "", client: { c_naam: "Truus" }, chosen: [{ n: "Squat", i: 0 }], vids: { squat: pad } }, S);
  const id = (await r.json()).id;
  assert.ok(id, "kaart gedeeld");

  for (const zoom of ["100%", "200%"]) {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], viewport: { width: 568, height: 320 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.7.46." + (zoom === "100%" ? 150 : 151) } });
    if (zoom !== "100%") await ctx.addInitScript((z) => { document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = z; window.dispatchEvent(new Event("resize")); }); }, zoom);
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + id, { waitUntil: "load" });
    await page.waitForSelector("#startknop", { state: "visible", timeout: 15000 });
    await page.evaluate(() => document.getElementById("startknop").click());
    await page.waitForSelector(".oef.actief .vbtn[data-eigen]", { state: "attached", timeout: 8000 });
    await page.evaluate(() => document.querySelector(".oef.actief .vbtn[data-eigen]").click());
    await page.waitForSelector(".oef.actief>.vhouder.open>video", { state: "attached", timeout: 8000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await wacht(400);
    const m = await page.evaluate(() => {
      const v = document.querySelector(".oef.actief>.vhouder.open>video").getBoundingClientRect();
      const b = document.getElementById("sessiebalk").getBoundingClientRect();
      return { vTop: Math.round(v.top), vBottom: Math.round(v.bottom), vH: Math.round(v.height), balk: Math.round(b.top), sw: document.documentElement.scrollWidth, w: innerWidth };
    });
    assert.ok(m.vH > 60, zoom + ": video niet weggekrompen " + JSON.stringify(m));
    // na het tonen scrollt de pagina de video zo nodig in beeld; de video moet in zijn geheel boven de onderbalk passen
    assert.ok(m.vH <= m.balk, zoom + ": video past boven de onderbalk " + JSON.stringify(m));
    assert.ok(m.vBottom <= m.balk + 1, zoom + ": onderkant (bediening) boven de onderbalk " + JSON.stringify(m));
    assert.ok(m.sw <= m.w + 1, zoom + ": geen horizontaal scrollen " + JSON.stringify(m));
    assert.deepEqual(fouten, []);
    await ctx.close();
  }
  console.log("test-sweep-video-liggend: OK");
} catch (e) { console.error(uit.slice(-2000)); throw e; }
finally { await browser.close(); app.kill(); await rm(dataDir, { recursive: true, force: true }); }
