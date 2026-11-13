// Gebruikers-sweep 2026-11-08:
// 1. /k: het vinkje "gedaan" per oefening gaat zonder internet niet meer verloren. Het
//    gaat via stuur() de offline-wachtrij in (per oefening per dag) en de server telt een
//    late tik op de dag van tikken (`wanneer`), zonder het vinkje van vandaag te wissen.
// 2. App: dubbelklik op "Toevoegen" bij een eigen oefening gaf een valse fout. De knop
//    gaat nu meteen op slot (vóór het lezen van de foto) en de server houdt twee
//    gelijktijdige verzoeken met dezelfde naam tegen (precies één oefening, één 409).
// 3. App: koos de therapeut bij "In de praktijk" de roepnaam ("Marieke B."), dan ging de
//    volledige naam toch als client.c_naam naar de server. Nu niet meer.
// API altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:oefvinkje`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const DAG = 86400000;
const nlDag = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });

const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");
assert.match(kaartHtml, /function toggleOefDaan[\s\S]{0,900}stuur\('\/api\/kaart\/oefening'/, "oefening-vinkje gaat via stuur() en dus de wachtrij");
assert.match(kaartHtml, /function zetInWacht[\s\S]{0,300}pad==='\/api\/kaart\/oefening'\?'#'\+body\.oef/, "wachtrij-sleutel per oefening");
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /if\(knop\.disabled\)return;\s*knop\.disabled=true;knop\.textContent='Bezig…';\s*var rd=new FileReader\(\);/,
  "eigen oefening: bezig-slot vóór het lezen van de foto");
assert.match(appHtml, /function serverKaart[\s\S]{0,1200}String\(c\.client\.c_naam\)\.trim\(\)\.toLowerCase\(\)!==String\(naam\)\.trim\(\)\.toLowerCase\(\)\)c\.client\.c_naam=String\(naam\)\.trim\(\)/,
  "serverKaart stuurt de gekozen kaartnaam als roepnaam (geen volledige naam, geen naam van een vorige patiënt)");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oefvinkje-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Vinkje";
