// Gebruikers-sweep 2026-11-20 18u (Karin, desktop + iPad): met de eigen rem per login (429) liet
// "Nieuw van patiënten" zich stil verbergen (`ib.style.display='none'`), dus een open pijnseintje of
// vraag was onzichtbaar zonder dat iemand wist waarom. Nu blijft een eerder getoonde lijst staan met
// "Niet bijgewerkt." plus de zin van de server, en zonder eerdere lijst staat de kop met die zin.
// Code altijd (CI); de browsercontrole alleen waar Playwright staat. `npm run test:inboxrem`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const fn = idx.match(/function laadInbox\(blok,pr\)\{[\s\S]*?\n  \}\n/);
assert.ok(fn, "laadInbox gevonden");
assert.doesNotMatch(fn[0], /\.catch\(function\(\)\{ib\.style\.display='none';\}\)/, "inbox verdwijnt niet stil bij een fout");
assert.match(fn[0], /var ibMis=function\(code,fout\)/, "eigen foutpad voor de inbox");
assert.match(fn[0], /code===429\?\(fout\|\|/, "bij 429 de zin van de server");
assert.match(fn[0], /'Niet bijgewerkt\. '/, "oude lijst blijft met 'Niet bijgewerkt'");
assert.match(fn[0], /ov\.textContent='Opnieuw proberen'/, "eigen knop Opnieuw proberen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-sweep-inbox-rem: geen Playwright, browserdeel overgeslagen"); }
if (!pw) { console.log("test-sweep-inbox-rem: statisch groen"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-inboxrem-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.8." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Inbox Rem";
const ZIN = "Even te veel verzoeken achter elkaar; probeer het over een paar minuten opnieuw.";
let browser = null;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "inboxrem-wachtwoord", akkoord: true })).json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin Test", email: "karin@inboxrem.test", wachtwoord: "karin-wachtwoord", regels: true }, G);
  const sessie = (await eigen.json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Henk V.", client: { c_naam: "Henk V." },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);

  browser = await pw.chromium.launch();
  const open = async (rem, n) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.5.9." + n } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.route("**/api/praktijk/inbox?*", (r) => rem.aan
      ? r.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "300" }, body: JSON.stringify({ ok: false, fout: ZIN }) })
      : r.continue());
    await page.goto(origin + "/v2/app", { waitUntil: "load" });
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    return { ctx, page, fouten };
  };
  const inboxTekst = (page) => page.evaluate(() => { const ib = document.getElementById("k_inbox"); return ib && ib.style.display !== "none" ? ib.textContent : ""; });
  const wachtOp = async (page, re, wat) => {
    for (let i = 0; i < 100; i++) { if (re.test(await inboxTekst(page))) return; await wacht(100); }
    assert.fail(wat + ": " + JSON.stringify(await inboxTekst(page)));
  };

  // 1) eerst gewoon geladen, daarna de rem: de vraag blijft staan met "Niet bijgewerkt" + zin van de server
  const rem = { aan: false };
  const a = await open(rem, 1);
  await a.page.click("#kaartenBtn");
  await wachtOp(a.page, /heeft een vraag/, "vraag in de inbox");
  rem.aan = true;
  await a.page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await a.page.click("#kaartenBtn");
  await wachtOp(a.page, /Niet bijgewerkt\./, "melding bij de oude lijst");
  const t1 = await inboxTekst(a.page);
  assert.match(t1, /heeft een vraag/, "de vraag blijft zichtbaar");
  assert.ok(t1.includes(ZIN), "zin van de server: " + t1);
  assert.equal(await a.page.locator("#k_inbox .ib-mis[role=status]").count(), 1, "één statusregel");
  if (process.env.SCREENSHOT_DIR) await a.page.screenshot({ path: join(process.env.SCREENSHOT_DIR, "inbox-rem.png") });
  // weer in orde: de melding verdwijnt
  rem.aan = false;
  await a.page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
  await a.page.click("#kaartenBtn");
  for (let i = 0; i < 100 && /Niet bijgewerkt/.test(await inboxTekst(a.page)); i++) await wacht(100);
  assert.doesNotMatch(await inboxTekst(a.page), /Niet bijgewerkt/, "melding weg als het weer lukt");
  assert.deepEqual(a.fouten, []);
  await a.ctx.close();

  // 2) meteen de rem: kop "Nieuw van patiënten" met de zin, niet stil weg
  const remB = { aan: true };
  const b = await open(remB, 2);
  await b.page.click("#kaartenBtn");
  await wachtOp(b.page, /Nieuw van patiënten/, "kop met melding");
  assert.ok((await inboxTekst(b.page)).includes(ZIN));
  assert.match(await inboxTekst(b.page), /kan nu niet worden gecontroleerd/, "zegt dat er iets kan openstaan");
  // eigen knop Opnieuw proberen (hertest Karin: een schermwissel laadt de inbox niet altijd opnieuw)
  remB.aan = false;
  await b.page.click("#k_inbox .ib-mis button");
  await wachtOp(b.page, /heeft een vraag/, "na Opnieuw proberen staat de vraag er");
  assert.equal(await b.page.locator("#k_inbox .ib-mis").count(), 0, "melding weg");
  assert.deepEqual(b.fouten, []);
  await b.ctx.close();
  console.log("test-sweep-inbox-rem: alles groen (oude lijst blijft met melding, zonder lijst kop + zin)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
