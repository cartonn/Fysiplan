// Gebruikers-sweep 2026-11-10 (Sanne, desktop 1280):
// 1. Na Uitloggen bleven de QR, "Bekijk zelf…", de deelknoppen en de roepnaam van de laatste patiënt
//    staan, de roepnaam ook na herladen. Uitgelogd = geen patiënt meer op het scherm.
// 2. Op de print stonden grijze placeholders ("adres", "telefoon", "__-__") en werd een lange
//    praktijknaam afgekapt. Placeholders zijn nu onzichtbaar op papier en de naam krimpt tot hij past.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat. `npm run test:uitloggenprint`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const html = await readFile(join(root, "public/index.html"), "utf8");
const uitlog = html.slice(html.indexOf("function prakLogout(){"), html.indexOf("function toonPsMsg("));
assert.match(uitlog, /verbergQr\(\)/, "Uitloggen haalt de QR weg");
assert.match(uitlog, /CLIENTKEYS\.forEach/, "Uitloggen leegt roepnaam en patiëntvelden");
assert.match(uitlog, /zetKaartId\(''\)/, "Uitloggen koppelt de editor los van de gedeelde kaart");
assert.match(html, /@media print\{[\s\S]*?#a4 input::placeholder,#a4 textarea::placeholder\{color:transparent !important\}/, "placeholders onzichtbaar op de print");
assert.match(html, /addEventListener\('beforeprint',pasPraktijkNaamVoorPrint\)/, "lange praktijknaam past vóór het printen");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("uitloggen + print: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitlog-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.4." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysiotherapie en Sportrevalidatie Het Lange Praktijknaamplein BV";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "uitloggen-wachtwoord", akkoord: true })).json()).sessie;
  assert.ok(sessie, "praktijk beveiligd");
  const S = { "x-praktijk-sessie": sessie };
  const kaarten = async () => (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json());

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.4.200" } });
  await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("al")) { localStorage.setItem("fp_praksessie", t); sessionStorage.setItem("al", "1"); } localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} }, sessie);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e)));
  page.on("dialog", (d) => d.dismiss());
  await page.goto(origin + "/v2/app");
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
  await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });

  // --- print: placeholders en lange praktijknaam ---
  await page.evaluate(() => { window.dispatchEvent(new Event("beforeprint")); });
  await page.emulateMedia({ media: "print" });
  const pr = await page.evaluate(() => {
    const p = document.getElementById("praktijkPrint");
    const ph = getComputedStyle(document.getElementById("p_tel"), "::placeholder").color;
    return { tekst: p && p.textContent, zicht: p && getComputedStyle(p).display, veld: getComputedStyle(document.getElementById("praktijk")).display,
      scroll: p ? p.scrollHeight : 0, client: p ? p.clientHeight : 0, sw: p ? p.scrollWidth : 0, cw: p ? p.clientWidth : 0, ph };
  });
  assert.equal(pr.tekst, P, "hele praktijknaam op de print");
  assert.equal(pr.zicht, "block", "printnaam zichtbaar");
  assert.equal(pr.veld, "none", "invulveld verborgen op de print");
  assert.ok(pr.scroll <= pr.client + 1 && pr.sw <= pr.cw + 1, `lange praktijknaam past op de print (${JSON.stringify(pr)})`);
  assert.equal(pr.ph, "rgba(0, 0, 0, 0)", "placeholder onzichtbaar op de print: " + pr.ph);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => { window.dispatchEvent(new Event("afterprint")); });
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("praktijk")).display !== "none" && getComputedStyle(document.getElementById("praktijkPrint")).display), "none", "na het printen weer het invulveld");

  // --- uitloggen ---
  await page.evaluate(() => {
    document.querySelector("[data-add]").click();
    const cn = document.getElementById("c_naam"); cn.value = "Lies"; cn.dispatchEvent(new Event("input", { bubbles: true })); cn.blur();
  });
  for (let i = 0; i < 60 && (await kaarten()).length < 1; i++) await wacht(100);
  assert.equal((await kaarten()).length, 1, "kaart van Lies gedeeld");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("qrBlok")).display !== "none", null, { timeout: 8000 });
  await page.click("#kaartenBtn");
  await page.waitForSelector("#ps_uit", { state: "visible", timeout: 5000 });
  await page.click("#ps_uit");
  await wacht(300);
  const na = await page.evaluate(() => ({
    qr: getComputedStyle(document.getElementById("qrBlok")).display, inhoud: document.getElementById("qrBlok").innerHTML,
    naam: document.getElementById("c_naam").value, sessie: localStorage.getItem("fp_praksessie")
  }));
  assert.equal(na.sessie, null, "uitgelogd");
  assert.equal(na.qr, "none", "QR weg na uitloggen");
  assert.equal(na.inhoud, "", "geen deelknoppen meer na uitloggen");
  assert.equal(na.naam, "", "roepnaam weg na uitloggen");
  await page.reload();
  await page.waitForSelector("[data-add]", { timeout: 15000 });
  assert.equal(await page.inputValue("#c_naam"), "", "roepnaam komt na herladen niet terug");
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("qrBlok")).display), "none", "QR komt na herladen niet terug");
  assert.deepEqual(fouten, []);
  console.log("uitloggen + print: ok (geen patiënt na uitloggen, naam past, geen placeholders op papier)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
