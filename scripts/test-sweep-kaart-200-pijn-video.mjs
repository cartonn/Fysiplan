// Gebruikers-sweep 2026-11-21 18u (Truus, iPhone SE, 200 % tekstzoom):
// 1. de pijncijfers 0–10 bleven 16 px in vakjes van 26 px breed, naast 34 px tekst. Nu twee rijen met
//    cijfers op volle grootte zodra een rij van elf niet past (container-query in de eigen lettergrootte).
// 2. in de oefenstand lag het label "Bekijk instructievideo" (twee regels hoog) over het onderste kwart
//    van de oefenfoto. Bij grote letters op een klein scherm (body.krap) nu alleen de afspeelknop.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:kaart200pijnvideo`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const k = await readFile(join(root, "public/kaart.html"), "utf8");
if (!process.env.ZONDER_BRON) {
assert.match(k, /\.mkaart\{container-type:inline-size\}/, "pijnkaart is een container");
assert.match(k, /@container \(max-width:16em\)\{\s*\.mschaal\{grid-template-columns:repeat\(6,/, "twee rijen als elf niet past");
assert.match(k, /body\.krap \.oef\.actief:not\(:has\(\.geenfoto\)\)>\.vbtn:not\(\[data-noor\]\)\[aria-expanded="false"\] \.vlab\{position:absolute/,
  "videolabel weg bij grote letters op een klein scherm");
}

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("kaart 200 % pijn en video: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-200pijn-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.21." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Groot Lettertype";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "groot-wachtwoord-1", akkoord: true })).json()).sessie;
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], vids: { bruggenbeginner: "yt:dQw4w9WgXcQ" }, kaartId: "" },
    { "x-praktijk-sessie": sessie })).json()).id;
  assert.ok(id, "kaart gedeeld");

  const meet = async (zoom) => {
    const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.21." + (200 + zoom / 100) } });
    await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
    const p = await ctx.newPage();
    if (zoom !== 100) await p.addInitScript((z) => { document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = z + "%"; }); }, zoom);
    await p.goto(origin + "/k/" + id);
    await p.waitForSelector("#mschaal button[data-score]", { state: "attached", timeout: 15000 });
    await p.evaluate(() => window.dispatchEvent(new Event("resize")));
    await wacht(400);
    const schaal = await p.evaluate(() => {
      const tekst = parseFloat(getComputedStyle(document.getElementById("mvraag")).fontSize);
      const kn = [...document.querySelectorAll("#mschaal button")].map((b) => {
        const r = b.getBoundingClientRect(); return { f: parseFloat(getComputedStyle(b).fontSize), w: r.width, h: r.height, top: Math.round(r.top) };
      });
      return { tekst, kn, rijen: new Set(kn.map((x) => x.top)).size, schuif: getComputedStyle(document.querySelector(".pschuif")).display,
        scrollW: document.documentElement.scrollWidth, w: innerWidth };
    });
    assert.equal(schaal.kn.length, 11, "elf cijfers");
    assert.ok(schaal.scrollW <= schaal.w, `geen horizontale scroll bij ${zoom} %`);
    let video = null;
    await p.click("#privok").catch(() => {});
    await p.click("#startknop");
    await p.waitForSelector("#oefs .oef.actief .vbtn", { timeout: 10000 });
    await wacht(500);
    video = await p.evaluate(() => {
      const a = document.querySelector("#oefs .oef.actief");
      const img = a.querySelector(".fotoknop img"), lab = a.querySelector(".vbtn .vlab");
      const ri = img.getBoundingClientRect(), rl = lab.getBoundingClientRect();
      const over = Math.max(0, Math.min(ri.bottom, rl.bottom) - Math.max(ri.top, rl.top)) * (rl.width > 2 ? 1 : 0);
      return { over, h: ri.height, naam: (lab.textContent || "").trim(), krap: document.body.classList.contains("krap") };
    });
    await ctx.close();
    return { schaal, video };
  };

  const gewoon = await meet(100);
  assert.equal(gewoon.schaal.rijen, 1, "100 %: één rij van elf");
  assert.equal(gewoon.schaal.schuif, "block", "100 %: schuif blijft");
  assert.ok(!gewoon.video.krap && gewoon.video.over > 0, "100 %: label staat gewoon op het beeld");

  const groot = await meet(200);
  assert.equal(groot.schaal.rijen, 2, "200 %: twee rijen");
  assert.equal(groot.schaal.schuif, "none", "200 %: schuif weg");
  for (const b of groot.schaal.kn) {
    assert.ok(b.f >= groot.schaal.tekst * 0.9, `200 %: cijfer ${b.f}px groeit mee met de tekst (${groot.schaal.tekst}px)`);
    assert.ok(b.w >= 44 && b.h >= 44, `200 %: knop ${Math.round(b.w)}×${Math.round(b.h)} is minstens 44 px`);
  }
  assert.ok(groot.video.krap, "200 % op iPhone SE is krap");
  assert.equal(groot.video.over, 0, "200 %: label ligt niet meer over de foto");
  assert.ok(groot.video.naam.length > 3, "knop houdt zijn naam voor de schermlezer");
  console.log("kaart 200 % pijn en video: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
