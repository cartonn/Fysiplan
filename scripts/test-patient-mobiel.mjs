// Patiëntkaart op de telefoon (herontwerp 2026-11-10, iPhone SE en Pixel 7).
// De kaart heeft twee standen met dezelfde oefeningen: een overzicht (korte rijen) en de
// oefenstand (één oefening per scherm, met beeld, dosering, uitleg en één grote knop).
// - uitleg staat bij de oefening zelf ("Zo doe je het"), in negen talen, nooit bij een
//   tegengehouden beeld of tegengehouden uitleg
// - alleen de avatar (kaartImg), nooit de lijntekening (img)
// - "30 sec" krijgt geen "herhalingen" erachter
// - de beginscherm-uitnodiging komt pas na de pijnscore of "Ik heb vandaag geoefend"
// - de oefenstand: Begin, Gedaan, Volgende, Klaar, en de terugknop van de telefoon
// Statisch altijd (CI); het browserdeel alleen waar Playwright staat.
// `npm run test:patientmobiel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const TALEN = ["nl", "en", "de", "fr", "es", "pl", "tr", "ar", "uk"];
const zo = vm.runInNewContext("(" + html.match(/var ZO_DOE=(\{[^\n]*?\});/)[1] + ")");
for (const t of TALEN) assert.ok(zo[t], "Zo doe je het: " + t);

// de teksten van de oefenstand, in elke taal
const tses = vm.runInNewContext("(" + html.match(/var TSES=(\{[\s\S]*?\n {2}\});/)[1] + ")");
for (const t of TALEN) {
  for (const k of ["door", "start", "verder", "overzicht", "nvan", "volgende", "klaar", "vorige", "status", "ongedaan", "meer"]) {
    assert.ok(tses[t] && tses[t][k], "oefenstand " + k + ": " + t);
  }
  assert.ok(/\{n\}/.test(tses[t].nvan) && /\{t\}/.test(tses[t].nvan), "Oefening n van t: " + t);
}

// het uitlegblok, los uitgevoerd
const blok = html.slice(html.indexOf("  var ZO_DOE="), html.indexOf("  // Uitwijklink onder een ingesloten YouTube-video"));
assert.ok(blok.includes("function oefUitlegBlok(o,gehouden){"), "uitlegblok gevonden");
const ctx = vm.createContext({ TAAL: "nl", NIET_VERTAALD: { en: "nog niet vertaald" },
  esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  vt: (s) => s, uitlegNietVertaald: () => false });
vm.runInContext(blok, ctx);
const o = { uitleg: "Sta rechtop <en> zak door je knieën. Kom rustig weer omhoog; adem door." };
const uit = ctx.oefUitlegBlok(o, false);
assert.match(uit, /^<div class="oefuitleg"><h3>Zo doe je het<\/h3>/);
assert.ok(uit.includes("Sta rechtop &lt;en&gt;"), "uitleg ge-escaped");
assert.equal((uit.match(/<p /g) || []).length, 2, "elke zin een eigen regel");
assert.deepEqual([...ctx.uitlegZinnen("Buig 2,5 cm. Houd 5 sec. vast en laat los.")], ["Buig 2,5 cm.", "Houd 5 sec. vast en laat los."], "afkorting of komma breekt geen zin");
assert.equal(ctx.oefUitlegBlok(o, true), "", "tegengehouden: geen uitleg");
assert.equal(ctx.oefUitlegBlok({}, false), "", "zonder uitleg geen blok");
assert.ok(html.includes("oefUitlegBlok(o,hideMedia||holdExplanation)"), "tekenKaart geeft de controlestatus mee");

// alleen avatars
assert.ok(html.includes("var beeldpad=o&&o.kaartImg?o.kaartImg:'';"));
assert.ok(!/beeldpad=[^;]*o\.img/.test(html), "geen lijntekening als terugval");

// de stemknop zegt wat hij doet
assert.ok(html.includes("var NOOR_LABEL='Luister naar deze oefening';") && !html.includes("'Luister naar Noor'"), "knop zegt wat hij doet");

// tijd is geen aantal herhalingen
assert.ok(/\^\\s\*\\d\+\(\[-–\]\\d\+\)\?\\s\*x\?\\s\*\$/.test(html), "regel voor herhalingen staat erin");
const isAantal = (h) => /^\s*\d+([-–]\d+)?\s*x?\s*$/i.test(h);
assert.ok(isAantal("10") && isAantal("8-12") && isAantal("10x"));
assert.ok(!isAantal("30 sec") && !isAantal("1 min") && !isAantal("2x30s"));

// beginscherm-uitnodiging: niet op een klok bij het openen en niet midden in het oefenen
assert.ok(!/setTimeout\(function\(\)\{toonBanner\(true\);\},2500\)/.test(html), "geen balk 2,5 s na het openen");
assert.ok(html.includes("closest('#gdaan,#mschaal button')"), "balk pas na de pijnscore of 'geoefend'");
assert.ok(html.includes("body.sessie .appbanner{display:none !important}"), "geen balk over de oefenstand");

