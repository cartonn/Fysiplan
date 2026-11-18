// De patiëntkaart haalt alleen op wat bij haar eigen oefeningen hoort.
// Tot nu toe haalde de kaartpagina bij elk bezoek de hele bibliotheek (/v2/oefeningen.json) en
// beide keuringsbestanden op: 1,6 MB aan tekst voor een kaart met een handvol oefeningen. De
// server stuurt nu met de kaart mee (GET /api/kaart) wat bij deze kaart hoort: `lib` en `keuring`.
// - De kaart kiest uit het kleine lijstje precies dezelfde oefening als uit de hele bibliotheek:
//   op vast id, op naam, bij een eigen oefening van de praktijk en bij een naam die niet bestaat.
// - De keuring geeft per oefening dezelfde uitkomst als met de hele bestanden: afgekeurd beeld,
//   tegengehouden uitleg (op id en op naam), goedgekeurde uitsnedes, afgedekt merk, en een
//   afgekeurde vorige versie. Dat draait de echte code uit kaart.html, op beide manieren.
// - Zonder pakket (een antwoord uit de offline-cache van een oudere versie) of met een pakket dat
//   niet klopt, leest de kaart de hele bestanden zoals eerst.
// De bestanden zelf blijven ongewijzigd en opvraagbaar.
// Het serverdeel past in CI; het browserdeel draait alleen waar Playwright staat.
// `npm run test:kaartpakket`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const lees = async (pad) => JSON.parse(await readFile(join(root, pad), "utf8"));
const tussen = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); const j = html.indexOf(b, i); assert.ok(j > i, b); return html.slice(i, j); };

// ---- 1. statisch: de kaart gebruikt het pakket en kan terug naar de hele bestanden ----
{
  assert.match(html, /var eigen=Array\.isArray\(d\.lib\)&&d\.keuring&&typeof d\.keuring==='object';/, "de kaart herkent het pakket");
  assert.match(html, /eigen\?d\.lib:fetch\('\/v2\/oefeningen\.json'/, "zonder pakket haalt ze de bibliotheek op");
  assert.match(html, /eigen\?loadMobileReview\(d\.keuring\)\.catch\(function\(\)\{return loadMobileReview\(\);\}\):loadMobileReview\(\)\)\.catch\(function\(\)\{mediaReviewReady=false;\}\)/,
    "een pakket dat niet klopt valt terug op de hele bestanden; lukt ook dat niet, dan blijft alles tegengehouden");
  assert.match(html, /if\(!d\|\|!d\.ok\)return \[d,\[\],null\];/, "een kaart die niet bestaat haalt verder niets op");
  const server = await readFile(join(root, "server.js"), "utf8");
  assert.match(server, /pakket = await kaartPakket\(found, eigenOef\)/, "de kaartroute maakt het pakket");
  assert.match(server, /\.\.\.\(pakket \|\| \{\}\) \}\);/, "en stuurt de kaart ook als het pakket niet lukt");
}

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-pakket-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const PK = "fysio pakket", KAART = "abcdef123456";
const EIGEN = { id: "po_0123456789ab", naam: "Eigen kniebuiging", img: "uploads/oef-eigen.jpg", uitleg: "Zak rustig door je knieën en kom weer omhoog.", t: 1 };
// een eigen oefening die de praktijk later de naam gaf van een bibliotheekoefening met een
// tegengehouden uitleg; de kaart kent haar nog onder de oude naam
const NAAMGENOOT = { id: "po_ba9876543210", naam: "Med ball swing", img: "uploads/oef-bal.jpg", uitleg: "Onze eigen uitleg bij de zwaai.", t: 2 };
const OUDE_NAAM = "Zwaai met de bal";
const gekozen = [
  { n: "Anteflexie armen", id: "fp_ff306042c93f0900", i: 0 },         // op vast id
  { n: "Squat", id: "", i: 0 },                                        // alleen op naam
  { n: "Step up with knee raise", id: "fp_7dc1478e2b3c17b0", i: 0 },  // beeld afgekeurd
  { n: "Yoga ear pressure", id: "fp_45eb69b02317733b", i: 0 },        // uitleg tegengehouden, op id
  { n: "mob back cat/cow", id: "", i: 0 },                            // uitleg tegengehouden, gevonden op naam
  { n: "Een naam van vroeger", id: "fp_027779ceb994b08e", i: 0 },     // hernoemd; een vorige versie van het beeld is afgekeurd
  { n: "Bestaat niet in de bibliotheek", id: "", i: 0 },              // onbekend
  { n: EIGEN.naam, id: EIGEN.id, i: 0 },                              // eigen oefening van de praktijk
  { n: OUDE_NAAM, id: NAAMGENOOT.id, i: 0 }                           // eigen oefening, nu naamgenoot van een tegengehouden uitleg
];
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ [PK]: { truus: { id: KAART, praktijk: "Fysio Pakket", naam: "Truus", ts: Date.now(),
  chosen: gekozen, rows: {}, cells: {}, vids: {}, client: { c_naam: "Truus" } } } }));
