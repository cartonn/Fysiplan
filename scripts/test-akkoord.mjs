// Eén akkoord (stap 5 van "rollen, dossier en opslag").
// - Beveiligen legt één akkoord vast: algemene voorwaarden + verwerkersovereenkomst,
//   met versie en tijd.
// - Een oudere praktijk (alleen vwo, of een oude versie) ziet "wat er veranderd is";
//   alleen een beheerder kan opnieuw akkoord gaan, met naam in het logboek.
// - Elke huidige versie heeft een regel in AKKOORD_WIJZIGINGEN.
// - "Wis Fysiplan van dit apparaat" wist login en lokale gegevens (browserdeel).
// - /v2/gegevens werkt met de eigen login van een beheerder; de app laadt niets van Google.
// Statisch + API in CI, browser alleen met Playwright. `npm run test:akkoord`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const src = await readFile(join(root, "server.js"), "utf8");
const versie = (n) => src.match(new RegExp("const " + n + ' = "([0-9-]+)"'))[1];
const AV = versie("AV_VERSIE"), VWO = versie("VWO_VERSIE");
const wijz = src.match(/const AKKOORD_WIJZIGINGEN = \[([\s\S]*?)\n\];/)[1];
assert.ok(wijz.includes('stuk: "av", versie: "' + AV + '"'), "wijzigingsregel voor de huidige AV-versie");
assert.ok(wijz.includes('stuk: "vwo", versie: "' + VWO + '"'), "wijzigingsregel voor de huidige VWO-versie");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-akkoord-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const start = () => {
  const a = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  a.uit = "";
  a.stdout.on("data", (c) => { a.uit += c; });
  a.stderr.on("data", (c) => { a.uit += c; });
  return a;
};
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const P = "Fysio Akkoord";
const status = async (S) => (await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(P), S)).json());

