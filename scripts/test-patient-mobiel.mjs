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
// "Gedaan" neemt één tik per 700 ms aan: het slot zit op de knop, niet alleen op de oefening
assert.ok(html.includes("var nu=Date.now();if(nu<KLAAR_SLOT)return;KLAAR_SLOT=nu+700;"), "slot op de knop Gedaan");

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

// pijnschuif: een baan die naar 10 toe dikker wordt, in één kleur. De elf cijferknoppen
// blijven de echte bediening (ook voor schermlezers); de schuif klikt op zo'n knop.
assert.equal((html.match(/<div class="pschuif" data-schaal="(mschaal|pskschaal)" aria-hidden="true">/g) || []).length, 2, "schuif bij de pijnscore en bij de doelactiviteit");
assert.ok(/\.pschuif\{[^}]*touch-action:pan-y/.test(css), "omhoog en omlaag vegen blijft bladeren");
assert.ok(/\.psvorm\{[^}]*clip-path:polygon/.test(css) && /\.psvul\{[^}]*background:var\(--kn\)/.test(css), "dikte toont de sterkte, één kleur");
const schuifCss = css.slice(css.indexOf(".pschuif{"), css.indexOf(".mdank,.sdank"));
assert.ok(schuifCss.length > 500 && !/gradient/i.test(schuifCss), "geen kleurverloop in de schuif");
assert.deepEqual((schuifCss.match(/#[0-9a-f]{3,8}\b/gi) || []).filter((k) => k.toLowerCase() !== "#fff"), [], "geen eigen kleuren in de schuif: alleen de knopkleur van de kaart");
assert.ok(html.includes("var k=schaal.children[v];if(k)k.click();"), "de schuif kiest via de cijferknop");
for (const t of TALEN) assert.ok(new RegExp("\\b" + t + ":\\{[^\\n]*mvraag:'[^']*(Schuif|Slide|Schiebe|glisser|Desliza|Przesuń|Kaydırarak|اسحب|Пересунь)").test(html), "pijnvraag noemt schuiven: " + t);

// video: in de oefenstand speelt de video op de plek van het beeld
assert.ok(css.includes(".oef.actief>.vhouder.open{display:contents"), "videohouder doet mee in het raster van de oefening");
assert.ok(/\.oef\.actief>\.vhouder\.open>video,\.oef\.actief>\.vhouder\.open>iframe\{grid-row:1;grid-column:1\}/.test(css), "video op de plek van het beeld");
assert.equal((html.match(/DRIEHOEK\+'<span class="vlab">'/g) || []).length, 5, "elke videoknop heeft een tekst naast het afspeelteken");

// AI-video: geen label "AI-concept · beoordeling volgt" meer, wel één gewone zin die zegt dat de
// video met AI is gemaakt (AI-verordening art. 50 lid 4), in alle negen talen
assert.ok(!/AI-concept|beoordeling door fysiotherapeut volgt|review pending/.test(html), "het label AI-concept staat niet meer op de patiëntkaart");
const conceptZin = html.slice(html.indexOf("  var VIDEO_META_CONCEPT={"), html.indexOf("  var STEM_NOOT="));
const aiWoord = { nl: "met AI gemaakt", en: "made with AI", de: "mit KI erstellt", fr: "avec l’IA", es: "con IA", pl: "przy użyciu AI", tr: "yapay zekâ ile", ar: "بالذكاء الاصطناعي", uk: "за допомогою ШІ" };
for (const t of TALEN) assert.ok(new RegExp("\\b" + t + ":'[^']*" + aiWoord[t] + "[^']*'").test(conceptZin), "AI-melding bij de video: " + t);
const STEM_NOOT = (html.match(/var STEM_NOOT='([^']+)';/) || [])[1], STEM_VIDEO_NOOT = (html.match(/var STEM_VIDEO_NOOT='([^']+)';/) || [])[1];
assert.equal(STEM_NOOT, "De stem is met AI gemaakt en legt de algemene uitvoering uit. Volg daarnaast de dosering en opmerkingen van je behandelaar op.");
assert.equal(STEM_VIDEO_NOOT, "De stem en video zijn met AI gemaakt en leggen de algemene uitvoering uit. Volg daarnaast de dosering en opmerkingen van je behandelaar op.");
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
      // pijnschuif: een brede baan van 64 px om te slepen of te tikken; de elf cijfers eronder
      // blijven los aan te tikken (44 px hoog, op 320 px elk 26 px breed)
      const cijfers = await maten("#mschaal button");
      assert.equal(cijfers.length, 11);
      assert.deepEqual(cijfers.filter((x) => x[1] < 24 || x[2] < 44), [], toestel + ": pijncijfers blijven aan te tikken");
      const baan = (await maten(".pschuif[data-schaal=mschaal]"))[0];
      assert.ok(baan && baan[1] >= 280 && baan[2] >= 60, toestel + ": de schuifbaan is breed en hoog genoeg voor een duim");
      assert.ok(!(await zicht(".pschuif[data-schaal=mschaal] .psknop")), toestel + ": zonder score staat er nog geen knop op de schuif");
      const volg = await p.evaluate(() => ["#mvraag", "#ml0", ".pschuif[data-schaal=mschaal]", "#mschaal"].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
      assert.deepEqual(volg, [...volg].sort((a, b) => a - b), toestel + ": vraag, 'geen pijn / ergste pijn', de baan, de cijfers");

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

      // Gedaan vinkt af en gaat door naar de volgende; een dubbeltik vinkt niet ook de volgende af
      await p.click("#sklaar");
      await p.click("#sklaar");
      await p.waitForFunction(() => document.getElementById("stel").textContent.indexOf("2 ") > -1);
      await wacht(300);
      assert.equal(await p.textContent("#stel"), "Oefening 2 van " + n, toestel + ": een dubbeltik op Gedaan slaat geen oefening over");
      assert.equal(await p.getAttribute('#oefs .oefdone[data-idx="0"]', "aria-pressed"), "true");
      assert.equal(await p.locator('#oefs .oefdone[aria-pressed="true"]').count(), 1, toestel + ": een dubbeltik vinkt alleen de oefening af die in beeld stond");
      await wacht(450);
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
      for (let i = 0; i < n; i++) { await p.click("#sklaar"); await wacht(720); } // de knop neemt één tik per 700 ms aan
      await p.waitForFunction(() => !document.body.classList.contains("sessie"));
      assert.equal(await p.locator('#oefs .oefdone[aria-pressed="true"]').count(), n, toestel + ": alles afgevinkt");
      await wacht(700);
      const kop = await p.locator("#metingkop").boundingBox();
      assert.ok(kop && kop.y >= 0 && kop.y < p.viewportSize().height / 2, toestel + ": de pijnvraag staat in beeld");
      assert.ok(!(await zicht("#startknop")), toestel + ": na alles gedaan geen begin-knop meer");
      assert.equal(await p.evaluate(() => history.state), null, toestel + ": geen oefenstand meer in de geschiedenis");

      // pijnschuif: slepen laat het cijfer meelopen en bewaart pas bij loslaten
      const schuif = () => p.evaluate(() => { const e = document.querySelector(".pschuif[data-schaal=mschaal]"), r = e.getBoundingClientRect(), k = e.querySelector(".psknop");
        const a = document.querySelector("#mschaal button.aan,#mschaal button.bezig");
        return { x: r.x, y: r.y + r.height / 2, w: r.width, sleept: e.classList.contains("sleept"), gekozen: e.classList.contains("gekozen"), knop: k.textContent, vul: e.querySelector(".psvul").style.width, aan: a ? a.textContent : null, scroll: Math.round(scrollY) }; });
      const bij = (st, v) => st.x + st.w * (v + 0.5) / 11;
      let st = await schuif();
      await p.mouse.move(bij(st, 1), st.y); await p.mouse.down();
      await p.mouse.move(bij(st, 4), st.y, { steps: 4 }); await p.mouse.move(bij(st, 6), st.y, { steps: 4 });
      st = await schuif();
      assert.deepEqual([st.sleept, st.knop, st.vul, st.aan], [true, "6", "60%", null], toestel + ": tijdens het slepen loopt het cijfer mee en is er nog niets bewaard");
      await p.mouse.up();
      await p.waitForFunction(() => { const a = document.querySelector("#mschaal button.aan"); return a && a.textContent === "6" && !document.querySelector(".pschuif").classList.contains("sleept"); });
      st = await schuif();
      assert.deepEqual([st.gekozen, st.knop, st.aan], [true, "6", "6"], toestel + ": loslaten bewaart de score");
      assert.ok(await zicht("#mdank"), toestel + ": bevestiging na het bewaren");
      // één tik op de baan kiest ook, en een los cijfer aantikken blijft werken
      await wacht(400);
      await p.mouse.click(bij(st, 9), st.y);
      await p.waitForFunction(() => { const a = document.querySelector("#mschaal button.aan"); return a && a.textContent === "9" && document.querySelector(".psknop").textContent === "9"; });
      await p.click("#mschaal button:nth-child(3)");
      await p.waitForFunction(() => { const a = document.querySelector("#mschaal button.aan"); return a && a.textContent === "2" && document.querySelector(".psknop").textContent === "2"; });
      // omhoog vegen over de schuif bladert de pagina en verandert de score niet
      const cdp = await c.newCDPSession(p);
      st = await schuif();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bij(st, 7), y: st.y }] });
      for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bij(st, 7) + i * 1.5, y: st.y - i * 12 }] }); await wacht(16); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await wacht(500);
      const na = await schuif();
      assert.ok(na.scroll > st.scroll + 40, toestel + ": vegen over de schuif bladert de pagina");
      assert.deepEqual([na.knop, na.aan, na.sleept], ["2", "2", false], toestel + ": bladeren verandert de pijnscore niet");
      // met een vinger opzij schuiven: het cijfer komt boven de duim uit en loslaten bewaart
      st = await schuif();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bij(st, 2), y: st.y }] });
      for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bij(st, 2) + (bij(st, 5) - bij(st, 2)) * i / 10, y: st.y + i * 0.5 }] }); await wacht(16); }
      await wacht(250);
      const duim = await p.evaluate(() => { const e = document.querySelector(".pschuif"), k = e.querySelector(".psknop").getBoundingClientRect(), r = e.getBoundingClientRect(); return { cls: e.className, tekst: e.querySelector(".psknop").textContent, onder: k.bottom, midden: r.top + r.height / 2, scroll: Math.round(scrollY) }; });
      assert.ok(/sleept/.test(duim.cls) && /vinger/.test(duim.cls) && duim.tekst === "5", toestel + ": schuiven met een vinger loopt mee");
      assert.ok(duim.onder < duim.midden - 15, toestel + ": het cijfer komt boven de duim uit");
      assert.equal(duim.scroll, st.scroll, toestel + ": opzij schuiven bladert niet");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await p.waitForFunction(() => { const a = document.querySelector("#mschaal button.aan"); return a && a.textContent === "5" && !document.querySelector(".pschuif").classList.contains("sleept"); });
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, toestel + ": de schuif steekt niet opzij uit");
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
    // de schuif loopt mee van rechts naar links: links op de baan is 10
    await p.click("#sterug");
    await p.waitForFunction(() => !document.body.classList.contains("sessie"));
    await p.evaluate(() => document.querySelector(".pschuif").scrollIntoView({ block: "center" }));
    await wacht(300);
    const rs = await p.evaluate(() => { const r = document.querySelector(".pschuif").getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; });
    await p.mouse.click(rs.x + rs.w * 0.5 / 11, rs.y);
    await p.waitForFunction(() => { const a = document.querySelector("#mschaal button.aan"); return a && a.textContent === "10"; });
    const knopX = await p.evaluate(() => { const k = document.querySelector(".psknop").getBoundingClientRect(); return k.x + k.width / 2; });
    assert.ok(knopX < rs.x + rs.w * 0.15, "Arabisch: de knop van 10 staat links");
    await c.close();

    // video: speelt op de plek van het beeld, de naam, dosering en "Gedaan" blijven staan
    for (const toestel of ["iPhone SE", "Pixel 7"]) {
      const cv = await browser.newContext({ ...pw.devices[toestel], locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": "10.61.0." + (toestel === "iPhone SE" ? 4 : 5) } });
      const pv = await cv.newPage();
      const vfouten = [];
      pv.on("pageerror", (e) => vfouten.push(e.message));
      await pv.route("**/vidtest/*", (r) => r.fulfill({ status: 404, body: "" }));
      // de eerste twee oefeningen van de demokaart krijgen een staande avatarvideo en een YouTube-video
      const namen = await (await fetch(origin + "/api/kaart?id=demo")).json().then((d) => d.kaart.chosen.slice(0, 2).map((x) => x.n));
      // de kaart krijgt haar oefeningen met de kaart zelf mee (lib), niet meer uit de hele bibliotheek
      await pv.route((u) => u.pathname === "/api/kaart", async (route) => {
        const r = await route.fetch(), d = await r.json();
        assert.ok(Array.isArray(d.lib), "de kaart krijgt haar eigen oefeningen mee");
        for (const o of d.lib) {
          // de kaart noemt de oefening zoals ze is bewaard; de bibliotheek kan haar intussen een
          // Nederlandse naam geven en levert de naam van toen dan mee als `eerder`
          const heet = (n) => o.naam === n || (o.eerder || []).includes(n);
          if (heet(namen[0])) o.video = { eigen: "vidtest/staand.webm", eigenMeta: { aiGenerated: true } };
          if (heet(namen[1])) o.video = { yt: "aqz-KE-bpKQ" };
        }
        await route.fulfill({ response: r, json: d });
      });
      await pv.route("**://www.youtube-nocookie.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<body style='background:#000'></body>" }));
      await pv.goto(origin + "/k/demo", { waitUntil: "networkidle" });
      await pv.waitForFunction(() => document.querySelectorAll("#oefs .oef[data-oidx]").length > 0);
      assert.ok(await pv.locator("#oefs .oef:nth-child(1) .vbtn[data-eigen]").count() === 1 && await pv.locator("#oefs .oef:nth-child(2) .vbtn[data-yt]").count() === 1, toestel + ": proefvideo's staan op de eerste twee oefeningen (" + namen.join(", ") + ")");
      const vak = (sel) => pv.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), zicht: getComputedStyle(e).visibility }; }, sel);
      // in het overzicht: geen videoknop, wel een afspeelteken op het plaatje
      assert.equal(await vak("#oefs .oef:nth-child(1) .vbtn[data-eigen]"), null, toestel + ": geen videoknop in het overzicht");
      assert.ok(await vak("#oefs .oef:nth-child(1) .demobadge"), toestel + ": afspeelteken op het plaatje in het overzicht");
      await pv.click("#oefs .oef:nth-child(1) .oefinfo");
      await pv.waitForFunction(() => document.body.classList.contains("sessie"));
      const foto = await vak("#oefs .oef.actief .fotoknop"), speel = await vak("#oefs .oef.actief .vbtn[data-eigen]");
      assert.ok(foto && speel, toestel + ": beeld en afspeelknop staan er");
      const midden = (v) => [v.x + v.w / 2, v.y + v.h / 2];
      assert.ok(Math.abs(midden(speel)[0] - midden(foto)[0]) < 3 && Math.abs(midden(speel)[1] - midden(foto)[1]) < 3, toestel + ": afspeelknop staat midden op het beeld");
      assert.ok(speel.w >= 68 && speel.h >= 68, toestel + ": afspeelknop is groot genoeg");
      assert.equal(await pv.textContent("#oefs .oef.actief .vbtn[data-eigen] .vlab"), "Bekijk instructievideo");
      // één zin bij de AI-video: met de luisterknop erbij noemt die stem en video samen, anders alleen de video
      const zinnen = await pv.evaluate(() => { const o = document.querySelector("#oefs .oef.actief"); return { stem: !!o.querySelector(".vbtn[data-noor]"), ai: [...o.querySelectorAll(".vmeta")].filter((e) => e.getClientRects().length).map((e) => e.textContent).filter((t) => /AI/.test(t)), alles: o.textContent }; });
      assert.equal(zinnen.ai.length, 1, toestel + ": precies één zin zegt dat de video met AI is gemaakt");
      assert.equal(zinnen.ai[0], zinnen.stem ? STEM_VIDEO_NOOT : "De video is met AI gemaakt en laat de algemene uitvoering zien. Volg daarnaast de dosering en opmerkingen van je behandelaar op.", toestel + ": de zin bij de AI-video");
      assert.ok(!/AI-concept|De stem is met AI gemaakt en legt/.test(zinnen.alles), toestel + ": geen los label en geen dubbele zin");
      await pv.click("#oefs .oef.actief .vbtn[data-eigen]");
      await pv.waitForFunction(() => !!document.querySelector("#oefs .oef.actief .vhouder.open video"));
      await wacht(400);
      const video = await vak("#oefs .oef.actief .vhouder.open video"), sluit = await vak("#oefs .oef.actief .vbtn[data-eigen]"), naam = await vak("#oefs .oef.actief .naam");
      assert.ok(video.y >= foto.y - 2 && video.y + video.h <= foto.y + Math.max(foto.h, video.h) + 2 && video.y < foto.y + foto.h, toestel + ": de video staat op de plek van het beeld");
      assert.equal((await vak("#oefs .oef.actief .fotoknop")).zicht, "hidden", toestel + ": het beeld is weg zolang de video er staat");
      assert.ok(naam.y >= video.y + video.h - 1, toestel + ": de naam staat onder de video");
      assert.ok(sluit.w === 44 && sluit.h === 44 && sluit.x + sluit.w <= pv.viewportSize().width && sluit.y < video.y + 60, toestel + ": sluitknop rechtsboven op de video");
      assert.equal(await pv.getAttribute("#oefs .oef.actief .vbtn[data-eigen]", "aria-expanded"), "true");
      const gedaan = await vak("#sklaar");
      assert.ok(gedaan.y + gedaan.h <= pv.viewportSize().height, toestel + ": Gedaan blijft in beeld bij de video");
      assert.equal(await pv.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, toestel + ": de video steekt niet opzij uit");
      // het videobestand ontbreekt hier: de melding staat dan op de video, niet onder de vouw
      await pv.waitForFunction(() => { const s = document.querySelector("#oefs .oef.actief .vstatus"); return s && !s.hidden && s.querySelector("button"); });
      const melding = await vak("#oefs .oef.actief .vstatus");
      assert.ok(melding.y >= foto.y - 2 && melding.y + melding.h <= naam.y + 2 && melding.x + melding.w <= sluit.x + 2, toestel + ": melding staat op de video, naast de sluitknop");
      // sluiten zet het beeld terug; de volgende oefening sluit een open video
      await pv.click("#oefs .oef.actief .vbtn[data-eigen]");
      await pv.waitForFunction(() => !document.querySelector("#oefs .vhouder.open"));
      assert.equal((await vak("#oefs .oef.actief .fotoknop")).zicht, "visible", toestel + ": na sluiten staat het beeld er weer");
      await pv.click("#oefs .oef.actief .vbtn[data-eigen]");
      await pv.waitForFunction(() => !!document.querySelector("#oefs .vhouder.open"));
      await pv.click("#svolgende");
      await pv.waitForFunction(() => document.getElementById("stel").textContent.indexOf("2 ") > -1);
      assert.equal(await pv.locator("#oefs .vhouder.open").count(), 0, toestel + ": de volgende oefening sluit de video");
      // YouTube: de speler komt in de plaats van het beeld, de knop blijft een gewone knop eronder
      await wacht(750);
      await pv.click("#oefs .oef.actief .vbtn[data-yt]");
      await pv.waitForFunction(() => !!document.querySelector("#oefs .oef.actief .vhouder.open iframe"));
      await wacht(300);
      const speler = await vak("#oefs .oef.actief .vhouder.open iframe"), ytknop = await vak("#oefs .oef.actief .vbtn[data-yt]"), ytnaam = await vak("#oefs .oef.actief .naam");
      assert.ok(speler.x === 0 && speler.w === pv.viewportSize().width, toestel + ": YouTube-speler over de volle breedte");
      assert.equal(await vak("#oefs .oef.actief .fotoknop"), null, toestel + ": de speler vervangt het beeld");
      assert.ok(ytnaam.y >= speler.y + speler.h - 1 && ytknop.y > ytnaam.y && ytknop.h >= 44, toestel + ": naam onder de speler, knop om te sluiten eronder");
      assert.ok(await vak("#oefs .oef.actief .ytextern"), toestel + ": uitwijklink naar YouTube staat erbij");
      assert.deepEqual(vfouten, [], toestel + ": geen scriptfouten bij video");
      await cv.close();
    }
    console.log("Patiëntkaart mobiel (browser): overzicht, oefenstand, Gedaan/Volgende/ongedaan, terugknop, groot beeld, afronden naar de pijnvraag, pijnschuif (slepen, tikken, bladeren, Arabisch), video op de plek van het beeld (iPhone SE en Pixel 7).");
  } finally {
    if (browser) await browser.close();
    app.kill();
    await rm(dataDir, { recursive: true, force: true });
  }
}