// kleinste geldige PNG-kop + opvulling (de server kijkt naar de kop en de lengte)
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 1)]);
const pngUrl = "data:image/png;base64," + png.toString("base64");

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "vinkje-wachtwoord", akkoord: true });
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  assert.ok(S["x-praktijk-sessie"], "praktijk beveiligd");
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  const trouw = async () => (await (await get("/api/kaart?id=" + id)).json()).kaart.oefTrouw || {};

  // 1. gisteren offline afgevinkt, vandaag pas verstuurd: telt als een dag (gisteren)
  const gisteren = Date.now() - DAG;
  assert.equal((await post("/api/kaart/oefening", { id, oef: 0, aan: true, wanneer: gisteren })).status, 200);
  let t = await trouw();
  assert.equal(t.Squat.n, 1, "late tik telt mee");
  assert.equal(t.Squat.d, nlDag(gisteren), "late tik staat op de dag van tikken");
  // vandaag ook: een tweede dag, en d wordt vandaag
  await post("/api/kaart/oefening", { id, oef: 0, aan: true });
  t = await trouw();
  assert.equal(t.Squat.n, 2, "twee verschillende dagen = 2");
  assert.equal(t.Squat.d, nlDag(Date.now()));
  // nog een late tik van gisteren (bv. tweede telefoon) wist het vinkje van vandaag niet
  await post("/api/kaart/oefening", { id, oef: 0, aan: true, wanneer: gisteren + 1000 });
  t = await trouw();
  assert.equal(t.Squat.d, nlDag(Date.now()), "vandaag blijft vandaag na een late tik");
  // uitvinken uit de wachtrij voor gisteren raakt vandaag niet
  await post("/api/kaart/oefening", { id, oef: 0, aan: false, wanneer: gisteren });
  t = await trouw();
  assert.equal(t.Squat.d, nlDag(Date.now()), "uitvinken van gisteren laat vandaag staan");
  // een toekomstig of te oud `wanneer` telt als nu
  await post("/api/kaart/oefening", { id, oef: 1, aan: true, wanneer: Date.now() + 30 * DAG });
  t = await trouw();
  assert.equal(t.Brug.d, nlDag(Date.now()), "toekomst telt als nu");

  // 2. twee gelijktijdige verzoeken met dezelfde eigen oefening
  const body = { praktijk: P, naam: "Muurzit eigen variant", uitleg: "Rug tegen de muur.", img: pngUrl };
  const [a, b] = await Promise.all([post("/api/praktijk/oefeningen", body, S), post("/api/praktijk/oefeningen", body, S)]);
  const codes = [a.status, b.status].sort();
  assert.deepEqual(codes, [200, 409], "precies één toegevoegd, één nette 409: " + codes);
  const lijst = await (await get("/api/praktijk/oefeningen?praktijk=" + encodeURIComponent(P), S)).json();
  const muur = (lijst.oefeningen || []).filter((o) => o.naam === "Muurzit eigen variant");
  assert.equal(muur.length, 1, "één oefening Muurzit: " + JSON.stringify(lijst).slice(0, 300));

  // 3. browser: offline vinkje komt later alsnog aan (alleen waar Playwright staat)
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch {}
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], extraHTTPHeaders: { "x-forwarded-for": "10.8.9.1" } });
      const page = await ctx.newPage();
      await page.goto(origin + "/k/" + id, { waitUntil: "networkidle" });
      await page.waitForSelector("#oefs .oefdone");
      const voor = (await trouw()).Brug.n;
      // eerst vandaag uitvinken (online) zodat het offline aanvinken iets verandert
      await post("/api/kaart/oefening", { id, oef: 1, aan: false });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector("#oefs .oefdone");
      await ctx.setOffline(true);
      await page.locator("#oefs .oefdone").nth(1).click();
      await wacht(300);
      const inWacht = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fp_wacht_"))
        .map((k) => localStorage.getItem(k)).join(""));
      assert.match(inWacht, /\/api\/kaart\/oefening/, "offline vinkje staat in de wachtrij");
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      let na = null;
      for (let i = 0; i < 40; i++) { na = (await trouw()).Brug; if (na.d === nlDag(Date.now())) break; await wacht(100); }
      assert.equal(na.d, nlDag(Date.now()), "offline vinkje kwam na online aan bij de praktijk");
      assert.ok(na.n >= voor - 1, "telling klopt");
      await ctx.close();

      // roepnaam bij "In de praktijk": de POST draagt alleen "Marieke B."
      const dc = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": "10.8.9.2" } });
      const ap = await dc.newPage();
      ap.on("dialog", (d) => d.accept());
      let verstuurd = null;
      await ap.route("**/api/kaarten", async (r) => {
        if (r.request().method() !== "POST") return r.continue();
        verstuurd = JSON.parse(r.request().postData() || "{}");
        await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, fout: "test" }) });
      });
      await ap.goto(origin + "/v2/app", { waitUntil: "networkidle" });
      await ap.evaluate(() => {
        const c = document.getElementById("c_naam"); c.value = "Marieke de Boer"; c.dispatchEvent(new Event("input", { bubbles: true }));
        document.getElementById("k_naam").value = "Marieke de Boer";
        document.getElementById("k_save_srv").click();
      });
      for (let i = 0; i < 40 && !verstuurd; i++) await wacht(100);
      assert.ok(verstuurd, "kaart verstuurd");
      assert.equal(verstuurd.naam, "Marieke B.");
      assert.equal((verstuurd.client || {}).c_naam, "Marieke B.", "geen volledige naam naar de server: " + JSON.stringify(verstuurd.client));
      assert.equal(await ap.inputValue("#c_naam"), "Marieke B.", "editor neemt de roepnaam over");
      // sweep 2026-11-08 (Jayden): naamveld van de voorbeeldkaart of een vorige patiënt,
      // kaart gedeeld als "Jayden": de server (en dus /k) krijgt "Jayden", niet de oude naam
      verstuurd = null;
      await ap.evaluate(() => {
        const c = document.getElementById("c_naam"); c.value = "Voorbeeldpatiënt"; c.dispatchEvent(new Event("input", { bubbles: true }));
        document.getElementById("k_naam").value = "Jayden";
        document.getElementById("k_save_srv").click();
      });
      for (let i = 0; i < 40 && !verstuurd; i++) await wacht(100);
      assert.ok(verstuurd, "tweede kaart verstuurd");
      assert.equal(verstuurd.naam, "Jayden");
      assert.equal((verstuurd.client || {}).c_naam, "Jayden", "geen naam van een andere patiënt naar /k: " + JSON.stringify(verstuurd.client));
      await dc.close();
    } finally { await browser.close(); }
    console.log("browserdeel: offline vinkje komt aan, roepnaam zonder volledige naam, geen naam van een vorige patiënt");
  } else console.log("browserdeel overgeslagen (geen Playwright)");

  console.log("test-sweep-oefvinkje-wachtrij: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