let app = start();
try {
  await klaar();
  // zonder vinkje geen praktijk
  const zonder = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "akkoord-wachtwoord" });
  assert.equal(zonder.status, 400);
  assert.match((await zonder.json()).fout, /voorwaarden en de verwerkersovereenkomst/);
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "akkoord-wachtwoord", akkoord: true });
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const acc = (await accounts())["fysio akkoord"];
  assert.equal(acc.akkoord.av, AV);
  assert.equal(acc.akkoord.vwo, VWO);
  assert.ok(acc.akkoord.t);
  const st = await status(G);
  assert.equal(st.akkoord.nodig, false);
  assert.deepEqual(st.akkoord.wijzigingen, []);

  // collega (therapeut) en beheerder met eigen login
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Bea Beheer", email: "bea@akkoord.nl", wachtwoord: "bea-wachtwoord", regels: true }, G);
  const B0 = { "x-praktijk-sessie": (await eigen.json()).sessie };
  const uit = await (await post("/api/praktijk/team/uitnodigen", { naam: "Tom", email: "tom@akkoord.nl", rol: "therapeut" }, B0)).json();
  const token = new URL(uit.link).searchParams.get("t");
  const aan = await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.1.1" },
    body: new URLSearchParams({ t: token, naam: "Tom", wachtwoord: "tom-wachtwoord", regels: "1" }).toString() });
  assert.ok(aan.status < 400, "uitnodiging aangenomen");

  // ---- oude praktijk: alleen het vwo-akkoord van vóór het gezamenlijke akkoord ----
  app.kill(); await wacht(200);
  const alle = await accounts();
  delete alle["fysio akkoord"].akkoord;
  alle["fysio akkoord"].vwo = { versie: VWO, t: new Date().toISOString() };
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(alle));
  app = start();
  await klaar();
  // sessies leven in het geheugen: na de herstart opnieuw inloggen
  const login = async (email, ww) => ({ "x-praktijk-sessie": (await (await post("/api/praktijk/login", { email, wachtwoord: ww })).json()).sessie });
  const T = await login("tom@akkoord.nl", "tom-wachtwoord");
  const B = await login("bea@akkoord.nl", "bea-wachtwoord");
  const stT = await status(T);
  assert.equal(stT.akkoord.nodig, true);
  assert.equal(stT.akkoord.beheer, false);
  assert.ok(stT.akkoord.wijzigingen.length > 0 && stT.akkoord.wijzigingen.every((w) => w.stuk === "av"), "alleen de voorwaarden zijn nieuw");
  assert.equal((await post("/api/praktijk/akkoord", { akkoord: true }, T)).status, 403, "therapeut kan niet namens de praktijk akkoord gaan");
  assert.equal((await post("/api/praktijk/akkoord", { akkoord: true })).status, 401);
  assert.equal((await post("/api/praktijk/akkoord", {}, B)).status, 400, "zonder vinkje niet");
  const ok = await post("/api/praktijk/akkoord", { akkoord: true }, B);
  assert.equal(ok.status, 200);
  const na = (await accounts())["fysio akkoord"].akkoord;
  assert.equal(na.wie, "Bea Beheer");
  assert.equal(na.av, AV);
  assert.equal((await status(T)).akkoord.nodig, false);
  const act = await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), B)).json();
  assert.ok(JSON.stringify(act).includes("akkoord"), "akkoord staat in de activiteit");
  // /v2/gegevens met eigen login: beheerder wel, therapeut niet; team zonder hashes
  const gegevens = (velden) => fetch(origin + "/v2/gegevens/download", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.2." + (ip++) },
    body: new URLSearchParams({ praktijk: P, ...velden }).toString() });
  const dlB = await gegevens({ email: "bea@akkoord.nl", wachtwoord: "bea-wachtwoord" });
  assert.equal(dlB.status, 200, "beheerder downloadt met eigen login");
  const pakket = await dlB.json();
  assert.deepEqual(pakket.team.map((l) => l.email).sort(), ["bea@akkoord.nl", "tom@akkoord.nl"]);
  assert.doesNotMatch(JSON.stringify(pakket), /"hash"/, "geen wachtwoordhashes in de download");
  assert.equal((await gegevens({ email: "tom@akkoord.nl", wachtwoord: "tom-wachtwoord" })).status, 403, "therapeut kan niet alles downloaden");

  // ---- geen lettertype of andere bron van Google in de app; teksten noemen de cookies ----
  const appHtml = await (await fetch(origin + "/v2/app")).text();
  assert.doesNotMatch(appHtml, /fonts\.googleapis|fonts\.gstatic/, "lettertype van de eigen server");
  const csp = (await fetch(origin + "/v2/app")).headers.get("content-security-policy") || "";
  assert.doesNotMatch(csp, /googleapis|gstatic/);
  const priv = await (await fetch(origin + "/privacy")).text();
  for (const w of ["fpproef", "fp1", "Wis Fysiplan van dit apparaat", "Teamleden", "Mijn gegevens"]) assert.ok(priv.includes(w), "privacyverklaring noemt " + w);
  assert.doesNotMatch(priv, /lettertype in de app/);
  console.log("test-akkoord: API OK");

  // ---- browser: banner met wijzigingen en Wis Fysiplan van dit apparaat ----
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-akkoord: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    // opnieuw "oud" maken, zodat de banner verschijnt
    app.kill(); await wacht(200);
    const a2 = await accounts();
    a2["fysio akkoord"].akkoord = { av: "2026-01-01", vwo: VWO, t: new Date().toISOString() };
    await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(a2));
    app = start();
    await klaar();
    const B2 = { "x-praktijk-sessie": (await (await post("/api/praktijk/login", { email: "bea@akkoord.nl", wachtwoord: "bea-wachtwoord" })).json()).sessie };
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.9.1" } });
      await ctx.addInitScript((t) => { try { if (!sessionStorage.getItem("al")) { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_notes", "x"); sessionStorage.setItem("al", "1"); } } catch {} }, B2["x-praktijk-sessie"]);
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(String(e)));
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("[data-add]", { timeout: 15000 });
      await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
      await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
      await page.click("#kaartenBtn");
      await page.waitForSelector("#ps_akkoord", { state: "visible", timeout: 8000 });
      assert.match(await page.textContent("#ps_akkoord"), /Algemene voorwaarden.*Eerste versie/);
      if (process.env.SCREENSHOT_DIR) await page.locator("#prakslot").screenshot({ path: join(process.env.SCREENSHOT_DIR, "akkoord-banner.png") });
      await page.click("#ps_akdo");
      assert.match(await page.textContent("#ps_akmsg"), /Vink eerst/);
      await page.check("#ps_akvink");
      await page.click("#ps_akdo");
      await page.waitForSelector("#ps_akkoord", { state: "hidden", timeout: 5000 });
      assert.equal((await accounts())["fysio akkoord"].akkoord.av, AV);

      page.once("dialog", (d) => d.accept());
      await page.click("#ps_wis");
      await page.waitForSelector("#gewist_melding", { timeout: 8000 });
      const over = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^(fp_|fysiplan)/.test(k) && k !== "fysiplan_welkom_gezien"));
      assert.ok(!over.includes("fp_praksessie") && !over.includes("fysiplan_notes"), "login en notities gewist: " + over.join(","));
      assert.equal((await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), B2)).status, 401, "sessie ook op de server vervallen");
      assert.deepEqual(fouten, []);
    } finally { await browser.close(); }
  }
  console.log("test-akkoord: OK");
} catch (e) {
  console.error(app.uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
