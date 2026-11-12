// De sessiesleutel staat in een cookie die scripts niet kunnen lezen (platformreview 2026-11-11).
// Tot nu toe bewaarde de app de sleutel in localStorage en stuurde hem zelf mee: elk script dat
// op de pagina wist te komen, kon hem lezen en dertig dagen gebruiken.
// - Inloggen zet de sleutel in een cookie met HttpOnly en SameSite=Strict (Secure op https).
//   Een browser krijgt hem alleen daarin; in het antwoord staat het woord "cookie". Een verzoek
//   zonder browserkoppen (een eigen programma, de tests) krijgt de sleutel ook in het antwoord.
// - De cookie alleen is genoeg om ingelogd te zijn, maar telt niet vanaf een andere website.
// - Uitloggen haalt de sessie weg en maakt de cookie leeg. De app meldt het als dat niet lukt,
//   in plaats van te doen alsof: de cookie kan alleen de server weghalen.
// - Een sleutel die nog in localStorage staat, ruilt de app één keer om voor de cookie.
// Het serverdeel past in CI; het browserdeel draait alleen waar Playwright staat.
// `npm run test:sessiecookie`
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, request as httpVerzoek } from "node:http";
import { createServer as httpsServer } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- 1. statisch ----
{
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  assert.doesNotMatch(idx, /localStorage\.setItem\('fp_praksessie'/, "de app zet de sessiesleutel niet meer in localStorage");
  assert.match(idx, /fetch\('api\/praktijk\/sessie-cookie'/, "een oude sleutel wordt omgeruild");
  assert.match(idx, /Uitloggen lukte niet\. Je bent op deze computer nog ingelogd\./, "mislukt uitloggen staat op het scherm");
  assert.match(idx, /Wissen lukte niet: er is geen verbinding met Fysiplan, dus je login staat nog op deze computer\. Er is niets gewist\./, "mislukt wissen ook");
  const server = await readFile(join(root, "server.js"), "utf8");
  // elke plek die een sessie uitdeelt, doet dat via sessieUit (dus met de cookie)
  const uitgedeeld = server.match(/sendJson\(response, 200, \{ ok: true, sessie[^}]*/g) || [];
  assert.ok(uitgedeeld.length >= 9, "de plekken waar een sessie wordt uitgedeeld zijn gevonden: " + uitgedeeld.length);
  for (const u of uitgedeeld) assert.match(u, /sessie: sessieUit\(request, response, /, "zonder cookie uitgedeeld: " + u);
  // ...en nooit op verzoek van een andere website. Met de sleutel in een kop kon dat geen kwaad;
  // met een cookie zou een andere website een bezoeker ongemerkt kunnen laten inloggen op háár
  // praktijk, waarna de bezoeker daar patiëntgegevens invult.
  const regels = server.split("\n");
  let plekken = 0;
  regels.forEach((regel, i) => {
    if (!regel.includes("sessie: sessieUit(request, response, ")) return;
    plekken++;
    let j = i;
    while (j > 0 && !/^  if \(urlPath\b/.test(regels[j])) j--;
    assert.ok(regels.slice(j, i).some((r) => r.trim() === "if (kruisSite(request)) { await weigerKruis(response); return; }"),
      "regel " + (i + 1) + " deelt een sessie uit zonder eerst een andere website te weigeren");
  });
  assert.equal(plekken, uitgedeeld.length);
}

// ---- 2. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-cookie-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", PROEF_VERPLICHT: "uit" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV" || k === "EIGEN_LOGIN_VERPLICHT") delete kind[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });

let ip = 1;
const adres = () => "10.92." + ((ip >> 8) & 255) + "." + (ip++ & 255);
// zoals een browser op de eigen site: Sec-Fetch-Site en Origin, koppen die een script niet kan weglaten
const BROWSER = { "sec-fetch-site": "same-origin", origin };
const post = (pad, body, kop = {}) => fetch(origin + pad, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": adres(), ...kop }, body: JSON.stringify(body) });
const get = (pad, kop = {}) => fetch(origin + pad, { headers: { "x-forwarded-for": adres(), ...kop } });
const cookies = (r) => r.headers.getSetCookie();
const sessieCookie = (r) => cookies(r).find((c) => c.startsWith("fpsessie=")) || "";
const tokenUit = (kop) => (kop.match(/^fpsessie=([a-f0-9]{48});/) || [])[1] || "";
const metCookie = (token, kop = {}) => ({ cookie: "fpsessie=" + token, ...kop });
const P = "Fysio Cookie", WW = "cookie-wachtwoord-1";
const kaartenPad = "/api/kaarten?praktijk=" + encodeURIComponent(P);
const status = async (kop) => (await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(P), kop)).json());

let browserKlaar = null;
try {
  for (let i = 0; i < 200; i++) { try { if ((await get("/health")).ok) break; } catch {} await wacht(50); }

  // -- beveiligen vanuit een browser: de sleutel staat alleen in de cookie --
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: WW, akkoord: true }, BROWSER);
  assert.equal(claim.status, 200);
  const claimLijf = await claim.json();
  assert.equal(claimLijf.sessie, "cookie", "een browser krijgt de sleutel niet in het antwoord");
  const kop1 = sessieCookie(claim), t1 = tokenUit(kop1);
  assert.match(t1, /^[a-f0-9]{48}$/, "de cookie draagt de sleutel: " + kop1);
  assert.match(kop1, /; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000$/, "HttpOnly, alleen op de eigen site, dertig dagen: " + kop1);
  assert.doesNotMatch(kop1, /Secure/, "zonder https geen Secure (lokaal ontwikkelen)");
  assert.ok(!JSON.stringify(claimLijf).includes(t1), "de sleutel staat nergens in het antwoord");

  // -- de cookie alleen is genoeg --
  assert.equal((await status(metCookie(t1))).ingelogd, true, "ingelogd met alleen de cookie");
  assert.equal((await get(kaartenPad, metCookie(t1))).status, 200, "kaarten opvragen met alleen de cookie");
  assert.equal((await get(kaartenPad, metCookie(t1, { "sec-fetch-site": "same-origin" }))).status, 200);
  assert.equal((await get(kaartenPad, metCookie(t1, { "sec-fetch-site": "none" }))).status, 200, "een adres dat de gebruiker zelf intikt telt");
  assert.equal((await get(kaartenPad)).status, 401, "zonder cookie niet");
  assert.equal((await get(kaartenPad, metCookie("0".repeat(48)))).status, 401, "een verzonnen cookie niet");
  assert.equal((await get(kaartenPad, { cookie: "andere=1; fpsessie=" + t1 + "; nog=2" })).status, 200, "tussen andere cookies");
  assert.equal((await get(kaartenPad, { cookie: "xfpsessie=" + t1 })).status, 401, "een cookie met een andere naam telt niet");

  // -- vanaf een andere website telt de cookie niet --
  assert.equal((await get(kaartenPad, metCookie(t1, { "sec-fetch-site": "cross-site" }))).status, 401, "cross-site: niet ingelogd");
  assert.equal((await get(kaartenPad, metCookie(t1, { "sec-fetch-site": "same-site", origin: "https://ander.fysiplan.invalid" }))).status, 401, "een ander subdomein: niet ingelogd");
  assert.equal((await get(kaartenPad, metCookie(t1, { origin: "https://elders.invalid" }))).status, 401, "oudere browser, Origin van elders: niet ingelogd");
  assert.equal((await get(kaartenPad, metCookie(t1, { origin: "null" }))).status, 401, "Origin null: niet ingelogd");
  assert.equal((await status(metCookie(t1, { "sec-fetch-site": "cross-site" }))).ingelogd, false);
  const kaartVanElders = await post("/api/kaarten", { praktijk: P, naam: "Van Elders", client: { c_naam: "X" }, chosen: [], kaartId: "" }, metCookie(t1, { "sec-fetch-site": "cross-site", origin: "https://elders.invalid" }));
  assert.ok([401, 403].includes(kaartVanElders.status), "een kaart opslaan vanaf een andere website: " + kaartVanElders.status);
  assert.deepEqual(await (await get(kaartenPad, metCookie(t1))).json(), [], "en er is niets opgeslagen");
  // de sleutel zelf meesturen (geen browser) kan vanaf elke plek, zoals altijd
  assert.equal((await get(kaartenPad, { "x-praktijk-sessie": t1, "sec-fetch-site": "cross-site" })).status, 200, "wie de sleutel heeft en zelf meestuurt, is ingelogd");

  // -- een andere website kan niemand laten inloggen, ook niet op haar eigen praktijk --
  for (const kop of [{ "sec-fetch-site": "cross-site", origin: "https://elders.invalid" }, { origin: "https://elders.invalid" }, { "sec-fetch-site": "same-site", origin: "https://ander.fysiplan.invalid" }]) {
    const r = await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW }, kop);
    assert.equal(r.status, 403, "inloggen vanaf een andere website wordt geweigerd: " + JSON.stringify(kop));
    assert.deepEqual(cookies(r), [], "en er komt geen cookie mee");
    const c = await post("/api/praktijk/claim", { praktijk: "Fysio Van Elders", wachtwoord: "elders-wachtwoord-1", akkoord: true }, kop);
    assert.equal(c.status, 403, "een praktijk beveiligen vanaf een andere website ook");
    assert.deepEqual(cookies(c), []);
  }

  // -- https (productie): Secure erbij, en de naam krijgt het voorvoegsel __Host- --
  const HTTPS = { "x-forwarded-proto": "https" };
  const https = await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW }, { ...BROWSER, ...HTTPS });
  assert.equal(https.status, 200);
  const httpsKop = cookies(https).find((c) => c.startsWith("__Host-fpsessie=")) || "";
  assert.match(httpsKop, /^__Host-fpsessie=[a-f0-9]{48}; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=2592000$/, "achter https: __Host-, Secure, Path=/ en geen Domain: " + cookies(https));
  assert.equal(cookies(https).length, 1, "één cookie, niet ook nog een zonder voorvoegsel");
  const tH = httpsKop.slice("__Host-fpsessie=".length, "__Host-fpsessie=".length + 48);
  assert.equal((await get(kaartenPad, { cookie: "__Host-fpsessie=" + tH, ...HTTPS })).status, 200, "op https ingelogd met de cookie met voorvoegsel");
  assert.equal((await get(kaartenPad, { cookie: "fpsessie=" + tH, ...HTTPS })).status, 401, "op https telt de naam zonder voorvoegsel niet (die kan een ander subdomein zetten)");
  assert.equal((await get(kaartenPad, { cookie: "fpsessie=" + "0".repeat(48) + "; __Host-fpsessie=" + tH, ...HTTPS })).status, 200, "een cookie zonder voorvoegsel ernaast verandert niets");
  assert.equal((await get(kaartenPad, { cookie: "__Host-fpsessie=" + tH })).status, 401, "zonder https telt alleen de naam zonder voorvoegsel");
  const httpsUit = await post("/api/praktijk/logout", {}, { cookie: "__Host-fpsessie=" + tH, ...BROWSER, ...HTTPS });
  assert.deepEqual(cookies(httpsUit), ["__Host-fpsessie=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0"], "uitloggen op https maakt die cookie leeg");
  assert.equal((await get(kaartenPad, { cookie: "__Host-fpsessie=" + tH, ...HTTPS })).status, 401);

  // -- een eigen programma (geen browserkoppen): sleutel ook in het antwoord, en hij werkt in de kop --
  const kaal = await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW });
  const kaalLijf = await kaal.json(), t2 = kaalLijf.sessie;
  assert.match(t2, /^[a-f0-9]{48}$/, "zonder browserkoppen staat de sleutel in het antwoord");
  assert.equal(tokenUit(sessieCookie(kaal)), t2, "en dezelfde sleutel in de cookie");
  assert.equal((await get(kaartenPad, { "x-praktijk-sessie": t2 })).status, 200);
  for (const kop of [{ "sec-fetch-site": "same-origin" }, { origin }, { "sec-fetch-site": "none" }]) {
    const r = await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW }, kop);
    assert.equal((await r.json()).sessie, "cookie", "elke browserkop is genoeg om de sleutel uit het antwoord te houden: " + JSON.stringify(kop));
  }

  // -- een open tabblad met de oude app stuurt het woord "cookie" mee als sleutel: de cookie beslist --
  assert.equal((await get(kaartenPad, metCookie(t1, { "x-praktijk-sessie": "cookie" }))).status, 200, "een ongeldige kop naast een geldige cookie");
  assert.equal((await get(kaartenPad, { "x-praktijk-sessie": "cookie" })).status, 401);

  // -- kop en cookie van verschillende praktijken: wie de sleutel zelf meestuurt, krijgt die praktijk --
  const P2 = "Fysio Koekje";
  const tAnder = (await (await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "ander-wachtwoord-2", akkoord: true })).json()).sessie;
  // (de status zegt bij welke praktijk de sessie hoort, welke naam er ook gevraagd wordt)
  const statusVan = async (kop) => (await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(P2), kop)).json()).naam;
  assert.equal(await statusVan(metCookie(t1)), P, "alleen de cookie: de praktijk van de cookie");
  assert.equal(await statusVan({ "x-praktijk-sessie": tAnder }), P2, "alleen de kop: de praktijk van de kop");
  assert.equal(await statusVan(metCookie(t1, { "x-praktijk-sessie": tAnder })), P2, "allebei: de kop wint van de cookie");

  // -- omruilen: een sleutel uit de browseropslag wordt de cookie --
  const ruil = await post("/api/praktijk/sessie-cookie", {}, { ...BROWSER, "x-praktijk-sessie": t2 });
  assert.equal(ruil.status, 200);
  assert.deepEqual(await ruil.json(), { ok: true }, "het antwoord bevat de sleutel niet");
  const ruilKop = sessieCookie(ruil);
  assert.equal(tokenUit(ruilKop), t2, "dezelfde sessie, nu in de cookie");
  const maxAge = Number((ruilKop.match(/Max-Age=(\d+)$/) || [])[1]);
  assert.ok(maxAge > 2591000 && maxAge < 2592000, "voor de tijd die de sessie nog had, niet opnieuw dertig dagen: " + maxAge);
  assert.match(ruilKop, /; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/);
  const ruilFout = await post("/api/praktijk/sessie-cookie", {}, { ...BROWSER, "x-praktijk-sessie": "f".repeat(48) });
  assert.equal(ruilFout.status, 401, "een sleutel die niet (meer) werkt: 401, dan mag hij uit de opslag");
  assert.equal(sessieCookie(ruilFout), "", "en geen cookie");
  assert.equal((await post("/api/praktijk/sessie-cookie", {}, metCookie(t1, BROWSER))).status, 200, "wie de cookie al heeft: goed");
  assert.equal((await post("/api/praktijk/sessie-cookie", {}, { "x-praktijk-sessie": t2, "sec-fetch-site": "cross-site", origin: "https://elders.invalid" })).status, 403, "niet vanaf een andere website");
  assert.equal((await post("/api/praktijk/sessie-cookie", {})).status, 401, "zonder iets: 401");

  // -- wachtwoord wijzigen: een verse cookie, de oude sleutels werken niet meer --
  const WW2 = "nieuw-cookie-wachtwoord-2";
  const wijzig = await post("/api/praktijk/wachtwoord", { praktijk: P, huidig: WW, nieuw: WW2 }, metCookie(t1, BROWSER));
  assert.equal(wijzig.status, 200, "wachtwoord wijzigen met alleen de cookie");
  assert.equal((await wijzig.json()).sessie, "cookie");
  const t3 = tokenUit(sessieCookie(wijzig));
  assert.ok(t3 && t3 !== t1, "een nieuwe sleutel in de cookie");
  assert.equal((await get(kaartenPad, metCookie(t1))).status, 401, "de oude cookie werkt niet meer");
  assert.equal((await get(kaartenPad, { "x-praktijk-sessie": t2 })).status, 401, "de oude sleutel in de kop ook niet");
  assert.equal((await get(kaartenPad, metCookie(t3))).status, 200);

  // -- uitloggen: sessie weg, cookie leeg --
  const uitElders = await post("/api/praktijk/logout", {}, metCookie(t3, { "sec-fetch-site": "cross-site", origin: "https://elders.invalid" }));
  assert.equal(uitElders.status, 403, "een andere website kan niemand uitloggen");
  assert.equal((await get(kaartenPad, metCookie(t3))).status, 200);
  const uit = await post("/api/praktijk/logout", {}, metCookie(t3, BROWSER));
  assert.equal(uit.status, 200);
  assert.match(sessieCookie(uit), /^fpsessie=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/, "de cookie gaat leeg terug: " + sessieCookie(uit));
  assert.equal((await get(kaartenPad, metCookie(t3))).status, 401, "de sessie bestaat niet meer");
  assert.equal((await status(metCookie(t3))).ingelogd, false);
  // "wis dit apparaat": ook de proefcookie leeg, naast die van de sessie
  const t4 = tokenUit(sessieCookie(await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW2 }, BROWSER)));
  const wis = await post("/api/praktijk/logout?apparaat=1", {}, metCookie(t4, BROWSER));
  assert.deepEqual(cookies(wis).map((c) => c.split("=")[0]).sort(), ["fpproef", "fpsessie"], "beide cookies gaan leeg terug");
  assert.ok(cookies(wis).every((c) => /Max-Age=0/.test(c)));
  assert.equal((await get(kaartenPad, metCookie(t4))).status, 401);
  // uitloggen met de sleutel in de kop (een eigen programma) blijft werken
  const t5 = (await (await post("/api/praktijk/login", { praktijk: P, wachtwoord: WW2 })).json()).sessie;
  assert.equal((await post("/api/praktijk/logout", {}, { "x-praktijk-sessie": t5 })).status, 200);
  assert.equal((await get(kaartenPad, { "x-praktijk-sessie": t5 })).status, 401);
  console.log("Sessiecookie (server): HttpOnly en SameSite=Strict, een browser krijgt de sleutel alleen in de cookie, niet geldig vanaf een andere website, omruilen en uitloggen werken.");

  // ---- 3. browser ----
  const require = createRequire(import.meta.url);
  let pw = null;
  try { pw = require("playwright"); } catch { console.log("test-sessie-cookie: geen Playwright, browserdeel overgeslagen (het serverdeel draaide wel)"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    browserKlaar = () => browser.close();
    const PB = "Fysio Browsercookie", WWB = "browser-wachtwoord-1";
    const nieuw = async (ipadres, oudeSleutel) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": ipadres } });
      await ctx.addInitScript((oud) => { try {
        localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten");
        if (oud && !sessionStorage.getItem("gezet")) { localStorage.setItem("fp_praksessie", oud); sessionStorage.setItem("gezet", "1"); }
      } catch {} }, oudeSleutel || "");
      const page = await ctx.newPage();
      const fouten = [];
      page.on("pageerror", (e) => fouten.push(e.message));
      return { ctx, page, fouten };
    };
    const open = async (page, { basis = origin, praktijk = PB, totRust = false } = {}) => {
      await page.goto(basis + "/v2/app", totRust ? { waitUntil: "networkidle", timeout: 20000 } : {});
      await page.waitForSelector("[data-add]", { timeout: 15000 });
      await page.evaluate((pr) => { document.querySelectorAll(".ov.on").forEach((o) => o.classList.remove("on")); const e = document.getElementById("praktijk"); e.value = pr; e.dispatchEvent(new Event("input", { bubbles: true })); }, praktijk);
      await page.click("#kaartenBtn");
    };
    const koek = async (ctx, basis = origin, naam = "fpsessie") => (await ctx.cookies(basis)).find((c) => c.name === naam) || null;
    const opslag = (page) => page.evaluate(() => ({ sleutel: localStorage.getItem("fp_praksessie"), cookie: document.cookie }));

    // -- beveiligen in de app: de sleutel staat in de cookie en nergens waar een script bij kan --
    const a = await nieuw("10.93.0.1");
    await open(a.page);
    await a.page.waitForSelector("#ps_ww", { state: "visible", timeout: 5000 });
    await a.page.fill("#ps_ww", WWB); await a.page.check("#ps_vwo"); await a.page.click("#ps_do");
    await a.page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });
    const k1 = await koek(a.ctx);
    assert.ok(k1 && /^[a-f0-9]{48}$/.test(k1.value), "na het inloggen staat de cookie er");
    assert.equal(k1.httpOnly, true, "HttpOnly");
    assert.equal(k1.sameSite, "Strict", "SameSite=Strict");
    const o1 = await opslag(a.page);
    assert.equal(o1.sleutel, null, "niets in localStorage");
    assert.ok(!o1.cookie.includes("fpsessie"), "en een script ziet de cookie niet: " + o1.cookie);
    assert.equal(await a.page.evaluate((w) => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || "").includes(w)), k1.value), false, "de sleutel staat nergens in de opslag");

    // -- herladen: ingelogd op de cookie alleen --
    await open(a.page);
    await a.page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });

    // -- wissen van dit apparaat lukt niet (geen verbinding): niets gewist, en dat staat er --
    // (dezelfde functie bewaren: unroute herkent een route aan de functie waarmee hij is gezet)
    const uitlogPad = (u) => u.pathname.endsWith("/api/praktijk/logout");
    const geenVerbinding = (r) => r.abort("internetdisconnected");
    await a.page.evaluate(() => localStorage.setItem("fysiplan_notes", "blijft"));
    await a.page.route(uitlogPad, geenVerbinding);
    const meldingen = [];
    const antwoord = (d) => { meldingen.push(d.message()); d.accept(); };
    a.page.on("dialog", antwoord);
    await a.page.click("#ps_wis");
    for (let i = 0; i < 50 && meldingen.length < 2; i++) await wacht(100);
    assert.equal(meldingen.length, 2, "eerst de vraag, dan de melding: " + JSON.stringify(meldingen));
    assert.match(meldingen[1], /Wissen lukte niet.*Er is niets gewist/s);
    assert.equal(await a.page.evaluate(() => localStorage.getItem("fysiplan_notes")), "blijft", "er is niets gewist");
    assert.ok(await koek(a.ctx), "de cookie staat er nog");

    // -- uitloggen lukt niet: het scherm zegt het en blijft ingelogd --
    await a.page.click("#ps_uit");
    await a.page.waitForFunction(() => /Uitloggen lukte niet/.test((document.getElementById("ps_msg") || {}).textContent || ""), null, { timeout: 5000 });
    assert.ok(await a.page.isVisible("#ps_uit"), "na mislukt uitloggen staat de app nog op ingelogd");
    assert.ok(await koek(a.ctx), "en de cookie staat er nog");

    // -- de verbinding is terug: dezelfde knop werkt zonder herladen; cookie weg, en na herladen niet meer ingelogd --
    await a.page.unroute(uitlogPad, geenVerbinding);
    await a.page.click("#ps_uit");
    await a.page.waitForSelector("#ps_ww", { state: "visible", timeout: 8000 });
    assert.equal(await koek(a.ctx), null, "na het uitloggen is de cookie weg");
    await open(a.page);
    await a.page.waitForSelector("#ps_ww", { state: "visible", timeout: 8000 });
    assert.equal(await a.page.isVisible("#ps_uit"), false, "na herladen niet ingelogd");
    a.page.off("dialog", antwoord);
    assert.deepEqual(a.fouten, [], "geen fouten op de pagina");
    await a.ctx.close();

    // -- een sleutel van vóór de cookie in localStorage: omgeruild en daarna weg --
    const oud = (await (await post("/api/praktijk/login", { praktijk: PB, wachtwoord: WWB })).json()).sessie;
    assert.match(oud, /^[a-f0-9]{48}$/);
    const b = await nieuw("10.93.0.2", oud);
    // totRust: het omruilverzoek moet ook voor de browser klaar zijn (de app leest het antwoord uit);
    // anders komt de pagina nooit tot rust en wachten andere tests daar eindeloos op
    await open(b.page, { totRust: true });
    await b.page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });
    await b.page.waitForFunction(() => localStorage.getItem("fp_praksessie") === null, null, { timeout: 8000 });
    const k2 = await koek(b.ctx);
    assert.ok(k2 && k2.value === oud && k2.httpOnly, "de oude sleutel staat nu in de cookie en niet meer in de opslag");
    await open(b.page);
    await b.page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });
    assert.equal((await opslag(b.page)).sleutel, null);
    assert.deepEqual(b.fouten, [], "geen fouten op de pagina");
    await b.ctx.close();

    // -- een oude sleutel die niet meer werkt: ook weg uit de opslag, en niet ingelogd --
    const c = await nieuw("10.93.0.3", "e".repeat(48));
    await open(c.page);
    await c.page.waitForFunction(() => localStorage.getItem("fp_praksessie") === null, null, { timeout: 8000 });
    assert.equal(await koek(c.ctx), null);
    await c.page.waitForSelector("#ps_ww", { state: "visible", timeout: 8000 });
    await c.ctx.close();

    // -- zoals in productie, over https: de browser neemt de cookie met __Host- aan en blijft ingelogd --
    // Een eigen https-adres met een zelfgetekend certificaat ervoor, dat net als de proxy van
    // Railway x-forwarded-proto: https meestuurt. Zonder openssl slaat dit deel over.
    const certMap = await mkdtemp(join(tmpdir(), "fysiplan-cookie-cert-"));
    let viaHttps = "niet gedraaid (geen openssl)";
    try {
      const gemaakt = await new Promise((ok) => execFile("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
        "-addext", "subjectAltName=DNS:localhost", "-keyout", join(certMap, "sleutel.pem"), "-out", join(certMap, "cert.pem")], (fout) => ok(!fout)));
      if (gemaakt) {
        const voordeur = httpsServer({ key: await readFile(join(certMap, "sleutel.pem")), cert: await readFile(join(certMap, "cert.pem")) }, (vraag, antwoord) => {
          const door = httpVerzoek({ host: "127.0.0.1", port, path: vraag.url, method: vraag.method, headers: { ...vraag.headers, "x-forwarded-proto": "https" } },
            (r) => { antwoord.writeHead(r.statusCode, r.headers); r.pipe(antwoord); });
          door.on("error", () => { antwoord.statusCode = 502; antwoord.end(); });
          vraag.pipe(door);
        });
        await new Promise((r) => voordeur.listen(0, "127.0.0.1", r));
        try {
          const veilig = "https://localhost:" + voordeur.address().port, PH = "Fysio Https";
          const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", ignoreHTTPSErrors: true, extraHTTPHeaders: { "x-forwarded-for": "10.93.0.4" } });
          await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_welkom_gezien", "1"); localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} });
          const page = await ctx.newPage();
          const fouten = [];
          page.on("pageerror", (e) => fouten.push(e.message));
          await open(page, { basis: veilig, praktijk: PH });
          await page.waitForSelector("#ps_ww", { state: "visible", timeout: 5000 });
          await page.fill("#ps_ww", "https-wachtwoord-1"); await page.check("#ps_vwo"); await page.click("#ps_do");
          await page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });
          const k = await koek(ctx, veilig, "__Host-fpsessie");
          assert.ok(k && /^[a-f0-9]{48}$/.test(k.value), "over https staat de cookie er, met het voorvoegsel: " + JSON.stringify((await ctx.cookies(veilig)).map((x) => x.name)));
          assert.deepEqual([k.httpOnly, k.secure, k.sameSite, k.path, k.domain], [true, true, "Strict", "/", "localhost"], "HttpOnly, Secure, Strict, Path=/ en alleen voor dit adres");
          assert.equal(await koek(ctx, veilig, "fpsessie"), null, "en geen tweede cookie zonder voorvoegsel");
          assert.equal(await page.evaluate(() => document.cookie.includes("fpsessie")), false, "een script ziet hem niet");
          await open(page, { basis: veilig, praktijk: PH });
          await page.waitForSelector("#ps_uit", { state: "visible", timeout: 8000 });
          await page.click("#ps_uit");
          await page.waitForSelector("#ps_ww", { state: "visible", timeout: 8000 });
          assert.equal(await koek(ctx, veilig, "__Host-fpsessie"), null, "na het uitloggen is hij weg");
          await open(page, { basis: veilig, praktijk: PH });
          await page.waitForSelector("#ps_ww", { state: "visible", timeout: 8000 });
          assert.deepEqual(fouten, [], "geen fouten op de pagina");
          await ctx.close();
          viaHttps = "gedraaid";
        } finally { await new Promise((r) => { voordeur.close(r); voordeur.closeAllConnections(); }); }
      }
    } finally { await rm(certMap, { recursive: true, force: true }); }
    console.log("Sessiecookie (browser): na inloggen staat de sleutel alleen in de HttpOnly-cookie; mislukt uitloggen of wissen staat op het scherm; een oude sleutel wordt omgeruild. Over https met __Host-: " + viaHttps + ".");
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
