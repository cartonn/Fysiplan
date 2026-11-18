// Gebruikers-sweep 2026-11-14 22u / 2026-11-15 02u (Mark, desktop + iPad): "Bewaar" bij een afspraak met
// een verlopen proef. De melding "Niet bewaard" kwam onder de knoprij buiten het venster (desktop 800 hoog),
// en het veld hield de niet-bewaarde datum, zodat het leek alsof de afspraak wel stond.
// Nu: de melding schuift in beeld en veld + herhaling springen terug naar wat echt op de kaart staat.
// Broncontrole altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:afspraakproef`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
const afs = idx.match(/var af=e\.target\.closest\('\[data-safspraakopslaan\]'\);[\s\S]*?\n      return;\n    \}/);
assert.ok(afs, "afspraak-handler gevonden");
assert.match(afs[0], /proefVerlopen\)\{[\s\S]*veldA\.value=veldA\.defaultValue;[\s\S]*defaultSelected[\s\S]*toonProefVoorbij\(af\)/,
  "verlopen proef: veld en herhaling terug vóór de melding");
assert.match(idx, /function toonProefVoorbij\(anker,stil\)\{[\s\S]{0,2500}na\.scrollIntoView\(\{block:'nearest'\}\)/,
  "melding naast de knop schuift in beeld");
// Sanne (schermlezer): de knoppen per kaart in Kaarten noemden geen patiënt ("Deel", "Openen", "Kopie", "×").
for (const k of ["sdeel", "sopen", "skopie", "slog", "sdossier", "sherstel"]) {
  assert.match(idx, new RegExp("data-" + k + "='\"\\+esc\\(c\\.id\\)\\+\"' aria-label='[^']+ — kaart \"\\+esc\\(c\\.naam\\)\\+\"'"), "label met patiënt: " + k);
}
assert.doesNotMatch(idx, /aria-label='Naar prullenbak'>×/, "× noemt de kaart");
// Karin: logo-upload van een bestand dat geen plaatje is gaf geen melding (resizeDataUrl geeft null)
assert.match(idx, /resizeDataUrl\(rd\.result,320,function\(durl\)\{[\s\S]{0,200}if\(!durl\)\{alert\(/, "logo: niet-plaatje geeft een melding");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("test-sweep-afspraak-proef-voorbij: broncontrole groen (geen Playwright, browserdeel overgeslagen)"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-afspraakproef-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.3." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Afspraakproef";
const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "wachtwoord-afspraakproef", akkoord: true });
  assert.equal(claim.status, 200);
  const sessie = (await claim.json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const r = await post("/api/kaarten", { praktijk: P, naam: "Mees", client: { c_naam: "Mees" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  // een bestaande afspraak die op de kaart staat
  const pz = (n) => String(n).padStart(2, "0");
  const veld = (d) => d.getFullYear() + "-" + pz(d.getMonth() + 1) + "-" + pz(d.getDate()) + "T" + pz(d.getHours()) + ":" + pz(d.getMinutes());
  const d0 = new Date(); d0.setDate(d0.getDate() + 30); d0.setHours(9, 30, 0, 0);
  const d1 = new Date(); d1.setDate(d1.getDate() + 60); d1.setHours(14, 0, 0, 0);
  const t0 = d0.getTime();
  assert.equal((await post("/api/kaart/afspraak", { praktijk: P, id, t: t0, herhaal: 0 }, S)).status, 200);

  for (const [naam, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["iPad", pw.devices["iPad (gen 7)"]]]) {
    const ctx = await browser.newContext({ ...opts, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.8.4." + (ip++) } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    page.on("dialog", (d) => { fouten.push("onverwacht venster: " + d.message()); d.dismiss(); });
    // de proef is voorbij: de server weigert het bewaren van de afspraak
    let posts = 0;
    await page.route("**/api/kaart/afspraak", (rt) => { posts++; return rt.fulfill({ status: 403, contentType: "application/json",
      body: JSON.stringify({ ok: false, proefVerlopen: true, fout: "De gratis proef is voorbij." }) }); });
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.evaluate(() => document.getElementById("kaartenBtn").click());
    await page.waitForSelector(`[data-sdeel='${id}']`, { state: "visible", timeout: 8000 });
    await page.click(`[data-sdeel='${id}']`);
    await page.waitForSelector(`[data-safspraakopslaan='${id}']`, { state: "visible", timeout: 8000 });
    const oud = await page.inputValue(`[data-safspraak='${id}']`);
    assert.equal(oud, veld(d0), naam + ": bestaande afspraak in het veld");
    await page.fill(`[data-safspraak='${id}']`, veld(d1));
    const herhaal = page.locator(`[data-safherhaal='${id}']`);
    if (await herhaal.count()) await herhaal.selectOption("4");
    await page.click(`[data-safspraakopslaan='${id}']`);
    const melding = page.locator("#ovKaarten .proef-voorbij-ov").first();
    await melding.waitFor({ state: "visible", timeout: 6000 });
    await wacht(400);
    const m = await melding.evaluate((el) => {
      const r = el.getBoundingClientRect(), mod = el.closest(".modal").getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: innerHeight, mTop: mod.top, mBottom: mod.bottom };
    });
    assert.ok(m.top >= Math.max(0, m.mTop) - 1 && m.bottom <= Math.min(m.h, m.mBottom) + 1,
      naam + ": melding 'Niet bewaard' in beeld (" + JSON.stringify(m) + ")");
    assert.equal(await page.inputValue(`[data-safspraak='${id}']`), oud, naam + ": veld terug naar de bewaarde afspraak");
    if (await herhaal.count()) assert.equal(await herhaal.inputValue(), "0", naam + ": herhaling terug");
    assert.equal(posts, 1, naam + ": één poging");
    // schermlezer: toegankelijke naam van de knoppen noemt de kaart en begint met de zichtbare tekst
    for (const [sel, zicht] of [[`[data-sdeel='${id}']`, "Deel"], [`[data-sopen='${id}']`, "Openen"], [`[data-skopie='${id}']`, "Kopie"]]) {
      const lab = await page.locator(sel).first().getAttribute("aria-label");
      assert.ok(lab && lab.startsWith(zicht) && lab.includes("Mees"), naam + ": label " + zicht + " = " + lab);
    }
    assert.deepEqual(fouten, [], naam);
    await ctx.close();
  }
  // en de server heeft de oude afspraak nog
  const k = (await (await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(P), { headers: kop(S) })).json()).find((x) => x.id === id);
  assert.equal(k.afspraak && k.afspraak.t, t0);
  // Jayden: de agendabestandsnaam volgt de taal van de kaart
  for (const [taal, naam] of [["en", "appointment.ics"], ["", "afspraak.ics"], ["__proto__", "afspraak.ics"]]) {
    const ics = await fetch(origin + "/api/kaart/afspraak.ics?id=" + id + (taal ? "&taal=" + taal : ""), { headers: kop() });
    assert.equal(ics.status, 200);
    assert.ok((ics.headers.get("content-disposition") || "").includes("filename=\"" + naam + "\""), "ics-naam " + taal + ": " + ics.headers.get("content-disposition"));
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
console.log("test-sweep-afspraak-proef-voorbij: OK");
