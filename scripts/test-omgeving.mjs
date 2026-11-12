// De testomgeving (lib/omgeving.js, docs/testomgeving.md).
//
// Een testomgeving is dezelfde server met nepgegevens. Bij Railway maak je haar het snelst door
// productie te kopiëren, en dan gaan de sleutels van mail, betalen en de reservekopie mee. Wat
// hier vastligt, is dat zo'n kopie niets echts kan doen:
//   1. welke omgeving het is: OMGEVING wint, op Railway beslist de naam van de omgeving, en een
//      naam die de server niet kent start niet;
//   2. het merk in de datamap: test start alleen op een lege of gemerkte map, productie en lokaal
//      nooit op een gemerkte;
//   3. wat een testomgeving anders doet: het eigen adres, mail, betalen, wat er genegeerd wordt;
//   4. de testpostbak, het lint op een pagina en links die nooit naar productie wijzen;
//   5. de echte server als testomgeving, met alle sleutels van "productie" erbij: geen verzoek
//      aan de reservekopie, Mollie of Cloudflare, mail alleen naar TEST_MAIL_AAN, de postbak
//      alleen voor beheer, het lint en noindex op elke pagina;
//   6. de server die weigert te starten, en daarbij niets aanraakt;
//   7. buiten de testomgeving bestaat hier niets van;
//   8. de nepgegevens (scripts/nepgegevens.mjs): twee praktijken met logins die werken, kaarten
//      met wat een patiënt invulde, en op productie doet het script niets.
// Zonder browser en zonder internet. `npm run test:omgeving`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpVerzoek } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { omgevingVan, keurDatamap, MERK_BESTAND, testRegels, naarEigenAdres, magEchtMailen, testBericht, TestPostbak, testPagina, LINT_ID, ROBOTS_TEST } from "../lib/omgeving.js";
import { bewaak } from "./bewaker.mjs";
import { vulNepgegevens, overzicht, PRAKTIJKEN } from "./nepgegevens.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const werkmap = await mkdtemp(join(tmpdir(), "fysiplan-omgeving-"));
let mapNr = 0;
const nieuweMap = async (bestanden = {}) => {
  const m = join(werkmap, "map" + ++mapNr);
  await mkdir(m, { recursive: true });
  for (const [naam, inhoud] of Object.entries(bestanden)) {
    if (naam.endsWith("/")) await mkdir(join(m, naam), { recursive: true });
    else await writeFile(join(m, naam), inhoud);
  }
  return m;
};
const gooit = async (f, patroon, uitleg) => { await assert.rejects(async () => f(), (e) => { assert.match(e.message, patroon, uitleg); return true; }, uitleg); };

