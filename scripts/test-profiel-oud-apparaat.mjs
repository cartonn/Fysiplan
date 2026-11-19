// Regressietest gebruikers-sweep 2026-11-19 (Karin, beheerder, desktop): een apparaat met een oud adres en
// telefoonnummer in fysiplan_settings toonde na herladen nog de oude waarden (vulUitProfiel vulde alleen lege
// velden aan). Wijzigde Karin daar één veld, dan stuurde de app het hele oude profiel terug en toonden /k en de
// print weer het oude nummer. Nu wint bij het openen en na het inloggen het profiel van de server.
// Tweede geval: op een nieuw apparaat zonder praktijknaam bleef het profiel leeg tot herladen.
// CI heeft geen Playwright: de statische controle draait altijd, de browserstap alleen waar Playwright staat.
// `npm run test:profieloudapparaat`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(join(root, "public/index.html"), "utf8");
const fn = (html.match(/function vulUitProfiel\(gezag,basisVoor\)\{[\s\S]*?\n  \}/) || [""])[0];
assert.ok(fn, "vulUitProfiel kent het verschil tussen openen (gezag) en eigen bewaren");
assert.match(fn, /if\(!nu\?srv:\(gezag\|\|nietZelf\)\)/, "bij openen wint het serverprofiel, ook boven een gevuld veld");
assert.match(fn, /PROF_VELD\[k\]===bezig/, "een veld waarin getypt wordt blijft staan");
assert.match(fn, /\(!cur\|\|basisVoor\)&&PRAKTIJKEN\.length===1/, "nieuw apparaat zonder praktijknaam krijgt het enige eigen profiel");
assert.match(html, /\}\);\n  loadPraktijken\(true\);/, "bij het openen van de app met gezag laden");
assert.match(html, /window\.fpLaadPraktijken\(true\);\}/, "na het inloggen met gezag laden");
assert.match(html, /if\(d\.ok\)\{loadPraktijken\(false,p\.basis\|\|null\);return;\}/, "na eigen bewaren: servervelden die hier niet gewijzigd zijn overnemen");
assert.match(html, /if\(PROF_BASIS\)p\.basis=PROF_BASIS;/, "het laatst geziene profiel gaat mee bij bewaren");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-profieloud-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://localhost:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
const bewaar = (c) => { uit = (uit + c).slice(-4000); };
app.stdout.on("data", bewaar);
app.stderr.on("data", bewaar);
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.66.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
let browser = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: "Fysio Oud", wachtwoord: "praktijk-wachtwoord", akkoord: true })).json());
  const K = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: "karin@oud.nl", wachtwoord: "karin-wachtwoord", regels: true }, G)).json());
  const nieuw = { praktijk: "Fysio Oud", adres: "Nieuwstraat 2", plaats: "Utrecht", tel: "030-2222222", email: "info@oud.nl", website: "https://oud.nl" };
  assert.equal((await post("/api/praktijken", nieuw, K)).status, 200, "beheerder bewaart het nieuwe profiel (apparaat B)");
  // server: met basis neemt hij alleen de velden over die de app zelf wijzigde (hertest 2026-11-19 14u, Karin)
  const zelfde = { ...nieuw };
  assert.equal((await post("/api/praktijken", { ...nieuw, adres: "Tussenweg 5" }, K)).status, 200, "ander apparaat wijzigt het adres");
  assert.equal((await post("/api/praktijken", { ...zelfde, tel: "030-4444444", basis: zelfde }, K)).status, 200, "open pagina wijzigt alleen de telefoon");
  let sp = (await (await get("/api/praktijken", K)).json())[0];
  assert.equal(sp.adres, "Tussenweg 5", "adres van het andere apparaat blijft staan");
  assert.equal(sp.tel, "030-4444444", "telefoon van de open pagina is bewaard");
  assert.equal((await post("/api/praktijken", { ...nieuw, basis: [] }, K)).status, 200, "rare basis: gewoon zoals vroeger");
  assert.equal((await post("/api/praktijken", nieuw, K)).status, 200, "terug naar het nieuwe profiel");
  console.log("test-profiel-oud-apparaat (statisch + server): ok");

  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("test-profiel-oud-apparaat: geen Playwright, browserdeel overgeslagen"); }
  if (pw) {
    browser = await pw.chromium.launch();
    const fouten = [];
    const apparaat = async (settings, xff) => {
      const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "nl-NL", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": xff } });
      await c.addInitScript(([s, st]) => {
        if (sessionStorage.getItem("klaar")) return; sessionStorage.setItem("klaar", "1");
        localStorage.setItem("fp_praksessie", s);
        localStorage.setItem("fysiplan_settings", JSON.stringify(st));
        localStorage.setItem("fysiplan_welkom_gezien", "1");
      }, [K["x-praktijk-sessie"], settings]);
      const p = await c.newPage();
      p.on("pageerror", (e) => fouten.push(e.message));
      await p.goto(origin + "/v2/app", { waitUntil: "load" });
      return p;
    };
    const tot = async (p, sel, waarde) => {
      for (let i = 0; i < 100 && (await p.inputValue(sel)) !== waarde; i++) await wacht(100);
      return p.inputValue(sel);
    };

    // apparaat A: het oude profiel staat nog in fysiplan_settings
    const A = await apparaat({ praktijk: "Fysio Oud", adres: "Oudestraat 1", plaats: "Zeist", tel: "06-11111111", email: "oud@oud.nl", website: "https://oud.nl" }, "10.66.2.1");
    assert.equal(await tot(A, "#p_tel", "030-2222222"), "030-2222222", "apparaat A toont na openen het nieuwe telefoonnummer");
    assert.equal(await A.inputValue("#p_adres"), "Nieuwstraat 2", "en het nieuwe adres");
    assert.equal(await A.inputValue("#p_plaats"), "Utrecht", "en de nieuwe plaats");
    // Karin wijzigt op A alleen de website: de rest blijft het nieuwe profiel
    await A.fill("#p_website", "https://oud-fysio.nl");
    await A.press("#p_website", "Tab");
    let srv = null;
    for (let i = 0; i < 60; i++) { srv = (await (await get("/api/praktijken", K)).json())[0]; if (srv.website === "https://oud-fysio.nl") break; await wacht(100); }
    assert.equal(srv.website, "https://oud-fysio.nl", "wijziging op A is bewaard");
    assert.equal(srv.tel, "030-2222222", "het oude nummer van A is niet teruggezet");
    assert.equal(srv.adres, "Nieuwstraat 2", "het oude adres van A is niet teruggezet");

    // A blijft open; een ander apparaat wijzigt het adres; A wijzigt daarna alleen de telefoon
    assert.equal((await post("/api/praktijken", { ...nieuw, website: "https://oud-fysio.nl", adres: "Derdeplein 3" }, K)).status, 200);
    await A.fill("#p_tel", "030-3333333");
    await A.press("#p_tel", "Tab");
    for (let i = 0; i < 60; i++) { srv = (await (await get("/api/praktijken", K)).json())[0]; if (srv.tel === "030-3333333") break; await wacht(100); }
    assert.equal(srv.tel, "030-3333333", "telefoon van de open pagina is bewaard");
    assert.equal(srv.adres, "Derdeplein 3", "adres van het andere apparaat is niet teruggezet");
    assert.equal(await tot(A, "#p_adres", "Derdeplein 3"), "Derdeplein 3", "open pagina toont daarna het nieuwe adres");

    // apparaat C: nieuw, nog geen praktijknaam op dit apparaat
    const C = await apparaat({}, "10.66.2.2");
    assert.equal(await tot(C, "#p_adres", "Derdeplein 3"), "Derdeplein 3", "nieuw apparaat krijgt het profiel zonder herladen");
    assert.equal(await C.inputValue("#p_tel"), "030-3333333");
    assert.deepEqual(fouten, [], "geen scriptfouten");
    console.log("test-profiel-oud-apparaat (browser): ok");
  }
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
