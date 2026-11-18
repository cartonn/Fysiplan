// Inbox "Nieuw van patiënten" en het label "In dossier" (stap 3 van "rollen, dossier
// en opslag").
// - Seintje, "te zwaar", nieuwe pijnscore en herstel komen per kaart in de inbox.
// - Afgehandeld haalt ze weg en zet "afgehandeld door <naam>" in het contactlogboek.
// - Het label "In dossier" geldt tot de patiënt iets nieuws doorgeeft.
// - Na 3 werkdagen zonder afhandeling noemt de weekbrief de kaart.
// - Een kaart die bijgewerkt in het dossier staat, staat niet bij "verdwijnt binnenkort".
// Zonder browser, past in CI. `npm run test:inbox`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-inbox-"));
const nu = Date.now(), dag = 86400000;
// bewaartermijn: invoering lang geleden, zodat "verdwijnt binnenkort" echt kan gelden
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 400 * dag }));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Inbox";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "inbox-wachtwoord", akkoord: true });
  const G = { "x-praktijk-sessie": (await claim.json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Sanne de Wit", email: "sanne@inbox.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G);
  const S = { "x-praktijk-sessie": (await eigen.json()).sessie };
  const deel = async (naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  const idA = await deel("Henk V.");
  const idB = await deel("Fatima");
  await deel("Jan K.");
  const inbox = async () => (await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json());
  assert.equal((await inbox()).kaarten.length, 0, "nog niets nieuws");
  assert.equal((await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P))).status, 401, "inbox alleen ingelogd");

  // ---- patiënten geven iets door ----
  assert.equal((await post("/api/kaart/seintje", { id: idA, soort: "vraag" })).status, 200);
  assert.equal((await post("/api/kaart/meting", { id: idA, score: 6 })).status, 200);
  assert.equal((await post("/api/kaart/oefzwaar", { id: idB, oef: 1 })).status, 200);
  let ib = await inbox();
  assert.equal(ib.kaarten.length, 2);
  const kA = ib.kaarten.find((k) => k.id === idA);
  assert.deepEqual(kA.items.map((i) => i.soort).sort(), ["pijn", "seintje"]);
  assert.equal(kA.inDossier, false);
  assert.ok(ib.kaarten.find((k) => k.id === idB).items.some((i) => i.soort === "zwaar" && i.oef === "Brug"));

  // ---- naar het dossier: label tot de patiënt iets nieuws doorgeeft ----
  const dos = await post("/api/kaart/dossier", { praktijk: P, id: idA }, S);
  assert.equal(dos.status, 200);
  const dd = await dos.json();
  assert.equal(dd.inDossier, true);
  assert.equal(dd.dossier.wie, "Sanne de Wit");
  let lijst = await (await get("/api/kaarten?praktijk=" + encodeURIComponent(P), S)).json();
  assert.equal(lijst.find((k) => k.id === idA).inDossier, true);
  await wacht(5);
  assert.equal((await post("/api/kaart/meting", { id: idA, score: 4 })).status, 200);
  lijst = await (await get("/api/kaarten?praktijk=" + encodeURIComponent(P), S)).json();
  assert.equal(lijst.find((k) => k.id === idA).inDossier, false, "nieuwe invoer: niet meer bijgewerkt");

  // ---- afgehandeld ----
  assert.equal((await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id: idA }, S)).status, 200);
  ib = await inbox();
  assert.deepEqual(ib.kaarten.map((k) => k.id), [idB], "A is afgehandeld");
  const volA = await (await get("/api/praktijk/kaart?praktijk=" + encodeURIComponent(P) + "&id=" + idA, S)).json();
  assert.ok(volA.kaart.contact.some((c) => c.van === "praktijk" && c.soort === "afgehandeld" && c.wie === "Sanne de Wit"));
  assert.equal(volA.kaart.seintje, null);
  // patiëntroute lekt niets van inbox of dossier
  const pat = await (await get("/api/kaart?id=" + idA)).json();
  assert.ok(!("dossier" in pat.kaart) && !("inboxGezien" in pat.kaart) && !("contact" in pat.kaart));
  // een nieuwe score na afhandeling komt weer binnen
  await wacht(5);
  await post("/api/kaart/meting", { id: idA, score: 3 });
  assert.ok((await inbox()).kaarten.some((k) => k.id === idA));
  console.log("test-inbox: API OK");
} catch (e) {
  console.error(uit.slice(-2000));
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
  throw e;
}

