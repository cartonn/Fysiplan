// De app en de patiëntkaart laden licht (platformreview 2026-11-11).
// Gemeten vóór deze wijziging: de app haalde bij het openen 166 MB op in 834 verzoeken (alle 818
// oefenbeelden op volle grootte voor vakjes van 76 px), de patiëntkaart 2,2 MB waarvan 1,9 MB
// onverpakte tekst. Erna: 0,3 MB voor de app en 0,6 MB voor de kaart.
// - Oefenlijst en sjabloonkiezer vragen een kleine versie van het beeld en pas als het vakje in
//   beeld komt. De A4 en de patiëntkaart houden het volledige bestand (de kaart controleert de hash).
// - De bouwstap zet van elk bibliotheekbeeld een kleine versie klaar; de server stuurt die, of het
//   origineel als hij ontbreekt of als de browser geen WebP aankan.
// - Tekst van 1 kB of meer gaat ingepakt weg (brotli of gzip) als de browser erom vraagt; kleine
//   antwoorden, beelden en geluid blijven zoals ze waren.
// - Beelden en lettertypen hebben een ETag: na een dag is opnieuw vragen een leeg 304-antwoord.
// Zonder browser, past in CI; het browserdeel draait alleen waar Playwright staat.
// `npm run test:lichtladen`
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import http, { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { INPAK_VANAF, etagKomtOvereen, inpakbaar, kiesInpak, pakIn } from "../lib/inpakken.js";
import { KLEIN_PX, kleinMap, kleinPadVoor } from "../lib/klein-beeld.js";

const root = process.cwd();
const sha = (b) => createHash("sha256").update(b).digest("hex");
const html = await readFile(join(root, "public/index.html"), "utf8");
const kaartHtml = await readFile(join(root, "public/kaart.html"), "utf8");

// ---- inpakken: de keuze, de inhoud en het bewaren ----
assert.equal(kiesInpak("gzip, deflate, br, zstd"), "br", "brotli boven gzip");
assert.equal(kiesInpak("gzip, deflate"), "gzip");
assert.equal(kiesInpak("GZIP"), "gzip");
assert.equal(kiesInpak("br;q=0, gzip;q=0.5"), "gzip", "q=0 is een uitdrukkelijk nee");
assert.equal(kiesInpak("br;q=0,gzip;q=0"), "");
assert.equal(kiesInpak("identity"), "");
assert.equal(kiesInpak(""), "");
assert.equal(kiesInpak(undefined), "");
assert.equal(inpakbaar("text/html; charset=utf-8", 5000), true);
assert.equal(inpakbaar("application/json; charset=utf-8", INPAK_VANAF), true);
assert.equal(inpakbaar("application/json; charset=utf-8", INPAK_VANAF - 1), false, "kleine antwoorden blijven zoals ze waren");
assert.equal(inpakbaar("image/svg+xml", 5000), true);
for (const type of ["image/png", "image/webp", "image/jpeg", "audio/mpeg", "video/mp4", "font/woff2", "application/octet-stream", ""]) {
  assert.equal(inpakbaar(type, 500000), false, type + " is al ingepakt of geen tekst");
}
{
  const tekst = "Oefening voor de patiënt: buig je knieën rustig. ".repeat(200);
  const br = await pakIn("br", tekst), gz = await pakIn("gzip", Buffer.from(tekst, "utf8"));
  assert.equal(brotliDecompressSync(br).toString("utf8"), tekst);
  assert.equal(gunzipSync(gz).toString("utf8"), tekst);
  assert.ok(br.length < tekst.length / 10 && gz.length < tekst.length / 10);
  // dezelfde inhoud een tweede keer: vanaf dan komt het ingepakte antwoord uit het geheugen
  const tweede = await pakIn("br", tekst), derde = await pakIn("br", tekst);
  assert.equal(tweede, derde, "bewaard na de tweede keer");
  assert.equal(brotliDecompressSync(derde).toString("utf8"), tekst);
  assert.notEqual(await pakIn("br", tekst + "x"), derde, "andere inhoud, ander antwoord");
}
assert.equal(etagKomtOvereen('"abc"', '"abc"'), true);
assert.equal(etagKomtOvereen('W/"abc"', '"abc"'), true, "een tussenstation mag er een zwakke ETag van maken");
assert.equal(etagKomtOvereen('"x", "abc"', '"abc"'), true);
assert.equal(etagKomtOvereen("*", '"abc"'), true);
assert.equal(etagKomtOvereen('"abd"', '"abc"'), false);
assert.equal(etagKomtOvereen(undefined, '"abc"'), false);
assert.equal(etagKomtOvereen('"abc"', ""), false);

// ---- de lijst vraagt het kleine beeld, de A4 het volledige ----
const renderer = html.match(/  function imgRender\(im,size\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(renderer, "imgRender staat in public/index.html");
const teken = (USE_V2_LIBRARY, V2_BEELD = "lijn") => {
  const context = vm.createContext({ USE_V2_LIBRARY, V2_BEELD, svgStr: () => "<svg/>" });
  vm.runInContext(renderer, context);
  return context.imgRender;
};
{
  const v2 = teken(true), beeld = { type: "img", src: "/v2/images/rug/a-avatar-v8.jpg", lineSrc: "/v2/images/rug/a-line-v1.png", colorSrc: "/v2/images/rug/a-avatar-v8.jpg" };
  for (const size of [38, 48, 56, 76]) {
    const h = v2(beeld, size);
    assert.ok(h.includes("src='/v2/klein/images/rug/a-line-v1.png'"), "lijst (" + size + " px) vraagt het kleine beeld: " + h);
    assert.ok(h.includes("loading='lazy'") && h.includes("decoding='async'"), "en pas als het in beeld komt: " + h);
  }
  assert.ok(teken(true, "kleur")(beeld, 56).includes("src='/v2/klein/images/rug/a-avatar-v8.jpg'"), "ook bij de kleurenbeelden");
  const a4 = v2(beeld, 90);
  assert.ok(a4.includes("src='/v2/images/rug/a-line-v1.png'"), "de A4 houdt het volledige bestand: " + a4);
  assert.ok(!a4.includes("loading="), "en laadt het meteen (afdrukken wacht niet op scrollen)");
  assert.ok(v2({ type: "img", src: "images/rug/a.png" }, 56).includes("src='klein/images/rug/a.png'"), "relatief pad");
  assert.ok(v2({ type: "img", src: "/images/rug/a.png" }, 56).includes("src='/klein/images/rug/a.png'"), "beheer");
  // eigen oefeningen van de praktijk en ingelezen plaatjes hebben geen kleine versie
  for (const eigen of ["/uploads/oefeningen/abc.jpg", "data:image/png;base64,AAAA", "/uploads/images/x.png", "upload.png"]) {
    assert.ok(v2({ type: "img", src: eigen }, 56).includes("src='" + eigen + "'"), "ongemoeid: " + eigen);
  }
  // v1 blijft zoals het was
  const v1 = teken(false)({ type: "img", src: "images/rug/a.png", lineSrc: null, colorSrc: null }, 56);
  assert.ok(v1.includes("src='images/rug/a.png'") && !v1.includes("loading="), "v1 ongewijzigd: " + v1);
}
assert.match(html, /imgRender\(im,90\)/, "de A4 tekent op 90 px en valt dus buiten de kleine beelden");
assert.doesNotMatch(kaartHtml, /klein\/images/, "de patiëntkaart gebruikt het volledige beeld (hashcontrole)");

// ---- de bouwstap zet de kleine beelden klaar ----
const pakket = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.match(pakket.scripts.build, /node scripts\/kleine-beelden\.mjs/, "npm run build maakt de kleine beelden (Railway en CI)");
const indexPad = join(kleinMap(root), "index.json");
if (!(await stat(indexPad).catch(() => null))) {
  // los gedraaid zonder `npm run build` ervoor: de bouwstap hier zelf draaien
  const r = spawnSync(process.execPath, ["scripts/kleine-beelden.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, "scripts/kleine-beelden.mjs: " + r.stdout + r.stderr);
}
const index = JSON.parse(await readFile(indexPad, "utf8"));
assert.ok(index.aantal > 1500, "de bouwstap heeft de kleine beelden gemaakt: " + JSON.stringify(index));

// ---- de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-lichtladen-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
// rauw ophalen: geen automatisch uitpakken en het pad gaat letterlijk de deur uit
function haal(pad, kop = {}, methode = "GET", body = null) {
  return new Promise((ok, fout) => {
    const req = http.request({ host: "127.0.0.1", port, path: pad, method: methode,
      headers: { "x-forwarded-for": "10.9.90." + (ip++ % 250), ...(body ? { "content-type": "application/json" } : {}), ...kop } }, (res) => {
      const delen = [];
      res.on("data", (d) => delen.push(d));
      res.on("end", () => ok({ status: res.statusCode, kop: res.headers, body: Buffer.concat(delen) }));
    });
    req.on("error", fout);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const uitgepakt = (r) => r.kop["content-encoding"] === "br" ? brotliDecompressSync(r.body) : r.kop["content-encoding"] === "gzip" ? gunzipSync(r.body) : r.body;
const WEBP = { accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" };
const isWebp = (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
let teruggezet = null;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const health = JSON.parse((await haal("/health")).body.toString("utf8"));
  assert.equal(health.kleineBeelden, index.aantal, "/health toont hoeveel kleine beelden er staan");

  // elke oefening in de bibliotheek heeft een kleine versie van zijn lijntekening en zijn kleurenbeeld
  const lib = JSON.parse(uitgepakt(await haal("/v2/oefeningen.json")).toString("utf8"));
  assert.ok(lib.length > 500, "bibliotheek geladen");
  const paden = [...new Set(lib.flatMap((o) => [o.img, o.kaartImg]).filter((p) => typeof p === "string" && p.startsWith("/v2/images/")))];
  assert.ok(paden.length > 1000, "beelden in de bibliotheek: " + paden.length);
  let somKlein = 0, somGroot = 0;
  for (const pad of paden) {
    const rel = pad.slice("/v2/".length);
    const klein = await stat(kleinPadVoor(rel, root)).catch(() => null);
    assert.ok(klein && klein.size > 0, "kleine versie ontbreekt: " + rel + " (draai npm run build)");
    assert.ok(klein.size < 16 * 1024, "kleine versie is klein: " + rel + " " + klein.size);
    somKlein += klein.size;
    somGroot += (await stat(join(root, "public", rel))).size;
  }
  assert.ok(somKlein < somGroot / 20, `alle lijstbeelden samen: ${(somKlein / 1048576).toFixed(1)} MB in plaats van ${(somGroot / 1048576).toFixed(0)} MB`);

  // steekproef door alle soorten bestanden: echt WebP, hooguit 160 px, zelfde verhouding
  const sharp = (await import("sharp")).default;
  const proef = paden.filter((_, i) => i % 45 === 0);
  for (const ext of [".png", ".jpg", ".webp"]) assert.ok(proef.some((p) => p.endsWith(ext)) || !paden.some((p) => p.endsWith(ext)), "steekproef bevat " + ext);
  for (const pad of proef) {
    const kleinUrl = pad.replace("/v2/images/", "/v2/klein/images/");
    const rel = pad.slice("/v2/".length);
    const bron = await readFile(join(root, "public", rel));
    const r = await haal(kleinUrl, WEBP);
    assert.equal(r.status, 200, kleinUrl);
    assert.equal(r.kop["content-type"], "image/webp");
    assert.ok(isWebp(r.body), "WebP: " + kleinUrl);
    assert.deepEqual(r.body, await readFile(kleinPadVoor(rel, root)), "het bestand van de bouwstap");
    assert.ok(r.body.length <= bron.length, "niet groter dan het origineel: " + kleinUrl);
    const mk = await sharp(r.body).metadata(), mb = await sharp(bron).metadata();
    assert.ok(mk.width <= KLEIN_PX && mk.height <= KLEIN_PX, `hooguit ${KLEIN_PX} px: ${kleinUrl} ${mk.width}x${mk.height}`);
    assert.ok(Math.abs(mk.width / mk.height - mb.width / mb.height) < 0.03, `zelfde verhouding: ${kleinUrl} ${mk.width}x${mk.height} tegen ${mb.width}x${mb.height}`);
    assert.equal(r.kop["cache-control"], "public, max-age=86400");
    assert.equal(r.kop.vary, "accept");
    assert.equal(r.kop["content-encoding"], undefined, "een beeld wordt niet nog eens ingepakt");
    assert.equal(r.kop["x-content-type-options"], "nosniff");
  }

  // één beeld van dichtbij
  const pad = paden.find((p) => p.endsWith(".png")), rel = pad.slice("/v2/".length);
  const kleinUrl = pad.replace("/v2/images/", "/v2/klein/images/");
  const bron = await readFile(join(root, "public", rel));
  const klein = await haal(kleinUrl, WEBP);
  assert.ok(klein.kop.etag, "ETag op het kleine beeld");
  const weer = await haal(kleinUrl, { ...WEBP, "if-none-match": klein.kop.etag });
  assert.equal(weer.status, 304, "zelfde versie: leeg antwoord");
  assert.equal(weer.body.length, 0);
  assert.equal(weer.kop.etag, klein.kop.etag);
  assert.equal((await haal(kleinUrl, { ...WEBP, "if-none-match": "W/" + klein.kop.etag })).status, 304);
  assert.equal((await haal(kleinUrl, { ...WEBP, "if-none-match": '"iets-anders"' })).status, 200);
  const kop = await haal(kleinUrl, WEBP, "HEAD");
  assert.equal(kop.status, 200);
  assert.equal(kop.body.length, 0);
  assert.equal(Number(kop.kop["content-length"]), klein.body.length);
  assert.deepEqual((await haal(kleinUrl.replace("/v2/klein/", "/klein/"), WEBP)).body, klein.body, "ook onder /klein/ (beheer)");
  // een browser zonder WebP krijgt het origineel
  const oud = await haal(kleinUrl, { accept: "image/png,image/*;q=0.8,*/*;q=0.5" });
  assert.equal(oud.status, 200);
  assert.equal(oud.kop["content-type"], "image/png");
  assert.equal(sha(oud.body), sha(bron), "zonder WebP: het origineel, byte voor byte");
  // ontbreekt de kleine versie, dan het origineel (zoals voorheen), geen fout
  const kleinBestand = kleinPadVoor(rel, root);
  await rename(kleinBestand, kleinBestand + ".weg");
  teruggezet = async () => { await rename(kleinBestand + ".weg", kleinBestand); teruggezet = null; };
  const zonder = await haal(kleinUrl, WEBP);
  await teruggezet();
  assert.equal(zonder.status, 200);
  assert.equal(sha(zonder.body), sha(bron), "geen kleine versie: het origineel");
  assert.equal(zonder.kop["content-type"], "image/png");
  // buiten de beeldmap valt niets te halen
  assert.equal((await haal("/v2/klein/images/rug/bestaat-niet.png", WEBP)).status, 404);
  for (const fout of ["/v2/klein/images/../../server.js", "/v2/klein/images/../../package.json.png", "/v2/klein/images/%2e%2e/%2e%2e/package.json.png",
    "/v2/klein/images/..%2f..%2fserver.js.png", "/klein/images/rug/../../../server.js.png", "/v2/klein/images/%2e%2e%2f%2e%2e%2fdist/build-info.json.png"]) {
    const r = await haal(fout, WEBP);
    // een pad dat op een beeldnaam eindigt komt bij de kleine beelden uit en wordt daar geweigerd;
    // de rest valt, zoals elk onbekend pad, op de inlogpagina. Nergens komt een bestand mee.
    if (/\.png$/.test(fout)) assert.ok(r.status === 403 || r.status === 404, fout + " geweigerd: " + r.status);
    assert.ok(!/createServer|"scripts"|builtAt/.test(r.body.toString("utf8")), fout + " lekt geen bestand");
    assert.doesNotMatch(String(r.kop["content-type"] || ""), /^image\//, fout + " geeft geen beeld");
  }
  assert.equal((await haal(kleinUrl, WEBP, "POST")).status, 405);

  // het volledige beeld is ongewijzigd (A4, pdf, patiëntkaart) en heeft nu een ETag
  const vol = await haal(pad, { ...WEBP, "accept-encoding": "gzip, br" });
  assert.equal(vol.status, 200);
  assert.equal(sha(vol.body), sha(bron), "het origineel, byte voor byte");
  assert.equal(vol.kop["content-encoding"], undefined);
  assert.equal(vol.kop["cache-control"], "public, max-age=86400");
  assert.ok(vol.kop.etag, "ETag op het volledige beeld");
  assert.equal((await haal(pad, { "if-none-match": vol.kop.etag })).status, 304);
  assert.equal((await haal(pad.replace("/v2/images/", "/images/"), { "if-none-match": vol.kop.etag })).status, 304, "zelfde bestand, zelfde ETag");
  const font = await haal("/fonts/inter-latin-wght-normal.woff2");
  assert.equal(font.status, 200);
  assert.ok(font.kop.etag && (await haal("/fonts/inter-latin-wght-normal.woff2", { "if-none-match": font.kop.etag })).status === 304, "lettertype: 304");

  // ---- tekst gaat ingepakt weg als de browser erom vraagt ----
  for (const [pad, bestand] of [["/v2.css", "public/v2.css"], ["/mobile-media-review.json", "public/mobile-media-review.json"],
    ["/sjablonen.json", "public/sjablonen.json"], ["/qr.js", "public/qr.js"], ["/kaart-sw.js", "public/kaart-sw.js"]]) {
    const echt = await readFile(join(root, bestand));
    const kaal = await haal(pad);
    assert.equal(kaal.kop["content-encoding"], undefined, pad + ": zonder Accept-Encoding niet ingepakt");
    assert.equal(sha(kaal.body), sha(echt));
    for (const enc of ["br", "gzip"]) {
      const r = await haal(pad, { "accept-encoding": enc === "br" ? "gzip, deflate, br, zstd" : "gzip, deflate" });
      assert.equal(r.status, 200);
      assert.equal(r.kop["content-encoding"], enc, pad + " als " + enc);
      assert.match(String(r.kop.vary || ""), /accept-encoding/i);
      assert.equal(sha(uitgepakt(r)), sha(echt), pad + " (" + enc + "): na uitpakken dezelfde inhoud");
      assert.ok(r.body.length < echt.length * 0.45, `${pad} (${enc}): ${r.body.length} van ${echt.length} bytes`);
      assert.equal(r.kop["cache-control"], kaal.kop["cache-control"], "de cache-regels blijven gelijk");
    }
    assert.equal((await haal(pad, { "accept-encoding": "br;q=0, gzip" })).kop["content-encoding"], "gzip");
    assert.equal((await haal(pad, { "accept-encoding": "identity" })).kop["content-encoding"], undefined);
  }
  // pagina's (met een eigen nonce per verzoek) en de catalogus
  for (const pad of ["/v2/app", "/k/abcdef123456", "/v2", "/v2/oefeningen.json", "/privacy"]) {
    const kaal = await haal(pad);
    const br = await haal(pad, { "accept-encoding": "gzip, deflate, br" });
    assert.equal(kaal.status, 200, pad);
    assert.equal(br.status, 200, pad);
    assert.equal(br.kop["content-encoding"], "br", pad + " ingepakt");
    const tekst = uitgepakt(br).toString("utf8");
    assert.equal(tekst.length, kaal.body.toString("utf8").length, pad + ": na uitpakken even lang als onverpakt");
    assert.ok(br.body.length < kaal.body.length * 0.45, `${pad}: ${br.body.length} van ${kaal.body.length} bytes`);
    if (!pad.endsWith(".json")) assert.match(tekst, /<\/html>\s*$/, pad + ": de hele pagina komt aan");
    for (const k of ["content-security-policy", "x-frame-options", "cache-control", "content-type"]) {
      assert.equal(typeof br.kop[k], typeof kaal.kop[k], pad + ": kop " + k + " blijft");
    }
  }
  // gegevens uit de API: groot gaat ingepakt, klein blijft zoals het was (daar zit de sessiesleutel)
  const P = "Fysio Lichtladen";
  const claimR = await haal("/api/praktijk/claim", { "accept-encoding": "gzip, deflate, br" }, "POST", { praktijk: P, wachtwoord: "lichtladen-wachtwoord", akkoord: true });
  assert.equal(claimR.status, 200);
  assert.equal(claimR.kop["content-encoding"], undefined, "het antwoord met de sessiesleutel is klein en gaat onverpakt");
  const S = { "x-praktijk-sessie": JSON.parse(claimR.body.toString("utf8")).sessie };
  for (const naam of ["Truus B.", "Jan K.", "Mo A.", "Els V.", "Piet D."]) {
    const r = await haal("/api/kaarten", S, "POST", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Bruggen beginner", id: "fp_688499fde71e7575", i: 0 }], kaartId: "" });
    assert.equal(r.status, 200, "kaart gedeeld");
  }
  const lijstPad = "/api/kaarten?praktijk=" + encodeURIComponent(P);
  const lijstKaal = await haal(lijstPad, S), lijstBr = await haal(lijstPad, { ...S, "accept-encoding": "br" });
  assert.ok(lijstKaal.body.length >= INPAK_VANAF, "de kaartenlijst is groot genoeg om in te pakken: " + lijstKaal.body.length);
  assert.equal(lijstBr.kop["content-encoding"], "br");
  assert.deepEqual(JSON.parse(uitgepakt(lijstBr).toString("utf8")).map((c) => c.naam).sort(), JSON.parse(lijstKaal.body.toString("utf8")).map((c) => c.naam).sort());
  const klein404 = await haal("/api/bestaat-niet", { "accept-encoding": "br" });
  assert.equal(klein404.status, 404);
  assert.equal(klein404.kop["content-encoding"], undefined, "een klein antwoord blijft onverpakt");
  assert.equal(JSON.parse(klein404.body.toString("utf8")).ok, false);
  const hoofd = await haal("/v2.css", { "accept-encoding": "br" }, "HEAD");
  assert.equal(hoofd.status, 200);
  assert.equal(hoofd.body.length, 0);

  // ---- browser: wat de app bij het openen werkelijk ophaalt ----
  let pw = null;
  try { pw = createRequire(import.meta.url)("playwright"); } catch { console.log("licht laden: geen Playwright, browsermeting overgeslagen (de rest draaide wel)"); }
  if (pw) {
    const browser = await pw.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "nl-NL", extraHTTPHeaders: { "x-forwarded-for": "10.9.91.1" } });
      await ctx.addInitScript(() => { try { localStorage.setItem("fysiplan_release_seen", "2026-11-02-kaarten"); } catch {} });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      const verzoeken = new Map();
      cdp.on("Network.requestWillBeSent", (e) => verzoeken.set(e.requestId, { url: e.request.url.replace(origin, ""), bytes: 0 }));
      cdp.on("Network.loadingFinished", (e) => { const v = verzoeken.get(e.requestId); if (v) v.bytes = e.encodedDataLength; });
      page.on("dialog", (d) => d.dismiss().catch(() => {}));
      await page.goto(origin + "/v2/app");
      await page.waitForSelector("#list .row img.thumb", { timeout: 20000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await wacht(1000);
      const alle = [...verzoeken.values()];
      const totaal = alle.reduce((a, v) => a + v.bytes, 0);
      const volle = alle.filter((v) => /^\/v2\/images\//.test(v.url));
      assert.deepEqual(volle.map((v) => v.url), [], "bij het openen haalt de lijst geen volledig beeld op");
      assert.ok(alle.some((v) => /^\/v2\/klein\/images\//.test(v.url)), "wel kleine beelden");
      assert.ok(totaal < 1.5 * 1048576, `de app opent met ${(totaal / 1048576).toFixed(2)} MB in ${alle.length} verzoeken (was 166 MB in 834)`);
      assert.ok(alle.length < 200, "niet alle beelden tegelijk: " + alle.length + " verzoeken");
      const lijst = await page.evaluate(() => [...document.querySelectorAll("#list .row img.thumb")].slice(0, 8).map((i) => ({ src: i.getAttribute("src"), lazy: i.loading, breed: i.naturalWidth, hoog: i.naturalHeight, klaar: i.complete })));
      for (const b of lijst) {
        assert.match(b.src, /^\/v2\/klein\/images\//, "lijstbeeld is de kleine versie");
        assert.equal(b.lazy, "lazy");
        assert.ok(b.klaar && b.breed > 0 && b.breed <= 160 && b.hoog <= 160, "zichtbaar en klein: " + JSON.stringify(b));
      }
      // op de A4 hoort het volledige beeld
      await page.evaluate(() => document.querySelector("#list [data-add]").click());
      await page.waitForSelector("#a4 img.thumb", { timeout: 8000 });
      await page.waitForFunction(() => { const i = document.querySelector("#a4 img.thumb"); return i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
      const a4 = await page.evaluate(() => { const i = document.querySelector("#a4 img.thumb"); return { src: i.getAttribute("src"), breed: i.naturalWidth, lazy: i.getAttribute("loading") }; });
      assert.doesNotMatch(a4.src, /klein/, "A4: het volledige beeld");
      assert.ok(a4.breed > 160, "A4: volle resolutie voor de afdruk: " + JSON.stringify(a4));
      assert.equal(a4.lazy, null);
      // sjabloonkiezer: ook daar de kleine beelden
      await page.evaluate(() => document.getElementById("sjabBtn").click());
      await page.waitForSelector("#ovSjab.on .sjb-rij img.thumb", { timeout: 8000 });
      const sj = await page.evaluate(() => [...document.querySelectorAll("#ovSjab img.thumb")].slice(0, 12).map((i) => i.getAttribute("src")));
      for (const s of sj) assert.match(s, /^\/v2\/klein\/images\/|^\/uploads\//, "sjabloonkiezer: " + s);
      console.log(`licht laden (browser): de app opent met ${(totaal / 1024).toFixed(0)} kB in ${alle.length} verzoeken`);
    } finally {
      await browser.close();
    }
  }
  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled|verzoek mislukt/, "geen serverfout in het log:\n" + uit.slice(-800));
  console.log(`licht laden: lijstbeelden ${(somKlein / 1048576).toFixed(1)} MB in plaats van ${(somGroot / 1048576).toFixed(0)} MB, tekst ingepakt, ETag op beelden: ok`);
} finally {
  if (teruggezet) await teruggezet().catch(() => {});
  app.kill();
  await new Promise((r) => (app.exitCode !== null || app.signalCode !== null) ? r() : app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