try {
  // ---- 1. welke omgeving is dit? ----
  assert.equal(omgevingVan({}), "lokaal");
  assert.equal(omgevingVan({ NODE_ENV: "production" }), "productie");
  assert.equal(omgevingVan({ OMGEVING: "test" }), "test");
  assert.equal(omgevingVan({ OMGEVING: " Test " }), "test", "hoofdletters en spaties maken niet uit");
  assert.equal(omgevingVan({ OMGEVING: "productie", RAILWAY_ENVIRONMENT_NAME: "test" }), "productie", "OMGEVING wint van de naam bij Railway");
  assert.equal(omgevingVan({ OMGEVING: "test", RAILWAY_ENVIRONMENT_NAME: "production" }), "test", "een testomgeving in een eigen project heet bij Railway ook production");
  assert.equal(omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "production" }), "productie");
  assert.equal(omgevingVan({ RAILWAY_ENVIRONMENT: "production" }), "productie", "de oude naam van de variabele telt ook");
  assert.equal(omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "Production" }), "productie");
  assert.equal(omgevingVan({ RAILWAY_PROJECT_ID: "abc" }), "productie", "op Railway zonder naam: productie, zoals het altijd was");
  assert.equal(omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "test" }), "test");
  assert.equal(omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "", RAILWAY_ENVIRONMENT: "", RAILWAY_PROJECT_ID: "" }), "lokaal", "lege variabelen zijn geen Railway");
  // de voor de hand liggende vergissing: productie kopiëren naar een omgeving met een eigen naam
  assert.throws(() => omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "staging", RAILWAY_PROJECT_ID: "abc" }), /heet bij Railway "staging".*"production" of "test"/s);
  assert.throws(() => omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "fysiplan-pr-12" }), /start alleen in de omgeving/);
  assert.throws(() => omgevingVan({ RAILWAY_ENVIRONMENT_NAME: "production-copy" }), /start alleen in de omgeving/, "een naam die op production lijkt, is het niet");
  // een tikfout in OMGEVING maakt van een testomgeving geen productie
  assert.throws(() => omgevingVan({ OMGEVING: "tset", RAILWAY_ENVIRONMENT_NAME: "production" }), /OMGEVING is "tset"/);
  assert.throws(() => omgevingVan({ OMGEVING: "lokaal" }), /Kies "test" of "productie"/);

  // ---- 2. het merk in de datamap ----
  {
    // test op een lege map: het merk komt erop
    let m = await nieuweMap();
    assert.deepEqual(await keurDatamap(m, "test", Date.UTC(2026, 10, 12)), { gemerkt: true, nieuw: true });
    const merk = JSON.parse(await readFile(join(m, MERK_BESTAND), "utf8"));
    assert.equal(merk.omgeving, "test");
    assert.equal(merk.sinds, "2026-11-12T00:00:00.000Z");
    // en daarna start ze er weer op, ook als er intussen gegevens staan
    await writeFile(join(m, "kaarten.json"), "{}");
    assert.deepEqual(await keurDatamap(m, "test"), { gemerkt: true, nieuw: false });
    // productie en lokaal starten niet op die map
    await gooit(() => keurDatamap(m, "productie"), /is van een testomgeving.*Productie start niet op nepgegevens/s, "productie op een gemerkte map");
    await gooit(() => keurDatamap(m, "lokaal"), /is van een testomgeving.*OMGEVING=test/s, "lokaal op een gemerkte map");

    // test op een map die nog niet bestaat: ze wordt gemaakt en gemerkt
    m = join(werkmap, "bestaat-nog-niet", "data");
    assert.deepEqual(await keurDatamap(m, "test"), { gemerkt: true, nieuw: true });
    assert.deepEqual(await readdir(m), [MERK_BESTAND]);

    // een leeg volume heeft al een lost+found, en soms verborgen bestanden: dat zijn geen gegevens
    m = await nieuweMap({ "lost+found/": "", ".stfolder": "x" });
    assert.deepEqual(await keurDatamap(m, "test"), { gemerkt: true, nieuw: true });

    // test op gegevens zonder merk: weigeren, en niets aanraken
    for (const bestanden of [{ "kaarten.json": "{}" }, { "uploads/": "" }, { "praktijk-accounts.json": "{}", "kaarten.json": "{}", "backups/": "" }]) {
      m = await nieuweMap(bestanden);
      const voor = (await readdir(m)).sort();
      await gooit(() => keurDatamap(m, "test"), /staan al gegevens zonder het merk.*gegevens van productie.*leeg volume/s, "test op gegevens zonder merk: " + voor);
      assert.deepEqual((await readdir(m)).sort(), voor, "de map is niet aangeraakt");
    }
    // ook als het merk er wel staat maar iets anders zegt, of kapot is
    for (const inhoud of ['{"omgeving":"productie"}', "geen json", "[]", "null"]) {
      m = await nieuweMap({ [MERK_BESTAND]: inhoud, "kaarten.json": "{}" });
      await gooit(() => keurDatamap(m, "test"), /zonder het merk/, "een merk dat geen test zegt: " + inhoud);
      // productie start daar gewoon op
      assert.deepEqual(await keurDatamap(m, "productie"), { gemerkt: false, nieuw: false });
    }

    // productie en lokaal: een gewone map, een lege map en een map die er niet is, zijn allemaal goed,
    // en er wordt niets geschreven
    m = await nieuweMap({ "kaarten.json": "{}" });
    assert.deepEqual(await keurDatamap(m, "productie"), { gemerkt: false, nieuw: false });
    assert.deepEqual(await keurDatamap(m, "lokaal"), { gemerkt: false, nieuw: false });
    assert.deepEqual(await readdir(m), ["kaarten.json"]);
    const weg = join(werkmap, "is-er-niet");
    assert.deepEqual(await keurDatamap(weg, "productie"), { gemerkt: false, nieuw: false });
    await assert.rejects(readdir(weg), "productie maakt de map hier niet aan");
  }

  // ---- 3. wat een testomgeving anders doet ----
  {
    // het eigen adres: een eigen FYSIPLAN_BASIS_URL, anders het domein van Railway, anders lokaal
    assert.equal(testRegels({ FYSIPLAN_BASIS_URL: "https://test.fysiplan.nl/" }).basis, "https://test.fysiplan.nl");
    assert.equal(testRegels({ FYSIPLAN_BASIS_URL: "https://test.fysiplan.nl" }).host, "test.fysiplan.nl");
    assert.equal(testRegels({ RAILWAY_PUBLIC_DOMAIN: "fysiplan-test.up.railway.app" }).basis, "https://fysiplan-test.up.railway.app");
    assert.equal(testRegels({ FYSIPLAN_BASIS_URL: "https://test.fysiplan.nl", RAILWAY_PUBLIC_DOMAIN: "fysiplan-test.up.railway.app" }).basis, "https://test.fysiplan.nl", "het eigen adres gaat voor");
    assert.deepEqual([testRegels({}, 4321).basis, testRegels({}, 4321).host], ["http://localhost:4321", "localhost:4321"]);
    // het adres van productie, gekopieerd met de andere variabelen, telt nooit
    for (const adres of ["https://fysiplan.nl", "https://www.fysiplan.nl/", "http://FYSIPLAN.nl", "fysiplan.nl", "ftp://test.fysiplan.nl"]) {
      const r = testRegels({ FYSIPLAN_BASIS_URL: adres, RAILWAY_PUBLIC_DOMAIN: "fysiplan-test.up.railway.app" });
      assert.equal(r.basis, "https://fysiplan-test.up.railway.app", adres);
      assert.ok(r.genegeerd.some((g) => g.startsWith("FYSIPLAN_BASIS_URL")), "en het staat bij wat genegeerd is: " + adres);
    }
    assert.equal(testRegels({ RAILWAY_PUBLIC_DOMAIN: "fysiplan.nl" }, 3000).basis, "http://localhost:3000", "ook niet als Railway zegt dat dit fysiplan.nl is");
    assert.equal(testRegels({ RAILWAY_PUBLIC_DOMAIN: "raar domein/pad" }, 3000).basis, "http://localhost:3000");

    // mail: alleen de adressen uit TEST_MAIL_AAN
    assert.deepEqual(testRegels({ TEST_MAIL_AAN: " Ahmed@Voorbeeld.nl, tweede@voorbeeld.nl;derde@voorbeeld.nl  geen-adres ahmed@voorbeeld.nl" }).mailAan,
      ["ahmed@voorbeeld.nl", "tweede@voorbeeld.nl", "derde@voorbeeld.nl"]);
    assert.deepEqual(testRegels({}).mailAan, []);
    const lijst = ["ahmed@voorbeeld.nl"];
    assert.equal(magEchtMailen("ahmed@voorbeeld.nl", lijst), true);
    assert.equal(magEchtMailen(" Ahmed@Voorbeeld.NL ", lijst), true);
    assert.equal(magEchtMailen("ahmed+praktijk2@voorbeeld.nl", lijst), true, "een adres met een plus komt in dezelfde postbus");
    assert.equal(magEchtMailen("iemand@voorbeeld.nl", lijst), false);
    assert.equal(magEchtMailen("ahmed@voorbeeld.nl.example", lijst), false);
    assert.equal(magEchtMailen("xahmed@voorbeeld.nl", lijst), false);
    assert.equal(magEchtMailen("ahmed@voorbeeld.nl", []), false, "zonder lijst gaat er niets echt weg");
    assert.equal(magEchtMailen("", lijst), false);
    assert.equal(magEchtMailen("ahmed@voorbeeld.nl", null), false);

    // betalen: alleen een testsleutel van Mollie
    assert.equal(testRegels({ MOLLIE_API_KEY: "test_abc123" }).mollie, "test_abc123");
    assert.deepEqual(testRegels({ MOLLIE_API_KEY: "test_abc123" }).genegeerd, []);
    for (const sleutel of ["live_abc123", "abc", "TEST_abc", " test_abc"]) {
      const r = testRegels({ MOLLIE_API_KEY: sleutel });
      assert.equal(r.mollie, "", sleutel);
      assert.ok(r.genegeerd.some((g) => g.startsWith("MOLLIE_API_KEY")), sleutel);
    }
    // de reservekopie en de video-opslag: wat er is ingesteld, staat bij wat genegeerd is
    const g = testRegels({ BACKUP_S3_URL: "https://s3.example/bak", CLOUDFLARE_API_TOKEN: "x" }).genegeerd.join(" | ");
    assert.match(g, /BACKUP_/);
    assert.match(g, /CLOUDFLARE_/);
    assert.deepEqual(testRegels({ BACKUP_S3_URL: "" }).genegeerd, []);
  }

  // ---- 4. links, berichten, de postbak en het lint ----
  {
    const B = "https://test.fysiplan.nl";
    assert.equal(naarEigenAdres("Ga naar https://fysiplan.nl/v2/proef?mijn=1 of https://www.fysiplan.nl. Of http://fysiplan.nl/privacy", B),
      "Ga naar https://test.fysiplan.nl/v2/proef?mijn=1 of https://test.fysiplan.nl. Of https://test.fysiplan.nl/privacy");
    assert.equal(naarEigenAdres("HTTPS://FYSIPLAN.NL/v2", B), "https://test.fysiplan.nl/v2");
    // wat niet het adres van productie is, blijft staan
    for (const t of ["https://test.fysiplan.nl/v2", "https://fysiplan.nl.voorbeeld.com/x", "https://fysiplan.nlx/x", "https://mijnfysiplan.nl/x", "https://fysiplan.nl-nep.com", "mail naar hallo@fysiplan.nl", "fysiplan.nl"])
      assert.equal(naarEigenAdres(t, B), t, t);
    assert.equal(naarEigenAdres(null, B), "");

    assert.deepEqual(testBericht("a@b.nl", "Je link", "Klik op https://fysiplan.nl/x", B), { naar: "a@b.nl", onderwerp: "[TEST] Je link",
      tekst: "(Dit bericht komt uit de testomgeving van Fysiplan. Niets hierin is echt.)\n\nKlik op https://test.fysiplan.nl/x" });

    // de postbak: nieuwste eerst, een grens, en op schijf
    const pad = join(werkmap, "postbak.json");
    const bewaard = [];
    const bak = new TestPostbak(pad, async (p, wat) => { bewaard.push(p); await writeFile(p, JSON.stringify(wat)); }, 3);
    await bak.laad();
    assert.deepEqual(bak.lijst(), [], "een postbak zonder bestand is leeg");
    for (let i = 1; i <= 4; i++) await bak.leg({ naar: "n" + i + "@x.nl", onderwerp: "o" + i, tekst: "t" + i }, i === 4, Date.UTC(2026, 10, 12, 10, i));
    assert.deepEqual(bak.lijst().map((b) => b.onderwerp), ["o4", "o3", "o2"], "nieuwste eerst, en hooguit drie");
    assert.deepEqual(bak.lijst()[0], { t: "2026-11-12T10:04:00.000Z", naar: "n4@x.nl", onderwerp: "o4", tekst: "t4", echt: true });
    assert.equal(bak.lijst()[1].echt, false);
    assert.equal(bewaard.length, 4, "elk bericht staat meteen op schijf");
    bak.lijst()[0].onderwerp = "geknoeid";
    assert.equal(bak.lijst()[0].onderwerp, "o4", "wie de lijst leest, kan de postbak niet veranderen");
    const opnieuw = new TestPostbak(pad, async () => {}, 3);
    await opnieuw.laad();
    assert.deepEqual(opnieuw.lijst(), bak.lijst(), "na een herstart staat alles er nog");
    await writeFile(pad, "kapot");
    const kapot = new TestPostbak(pad, async () => {}, 3);
    await kapot.laad();
    assert.deepEqual(kapot.lijst(), [], "een onleesbaar bestand geeft een lege postbak, geen fout");
    await bak.leg({ naar: "x@x.nl", onderwerp: "o".repeat(1000), tekst: "t".repeat(50000) });
    assert.deepEqual([bak.lijst()[0].onderwerp.length, bak.lijst()[0].tekst.length], [300, 20000], "een bericht heeft een grens");

    // het lint: direct na <body>, [TEST] in de titel, één keer
    const pagina = '<!doctype html><html><head><title>Fysiplan</title><link rel="canonical" href="https://fysiplan.nl/v2"></head><body class="x"><h1>Hallo</h1></body></html>';
    const uit = testPagina(pagina, B);
    assert.match(uit, new RegExp('<body class="x"><style>#' + LINT_ID + '\\{[^<]*</style><div id="' + LINT_ID + '"[^>]*>TESTOMGEVING · nepgegevens</div><h1>Hallo</h1>'));
    assert.match(uit, /<title>\[TEST\] Fysiplan<\/title>/);
    assert.match(uit, /href="https:\/\/test\.fysiplan\.nl\/v2"/, "een link naar productie wijst naar de testomgeving");
    assert.match(uit, /pointer-events:none/, "het lint vangt geen klikken: de pagina eronder werkt als in productie");
    assert.equal(testPagina(uit, B), uit, "twee keer is hetzelfde als één keer");
    assert.equal(testPagina(Buffer.from(pagina), B), uit, "een pagina uit een bestand gaat net zo");
    assert.equal(testPagina("<p>los stukje</p>", B), "<p>los stukje</p>", "wat geen hele pagina is, krijgt geen lint");
    assert.match(testPagina("<html><BODY><title>x</title></BODY></html>", B), /<BODY><style>/, "hoofdletters maken niet uit");

    assert.equal(ROBOTS_TEST, "User-agent: *\nAllow: /health\nDisallow: /\n");
  }

  // ---- de echte server ----
  async function vrijePoort() {
    const s = createServer();
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const p = s.address().port;
    await new Promise((r) => s.close(r));
    return p;
  }
  // Start de server. Geeft { origin, stop, log } terug, of { code, log } als hij zelf stopte.
  async function start(dataDir, extra = {}) {
    const port = await vrijePoort();
    const origin = "http://127.0.0.1:" + port;
    const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "" };
    for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|CLOUDFLARE|STREAM|FYSIPLAN_|MAIL_|TEST_MAIL)/.test(k) || ["NODE_ENV", "OMGEVING", "EIGEN_LOGIN_VERPLICHT", "PROEF_VERPLICHT", "V1_REGISTRATIE_CODE"].includes(k)) delete kind[k];
    Object.assign(kind, extra);
    const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
    const uit = { origin, log: "", code: null };
    app.stdout.on("data", (c) => { uit.log += c; });
    app.stderr.on("data", (c) => { uit.log += c; });
    const gestopt = new Promise((r) => app.once("exit", (code) => { uit.code = code; r(); }));
    for (let i = 0; i < 400 && uit.code === null; i++) {
      try { if ((await fetch(origin + "/health")).ok) break; } catch {}
      await wacht(50);
    }
    uit.stop = async () => { if (uit.code === null) app.kill(); await gestopt; };
    if (uit.code !== null) await gestopt;
    return uit;
  }
  // een verzoek met een Host-kop naar keuze (fetch kiest die zelf)
  const metHost = (origin, pad, host, lijf) => new Promise((klaar, mis) => {
    const u = new URL(origin + pad);
    const r = httpVerzoek({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: lijf ? "POST" : "GET",
      headers: { host, ...(lijf ? { "content-type": "application/json", "content-length": Buffer.byteLength(lijf) } : {}) } }, (antwoord) => {
      let tekst = "";
      antwoord.on("data", (c) => { tekst += c; });
      antwoord.on("end", () => klaar({ status: antwoord.statusCode, tekst }));
    });
    r.on("error", mis);
    r.end(lijf || undefined);
  });

  // De diensten van buiten, nagemaakt: alles wat er binnenkomt, wordt onthouden. Mail antwoordt
  // zoals de mailprovider; de rest hoort in een testomgeving nooit een verzoek te krijgen.
  const buiten = [];
  const nep = createServer((req, res) => {
    let lijf = "";
    req.on("data", (c) => { lijf += c; });
    req.on("end", () => {
      buiten.push({ pad: req.url, methode: req.method, lijf });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "nep" }));
    });
  });
  await new Promise((r) => nep.listen(0, "127.0.0.1", r));
  const nepAdres = "http://127.0.0.1:" + nep.address().port;
  const mails = () => buiten.filter((b) => b.pad === "/mail/emails").map((b) => JSON.parse(b.lijf));
  const nietMail = () => buiten.filter((b) => !b.pad.startsWith("/mail/"));
  // alle sleutels van "productie", zoals een gekopieerde omgeving ze meekrijgt
  const SLEUTEL = "eigen-beheersleutel-voor-de-test";
  const vanProductie = {
    ADMIN_KEY: SLEUTEL, V1_REGISTRATIE_CODE: "proefcode-1234", PROEF_MELDING_AAN: "eigenaar@fysiplan.invalid",
    MAIL_API_SLEUTEL: "re_nep", MAIL_AFZENDER: "Fysiplan <noreply@fysiplan.invalid>", MAIL_API_BASIS: nepAdres + "/mail",
    MOLLIE_API_KEY: "live_echtgeld", MOLLIE_API_BASIS: nepAdres + "/mollie", MOLLIE_INCASSO: "aan",
    BACKUP_S3_URL: nepAdres + "/bak", BACKUP_S3_SLEUTEL_ID: "id", BACKUP_S3_GEHEIM: "geheim", BACKUP_SLEUTEL: "een-lange-wachtzin-voor-de-reservekopie", BACKUP_LEVERANCIER: "Nepopslag",
    CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_API_TOKEN: "tok", STREAM_API_BASIS: nepAdres + "/stream",
    FYSIPLAN_BASIS_URL: "https://fysiplan.nl",
  };
  const beheer = { "x-admin-sleutel": SLEUTEL };
  const json = { "content-type": "application/json" };

  try {
    // ---- 5. de echte server als testomgeving, met alle sleutels van productie erbij ----
    const dataDir = await nieuweMap();
    let app = await start(dataDir, { ...vanProductie, OMGEVING: "test", RAILWAY_PUBLIC_DOMAIN: "fysiplan-test.up.railway.app", TEST_MAIL_AAN: "Tester@Voorbeeld.invalid" });
    try {
      assert.equal(app.code, null, "de testomgeving start op een lege map:\n" + app.log);
      const { origin } = app;
      const postbak = async () => (await (await fetch(origin + "/api/test/mail", { headers: beheer })).json()).berichten;

      // het merk staat er, en de server zegt wat hij is en wat hij negeert
      assert.equal(JSON.parse(await readFile(join(dataDir, MERK_BESTAND), "utf8")).omgeving, "test");
      assert.match(app.log, /TESTOMGEVING op https:\/\/fysiplan-test\.up\.railway\.app: mail blijft in de testpostbak .*behalve naar 1 adres.*betalen uit; reservekopie buiten Railway uit; video's op het eigen volume/);
      for (const naam of ["FYSIPLAN_BASIS_URL", "MOLLIE_API_KEY", "BACKUP_", "CLOUDFLARE_"]) assert.match(app.log, new RegExp("TESTOMGEVING: genegeerd: " + naam), naam + " staat in het logboek als genegeerd");
      let h = await (await fetch(origin + "/health")).json();
      assert.deepEqual([h.omgeving, h.backupElders, h.videoOpslag], ["test", "uit", "railway-volume"]);

      // de bewaker: goed als hij weet dat dit test is, alarm als dit het adres van productie had moeten zijn
      let u = await bewaak(origin, { omgeving: "test", pauzeMs: 0 });
      assert.deepEqual([u.ok, u.storingen, u.omgeving], [true, [], "test"], JSON.stringify(u));
      u = await bewaak(origin, { pauzeMs: 0 });
      assert.deepEqual(u.storingen.map((s) => s.code), ["omgeving"], "het adres van productie dat een testomgeving blijkt, is een storing");

      // elke pagina: het lint, [TEST] in de titel, niets voor een zoekmachine
      for (const pad of ["/v2", "/v2/app", "/v2/proef", "/k/demo", "/privacy", "/dashboard88", "/test/postbak", "/"]) {
        const r = await fetch(origin + pad);
        const tekst = await r.text();
        assert.equal(r.status, 200, pad);
        assert.match(r.headers.get("content-type"), /^text\/html/, pad);
        assert.equal(tekst.split('id="' + LINT_ID + '"').length, 2, "het lint staat één keer op " + pad);
        assert.match(tekst, /<title>\[TEST\] /, "[TEST] in de titel van " + pad);
        assert.match(r.headers.get("x-robots-tag"), /noindex/, pad);
        assert.doesNotMatch(tekst, /https?:\/\/(www\.)?fysiplan\.nl(?![\w-]|\.[\w-])/, "geen link naar productie op " + pad);
      }
      for (const pad of ["/health", "/v2/oefeningen.json", "/robots.txt", "/v2.css"]) {
        const r = await fetch(origin + pad);
        await r.text();
        assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow, noarchive", pad);
      }
      assert.equal(await (await fetch(origin + "/robots.txt")).text(), ROBOTS_TEST);
      assert.doesNotMatch(await (await fetch(origin + "/v2.css")).text(), new RegExp(LINT_ID), "alleen pagina's krijgen het lint");

      // de testpostbak is alleen voor beheer
      assert.equal((await fetch(origin + "/api/test/mail")).status, 403);
      assert.equal((await fetch(origin + "/api/test/mail", { headers: { "x-admin-sleutel": "admin88" } })).status, 403, "de openbare standaardsleutel werkt in een testomgeving niet");
      assert.equal((await fetch(origin + "/api/test/mail", { method: "POST", headers: beheer })).status, 405);
      let d = await (await fetch(origin + "/api/test/mail", { headers: beheer })).json();
      assert.deepEqual(d, { ok: true, echtNaar: ["tester@voorbeeld.invalid"], berichten: [] });

      // mail naar een willekeurig adres: niet verstuurd, wel in de postbak, met de link naar deze omgeving
      const registreer = (email, host) => metHost(origin, "/api/v1/registreer", host || new URL(origin).host, JSON.stringify({ email, code: "proefcode-1234" }));
      let r = await registreer("noor@praktijk.invalid");
      assert.equal(r.status, 200, r.tekst);
      assert.deepEqual(mails(), [], "er is niets naar de mailprovider gegaan");
      let bak = await postbak();
      assert.equal(bak.length, 1);
      assert.deepEqual([bak[0].naar, bak[0].onderwerp, bak[0].echt], ["noor@praktijk.invalid", "[TEST] Je Fysiplan-wachtwoord instellen", false]);
      assert.match(bak[0].tekst, /^\(Dit bericht komt uit de testomgeving van Fysiplan\. Niets hierin is echt\.\)\n\nWelkom bij Fysiplan\./);
      assert.ok(bak[0].tekst.includes(origin + "/"), "de link wijst naar het adres waarop het verzoek binnenkwam: " + bak[0].tekst);
      // een verzoek met een vreemde Host-kop: de link valt terug op de testomgeving, nooit op productie
      r = await registreer("vreemd@praktijk.invalid", "kwaad.example");
      assert.equal(r.status, 200, r.tekst);
      bak = await postbak();
      assert.match(bak[0].tekst, /https:\/\/fysiplan-test\.up\.railway\.app\//, bak[0].tekst);
      r = await registreer("vermomd@praktijk.invalid", "fysiplan.nl");
      bak = await postbak();
      assert.match(bak[0].tekst, /https:\/\/fysiplan-test\.up\.railway\.app\//, "ook met de Host-kop van productie: " + bak[0].tekst);
      for (const b of bak) assert.doesNotMatch(b.tekst, /\/\/(www\.)?fysiplan\.nl(?![\w-]|\.[\w-])/, "geen link naar productie in een bericht");
      assert.deepEqual(mails(), []);

      // mail naar een adres uit TEST_MAIL_AAN gaat echt weg, herkenbaar, en staat ook in de postbak
      r = await registreer("tester+eerste@voorbeeld.invalid");
      assert.equal(r.status, 200, r.tekst);
      assert.equal(mails().length, 1);
      assert.deepEqual([mails()[0].to, mails()[0].subject], [["tester+eerste@voorbeeld.invalid"], "[TEST] Je Fysiplan-wachtwoord instellen"]);
      assert.match(mails()[0].text, /^\(Dit bericht komt uit de testomgeving/);
      bak = await postbak();
      assert.deepEqual([bak.length, bak[0].naar, bak[0].echt], [4, "tester+eerste@voorbeeld.invalid", true]);

      // een aanmelding voor de proef: het bericht aan de eigenaar noemt letterlijk fysiplan.nl, en ook dat wijst hierheen
      r = await fetch(origin + "/v2/proef", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "eigenaar@nieuwepraktijk.invalid", email_ok: "1", naam: "Sanne de Vries", tel: "06 1234 5679", praktijk: "Fysio Nep", akkoord: "1", vwo: "1" }).toString() });
      assert.ok(r.status < 400, "de aanmelding lukt: " + r.status);
      for (let i = 0; i < 100 && !(await postbak()).some((b) => b.naar === "eigenaar@fysiplan.invalid"); i++) await wacht(50);
      bak = await postbak();
      const melding = bak.find((b) => b.naar === "eigenaar@fysiplan.invalid");
      assert.ok(melding, "het bericht aan de eigenaar ligt in de postbak: " + bak.map((b) => b.naar));
      assert.match(melding.tekst, /Alle aanmeldingen: https:\/\/fysiplan-test\.up\.railway\.app\/aanmeldingen/);
      assert.equal(mails().length, 1, "en het is niet verstuurd");

      // Een link die de server uit het verzoek opbouwt en die niet door mail of een pagina gaat:
      // de agenda van de voorbeeldkaart. Alleen het adres van deze omgeving telt als eigen; al het
      // andere, ook de Host-kop van productie, valt daarop terug.
      const agendaLink = async (o, host) => (/^URL:(.*)$/m.exec((await metHost(o, "/api/kaart/agenda?id=demo&dagen=MO&tijd=09:00", host)).tekst) || [])[1];
      assert.equal(await agendaLink(origin, "fysiplan-test.up.railway.app"), "https://fysiplan-test.up.railway.app/k/demo");
      assert.equal(await agendaLink(origin, "FYSIPLAN-test.up.railway.app"), "https://FYSIPLAN-test.up.railway.app/k/demo");
      assert.equal(await agendaLink(origin, "kwaad.example"), "https://fysiplan-test.up.railway.app/k/demo");
      assert.equal(await agendaLink(origin, "fysiplan.nl"), "https://fysiplan-test.up.railway.app/k/demo", "het adres van productie is in een testomgeving niet eigen");
      assert.equal(await agendaLink(origin, "app.fysiplan.nl"), "https://fysiplan-test.up.railway.app/k/demo");
      assert.equal(await agendaLink(origin, new URL(origin).host), "https://" + new URL(origin).host + "/k/demo", "lokaal blijft lokaal");

      // betalen staat uit met een echte sleutel
      r = await fetch(origin + "/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=tr_abc" });
      assert.notEqual(await r.text(), "ok", "de webhook van Mollie bestaat niet");

      // en na dit alles is er geen enkel verzoek naar de reservekopie, Mollie of Cloudflare gegaan
      await wacht(300);
      assert.deepEqual(nietMail(), [], "geen verzoek aan een dienst van productie");

      // de postbak overleeft een herstart
      await app.stop();
      app = await start(dataDir, { ...vanProductie, OMGEVING: "test", RAILWAY_PUBLIC_DOMAIN: "fysiplan-test.up.railway.app" });
      assert.equal(app.code, null, "de testomgeving start opnieuw op haar eigen map:\n" + app.log);
      d = await (await fetch(app.origin + "/api/test/mail", { headers: beheer })).json();
      assert.deepEqual([d.echtNaar, d.berichten.length], [[], bak.length]);
      // zonder TEST_MAIL_AAN gaat er niets echt weg, ook niet naar het adres van zonet
      r = await metHost(app.origin, "/api/v1/registreer", new URL(app.origin).host, JSON.stringify({ email: "tester@voorbeeld.invalid", code: "proefcode-1234" }));
      assert.equal(r.status, 200, r.tekst);
      assert.equal(mails().length, 1, "nog steeds dat ene bericht");
    } finally { await app.stop(); }

    // met een testsleutel van Mollie werkt betalen wel, en de naam van de omgeving bij Railway is genoeg
    {
      const m = await nieuweMap();
      const a = await start(m, { ADMIN_KEY: SLEUTEL, RAILWAY_ENVIRONMENT_NAME: "test", RAILWAY_PROJECT_ID: "p", MOLLIE_API_KEY: "test_sleutel", MOLLIE_API_BASIS: nepAdres + "/mollie" });
      try {
        assert.equal(a.code, null, a.log);
        assert.equal((await (await fetch(a.origin + "/health")).json()).omgeving, "test", "de omgeving heet test bij Railway: dan is het test");
        assert.match(a.log, /betalen met de testsleutel van Mollie/);
        const r = await fetch(a.origin + "/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=tr_abc" });
        assert.equal(await r.text(), "ok");
        // zonder mailsleutels werkt mail toch: alles ligt in de postbak
        assert.equal((await metHost(a.origin, "/api/v1/wachtwoord-vergeten", new URL(a.origin).host, JSON.stringify({ email: "iemand@praktijk.invalid" }))).status, 200);
      } finally { await a.stop(); }
    }

    // Een testomgeving zonder eigen beheersleutel en zonder mailsleutels. Ze hangt aan het internet,
    // dus ze telt als productie: de openbare standaardsleutel werkt er niet, en een praktijk begint
    // met een proef en een eigen login. En een adres uit TEST_MAIL_AAN krijgt zonder mailsleutels niets.
    {
      const voor = mails().length;
      const a = await start(await nieuweMap(), { OMGEVING: "test", TEST_MAIL_AAN: "tester@voorbeeld.invalid", MAIL_API_BASIS: nepAdres + "/mail", V1_REGISTRATIE_CODE: "proefcode-1234" });
      try {
        assert.equal(a.code, null, a.log);
        assert.equal((await fetch(a.origin + "/api/test/mail", { headers: { "x-admin-sleutel": "admin88" } })).status, 403, "de openbare standaardsleutel opent de testpostbak niet");
        assert.equal((await fetch(a.origin + "/api/dashboard", { headers: { "x-admin-sleutel": "admin88" } })).status, 403, "en het dashboard ook niet");
        assert.match(a.log, /Beheer staat dicht/);
        const st = await (await fetch(a.origin + "/api/praktijk/status?praktijk=Nieuw")).json();
        assert.deepEqual([st.eigenLogin, st.proefNodig], [true, true], "dezelfde regels als productie: " + JSON.stringify(st));
        const r = await metHost(a.origin, "/api/v1/registreer", new URL(a.origin).host, JSON.stringify({ email: "tester@voorbeeld.invalid", code: "proefcode-1234" }));
        assert.equal(r.status, 200, r.tekst);
        assert.equal(mails().length, voor, "zonder mailsleutels gaat er niets naar de mailprovider");
      } finally { await a.stop(); }
    }

    // ---- 6. de server die weigert te starten, en daarbij niets aanraakt ----
    const weigert = async (bestanden, env, patroon, uitleg) => {
      const m = await nieuweMap(bestanden);
      const voor = (await readdir(m)).sort();
      const a = await start(m, env);
      try {
        assert.equal(a.code, 1, uitleg + ": de server stopt met code 1\n" + a.log);
        assert.match(a.log, patroon, uitleg);
        assert.match(a.log, /^Fysiplan start niet: /m, uitleg);
        assert.deepEqual((await readdir(m)).sort(), voor, uitleg + ": de datamap is niet aangeraakt");
      } finally { await a.stop(); }
    };
    await weigert({ "kaarten.json": "{}", "praktijk-accounts.json": "{}" }, { OMGEVING: "test" }, /staan al gegevens zonder het merk van een testomgeving/, "een testomgeving op de gegevens van productie");
    await weigert({ [MERK_BESTAND]: '{"omgeving":"test"}', "kaarten.json": "{}" }, {}, /is van een testomgeving/, "lokaal op de map van een testomgeving");
    await weigert({ [MERK_BESTAND]: '{"omgeving":"test"}' }, { RAILWAY_ENVIRONMENT_NAME: "production" }, /Productie start niet op nepgegevens/, "productie op de map van een testomgeving");
    await weigert({}, { ...vanProductie, RAILWAY_ENVIRONMENT_NAME: "staging", RAILWAY_PROJECT_ID: "p" }, /heet bij Railway "staging"/, "een kopie van productie onder een andere naam");
    await weigert({}, { OMGEVING: "prod" }, /OMGEVING is "prod"/, "een tikfout in OMGEVING");
    assert.deepEqual(buiten.filter((b) => !b.pad.startsWith("/mail/")), [], "ook een geweigerde start vraagt niets aan een dienst van productie");

    // ---- 7. buiten de testomgeving bestaat hier niets van ----
    {
      const m = await nieuweMap();
      const a = await start(m, {});
      try {
        assert.equal(a.code, null, a.log);
        assert.equal((await (await fetch(a.origin + "/health")).json()).omgeving, "lokaal");
        assert.doesNotMatch(a.log, /TESTOMGEVING/);
        for (const pad of ["/api/test/mail", "/test/postbak", "/test-postbak.html"]) {
          const r = await fetch(a.origin + pad, { headers: { "x-admin-sleutel": "admin88" } });
          assert.equal(r.status, 404, pad + " bestaat alleen in een testomgeving");
        }
        const r = await fetch(a.origin + "/v2");
        const tekst = await r.text();
        assert.doesNotMatch(tekst, new RegExp(LINT_ID), "geen lint buiten de testomgeving");
        assert.doesNotMatch(tekst, /\[TEST\]/);
        assert.equal(r.headers.get("x-robots-tag"), null, "de landingspagina mag gewoon gevonden worden");
        assert.match(tekst, /https:\/\/fysiplan\.nl\/v2/, "en haar links blijven zoals ze zijn");
        assert.match(await (await fetch(a.origin + "/robots.txt")).text(), /Sitemap: https:\/\/fysiplan\.nl\/sitemap\.xml/);
        // de link uit het verzoek: het eigen domein en lokaal tellen, al het andere valt terug op fysiplan.nl
        const link = async (host) => (/^URL:(.*)$/m.exec((await metHost(a.origin, "/api/kaart/agenda?id=demo&dagen=MO&tijd=09:00", host)).tekst) || [])[1];
        assert.equal(await link("kwaad.example"), "https://fysiplan.nl/k/demo");
        assert.equal(await link("app.fysiplan.nl"), "https://app.fysiplan.nl/k/demo");
        assert.equal(await link("fysiplan.nl"), "https://fysiplan.nl/k/demo");
        assert.equal(await link("fysiplan-test.up.railway.app"), "https://fysiplan.nl/k/demo");
        assert.equal(await link(new URL(a.origin).host), "https://" + new URL(a.origin).host + "/k/demo");
        assert.deepEqual(await readdir(m).then((n) => n.includes(MERK_BESTAND)), false, "en er komt geen merk in de map");
      } finally { await a.stop(); }
      // op Railway in de omgeving production: productie
      const pMap = await nieuweMap();
      const p = await start(pMap, { RAILWAY_ENVIRONMENT_NAME: "production", RAILWAY_PROJECT_ID: "p", ADMIN_KEY: SLEUTEL });
      try {
        assert.equal(p.code, null, p.log);
        assert.equal((await (await fetch(p.origin + "/health")).json()).omgeving, "productie");
        assert.equal((await fetch(p.origin + "/test/postbak")).status, 404);
        // de nepgegevens beginnen niet aan productie: geen aanmelding, geen praktijk, geen bestand erbij
        const voor = (await readdir(pMap)).sort();
        await gooit(() => vulNepgegevens(p.origin), /geen testomgeving.*"productie".*niets gedaan/s, "nepgegevens weigeren productie");
        assert.deepEqual((await readdir(pMap)).sort(), voor, "en er is in de datamap niets bijgekomen");
      } finally { await p.stop(); }
    }

    // ---- 8. de nepgegevens: door de voordeur van een testomgeving ----
    {
      await gooit(() => vulNepgegevens("test.voorbeeld.nl"), /Geef het adres/);
      const voorBuiten = buiten.length;
      const a = await start(await nieuweMap(), { OMGEVING: "test", ADMIN_KEY: SLEUTEL });
      try {
        assert.equal(a.code, null, a.log);
        const uit = await vulNepgegevens(a.origin + "/");
        assert.equal(uit.omgeving, "test");
        assert.deepEqual(uit.praktijken.map((x) => x.naam), PRAKTIJKEN.map((x) => x.naam));
        assert.deepEqual(uit.praktijken.map((x) => x.logins.length), [2, 1], "een beheerder met een collega, en een praktijk met één login");
        assert.deepEqual(uit.praktijken.map((x) => x.kaarten.length), [3, 2]);
        const post = (pad, body) => fetch(a.origin + pad, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        // elke login uit het overzicht werkt: wachtwoord en één reservecode geven een sessie, het wachtwoord alleen niet
        for (const pr of uit.praktijken) for (const l of pr.logins) {
          assert.ok(l.email.endsWith("@example.org") && l.wachtwoord.length >= 12 && l.geheim && l.reservecodes.length === 8, l.email);
          assert.equal((await post("/api/praktijk/login", { praktijk: pr.naam, email: l.email, wachtwoord: l.wachtwoord })).status, 401, "zonder tweede stap geen sessie");
          const r = await post("/api/praktijk/login", { praktijk: pr.naam, email: l.email, wachtwoord: l.wachtwoord, code: l.reservecodes[0] });
          assert.equal(r.status, 200, l.email + " logt in met een reservecode");
          assert.ok((await r.json()).sessie);
        }
        assert.equal(uit.praktijken[0].logins[1].rol, "therapeut");
        // de kaart zoals de patiënt haar krijgt: de oefeningen uit de bibliotheek, met sets en herhalingen, en wat er thuis is ingevuld
        const kaartVan = async (k) => { const r = await fetch(a.origin + "/api/kaart?id=" + k.id); assert.equal(r.status, 200, k.naam); return r.json(); };
        const jan = await kaartVan(uit.praktijken[0].kaarten[0]);
        const jk = jan.kaart || jan;
        assert.equal(jk.chosen.length, 4);
        assert.deepEqual(jk.metingen.map((m) => m.s ?? m.score ?? m.v), [6, 5, 4, 2], "vier pijnscores op vier dagen, de oudste eerst");
        assert.equal(jk.gedaan.length, 3);
        assert.ok(Object.values(jk.cells || {}).includes("12") && Object.values(jk.cells || {}).includes("3"), "sets en herhalingen staan op de kaart");
        const dagen = jk.metingen.map((m) => Math.round((Date.now() - m.t) / 86400000));
        assert.deepEqual(dagen, [8, 6, 3, 1], "de scores staan op de dagen van toen, niet allemaal op vandaag");
        const piet = await kaartVan(uit.praktijken[0].kaarten[2]);
        assert.equal(((piet.kaart || piet).metingen || []).length, 0, "een kaart die net gestart is");
        assert.equal((await fetch(uit.praktijken[1].kaarten[0].link)).status, 200, "de link uit het overzicht opent de kaart");
        // de mails van het aanmelden en uitnodigen staan in de testpostbak; er ging niets de deur uit
        const bak = await (await fetch(a.origin + "/api/test/mail", { headers: { "x-admin-sleutel": SLEUTEL } })).json();
        assert.ok(bak.berichten.some((b) => b.naar === "bram@example.org" && /uitgenodigd/.test(b.onderwerp)));
        assert.ok(bak.berichten.every((b) => !b.echt));
        assert.equal(buiten.length, voorBuiten, "geen verzoek aan een dienst van buiten");
        // het overzicht noemt per login wat je nodig hebt, en elke kaart
        const tekst = overzicht(uit);
        for (const pr of uit.praktijken) {
          for (const l of pr.logins) for (const stuk of [l.email, l.wachtwoord, l.geheim, l.reservecodes[7]]) assert.ok(tekst.includes(stuk), stuk);
          for (const k of pr.kaarten) assert.ok(tekst.includes(k.link));
        }
        // een tweede keer: het script zegt dat het er al staat en maakt niets dubbel
        await gooit(() => vulNepgegevens(a.origin), /staan er al.*--set=/s);
      } finally { await a.stop(); }
    }

    // de volgorde in server.js: eerst de omgeving, en het merk vóór het eerste bestand uit de datamap
    const bron = await readFile(join(root, "server.js"), "utf8");
    const iOmgeving = bron.indexOf("OMGEVING = omgevingVan(process.env)");
    const iMap = bron.indexOf("const dataDir = await resolveDataDir();");
    const iKeur = bron.indexOf("await keurDatamap(dataDir, OMGEVING)");
    assert.ok(iOmgeving > 0 && iMap > iOmgeving && iKeur > iMap, "omgeving, datamap, merk: in die volgorde");
    assert.doesNotMatch(bron.slice(0, iMap), /dataDir/, "vóór die regel gebruikt niets de datamap");
    assert.equal(bron.slice(iMap, iKeur).split("\n").filter((r) => r.trim() && !r.trim().startsWith("//")).length, 2, "en tussen de datamap en het merk staat geen andere code");
    assert.match(bron, /const backupElders = TEST \? null : backupInstellingen\(\);/);
    assert.match(bron, /const STREAM_ENABLED = !TEST && /);
    assert.match(bron, /const MOLLIE_SLEUTEL = TEST \? TEST\.mollie : /);
    assert.match(bron, /const APP_BASIS = TEST \? TEST\.basis : /, "links in berichten en naar Mollie vertrekken vanaf het adres van deze omgeving");
    assert.match(bron, /const INCASSO_WEBHOOK = APP_BASIS \+ "\/api\/mollie\/webhook";/, "Mollie meldt een incasso bij deze omgeving, niet bij productie");
    assert.equal(bron.match(/await fetch\(MAIL_API_BASIS/g).length, 1, "er is één plek waar mail de deur uitgaat");
    assert.equal(bron.split('"fysiplan.nl"').length - 1, 2, "het adres van productie staat alleen nog in eigenHost");
  } finally { await new Promise((r) => nep.close(r)); }

  console.log("test-omgeving: ok (welke omgeving, het merk in de datamap, het eigen adres, mail alleen naar de eigen adressen, de testpostbak, het lint, geen verzoek aan diensten van productie, weigeren zonder iets aan te raken, niets hiervan buiten de testomgeving, de nepgegevens)");
} finally {
  await rm(werkmap, { recursive: true, force: true });
}