await writeFile(join(dataDir, "praktijk-oefeningen.json"), JSON.stringify({ [PK]: [EIGEN, NAAMGENOOT] }));

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
// localhost: de browser hieronder ziet dat als veilige oorsprong
const origin = `http://localhost:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV") delete kind[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
let ip = 1;
const haal = (pad) => fetch(origin + pad, { headers: { "x-forwarded-for": "10.77.0." + (ip++ % 250) } });

// de echte kaartcode in een VM: opzoeken van een oefening en het verwerken van de keuring
const normExBron = html.match(/  function normEx\(s\)\{[^\n]*\n/)[0];
const kaartCode = normExBron + tussen("  var mediaReviewReady=false,", "  function geldigeUitsnede(") +
  tussen("  function geldigeUitsnede(", "  async function loadMobileReview(") + tussen("  async function loadMobileReview(", "  // Een oude afkeuring mag") +
  tussen("  function metEigen(", "  function cellPrefix(") + html.match(/  function uitlegGehouden\(item\)\{\n[^\n]*\n  \}\n/)[0];
function kaartVm(bestanden) {
  const gevraagd = [];
  const ctx = vm.createContext({ Promise, Array, Number, String, Error, JSON, Math, Object,
    fetch: async (url) => { gevraagd.push(url); const d = bestanden && bestanden[url]; return d ? { ok: true, json: async () => JSON.parse(JSON.stringify(d)) } : { ok: false, json: async () => ({}) }; } });
  vm.runInContext(kaartCode, ctx);
  return { ctx, gevraagd };
}
// wat de kaart per oefening besluit, en welke sleutels de keuring voor deze kaart vult
function uitkomst(ctx, lib, kaart, ids) {
  ctx.__lib = lib; ctx.__kaart = kaart; ctx.__ids = [...ids];
  return JSON.parse(vm.runInContext(`(function(){
    var index=oefeningIndex(__lib,__kaart);
    var per=(__kaart.chosen||[]).map(function(x){
      var o=zoekOefening(index,x);
      var item={name:o?o.naam:x.n,id:(o&&o.exerciseId)||x.id||''};
      return {x:x.n,o:o,sleutel:o?mediaKey(o):'',beeldTegen:o?mediaWithheld(o):null,uitlegTegen:explanationWithheld(o),
        voorleesTegen:uitlegGehouden(item),uitsnede:o?(poseKeuring[mediaKey(o)]||null):null,merk:o?(merkDek[mediaKey(o)]||null):null};
    });
    var vanKaart=function(obj){var uit={};Object.keys(obj).sort().forEach(function(k){if(__ids.indexOf(k.split('|')[0])>-1)uit[k]=obj[k];});return uit;};
    return JSON.stringify({klaar:mediaReviewReady,per:per,afgekeurd:vanKaart(blockedMedia),uitsnedes:vanKaart(poseKeuring),merken:vanKaart(merkDek)});
  })()`, ctx));
}

let browserKlaar = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await haal("/health")).ok) break; } catch {} await wacht(50); }

  const r = await haal("/api/kaart?id=" + KAART);
  assert.equal(r.status, 200);
  const tekst = await r.text(), d = JSON.parse(tekst);
  assert.equal(d.ok, true);
  assert.ok(Array.isArray(d.lib) && d.keuring && Array.isArray(d.keuring.media.entries) && Array.isArray(d.keuring.narration.holds), "de kaart krijgt lib en keuring mee");
  const helelib = await (await haal("/v2/oefeningen.json")).json();
  const media = await lees("public/mobile-media-review.json"), uitleg = await lees("public/mobile-narration-review.json");
  const kaart = d.kaart;
  assert.deepEqual(kaart.eigenOef.map((e) => e.id).sort(), [EIGEN.id, NAAMGENOOT.id].sort(), "testopzet: de eigen oefeningen reizen met de kaart mee");

  // -- de bibliotheek: klein, en gelijkwaardig aan de hele --
  assert.ok(helelib.length > 500, "testopzet: de hele bibliotheek is groot (" + helelib.length + ")");
  assert.equal(d.lib.length, 6, "alleen de zes bibliotheekoefeningen van deze kaart: " + d.lib.map((o) => o.naam).join(", "));
  for (const o of d.lib) assert.deepEqual(o, helelib.find((h) => h.exerciseId === o.exerciseId), o.naam + ": de regel is onbewerkt die uit de bibliotheek");
  assert.deepEqual(d.lib.map((o) => o.exerciseId), helelib.filter((h) => d.lib.some((o) => o.exerciseId === h.exerciseId)).map((h) => h.exerciseId), "in de volgorde van de bibliotheek");
  // "Squat" en "Mob back cat/cow" tonen sinds de Nederlandse namen een andere naam; de naam
  // waaronder de kaart ze kent gaat mee als `eerder`
  const heet = (o, n) => !!o && (o.naam === n || (o.eerder || []).includes(n));
  assert.ok(d.lib.some((o) => heet(o, "Squat")), "een oefening die alleen op naam op de kaart staat gaat mee");
  assert.ok(d.lib.some((o) => o.exerciseId === "fp_027779ceb994b08e"), "een hernoemde oefening gaat mee op haar vaste id");
  assert.ok(!d.lib.some((o) => o.naam === "Med ball swing"), "testopzet: de bibliotheekoefening die net zo heet als de eigen oefening staat niet op de kaart");
  assert.ok(!d.lib.some((o) => /^po_/.test(o.exerciseId)), "eigen oefeningen staan niet in lib maar in kaart.eigenOef");

  // -- de keuring: alleen regels van deze kaart, onbewerkt, met de datum van beide bestanden --
  const ids = new Set([...d.lib.map((o) => o.exerciseId), ...gekozen.map((x) => x.id).filter(Boolean)]);
  assert.equal(d.keuring.media.reviewDate, media.reviewDate);
  assert.equal(d.keuring.narration.reviewDate, uitleg.reviewDate);
  assert.deepEqual(d.keuring.media.entries, media.entries.filter((e) => ids.has(e.exerciseId)), "beeldkeuring: precies de regels bij deze oefeningen, onbewerkt");
  assert.deepEqual(d.keuring.media.rejectedSources, media.rejectedSources.filter((e) => ids.has(e.exerciseId)), "afgekeurde vorige versies: alleen die van deze kaart");
  assert.equal(d.keuring.media.rejectedSources.length, 1, "testopzet: de afgekeurde vorige versie van de hernoemde oefening zit erbij");
  const namen = new Set([...d.lib.flatMap((o) => [o.naam, ...(o.eerder || [])]), ...gekozen.map((x) => x.n), EIGEN.naam, NAAMGENOOT.naam]);
  assert.deepEqual(d.keuring.narration.holds, uitleg.holds.filter((h) => ids.has(h.exerciseId) || namen.has(h.name)), "uitlegkeuring: de regels op id of op naam");
  assert.deepEqual(d.keuring.narration.holds.map((h) => h.name).sort(), ["Med ball swing", "Mob back cat/cow", "Yoga ear pressure"], "testopzet: drie tegengehouden uitleggen op deze kaart");
  assert.ok(d.keuring.media.entries.length < 12 && d.keuring.media.entries.length < media.entries.length / 50, "een handvol van de " + media.entries.length + " regels");

  // -- dezelfde uitkomst als met de hele bestanden: de echte kaartcode op beide manieren --
  const heel = kaartVm({ "/mobile-media-review.json": media, "/mobile-narration-review.json": uitleg });
  await vm.runInContext("loadMobileReview()", heel.ctx);
  assert.deepEqual(heel.gevraagd, ["/mobile-media-review.json", "/mobile-narration-review.json"], "zonder pakket leest de kaart beide bestanden");
  const klein = kaartVm(null);
  klein.ctx.__keuring = d.keuring;
  await vm.runInContext("loadMobileReview(__keuring)", klein.ctx);
  assert.deepEqual(klein.gevraagd, [], "met het pakket haalt de kaart voor de keuring niets op");
  const uitHeel = uitkomst(heel.ctx, helelib, kaart, ids), uitKlein = uitkomst(klein.ctx, d.lib, kaart, ids);
  assert.deepEqual(uitKlein, uitHeel, "per oefening dezelfde regel, hetzelfde beeld en dezelfde keuring als met de hele bestanden");
  // en de testgevallen zijn echt wat ze moeten zijn
  const van = (n) => uitKlein.per.find((p) => p.x === n);
  assert.equal(uitKlein.klaar, true);
  assert.equal(van("Anteflexie armen").o.exerciseId, "fp_ff306042c93f0900");
  assert.equal(van("Anteflexie armen").beeldTegen, false);
  assert.ok(van("Anteflexie armen").uitsnede && van("Anteflexie armen").merk, "goedgekeurde uitsnedes en het afgedekte merk komen mee");
  assert.ok(heet(van("Squat").o, "Squat"));
  assert.equal(van("Step up with knee raise").beeldTegen, true, "het afgekeurde beeld blijft tegengehouden");
  assert.equal(van("Yoga ear pressure").uitlegTegen, true, "de tegengehouden uitleg blijft tegengehouden (op id)");
  assert.ok(heet(van("mob back cat/cow").o, "Mob back cat/cow"));
  assert.equal(van("mob back cat/cow").uitlegTegen, true, "en ook als de kaart de oefening op naam vond");
  assert.equal(van("Een naam van vroeger").o.exerciseId, "fp_027779ceb994b08e");
  assert.ok(Object.keys(uitKlein.afgekeurd).some((k) => k === "fp_027779ceb994b08e|images/cardio/alternating-lunge-jumps-avatar-v8.jpg"), "de afgekeurde vorige versie blijft afgekeurd");
  assert.equal(van("Bestaat niet in de bibliotheek").o, null);
  assert.equal(van(EIGEN.naam).o.exerciseId, EIGEN.id);
  assert.equal(van(EIGEN.naam).uitlegTegen, false);
  assert.equal(van(OUDE_NAAM).o.exerciseId, NAAMGENOOT.id);
  assert.equal(van(OUDE_NAAM).uitlegTegen, true, "een houd op naam geldt ook voor de eigen naamgenoot, net als met het hele bestand");

  // -- een pakket dat niet klopt wordt geweigerd, met dezelfde controles als de bestanden --
  for (const [wat, stuk] of [
    ["zonder beeldkeuring", { narration: d.keuring.narration }],
    ["zonder uitlegkeuring", { media: d.keuring.media }],
    ["regels geen lijst", { media: { ...d.keuring.media, entries: "x" }, narration: d.keuring.narration }],
    ["houds geen lijst", { media: d.keuring.media, narration: { reviewDate: uitleg.reviewDate } }],
    ["twee generaties door elkaar", { media: d.keuring.media, narration: { ...d.keuring.narration, reviewDate: "1999-01-01" } }]]) {
    const k = kaartVm(null);
    k.ctx.__keuring = stuk;
    await assert.rejects(() => vm.runInContext("loadMobileReview(__keuring)", k.ctx), /Invalid review|generation/, wat);
    assert.equal(vm.runInContext("mediaReviewReady", k.ctx), false, wat + ": niets vrijgegeven");
  }

  // -- hoeveel lichter --
  const heleTekst = JSON.stringify(helelib).length + JSON.stringify(media).length + JSON.stringify(uitleg).length;
  assert.ok(tekst.length < 60000, "het antwoord met de kaart en haar pakket blijft klein: " + tekst.length + " bytes");
  assert.ok(tekst.length < heleTekst / 20, "minder dan een twintigste van de drie hele bestanden (" + tekst.length + " tegen " + heleTekst + ")");

  // -- de demokaart en een kaart die niet bestaat --
  const demo = await (await haal("/api/kaart?id=demo")).json();
  assert.ok(demo.ok && demo.lib.length > 0 && demo.lib.length <= demo.kaart.chosen.length, "de demokaart krijgt ook alleen haar eigen oefeningen");
  for (const x of demo.kaart.chosen) assert.ok(demo.lib.some((o) => (x.id && o.exerciseId === x.id) || heet(o, x.n)), "demokaart: " + x.n + " zit erbij");
  const weg = await haal("/api/kaart?id=ffffffffffff");
  assert.equal(weg.status, 404);
  assert.deepEqual(Object.keys(await weg.json()).sort(), ["fout", "ok"], "een kaart die niet bestaat krijgt geen pakket");

  // -- de bestanden zelf blijven opvraagbaar, voor de terugval --
  for (const pad of ["/v2/oefeningen.json", "/mobile-media-review.json", "/mobile-narration-review.json"]) assert.equal((await haal(pad)).status, 200, pad);
  console.log(`Kaartpakket (server): ${d.lib.length} van ${helelib.length} oefeningen en ${d.keuring.media.entries.length} van ${media.entries.length} keuringsregels reizen mee (${tekst.length} bytes tegen ${heleTekst}); per oefening dezelfde uitkomst als met de hele bestanden.`);

  // ---- 3. browser: wat de kaart ophaalt, en dat het scherm hetzelfde is ----
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-kaart-eigen-pakket: geen Playwright, browserdeel overgeslagen (het serverdeel draaide wel)"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    browserKlaar = () => browser.close();
    const HELE = ["/v2/oefeningen.json", "/mobile-media-review.json", "/mobile-narration-review.json"];
    let n = 0;
    // opent de kaart; `bewerk` mag het antwoord van /api/kaart aanpassen, `dicht` blokkeert de hele bestanden
    async function open({ bewerk = null, dicht = false } = {}) {
      const ctx = await browser.newContext({ ...pw.devices["iPhone SE"], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.78.0." + (++n) } });
      const page = await ctx.newPage();
      const fouten = [], gevraagd = [];
      page.on("pageerror", (e) => fouten.push(e.message));
      page.on("request", (q) => { const u = new URL(q.url()); if (u.origin === origin) gevraagd.push(u.pathname); });
      if (bewerk) await page.route((u) => u.pathname === "/api/kaart", async (route) => {
        const antwoord = await route.fetch(), lijf = await antwoord.json();
        await route.fulfill({ response: antwoord, json: bewerk(lijf) });
      });
      if (dicht) await page.route((u) => u.pathname.startsWith("/mobile-"), (route) => route.fulfill({ status: 503, body: "" }));
      await page.goto(origin + "/k/" + KAART, { waitUntil: "networkidle" });
      await page.waitForSelector("#wrap", { state: "visible" });
      await page.waitForFunction((aantal) => document.querySelectorAll("#oefs .oef[data-oidx]").length === aantal, gekozen.length);
      await wacht(600);
      const scherm = await page.evaluate(() => [...document.querySelectorAll("#oefs .oef[data-oidx]")].map((o) => ({
        naam: o.querySelector(".naam").textContent, beeld: (o.querySelector(".fotoknop img") || {}).src || "", pose: (o.querySelector(".fotoknop img") || { dataset: {} }).dataset.pose || "",
        meldingen: [...o.querySelectorAll("p.vmeta")].map((p) => p.textContent), uitleg: !!o.querySelector(".oefuitleg") })));
      await ctx.close();
      assert.deepEqual(fouten, [], "geen fouten op de pagina");
      return { scherm, hele: HELE.filter((p) => gevraagd.includes(p)) };
    }
    const gewoon = await open();
    assert.deepEqual(gewoon.hele, [], "met het pakket haalt de kaart de bibliotheek en de keuringsbestanden niet meer op");
    assert.equal(gewoon.scherm.filter((o) => o.beeld).length, 7, "zeven van de negen met beeld (afgekeurd en onbekend zonder): " + JSON.stringify(gewoon.scherm.map((o) => [o.naam, !!o.beeld])));
    assert.equal(gewoon.scherm.find((o) => o.naam === "Step up with knee raise").beeld, "", "het afgekeurde beeld staat er niet");
    assert.equal(gewoon.scherm.find((o) => o.naam === "Yoga ear pressure").uitleg, false, "de tegengehouden uitleg staat er niet");
    assert.equal(gewoon.scherm.find((o) => o.naam === "Anteflexie armen").uitleg, true);

    // een antwoord zonder pakket (offline-cache van een oudere versie): de hele bestanden, hetzelfde scherm
    const zonder = await open({ bewerk: (l) => { delete l.lib; delete l.keuring; return l; } });
    assert.deepEqual(zonder.hele, HELE, "zonder pakket leest de kaart de hele bestanden zoals eerst");
    assert.deepEqual(zonder.scherm, gewoon.scherm, "en toont precies hetzelfde");

    // een keuring die niet klopt: de bibliotheek uit het pakket, de keuring uit de hele bestanden
    const stuk = await open({ bewerk: (l) => { l.keuring.narration.reviewDate = "1999-01-01"; return l; } });
    assert.deepEqual(stuk.hele, HELE.slice(1), "een pakket met twee generaties door elkaar: terug naar de keuringsbestanden");
    assert.deepEqual(stuk.scherm, gewoon.scherm, "met hetzelfde scherm");

    // en lukt ook dat niet, dan blijft elk beeld tegengehouden (zoals altijd zonder controle)
    const dichtbij = await open({ bewerk: (l) => { l.keuring.narration.reviewDate = "1999-01-01"; return l; }, dicht: true });
    assert.equal(dichtbij.scherm.filter((o) => o.beeld).length, 0, "zonder geldige keuring geen enkel beeld");
    console.log("Kaartpakket (browser): geen verzoek meer naar de hele bestanden; zonder of met een ongeldig pakket leest de kaart ze zoals eerst en toont hetzelfde.");
  }
} catch (e) {
  if (log.trim()) console.error(log.split("\n").slice(-15).join("\n"));
  throw e;
} finally {
  if (browserKlaar) await browserKlaar().catch(() => {});
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