// ---- weekbrief: wachtend na 3 werkdagen, verdwijnen alleen als niet in dossier ----
// tweede server met een datamap waarin de kaarten al oud zijn
app.kill();
await wacht(200);
try {
  const { readFile } = await import("node:fs/promises");
  const kaarten = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  const map = Object.values(kaarten)[0];
  const oud = nu - 85 * dag; // over 5 dagen weg door de bewaartermijn (90 dagen stil)
  for (const k of Object.values(map)) {
    k.ts = oud; k.metingen = []; k.gedaan = []; k.ervaring = []; k.contact = []; k.oefZwaar = null; k.bekeken = { t: oud };
  }
  const [a, b, c] = Object.values(map);
  a.seintje = { t: nu - 8 * dag, soort: "vraag" };     // wacht al ruim 3 werkdagen
  a.ts = nu - 20 * dag;                                   // en verdwijnt dus niet
  b.dossier = { t: oud + 1000 };                          // bijgewerkt in het dossier
  c.dossier = null;                                       // niet in het dossier
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify(kaarten));
  const app2 = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let uit2 = "";
  app2.stdout.on("data", (x) => { uit2 += x; });
  app2.stderr.on("data", (x) => { uit2 += x; });
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    const l = await post("/api/praktijk/login", { email: "sanne@inbox.nl", wachtwoord: "sanne-wachtwoord" });
    const S2 = { "x-praktijk-sessie": (await l.json()).sessie };
    const brief = (await (await get("/api/praktijk/brief?praktijk=" + encodeURIComponent(P), S2)).json()).brief;
    assert.match(brief, new RegExp("Nog niet afgehandeld na 3 werkdagen of langer: " + a.naam.replace(".", "\\.")));
    const regel = brief.split("\n").find((r) => r.startsWith("Verdwijnt binnenkort")) || "";
    assert.match(regel, new RegExp(c.naam), "kaart zonder dossier staat erbij");
    assert.doesNotMatch(regel, new RegExp(b.naam), "kaart in het dossier niet");

    // ---- app (alleen met Playwright): inbox in Kaarten ----
    let pw = null;
    try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-inbox: geen Playwright, browserdeel overgeslagen"); }
    if (pw) {
      const browser = await pw.chromium.launch();
      try {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.5.9.1" } });
        await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, S2["x-praktijk-sessie"]);
        const page = await ctx.newPage();
        const fouten = [];
        page.on("pageerror", (e) => fouten.push(String(e)));
        await page.goto(origin + "/v2/app");
        await page.waitForSelector("[data-add]", { timeout: 15000 });
        await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
        await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
        await page.click("#kaartenBtn");
        await page.waitForSelector("[data-ibklaar]", { state: "visible", timeout: 8000 });
        assert.match(await page.textContent("#k_inbox"), /heeft een vraag/);
        assert.match(await page.textContent("#k_inbox"), /wacht \d+ werkdagen/);
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, "inbox-kaarten.png") });
        await page.click("[data-ibklaar]");
        await page.waitForFunction(() => /Niets nieuws/.test(document.getElementById("k_inbox").textContent), null, { timeout: 8000 });
        assert.deepEqual(fouten, []);
      } finally { await browser.close(); }
    }
    console.log("test-inbox: OK");
  } catch (e) {
    console.error(uit2.slice(-2000));
    throw e;
  } finally {
    app2.kill();
  }
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