// opbouw: oefeningen eerst, daarna "Hoe ging het", contact, Meer; Print en Deel onderaan
const volgorde = ['id="b_oef"', 'id="startknop"', 'id="oefs"', 'id="b_na"', 'id="b_contact"', 'id="b_meer"', 'id="printBtn"', 'id="sessiebalk"'];
for (let i = 1; i < volgorde.length; i++) assert.ok(html.indexOf(volgorde[i]) > html.indexOf(volgorde[i - 1]) && html.indexOf(volgorde[i - 1]) > -1, volgorde[i - 1] + " staat vóór " + volgorde[i]);
assert.ok(html.includes("beforeprint") && html.includes("schemablok"), "schema op de print");
assert.ok(html.includes("#oefs .oef>.oefuitleg{display:block !important"), "uitleg op de print");

// rust: geen lettergroottes in px (ze schalen mee met de telefooninstelling), en de
// pijnschaal krijgt geen kleur per cijfer (MDR: geen oordeel over de ernst)
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const voorLightbox = css.slice(0, css.indexOf("/* tik op een oefenfoto"));
assert.ok(voorLightbox.length > 5000 && !/font-size:\s*[\d.]+px|font:[^;}]*\s[\d.]+px[/ ;}]/.test(voorLightbox), "lettergroottes in rem");
assert.ok(!/\.mschaal button\[data-score="\d+"\]\{[^}]*(background|color)/.test(css), "geen kleur per pijncijfer");
console.log("Patiëntkaart mobiel (statisch): uitleg per zin (9 talen), oefenstand in 9 talen, alleen avatars, tijd ≠ herhalingen, beginschermbalk na de pijnscore, opbouw, print.");

