// Gebruikers-sweep 2026-11-11 18u (Karin, beheerder, desktop en iPad): sinds het donkere V2-thema
// (Active Tech, #197) waren het Team-venster en het Kaarten-paneel bijna onleesbaar. De lichtblauwe
// naamblokken (--naamblok #eaf2fd) bleven licht terwijl de tekst wit werd (contrast ±1,1:1), de rolkeuze
// was wit op wit, het rolpilletje en het uitnodigformulier licht met lichte tekst.
// Nu krijgen naamblokken, rolpil, rolkeuze en uitnodigformulier in het donkere thema donkere vlakken.
// Platformreview 2026-11-11: daarna elke toestand nagelopen (in rust, onder de muis, met focus, in
// elk venster). Nog licht met lichte tekst (1,0 tot 1,9:1): de rij onder de muis en de groepskop in
// de sjabloonkiezer, het hele hulpvenster, velden zonder type-attribuut (praktijknaam bij welkom,
// eigen login, eigen oefening), datumvelden, het zoekveld in Kaarten, de categorie en de beeldkeuze
// onder de muis, de actieve sorteerknop (wit op limoen) en foutmeldingen in donkerrood op petrol.
// Het venster "Nieuw in Fysiplan" was wit zonder achtergrond.
// Broncontrole altijd (CI); het browserdeel (meet het contrast van alle zichtbare tekst in de
// vensters, ook onder de muis en met focus) alleen waar Playwright staat. `npm run test:v2contrast`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const css = await readFile(join(root, "public/v2.css"), "utf8");
// het donkere schermblok (na de Active Tech-kleuren) moet de lichte naamblokken overschrijven
const donker = css.slice(css.indexOf("--bg:#18343b"));
assert.ok(donker.length > 10, "donker thema gevonden");
assert.match(donker, /--naamblok:#[0-9a-f]{6}/i, "naamblok krijgt in het donkere thema een eigen kleur");
const nb = donker.match(/--naamblok:#([0-9a-f]{6})/i)[1];
const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
assert.ok(ratio("ffffff", nb) >= 4.5, "witte naam op het naamblok minstens 4,5:1, nu " + ratio("ffffff", nb).toFixed(2));

// proefformulier (Mark): een veld met een fout was witte tekst op #fffafa, het pijnseintje rood op petrol
const proef = await readFile(join(root, "public/proef.html"), "utf8");
const proefDonker = proef.slice(proef.indexOf("--bg:#18343b"));
const fout = proefDonker.match(/--fout:#([0-9a-f]{6})/i);
assert.ok(fout && ratio(fout[1], "20464f") >= 4.5, "foutkleur leesbaar op petrol");
const mis = proefDonker.match(/\.veld\.mis input\{background:#([0-9a-f]{6})/i);
assert.ok(mis && ratio("ffffff", mis[1]) >= 4.5, "getypte tekst in een foutveld leesbaar");
const alarm = proefDonker.match(/\.alarm\{background:#([0-9a-f]{6})/i);
assert.ok(alarm && ratio(fout[1], alarm[1]) >= 4.5, "alarmregel leesbaar");

// ---- tweede ronde (platformreview 2026-11-11): vlakken en tekstkleuren in het donkere thema ----
const PANEEL = "20464f", BLOK = "2b5054", LIMOEN = "b9e34b";
const hex6 = (h) => (h.length === 3 ? h.split("").map((c) => c + c).join("") : h).toLowerCase();
// de achtergrond die het donkere thema aan een selector geeft (laatste regel wint)
// ook de tekstkleur, als dezelfde regel die zet
const vlakVan = (selector) => {
  let gevonden = null;
  for (const m of donker.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(",").some((x) => x.trim().replace(/\s+/g, " ") === selector)) continue;
    const bg = m[2].match(/background(?:-color)?:\s*#([0-9a-f]{3,6})\b/i);
    const kl = m[2].match(/(?:^|;)\s*color:\s*#([0-9a-f]{3,6})\b/i);
    if (bg) gevonden = { bg: hex6(bg[1]), kleur: kl ? hex6(kl[1]) : null };
  }
  return gevonden;
};
for (const [selector, wat] of [
  ["html.v2 .sjb-groep", "groepskop in de sjabloonkiezer"],
  ["html.v2 .sjb-rij:hover", "rij onder de muis in de sjabloonkiezer"],
  ["html.v2 .helpsection", "blokken in het hulpvenster"],
  ["html.v2 #filters .chip:hover", "categorie onder de muis"],
  ["html.v2 .topbar #beeldKeuze .beeldsegment button:hover", "beeldkeuze onder de muis"],
  ["html.v2 .video-drop:hover", "videovak onder de muis"],
  ["html.v2 dialog.fp-nieuw", "venster Nieuw in Fysiplan"]
]) {
  const v = vlakVan(selector);
  assert.ok(v, wat + ": het donkere thema geeft " + selector + " een eigen achtergrond");
  // zet de regel zelf de tekstkleur, dan telt die; anders de gewone tekst en de gedempte tekst van het thema
  for (const kleur of v.kleur ? [v.kleur] : ["ffffff", "e0eae7", "bdcfca"]) {
    assert.ok(ratio(kleur, v.bg) >= 4.5, wat + ": tekst #" + kleur + " leesbaar op #" + v.bg + " (" + ratio(kleur, v.bg).toFixed(2) + ":1)");
  }
}
// velden zonder type-attribuut en datumvelden krijgen het donkere veld
const veldRegel = donker.match(/html\.v2 input:where\((.*?)\)\{background-color:#([0-9a-f]{3,6});color:#([0-9a-f]{3,6})\b/i);
assert.ok(veldRegel, "het donkere thema kleurt ook velden zonder type-attribuut");
for (const soort of [":not([type])", "[type=search]", "[type=number]", "[type=date]", "[type=datetime-local]"]) assert.ok(veldRegel[1].includes(soort), "veldregel dekt " + soort);
assert.ok(ratio(hex6(veldRegel[3]), hex6(veldRegel[2])) >= 4.5, "getypte tekst leesbaar in het veld");
// tekst op de merkkleur, foutrood en goedgroen lopen via variabelen die het donkere thema omzet
const kleurVar = (naam) => { const m = [...donker.matchAll(new RegExp("html\\.v2\\{[^}]*--" + naam + ":#([0-9a-f]{6})", "gi"))].pop(); return m ? m[1] : null; };
const opMerk = kleurVar("op-merk"), foutKleur = kleurVar("fout"), goedKleur = kleurVar("goed");
assert.ok(opMerk && ratio(opMerk, LIMOEN) >= 4.5, "tekst op limoen leesbaar (--op-merk)");
for (const [naam, kleur] of [["--fout", foutKleur], ["--goed", goedKleur]]) {
  assert.ok(kleur, naam + " heeft in het donkere thema een eigen tint");
  assert.ok(ratio(kleur, PANEEL) >= 4.5 && ratio(kleur, BLOK) >= 4.5, naam + " leesbaar op het paneel en op een blok");
}
assert.match(donker, /html\.v2 #a4\{[^}]*--op-merk:#fff[^}]*--fout:#b42318/, "op de A4 (papier) blijven de drukkleuren");

// In de app zelf: geen donkere tekstkleur die direct op het donkere vlak staat, en geen licht vlak
// waar de tekst de lichte themakleur erft. Wie een nieuwe melding of chip toevoegt, gebruikt
// var(--fout,#b42318), var(--goed,#287a4b) of var(--op-merk,#fff), of geeft vlak én tekst een kleur.
for (const bestand of ["public/index.html", "public/release-notes.js"]) {
  const regels = (await readFile(join(root, bestand), "utf8")).split("\n");
  const mis = [];
  regels.forEach((regel, i) => {
    for (const m of regel.matchAll(/(?:style=\\?(['"])(.*?)\\?\1|cssText\s*=\s*(['"])(.*?)\3)/g)) {
      const st = m[2] || m[4] || "";
      const tekst = st.match(/(?:^|;)\s*color:\s*#([0-9a-fA-F]{3,6})\b/);
      const vlak = st.match(/background(?:-color)?:\s*#([0-9a-fA-F]{3,6})\b/);
      const heeftVlak = /background(?:-color)?:/.test(st), heeftTekst = /(?:^|;)\s*color:/.test(st);
      if (tekst && !heeftVlak && ratio(hex6(tekst[1]), PANEEL) < 4.5) mis.push((i + 1) + ": donkere tekst #" + tekst[1] + " zonder eigen vlak");
      if (vlak && !heeftTekst && lum(hex6(vlak[1])) > 0.6) mis.push((i + 1) + ": licht vlak #" + vlak[1] + " zonder eigen tekstkleur");
    }
    for (const m of regel.matchAll(/\.style\.color\s*=\s*([^;]{0,90})/g)) {
      // de terugvalkleur in var(--naam,#kleur) telt niet; een zin die ook de achtergrond zet evenmin
      const kaal = m[1].replace(/var\(--[a-z-]+,#[0-9a-fA-F]{3,6}\)/g, "");
      if (/\.style\.background\s*=/.test(regel)) continue;
      for (const h of kaal.match(/#[0-9a-fA-F]{3,6}\b/g) || []) if (ratio(hex6(h.slice(1)), PANEEL) < 4.5) mis.push((i + 1) + ": style.color=" + h + " zonder variabele");
    }
  });
  assert.deepEqual(mis, [], bestand + ": kleuren die in het donkere thema onleesbaar zijn: " + mis.join(" | "));
}
const rn = await readFile(join(root, "public/release-notes.js"), "utf8");
assert.match(rn, /dialog\.className='no-print fp-nieuw'/, "Nieuw in Fysiplan gebruikt de opmaak uit v2.css");
assert.doesNotMatch(rn, /cssText/, "Nieuw in Fysiplan heeft geen losse lichte opmaak meer");

let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch {}
if (!pw) { console.log("browserdeel overgeslagen (geen Playwright)"); console.log("v2 contrast: ok"); process.exit(0); }

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-contrast-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.33." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Contrast";

// meet in de pagina: elke zichtbare tekst (ook in select/input) tegen de eerste niet-doorzichtige achtergrond
const meet = (sel) => {
  const rgb = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const achter = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255 }; };
  const slecht = [];
  const wortel = document.querySelector(sel);
  if (!wortel) return [{ fout: "geen " + sel }];
  // het element zelf telt mee (een knop met losse tekst), en van een leeg veld de voorbeeldtekst
  for (const el of [wortel, ...wortel.querySelectorAll("*")]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || +st.opacity < 0.3) continue;
    let tekst = "", kleur = st.color;
    if (el.tagName === "SELECT") tekst = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : "";
    else if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|email|search|tel|url|number)$/.test(el.type))) {
      tekst = el.value;
      if (!tekst && el.placeholder) { tekst = el.placeholder; kleur = getComputedStyle(el, "::placeholder").color; }
    } else for (const n of el.childNodes) if (n.nodeType === 3) tekst += n.textContent;
    tekst = tekst.trim();
    if (!tekst) continue;
    const v = rgb(kleur), a = achter(el);
    if (!v) continue;
    const [x, y] = [L(v), L(a)].sort((p, q) => q - p);
    const c = (x + 0.05) / (y + 0.05);
    if (c < 3) slecht.push({ tekst: tekst.slice(0, 30), tag: el.tagName, cls: String(el.className).slice(0, 30), c: +c.toFixed(2) });
  }
  return slecht;
};

const browser = await pw.chromium.launch();
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const sessie = (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "contrast-wachtwoord-1", akkoord: true })).json()).sessie;
  const S = { "x-praktijk-sessie": sessie };
  const id = (await (await post("/api/kaarten", { praktijk: P, naam: "Truus", client: { c_naam: "Truus" },
    chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" }, S)).json()).id;
  assert.ok(id, "kaart gedeeld");
  await post("/api/kaart/seintje", { id, soort: "vraag" });
  const inv = await post("/api/praktijk/team/uitnodigen", { naam: "Lotte", email: "lotte@example.org", rol: "therapeut" }, S);
  assert.equal(inv.status, 200, "collega uitgenodigd");

  for (const schema of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: schema, locale: "nl-NL",
      extraHTTPHeaders: { "x-forwarded-for": "10.7.33.20" + (schema === "dark" ? 1 : 0) } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); } catch {} }, sessie);
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.dismiss());
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
    await page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); });
    await page.click("#kaartenBtn");
    await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
    await wacht(600);
    const k = await page.evaluate(meet, "#ovKaarten");
    assert.deepEqual(k, [], schema + ": Kaarten-paneel leesbaar (contrast ≥ 3:1): " + JSON.stringify(k));
    await page.evaluate(() => document.getElementById("ps_team").click());
    await page.waitForSelector("#ovTeam.on .tm-lid", { timeout: 8000 });
    await wacht(400);
    const t = await page.evaluate(meet, "#ovTeam");
    assert.deepEqual(t, [], schema + ": Team-venster leesbaar (contrast ≥ 3:1): " + JSON.stringify(t));
    await ctx.close();
  }

  // ---- tweede ronde: onder de muis en met focus, in de vensters die een nieuwe gebruiker het eerst ziet ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.7.33.210" } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fp_praksessie", t); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} }, sessie);
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    await page.goto(origin + "/v2/app");
    await page.waitForSelector("[data-add]", { timeout: 15000 });
    await page.evaluate((pr) => { const p = document.getElementById("praktijk"); p.value = pr; p.dispatchEvent(new Event("input", { bubbles: true })); }, P);
    const sluit = () => page.evaluate(() => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); document.querySelectorAll("dialog[open]").forEach((d) => d.close()); });
    // meet binnen één element (zelfde maat als hierboven), na de overgang van :hover of :focus
    let merk = 0;
    const meetEl = async (el) => {
      const sel = "[data-meet='m" + (++merk) + "']";
      await el.evaluate((e, m) => e.setAttribute("data-meet", m), "m" + merk);
      const uit = await page.evaluate(meet, sel);
      await el.evaluate((e) => e.removeAttribute("data-meet"));
      return uit;
    };
    const onderMuis = async (sel, wat, max = 3) => {
      const els = await page.$$(sel);
      assert.ok(els.length, wat + ": " + sel + " bestaat");
      for (const el of els.slice(0, max)) {
        if (!(await el.isVisible())) continue;
        await el.hover(); await wacht(280);
        const m = await meetEl(el);
        assert.deepEqual(m, [], wat + " onder de muis leesbaar: " + JSON.stringify(m));
      }
      await page.mouse.move(2, 2);
    };
    const metFocus = async (sel, wat) => {
      const el = await page.$(sel);
      assert.ok(el, wat + ": " + sel + " bestaat");
      await el.fill("Voorbeeldtekst"); await el.focus(); await wacht(220);
      const m = await meetEl(el);
      assert.deepEqual(m, [], wat + " met getypte tekst leesbaar: " + JSON.stringify(m));
      const vlak = await el.evaluate((e) => getComputedStyle(e).backgroundColor);
      assert.notEqual(vlak, "rgb(255, 255, 255)", wat + ": geen wit veld in het donkere scherm");
      await el.fill("");
    };

    await sluit();
    await onderMuis("#filters .chip:not(.on)", "categorie");
    await onderMuis("#beeldKeuze .beeldsegment button:not(.aan)", "beeldkeuze", 1);
    await onderMuis(".row .fav", "ster bij een oefening", 1);

    // sjabloonkiezer: het eerste venster van een nieuwe gebruiker
    await page.evaluate(() => document.getElementById("sjabBtn").click());
    await page.waitForSelector("#ovSjab.on .sjb-rij", { timeout: 8000 });
    await wacht(400);
    assert.deepEqual(await page.evaluate(meet, "#ovSjab"), [], "sjabloonkiezer in rust leesbaar");
    await onderMuis("#ovSjab .sjb-rij", "rij in de sjabloonkiezer", 4);
    await onderMuis("#ovSjab .sjb-cat", "categorie in de sjabloonkiezer", 3);
    const groepskop = await page.evaluate(() => { const l = document.getElementById("sj_lijst"); l.scrollTop = 260; return getComputedStyle(l.querySelector(".sjb-groep")).backgroundColor; });
    assert.notEqual(groepskop, "rgb(255, 255, 255)", "de vastgeplakte groepskop is geen witte balk");
    await wacht(150);
    assert.deepEqual(await page.evaluate(meet, "#ovSjab"), [], "sjabloonkiezer na scrollen leesbaar");

    // hulp, welkom, eigen lijst uploaden, video koppelen
    for (const venster of ["ovHelp", "ovWelkom", "ovUp", "ovVideo"]) {
      await sluit();
      await page.evaluate((i) => document.getElementById(i).classList.add("on"), venster);
      await wacht(250);
      assert.deepEqual(await page.evaluate(meet, "#" + venster), [], "#" + venster + " leesbaar");
    }
    await sluit();
    await page.evaluate(() => document.getElementById("ovWelkom").classList.add("on"));
    await metFocus("#welkom_praktijk", "praktijknaam bij welkom");

    // kaarten: actieve sorteerknop (was wit op limoen), en het seintjesvenster
    await sluit();
    await page.click("#kaartenBtn");
    await page.waitForSelector(`[data-sopen='${id}']`, { state: "visible", timeout: 8000 });
    await wacht(500);
    const actief = await page.$("#k_srv_sort [data-sort][aria-pressed='true']");
    if (actief) assert.deepEqual(await meetEl(actief), [], "actieve sorteerknop leesbaar");
    await page.evaluate((i) => document.querySelector(`[data-sein='${i}']`).click(), id);
    await page.waitForSelector("#ovSein.on", { timeout: 5000 });
    await wacht(250);
    assert.equal(await page.textContent("#sn_titel"), "Seintje van Truus", "het seintjesvenster noemt de patiënt");
    assert.match(await page.textContent("#sn_uitleg"), /Heeft een vraag · vandaag/, "het seintjesvenster zegt wat er gemeld is en wanneer");
    assert.deepEqual(await page.evaluate(meet, "#ovSein"), [], "seintjesvenster leesbaar");

    // team: het veld voor je eigen login en de foutmelding eronder
    await sluit();
    await page.click("#kaartenBtn");
    await page.waitForSelector("#ps_team", { state: "visible", timeout: 8000 });
    await page.evaluate(() => document.getElementById("ps_team").click());
    await page.waitForSelector("#ovTeam.on #tm_enaam", { timeout: 8000 });
    await metFocus("#tm_enaam", "naam bij eigen login");
    await page.evaluate(() => document.getElementById("tm_edo").click());
    await wacht(400);
    assert.deepEqual(await page.evaluate(meet, "#ovTeam"), [], "foutmelding in het teamvenster leesbaar");

    // Nieuw in Fysiplan: donker vlak, in het midden, met een echte achtergrond erachter
    await sluit();
    const nieuw = await page.evaluate(() => { const d = document.querySelector("dialog.fp-nieuw"); d.showModal(); const r = d.getBoundingClientRect(); return { links: Math.round(r.left), rechts: Math.round(innerWidth - r.right), vlak: getComputedStyle(d).backgroundColor, achter: getComputedStyle(d, "::backdrop").backgroundColor }; });
    assert.ok(Math.abs(nieuw.links - nieuw.rechts) <= 2, "Nieuw in Fysiplan staat in het midden: " + JSON.stringify(nieuw));
    assert.notEqual(nieuw.vlak, "rgb(255, 255, 255)", "Nieuw in Fysiplan is geen wit venster");
    assert.match(nieuw.achter, /rgba\(\d+, \d+, \d+, 0\.[3-9]/, "Nieuw in Fysiplan heeft een achtergrond: " + nieuw.achter);
    assert.deepEqual(await page.evaluate(meet, "dialog.fp-nieuw"), [], "Nieuw in Fysiplan leesbaar");
    await ctx.close();
  }
  console.log("v2 contrast: ok");
} catch (e) {
  console.error(uit.slice(-1500));
  throw e;
} finally {
  await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
