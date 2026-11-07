// Vaste praktijkcode los van de naam (security-backlog HOOG, 2026-11-06).
// - Een praktijknaam kan niet meer vooraf voor een ander bezet worden: een tweede
//   praktijk met dezelfde naam kiest bewust "andere praktijk" en krijgt een eigen code.
// - Inloggen op naam vindt de praktijk waarvan het wachtwoord klopt.
// - Met een sessie handelt elke route voor de eigen praktijk, ook als op de kaart
//   een andere naam staat (geen stille wissel van praktijk meer).
// - Patiëntkaart, overzicht, profiel en /v2/gegevens blijven per praktijk gescheiden.
// Zonder browser, past in CI. `npm run test:praktijkcode`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-praktijkcode-"));
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
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const kaartenOpSchijf = async () => JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // ---- praktijk A beveiligt "De Brug" als eerste: oude sleutel (de naam) ----
  const cA = await post("/api/praktijk/claim", { praktijk: "De Brug", wachtwoord: "wachtwoord-van-a", akkoord: true });
  assert.equal(cA.status, 200);
  const A = { "x-praktijk-sessie": (await cA.json()).sessie };
  assert.ok((await accounts())["de brug"], "eerste praktijk houdt de naam als sleutel");

  // ---- praktijk B heet ook "De Brug": eerst de vraag, dan bewust een eigen praktijk ----
  const cB0 = await post("/api/praktijk/claim", { praktijk: "De Brug", wachtwoord: "wachtwoord-van-b", akkoord: true });
  assert.equal(cB0.status, 409);
  const dB0 = await cB0.json();
  assert.ok(dB0.login && dB0.bezet, "vraagt eerst of het de eigen praktijk is");
  const cB = await post("/api/praktijk/claim", { praktijk: "De Brug", wachtwoord: "wachtwoord-van-b", akkoord: true, nieuw: true });
  assert.equal(cB.status, 200, "tweede praktijk met dezelfde naam wordt niet buitengesloten");
  const B = { "x-praktijk-sessie": (await cB.json()).sessie };
  const codes = Object.keys(await accounts()).filter((k) => /^p-[a-f0-9]{16}$/.test(k));
  assert.equal(codes.length, 1, "B kreeg een eigen praktijkcode");
  const codeB = codes[0];
  assert.equal((await accounts())[codeB].naam, "De Brug");

  // ---- status: B is ingelogd, zonder sessie is de naam beveiligd ----
  const stB = await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent("De Brug"), B)).json();
  assert.equal(stB.ingelogd, true);
  assert.equal(stB.naam, "De Brug");
  const st0 = await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent("de brug"))).json();
  assert.equal(st0.geclaimd, true);
  assert.equal(st0.ingelogd, false);

  // ---- inloggen op naam: het wachtwoord bepaalt welke praktijk ----
  const lA = await post("/api/praktijk/login", { praktijk: "De Brug", wachtwoord: "wachtwoord-van-a" });
  assert.equal(lA.status, 200);
  const lB = await post("/api/praktijk/login", { praktijk: "de brug", wachtwoord: "wachtwoord-van-b" });
  assert.equal(lB.status, 200);
  const B2 = { "x-praktijk-sessie": (await lB.json()).sessie };
  assert.notEqual((await post("/api/praktijk/login", { praktijk: "De Brug", wachtwoord: "fout-wachtwoord" })).status, 200);

  // ---- kaarten: elk in de eigen praktijk ----
  const deel = (S, naam, praktijk = "De Brug") => post("/api/kaarten", { praktijk, naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
  const kA = await deel(A, "Anna");
  assert.equal(kA.status, 200);
  const kB = await deel(B, "Bram");
  assert.equal(kB.status, 200);
  const idB = (await kB.json()).id;
  // B typt een andere naam op de kaart: de kaart blijft toch in praktijk B
  const kB2 = await deel(B2, "Cees", "Heel Andere Naam");
  assert.equal(kB2.status, 200);
  const schijf = await kaartenOpSchijf();
  assert.deepEqual(Object.keys(schijf["de brug"]).sort(), ["anna"]);
  assert.deepEqual(Object.keys(schijf[codeB]).sort(), ["bram", "cees"]);
  assert.ok(!schijf["heel andere naam"], "geen stille wissel naar een andere praktijk");

  const lijst = async (S) => (await (await get("/api/kaarten?praktijk=" + encodeURIComponent("De Brug"), S)).json()).map((k) => k.naam).sort();
  assert.deepEqual(await lijst(A), ["Anna"]);
  assert.deepEqual(await lijst(B), ["Bram", "Cees"]);

  // zonder sessie: inloggen vragen, niet opnieuw beveiligen
  const zonder = await deel({}, "Dirk", "De Brug");
  assert.equal(zonder.status, 401);
  assert.equal((await zonder.json()).login, true);

  // ---- profiel: B's adres komt op B's patiëntkaart, A's profiel blijft van A ----
  assert.equal((await post("/api/praktijken", { praktijk: "De Brug", adres: "Straat A 1", plaats: "Utrecht" }, A)).status, 200);
  assert.equal((await post("/api/praktijken", { praktijk: "De Brug", adres: "Laan B 2", plaats: "Zeist" }, B)).status, 200);
  const patient = await (await get("/api/kaart?id=" + idB)).json();
  assert.equal(patient.praktijk.adres, "Laan B 2", "patiënt van B ziet het adres van B");
  const eigenA = await (await get("/api/praktijken", A)).json();
  assert.deepEqual(eigenA.map((p) => p.adres), ["Straat A 1"]);

  // ---- /v2/gegevens: download met B's wachtwoord geeft alleen B ----
  const dl = await fetch(origin + "/v2/gegevens/download", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.7.1.1" },
    body: new URLSearchParams({ praktijk: "De Brug", wachtwoord: "wachtwoord-van-b" }).toString() });
  assert.equal(dl.status, 200);
  const pakket = await dl.json();
  assert.equal(pakket.praktijk, codeB);
  assert.deepEqual(pakket.kaarten.map((k) => k.naam).sort(), ["Bram", "Cees"]);
  assert.deepEqual(pakket.profiel.map((p) => p.adres), ["Laan B 2"]);

  // ---- naam wijzigen via het profiel: daarna ook met de nieuwe naam inloggen ----
  assert.equal((await post("/api/praktijken", { praktijk: "De Brug Zeist", adres: "Laan B 2", plaats: "Zeist" }, B)).status, 200);
  assert.equal((await post("/api/praktijk/login", { praktijk: "De Brug Zeist", wachtwoord: "wachtwoord-van-b" })).status, 200);
  assert.equal((await post("/api/praktijk/login", { praktijk: "De Brug", wachtwoord: "wachtwoord-van-a" })).status, 200, "A blijft gewoon werken");

  // ---- app (alleen waar Playwright staat; CI heeft het niet) ----
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-praktijkcode: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.2.1" } });
      const page = await ctx.newPage();
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("[data-add]", { timeout: 15000 });
      await page.evaluate(() => { const p = document.getElementById("praktijk"); p.value = "De Brug"; p.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
      await page.click("#kaartenBtn");
      await page.waitForSelector("#ps_nieuw", { state: "visible", timeout: 5000 });
      assert.equal((await page.textContent("#ps_do")).trim(), "Inloggen");
      await page.click("#ps_nieuw");
      assert.equal((await page.textContent("#ps_do")).trim(), "Beveiligen", "andere praktijk met deze naam kan beveiligen");
      assert.match(await page.textContent("#ps_status"), /eigen beveiligde praktijk/);
      await page.fill("#ps_ww", "wachtwoord-van-c");
      await page.check("#ps_vwo");
      await page.click("#ps_do");
      await page.waitForFunction(() => /ingelogd/.test(document.getElementById("ps_status").textContent), null, { timeout: 5000 });
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, "praktijkcode-ingelogd.png") });
      const codesNu = Object.keys(await accounts()).filter((k) => /^p-[a-f0-9]{16}$/.test(k));
      assert.equal(codesNu.length, 2, "praktijk C kreeg via de app ook een eigen code");
    } finally { await browser.close(); }
  }

  console.log("test-praktijkcode: OK");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