// ---- browser: de oefenstand echt doorlopen ----
let pw = null;
try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-patient-mobiel: geen Playwright, browserdeel overgeslagen"); }
if (pw) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-patientmobiel-"));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = `http://localhost:${port}`;
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  let browser = null;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
    browser = await pw.chromium.launch();
    for (const toestel of ["iPhone SE", "Pixel 7"]) {
      const c = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", timezoneId: "Europe/Amsterdam", extraHTTPHeaders: { "x-forwarded-for": "10.61.0." + (toestel === "iPhone SE" ? 1 : 2) } });
      const p = await c.newPage();
      const fouten = [];
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      await p.waitForFunction(() => document.querySelectorAll("#oefs .oef[data-oidx]").length > 0 && document.querySelector("#oefs .oefdone .odt").textContent);
      const zicht = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
      const n = await p.locator("#oefs .oef").count();
      assert.ok(n >= 2, toestel + ": demokaart heeft oefeningen");

      // overzicht: korte rijen, geen uitleg of stemknop, één begin-knop
      assert.equal(await p.textContent("#startknop"), "Begin met oefenen");
      assert.ok(!(await zicht("#oefs .oef .oefuitleg")), toestel + ": overzicht toont geen uitleg");
      assert.ok(!(await zicht("#oefs .oef .oefzwaar")), toestel + ": 'Te zwaar?' staat alleen bij de oefening zelf");
      assert.ok(await zicht("#oefs .oef .dosis"), toestel + ": korte dosering in de rij");
      assert.ok(!(await zicht("#sessiebalk")) && !(await zicht("#sessiekop")), toestel + ": geen oefenbalk in het overzicht");
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, toestel + ": niets steekt opzij uit");
      const maten = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length)
        .map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.className, Math.round(r.width), Math.round(r.height)]; }), sel);
      assert.deepEqual((await maten("#startknop,#oefs .oefdone,#taalsel,#grootBtn,#ovalles,#leesBtn,#gdaan")).filter((x) => x[1] < 44 || x[2] < 44), [], toestel + ": tikdoelen minstens 44 px");
      // elf cijfers op 320 px: zes naast elkaar is 41 px breed, daarom zijn ze 52 px hoog
      const cijfers = await maten("#mschaal button");
      assert.equal(cijfers.length, 11);
      assert.deepEqual(cijfers.filter((x) => x[1] < 40 || x[2] < 48), [], toestel + ": pijncijfers groot genoeg");

      // begin: de eerste oefening vult het scherm
      await p.click("#startknop");
      await p.waitForFunction(() => document.body.classList.contains("sessie"));
      assert.equal(await p.textContent("#stel"), "Oefening 1 van " + n);
      assert.equal(await p.locator("#oefs .oef.actief").count(), 1);
      assert.ok(await zicht("#oefs .oef.actief .oefuitleg"), toestel + ": uitleg staat bij de oefening");
      assert.ok(await zicht("#oefs .oef.actief .chips"), toestel + ": dosering uitgeschreven");
      assert.ok(await zicht("#oefs .oef.actief .oefzwaar") && await zicht("#veilig"), toestel + ": 'Te zwaar?' en de pijnregel staan erbij");
      assert.ok(!(await zicht("#b_na")) && !(await zicht("#b_contact")) && !(await zicht(".kop")), toestel + ": de rest van de kaart is weg");
      assert.equal(await p.textContent("#sklaar"), "Gedaan");
      assert.ok(await p.isDisabled("#svorige"), toestel + ": eerste oefening heeft geen vorige");
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, toestel + ": oefenstand steekt niet opzij uit");
      // de knop Gedaan staat altijd in beeld, ook op het kleinste scherm
      const kn = await p.locator("#sklaar").boundingBox();
      assert.ok(kn.y + kn.height <= p.viewportSize().height && kn.height >= 48, toestel + ": Gedaan staat onderin in beeld");

      // Gedaan vinkt af en gaat door naar de volgende
      await p.click("#sklaar");
      await p.waitForFunction(() => document.getElementById("stel").textContent.indexOf("2 ") > -1);
      assert.equal(await p.getAttribute('#oefs .oefdone[data-idx="0"]', "aria-pressed"), "true");
      // terug naar een afgevinkte oefening: status, ongedaan maken, en de knop heet Volgende
      await p.click("#svorige");
      assert.equal(await p.textContent("#sklaar"), "Volgende");
      assert.ok(await zicht("#sstatus"), toestel + ": 'Vandaag gedaan' staat erbij");
      await p.click("#songedaan");
      assert.equal(await p.getAttribute('#oefs .oefdone[data-idx="0"]', "aria-pressed"), "false");
      assert.equal(await p.textContent("#sklaar"), "Gedaan");

      // de terugknop van de telefoon sluit de oefening, niet de kaart
      await p.goBack();
      await p.waitForFunction(() => !document.body.classList.contains("sessie"));
      assert.ok(/\/k\/demo/.test(p.url()), toestel + ": terugknop blijft op de kaart");
      assert.ok(await zicht("#b_na"), toestel + ": overzicht is terug");

      // een rij openen, vergroten, en met terug eerst het grote beeld sluiten
      await p.click("#oefs .oef:nth-child(2) .oefinfo");
      await p.waitForFunction(() => document.body.classList.contains("sessie"));
      assert.equal(await p.textContent("#stel"), "Oefening 2 van " + n);
      if (await p.locator("#oefs .oef.actief .fotoknop").count()) {
        await p.click("#oefs .oef.actief .fotoknop");
        await p.waitForFunction(() => document.querySelector(".lightbox").classList.contains("open"));
        await p.goBack();
        await p.waitForFunction(() => !document.querySelector(".lightbox").classList.contains("open"));
        assert.ok(await p.evaluate(() => document.body.classList.contains("sessie")), toestel + ": na het grote beeld sta je weer bij de oefening");
      }
      await p.click("#sterug");
      await p.waitForFunction(() => !document.body.classList.contains("sessie"));

      // alles doorlopen: na de laatste "Gedaan" sta je bij "Hoe ging het vandaag?"
      await wacht(750); // het dubbeltikslot van de eerste oefening (700 ms) is dan voorbij
      await p.click("#startknop");
      for (let i = 0; i < n; i++) { await p.click("#sklaar"); await wacht(120); }
      await p.waitForFunction(() => !document.body.classList.contains("sessie"));
      assert.equal(await p.locator('#oefs .oefdone[aria-pressed="true"]').count(), n, toestel + ": alles afgevinkt");
      await wacht(700);
      const kop = await p.locator("#metingkop").boundingBox();
      assert.ok(kop && kop.y >= 0 && kop.y < p.viewportSize().height / 2, toestel + ": de pijnvraag staat in beeld");
      assert.ok(!(await zicht("#startknop")), toestel + ": na alles gedaan geen begin-knop meer");
      assert.equal(await p.evaluate(() => history.state), null, toestel + ": geen oefenstand meer in de geschiedenis");
      assert.deepEqual(fouten, [], toestel + ": geen scriptfouten");
      await c.close();
    }

    // Arabisch: van rechts naar links, pijlen gespiegeld
    const c = await browser.newContext({ ...pw.devices["Pixel 7"], locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.61.0.3" } });
    const p = await c.newPage();
    await p.goto(origin + "/k/demo?taal=ar", { waitUntil: "networkidle" });
    await p.waitForFunction(() => document.querySelectorAll("#oefs .oef[data-oidx]").length > 0);
    await p.click("#startknop");
    await p.waitForFunction(() => document.body.classList.contains("sessie"));
    const ar = await p.evaluate(() => ({ dir: document.documentElement.dir, vorige: document.getElementById("svorige").getBoundingClientRect().x, volgende: document.getElementById("svolgende").getBoundingClientRect().x,
      spiegel: getComputedStyle(document.querySelector("#svorige svg")).transform, breed: document.documentElement.scrollWidth - innerWidth }));
    assert.equal(ar.dir, "rtl");
    assert.ok(ar.vorige > ar.volgende, "Arabisch: vorige staat rechts");
    assert.ok(/^matrix\(-1,/.test(ar.spiegel), "Arabisch: pijlen gespiegeld");
    assert.equal(ar.breed, 0, "Arabisch: niets steekt opzij uit");
    await c.close();
    console.log("Patiëntkaart mobiel (browser): overzicht, oefenstand, Gedaan/Volgende/ongedaan, terugknop, groot beeld, afronden naar de pijnvraag, Arabisch (iPhone SE en Pixel 7).");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
