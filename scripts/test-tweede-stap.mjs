// Platformreview 2026-11-11: "Iedereen die patiëntkaarten ziet, krijgt een eigen login met een
// tweede stap." Tot nu toe was een wachtwoord genoeg: wie het wachtwoord van een therapeut te
// weten kwam, zag alle patiëntkaarten van de praktijk.
//
// Nu kan een eigen login een tweede stap krijgen: een code uit een code-app (TOTP, RFC 6238).
// - De rekenkern (lib/totp.js) klopt met de testwaarden uit RFC 4226, RFC 6238 en RFC 4648.
// - De QR-code voor het instellen komt uit de eigen encoder (public/qr.js, ruime stand). De
//   vaste afdrukken hieronder zijn vooraf module voor module gelijk bevonden aan twee
//   referentie-encoders en met een QR-lezer teruggelezen; de kaart-QR is ongewijzigd.
// - Inloggen: na het wachtwoord de code. Een code werkt één keer, een foute code telt als
//   misser, en na te veel foute codes werkt alleen nog een reservecode.
// - Instellen, uitzetten en nieuwe reservecodes vragen het eigen wachtwoord opnieuw; het geheim
//   en de reservecodes verlaten de server alleen bij het instellen, naar de eigen browser.
// - De formulieren die met e-mail en wachtwoord werken (gegevens downloaden of wissen, overzicht
//   na de proef) vragen de code ook.
// - Telefoon kwijt: een beheerder met een eigen login wist de tweede stap van een collega; met
//   het gedeelde praktijkwachtwoord kan dat niet. Voor de enige beheerder kan Fysiplan-beheer een
//   herstelmail sturen die ook de tweede stap laat vervallen (alleen met tweedeStap: true).
// Nepmail-API op localhost; zonder browser, past in CI. `npm run test:tweedestap`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { base32, base32Naar, codeVoor, controleer, stapVan, otpauth, OTPAUTH_MAX, nieuwGeheim, nieuweReservecode, reservecodeNormaal, STAP_S } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (t) => createHash("sha256").update(t).digest("hex");

// ---- 1. de rekenkern ----
{
  // RFC 4648, hoofdstuk 10
  for (const [tekst, b32] of [["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]]) {
    assert.equal(base32(Buffer.from(tekst)), b32, "base32 van " + JSON.stringify(tekst));
    if (tekst) assert.equal(base32Naar(b32).toString(), tekst, "en terug");
  }
  assert.equal(base32Naar("mzxw 6ytb-oi==").toString(), "foobar", "kleine letters, spaties, streepjes en opvulling mogen");
  assert.equal(base32Naar("MZXW1"), null, "een teken buiten het alfabet geeft niets");
  assert.equal(base32Naar(""), null);

  // RFC 4226, bijlage D: tellers 0 tot en met 9 met de sleutel "12345678901234567890"
  const sleutel = Buffer.from("12345678901234567890");
  ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
    .forEach((code, teller) => assert.equal(codeVoor(sleutel, teller), code, "HOTP teller " + teller));
  // RFC 6238, bijlage B (SHA1): de laatste zes cijfers van de codes van acht cijfers
  for (const [seconden, code] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]]) {
    assert.equal(codeVoor(sleutel, stapVan(seconden * 1000)), code, "TOTP op tijdstip " + seconden);
    assert.equal(codeVoor(base32(sleutel), stapVan(seconden * 1000)), code, "ook met de sleutel als base32");
  }
  assert.equal(STAP_S, 30);
  assert.equal(codeVoor("", 1), null, "zonder sleutel geen code");
  assert.equal(codeVoor("niet-base32!", 1), null);

  // controleer: één stap terug en één vooruit tellen mee, verder niet; een code werkt één keer
  const g = nieuwGeheim();
  assert.match(g, /^[A-Z2-7]{32}$/, "een geheim van 160 bits");
  assert.notEqual(g, nieuwGeheim());
  const t = 1700000000000, s = stapVan(t);
  assert.equal(controleer(g, codeVoor(g, s), t), s, "de code van nu");
  assert.equal(controleer(g, codeVoor(g, s - 1), t), s - 1, "de vorige code (klok van de telefoon)");
  assert.equal(controleer(g, codeVoor(g, s + 1), t), s + 1, "de volgende code");
  const ver = [s - 2, s + 2].map((x) => codeVoor(g, x)).filter((c) => ![s - 1, s, s + 1].some((x) => codeVoor(g, x) === c));
  for (const c of ver) assert.equal(controleer(g, c, t), null, "twee stappen ernaast telt niet");
  assert.equal(controleer(g, codeVoor(g, s), t, s), null, "dezelfde code werkt geen tweede keer");
  assert.equal(controleer(g, codeVoor(g, s - 1), t, s), null, "en een oudere ook niet meer");
  assert.equal(controleer(g, codeVoor(g, s + 1), t, s), s + 1, "de volgende wel");
  const c0 = codeVoor(g, s);
  assert.equal(controleer(g, c0.slice(0, 3) + " " + c0.slice(3), t), s, "een spatie in het midden mag");
  for (const fout of ["", "12345", "1234567", "abcdef", null, undefined]) assert.equal(controleer(g, fout, t), null, "geen zes cijfers: " + fout);

  // reservecodes: vier blokken van vier; overtypen met kleine letters of zonder streepjes mag
  const rc = nieuweReservecode();
  assert.match(rc, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  assert.equal(reservecodeNormaal(rc.toLowerCase().replace(/-/g, " ")), rc.replace(/-/g, ""));
  assert.equal(reservecodeNormaal("123456"), "", "zes cijfers is geen reservecode");
  assert.equal(reservecodeNormaal(rc + "A"), "");

  // de link voor de code-app: kort genoeg voor de eigen QR-encoder, het adres erin waar het past
  const kort = otpauth(g, "eva@fysio.nl");
  assert.equal(kort, "otpauth://totp/Fysiplan:eva@fysio.nl?secret=" + g + "&issuer=Fysiplan");
  const midden = otpauth(g, "voornaam.achternaam@praktijknaam.nl");
  assert.equal(midden, "otpauth://totp/Fysiplan:voornaam.achternaam@praktijknaam.nl?secret=" + g, "past de uitgever er niet meer bij, dan blijft de naam vóór de dubbele punt");
  const lang = otpauth(g, "een.heel.lange.voornaam.en.achternaam@een-lange-praktijknaam.example");
  assert.equal(lang, "otpauth://totp/Fysiplan?secret=" + g + "&issuer=Fysiplan", "past het adres er niet bij, dan alleen Fysiplan");
  assert.match(otpauth(g, "a b+c@x.nl"), /Fysiplan:a%20b%2Bc@x\.nl\?/, "bijzondere tekens in het adres zijn gecodeerd");
  for (const link of [kort, midden, lang, otpauth(g, ""), otpauth(g, "x".repeat(200) + "@y.nl")]) {
    assert.ok(Buffer.byteLength(link) <= OTPAUTH_MAX, "de link past in de QR: " + Buffer.byteLength(link));
    assert.ok(link.includes("secret=" + g));
  }
}

// ---- 2. de QR-encoder: ruime stand erbij, kaart-QR ongewijzigd ----
{
  const sandbox = { window: {} };
  vm.runInNewContext(await readFile(join(root, "public/qr.js"), "utf8"), sandbox);
  const qr = sandbox.window.FYSIQR;
  const afdruk = (m) => m ? m.length + ":" + sha(m.map((r) => r.map((v) => (v ? "1" : "0")).join("")).join("\n")).slice(0, 16) : "leeg";
  // kaart-QR (niveau M): dezelfde afdrukken als vóór deze wijziging
  for (const [tekst, verwacht] of [["https://fysiplan.nl/k/0ad0ad0ad0b1", "29:15866aeeafaf1961"], ["https://fysiplan.nl/k/abc123", "29:f8df56a7d2a0925c"],
    ["fysiplan.nl/k/x", "25:f0d1b8d92d117f55"], ["a", "21:e8ab680854e4019c"]]) {
    assert.equal(afdruk(qr.matrix(tekst)), verwacht, "kaart-QR ongewijzigd voor " + tekst);
  }
  // ruime stand (niveau L, versie 1 tot en met 5): vaste afdrukken, vooraf gelijk bevonden aan referentie-encoders
  const G = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  for (const [tekst, verwacht] of [["otpauth://totp/Fysiplan:eva@fysio.nl?secret=" + G + "&issuer=Fysiplan", "37:f501a5cc2f407aee"],
    ["otpauth://totp/Fysiplan?secret=" + G + "&issuer=Fysiplan", "37:867aa5b967f89377"], ["x".repeat(106), "37:28571cbdad171764"],
    ["hallo wereld", "21:e009a7d2429f7c19"], ["x".repeat(40), "29:13f0634c3292a15d"], ["x".repeat(60), "33:c4497937b5332a6d"]]) {
    assert.equal(afdruk(qr.matrix(tekst, true)), verwacht, "ruime QR voor " + tekst.slice(0, 30));
  }
  assert.equal(qr.matrix("x".repeat(107), true), null, "107 bytes past niet meer");
  assert.equal(qr.svg("x".repeat(107), 200, true), "", "en geeft dan geen halve QR");
  const link = otpauth(G, "eva@fysio.nl");
  assert.equal(qr.matrix(link), null, "de instel-link past niet in de kaart-QR (daarom de ruime stand)");
  assert.match(qr.svg(link, 176, true), /^<svg [^>]*width="176"[\s\S]*<\/svg>$/, "de instel-link geeft een QR");
  // de formaatbits in de matrix zeggen welk niveau er staat: L voor de ruime stand, M voor de kaart
  const formaatWoord = (m) => {
    const b = [m[0][8], m[1][8], m[2][8], m[3][8], m[4][8], m[5][8], m[7][8], m[8][8], m[8][7], m[8][5], m[8][4], m[8][3], m[8][2], m[8][1], m[8][0]];
    let v = 0; b.forEach((x, k) => { if (x) v |= 1 << k; });
    return v ^ 0x5412;
  };
  const bchRest = (v) => { let r = v; for (let k = 14; k >= 10; k--) if ((r >> k) & 1) r ^= 0x537 << (k - 10); return r; };
  const wl = formaatWoord(qr.matrix(link, true)), wm = formaatWoord(qr.matrix("https://fysiplan.nl/k/abc123"));
  assert.equal((wl >> 13) & 3, 1, "ruime stand: foutcorrectie L");
  assert.equal((wm >> 13) & 3, 0, "kaart-QR: foutcorrectie M");
  assert.equal(bchRest(wl), 0, "de formaatbits zijn een geldig codewoord");
  assert.equal(bchRest(wm), 0);
}

// ---- 3. de app en de formulieren hebben de velden ----
{
  const idx = await readFile(join(root, "public/index.html"), "utf8");
  assert.match(idx, /id='ps_code'[^>]*autocomplete='one-time-code'/, "inlogformulier: een veld voor de code");
  assert.match(idx, /d\.tweedeStap&&act==='login'/, "de app toont het codeveld als de server erom vraagt");
  assert.match(idx, /teamPost\('tweede-stap\/start'/, "Team-venster: instellen");
  assert.match(idx, /FYSIQR\.svg\(r\.uri,176,true\)/, "de QR wordt in de browser getekend, in de ruime stand");
  for (const actie of ["tweede-stap-aan", "tweede-stap-uit", "tweede-stap-gewist", "tweede-stap-mislukt", "tweede-stap-op-slot", "ingelogd-met-reservecode", "reservecodes-vernieuwd"]) {
    assert.ok(idx.includes("'" + actie + "':"), "de Activiteit kent een leesbare regel voor " + actie);
  }
  const proef = await readFile(join(root, "public/proef.html"), "utf8");
  for (const actie of ["/v2/proef/overzicht", "/v2/gegevens/download", "/v2/gegevens/wissen"]) {
    assert.match(proef, new RegExp('action="' + actie + '"[\\s\\S]*?name="code"[\\s\\S]*?</form>'), "formulier " + actie + " heeft een veld voor de code");
  }
  const server = await readFile(join(root, "server.js"), "utf8");
  assert.doesNotMatch(server, /qrSvgVoor\([^)]*(geheim|otpauth|uri)/, "het geheim gaat nooit door de QR-cache van de server");
}

// ---- 4. de server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-tweedestap-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
// een verlopen proef op dit "apparaat" (cookie), voor het overzicht na de proef
const dag = 86400000, proefToken = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000007: { id: "oud0000000000007", email: "oud@stap.invalid", naam: "Oude Proef", tel: "+31612340000",
    praktijk: "Fysio Elders", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(proefToken)] }
}));
const proefCookie = { cookie: "fpproef=" + proefToken };

const mails = [];
const mailApi = createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => { try { mails.push(JSON.parse(b)); } catch {} res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}'); });
});
await new Promise((r) => mailApi.listen(0, "127.0.0.1", r));
const mailUrl = `http://127.0.0.1:${mailApi.address().port}`;

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const SLEUTEL = "beheer-" + randomBytes(12).toString("hex");
const A = { "x-admin-sleutel": SLEUTEL };
let origin = "", log = "";
async function start(env = {}) {
  const port = await vrijePoort();
  origin = `http://127.0.0.1:${port}`;
  const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "",
    PROEF_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", FYSIPLAN_CONTACT: "hulp@fysiplan.invalid",
    MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "Fysiplan <test@fysiplan.invalid>", MAIL_API_BASIS: mailUrl, ...env };
  for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS)/.test(k) || k === "NODE_ENV") delete kind[k];
  const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { log += c; });
  app.stderr.on("data", (c) => { log += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  return app;
}
async function stop(app) {
  app.kill();
  await new Promise((r) => app.once("exit", r));
}

let ip = 1;
const adres = () => "10.86." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
const accountsTekst = () => readFile(join(dataDir, "praktijk-accounts.json"), "utf8");
// het lid zoals het op schijf staat (voor de teller van foute codes)
const lidOpSchijf = async (email) => {
  for (const acc of Object.values(await accounts())) { const l = (acc.leden || []).find((x) => x.email === email); if (l) return l; }
  return null;
};
const team = async (S) => (await get("/api/praktijk/team", S)).json();
const login = (lijf) => post("/api/praktijk/login", lijf);
const P = "Fysio Stap";
const activiteit = async (S) => (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S)).json()).activiteit;
// een verse code voor dit geheim: nooit twee keer dezelfde tijdstap (een code werkt één keer).
// De server telt één stap vooruit mee, dus twee verse codes kort na elkaar kunnen allebei.
const laatst = new Map();
const versStap = (geheim) => Math.max(stapVan(Date.now()), (laatst.get(geheim) || 0) + 1);
function vers(geheim) {
  const s = versStap(geheim);
  laatst.set(geheim, s);
  return codeVoor(geheim, s);
}
// dezelfde code, maar zonder hem als gebruikt te tellen (voor een poging die de server weigert)
const versKijk = (geheim) => codeVoor(geheim, versStap(geheim));
// zes cijfers die nu zeker niet kloppen
function mis(geheim) {
  const nu = stapVan(Date.now());
  const goed = new Set([-2, -1, 0, 1, 2, 3].map((d) => codeVoor(geheim, nu + d)));
  for (let n = 0; ; n++) { const c = String(n).padStart(6, "0"); if (!goed.has(c)) return c; }
}
// de tweede stap instellen voor de login van sessie S; geeft het geheim, de reservecodes en de nieuwe sessie
async function stelIn(S, wachtwoord) {
  let r = await post("/api/praktijk/team/tweede-stap/start", { wachtwoord }, S);
  assert.equal(r.status, 200, await r.clone().text());
  const st = await r.json();
  r = await post("/api/praktijk/team/tweede-stap/bevestig", { code: vers(st.geheim) }, S);
  assert.equal(r.status, 200, await r.clone().text());
  const b = await r.json();
  return { geheim: st.geheim, uri: st.uri, reservecodes: b.reservecodes, S: ses(b), gedeeldAan: b.gedeeldAan };
}

let app = await start();
try {
  // een praktijk met het gedeelde wachtwoord, een beheerder (Eva) en een therapeut (Tom) met een eigen login
  let r = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(r.status, 200, await r.clone().text());
  const G = ses(await r.json());
  r = await post("/api/praktijk/team/eigen-login", { naam: "Eva Bos", email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", regels: true }, G);
  assert.equal(r.status, 200, await r.clone().text());
  const evaJson = await r.json();
  let E = ses(evaJson);
  const evaId = evaJson.ik.id;
  const u = await (await post("/api/praktijk/team/uitnodigen", { email: "tom@stap.invalid", naam: "Tom Smit", rol: "therapeut" }, E)).json();
  const tomId = u.lid.id;
  r = await formulier("/v2/uitnodiging", { t: new URL(u.link).searchParams.get("t"), naam: "Tom Smit", wachtwoord: "tom-wachtwoord", regels: "1" });
  assert.ok(r.status < 400, "Tom neemt de uitnodiging aan: " + r.status);
  r = await login({ email: "tom@stap.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 200);
  let T = ses(await r.json());

  // ---- 4a. instellen ----
  let t = await team(E);
  assert.equal(t.ik.tweedeStap, false, "nog geen tweede stap");
  assert.ok(t.leden.every((l) => l.tweedeStap === false));
  r = await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(P), E)).json();
  assert.equal(r.tweedeStap, false, "de app weet dat deze login nog geen tweede stap heeft");
  r = await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(P), G)).json();
  assert.equal(r.tweedeStap, undefined, "het praktijkwachtwoord is geen eigen login");

  r = await post("/api/praktijk/team/tweede-stap/start", { wachtwoord: "praktijk-wachtwoord" }, G);
  assert.equal(r.status, 400, "met het praktijkwachtwoord is er geen eigen login om te beveiligen");
  assert.equal((await r.json()).eigenLogin, true);
  assert.equal((await post("/api/praktijk/team/tweede-stap/start", { wachtwoord: "eva-wachtwoord" })).status, 401, "zonder sessie: 401");
  r = await post("/api/praktijk/team/tweede-stap/start", { wachtwoord: "fout-wachtwoord" }, E);
  assert.equal(r.status, 403, "instellen vraagt het eigen wachtwoord opnieuw");
  assert.equal((await post("/api/praktijk/team/tweede-stap/bevestig", { code: "123456" }, E)).status, 400, "bevestigen zonder te beginnen kan niet");

  r = await post("/api/praktijk/team/tweede-stap/start", { wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 200, await r.clone().text());
  assert.match(r.headers.get("cache-control") || "", /no-store/, "het antwoord met het geheim wordt nergens bewaard");
  const st = await r.json();
  assert.match(st.geheim, /^[A-Z2-7]{32}$/);
  assert.equal(st.uri, "otpauth://totp/Fysiplan:eva@stap.invalid?secret=" + st.geheim + "&issuer=Fysiplan");
  assert.doesNotMatch(await accountsTekst(), /totp/, "er staat nog niets op schijf tot de eerste code klopt");
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord" })).status, 200, "en inloggen gaat nog zonder code");

  r = await post("/api/praktijk/team/tweede-stap/bevestig", { code: mis(st.geheim) }, E);
  assert.equal(r.status, 400, "een foute code zet niets aan");
  assert.equal((await r.json()).code, true);
  assert.doesNotMatch(await accountsTekst(), /totp/);
  const eersteCode = vers(st.geheim);
  r = await post("/api/praktijk/team/tweede-stap/bevestig", { code: eersteCode }, E);
  assert.equal(r.status, 200, await r.clone().text());
  const bev = await r.json();
  assert.equal(bev.reservecodes.length, 8, "acht reservecodes, één keer getoond");
  assert.ok(bev.reservecodes.every((c) => /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/.test(c)));
  assert.equal(new Set(bev.reservecodes).size, 8);
  assert.equal(bev.gedeeldAan, true, "de app hoort dat het praktijkwachtwoord nog werkt");
  assert.equal((await get("/api/praktijk/team", E)).status, 401, "de oude sessie (zonder tweede stap gemaakt) is ingetrokken");
  E = ses(bev);
  let reserve = bev.reservecodes;

  // op schijf: het geheim, en van de reservecodes alleen de SHA-256
  let schijf = await accountsTekst();
  let eva = (await accounts())[P.toLowerCase()].leden.find((l) => l.id === evaId);
  assert.equal(eva.totp.geheim, st.geheim);
  assert.equal(eva.totp.reserve.length, 8);
  assert.ok(eva.totp.reserve.every((h) => /^[a-f0-9]{64}$/.test(h)));
  for (const c of reserve) { assert.ok(!schijf.includes(c) && !schijf.includes(c.replace(/-/g, "")), "geen leesbare reservecode op schijf"); assert.ok(eva.totp.reserve.includes(sha(c.replace(/-/g, "")))); }

  // de app ziet alleen dát het aan staat
  r = await get("/api/praktijk/team", E);
  const teamTekst = await r.text();
  t = JSON.parse(teamTekst);
  assert.equal(t.ik.tweedeStap, true);
  assert.equal(t.ik.reservecodesOver, 8);
  assert.ok(t.ik.tweedeStapSinds > Date.now() - 60000);
  assert.equal(t.leden.find((l) => l.id === evaId).tweedeStap, true);
  assert.equal(t.leden.find((l) => l.id === tomId).tweedeStap, false);
  assert.ok(!teamTekst.includes(st.geheim) && !/geheim|reserve"|[a-f0-9]{64}/.test(teamTekst), "geen geheim of reservecodes in het teamoverzicht");
  assert.equal((await (await get("/api/praktijk/status?praktijk=" + encodeURIComponent(P), E)).json()).tweedeStap, true);
  assert.equal((await post("/api/praktijk/team/tweede-stap/start", { wachtwoord: "eva-wachtwoord" }, E)).status, 409, "staat hij aan, dan begint instellen niet opnieuw");
  let act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-aan" && a.wie === "Eva Bos"), "aanzetten staat in de Activiteit, met naam");

  // ---- 4b. inloggen ----
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord" });
  assert.equal(r.status, 401, "wachtwoord alleen is niet meer genoeg (was 200)");
  let j = await r.json();
  assert.equal(j.tweedeStap, true, "de app hoort dat de code nog nodig is");
  assert.equal(j.sessie, undefined, "geen sessie zonder code");
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: mis(st.geheim) });
  assert.equal(r.status, 403, "een foute code komt er niet in");
  j = await r.json();
  assert.equal(j.tweedeStap, true);
  assert.equal(j.sessie, undefined);
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: eersteCode });
  assert.equal(r.status, 403, "de code van het instellen werkt geen tweede keer");
  r = await login({ email: "eva@stap.invalid", wachtwoord: "fout-wachtwoord", code: codeVoor(st.geheim, stapVan(Date.now()) + 1) });
  assert.equal(r.status, 403, "fout wachtwoord met een goede code: geweigerd");
  assert.equal((await r.json()).tweedeStap, undefined, "en het antwoord zegt niets over de code");
  const tweedeCode = vers(st.geheim);
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: tweedeCode.slice(0, 3) + " " + tweedeCode.slice(3) });
  assert.equal(r.status, 200, "wachtwoord en een verse code: ingelogd " + await r.clone().text());
  j = await r.json();
  assert.ok(j.sessie);
  assert.equal(j.reservecodesOver, undefined);
  assert.equal((await get("/api/praktijk/team", ses(j))).status, 200, "de nieuwe sessie werkt");
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: tweedeCode })).status, 403, "ook deze code werkt maar één keer");
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-mislukt" && a.wie === "Eva Bos"), "een foute code na een goed wachtwoord staat in de Activiteit");
  assert.ok(act.some((a) => a.actie === "ingelogd" && a.wie === "Eva Bos"));

  // reservecode: één keer, ook met kleine letters en zonder streepjes
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: reserve[0].toLowerCase().replace(/-/g, "") });
  assert.equal(r.status, 200, "inloggen met een reservecode");
  assert.equal((await r.json()).reservecodesOver, 7, "de app hoort hoeveel er nog zijn");
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: reserve[0] })).status, 403, "een reservecode werkt één keer");
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "ingelogd-met-reservecode" && a.wie === "Eva Bos"));
  assert.equal((await team(E)).ik.reservecodesOver, 7);

  // het gedeelde praktijkwachtwoord heeft geen tweede stap (daarom kan een praktijk het uitzetten)
  assert.equal((await login({ praktijk: P, wachtwoord: "praktijk-wachtwoord" })).status, 200, "het praktijkwachtwoord logt nog zonder code in");
  // Tom heeft geen tweede stap: voor hem verandert er niets, ook niet als de app een code meestuurt
  assert.equal((await login({ email: "tom@stap.invalid", wachtwoord: "tom-wachtwoord" })).status, 200);
  assert.equal((await login({ email: "tom@stap.invalid", wachtwoord: "tom-wachtwoord", code: "123456" })).status, 200);

  // ---- 4c. de formulieren met e-mail en wachtwoord ----
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord" });
  assert.equal(r.status, 403, "downloaden zonder code: geweigerd (was 200)");
  assert.match(await r.text(), /tweede stap/, "het formulier zegt wat er nog nodig is");
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: mis(st.geheim) });
  assert.equal(r.status, 403, "downloaden met een foute code: geweigerd");
  assert.doesNotMatch(await r.text(), /"kaarten"/);
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: reserve[1] });
  assert.equal(r.status, 200, "downloaden met wachtwoord en reservecode");
  assert.match(r.headers.get("content-disposition") || "", /attachment/);
  const pakketTekst = await r.text(), pakket = JSON.parse(pakketTekst);
  assert.deepEqual(pakket.team.find((l) => l.email === "eva@stap.invalid").tweedeStap.aan, true, "de download zegt dat de tweede stap aan staat");
  assert.equal(pakket.team.find((l) => l.email === "tom@stap.invalid").tweedeStap.aan, false);
  assert.ok(!pakketTekst.includes(st.geheim) && !/[a-f0-9]{64}/.test(JSON.stringify(pakket.team)), "maar het geheim en de reservecodes zitten er niet in");
  assert.equal((await formulier("/v2/gegevens/download", { praktijk: P, wachtwoord: "praktijk-wachtwoord" })).status, 200, "met het praktijkwachtwoord (zolang dat aan staat) verandert er niets");

  // wissen: eerst de bevestiging, zodat een vergeten "WISSEN" geen code kost
  r = await formulier("/v2/gegevens/wissen", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: reserve[2], zeker: "" });
  assert.equal(r.status, 400);
  assert.equal((await team(E)).ik.reservecodesOver, 6, "de reservecode is niet verbruikt");
  r = await formulier("/v2/gegevens/wissen", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", zeker: "WISSEN" });
  assert.equal(r.status, 403, "wissen zonder code: geweigerd (was: alles weg)");
  assert.ok((await accounts())[P.toLowerCase()], "de praktijk staat er nog");

  // overzicht na een verlopen proef
  r = await formulier("/v2/proef/overzicht", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord" }, proefCookie);
  assert.equal(r.status, 403, "overzicht zonder code: geweigerd (was 200)");
  assert.match(await r.text(), /tweede stap/);
  r = await formulier("/v2/proef/overzicht", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: reserve[2] }, proefCookie);
  assert.equal(r.status, 200, "overzicht met wachtwoord en reservecode");
  assert.match(await r.text(), /actieve kaart/);
  r = await formulier("/v2/proef/overzicht", { praktijk: P, email: "tom@stap.invalid", wachtwoord: "tom-wachtwoord" }, proefCookie);
  assert.equal(r.status, 200, "een login zonder tweede stap werkt zoals het was");
  assert.equal((await team(E)).ik.reservecodesOver, 5);

  // ---- 4d. een collega: zelf instellen, en wissen door een beheerder ----
  const tom = await stelIn(T, "tom-wachtwoord");
  T = tom.S;
  assert.equal((await login({ email: "tom@stap.invalid", wachtwoord: "tom-wachtwoord" })).status, 401, "ook een therapeut zet de tweede stap op de eigen login");
  r = await post("/api/praktijk/team/tweede-stap/wis", { id: evaId }, T);
  assert.equal(r.status, 403, "een therapeut wist niemands tweede stap");
  r = await post("/api/praktijk/team/tweede-stap/wis", { id: tomId }, G);
  assert.equal(r.status, 403, "met het gedeelde praktijkwachtwoord kan het ook niet");
  assert.equal((await r.json()).eigenLogin, true);
  assert.equal((await team(E)).leden.find((l) => l.id === tomId).tweedeStap, true, "Toms tweede stap staat er nog");
  assert.equal((await post("/api/praktijk/team/tweede-stap/wis", { id: evaId }, E)).status, 400, "de eigen tweede stap wis je niet zo: die zet je uit met wachtwoord en code");
  assert.equal((await post("/api/praktijk/team/tweede-stap/wis", { id: "bestaat-niet" }, E)).status, 404);
  r = await post("/api/praktijk/team/tweede-stap/wis", { id: tomId }, E);
  assert.equal(r.status, 200, "een beheerder met een eigen login wist de tweede stap van een collega");
  assert.equal((await r.json()).lid.tweedeStap, false);
  assert.equal((await get("/api/praktijk/team", T)).status, 401, "de collega is overal uitgelogd");
  r = await login({ email: "tom@stap.invalid", wachtwoord: "tom-wachtwoord" });
  assert.equal(r.status, 200, "en logt daarna in met alleen het wachtwoord");
  T = ses(await r.json());
  assert.equal((await post("/api/praktijk/team/tweede-stap/wis", { id: tomId }, E)).status, 400, "er is niets meer te wissen");
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-gewist" && /Eva Bos → Tom Smit/.test(a.wie || "")), "wissen staat in de Activiteit: wie bij wie");
  assert.ok(act.some((a) => a.actie === "team-wijziging-geweigerd" && /praktijkwachtwoord → Tom Smit \(tweede stap wissen\)/.test(a.wie || "")), "de geweigerde poging met het praktijkwachtwoord ook");

  // ---- 4e. nieuwe reservecodes, en uitzetten ----
  r = await post("/api/praktijk/team/tweede-stap/reservecodes", { wachtwoord: "fout-wachtwoord", code: reserve[3] }, E);
  assert.equal(r.status, 403, "nieuwe reservecodes vragen het wachtwoord");
  r = await post("/api/praktijk/team/tweede-stap/reservecodes", { wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 400, "en een code");
  r = await post("/api/praktijk/team/tweede-stap/reservecodes", { wachtwoord: "eva-wachtwoord", code: mis(st.geheim) }, E);
  assert.equal(r.status, 403);
  r = await post("/api/praktijk/team/tweede-stap/reservecodes", { wachtwoord: "eva-wachtwoord", code: reserve[3] }, E);
  assert.equal(r.status, 200, await r.clone().text());
  const nieuw = (await r.json()).reservecodes;
  assert.equal(nieuw.length, 8);
  assert.ok(nieuw.every((c) => !reserve.includes(c)));
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: reserve[4] })).status, 403, "de oude reservecodes werken niet meer");
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord", code: nieuw[0] })).status, 200, "de nieuwe wel");
  assert.equal((await get("/api/praktijk/team", E)).status, 200, "nieuwe reservecodes loggen niemand uit");

  r = await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "fout-wachtwoord", code: nieuw[1] }, E);
  assert.equal(r.status, 403, "uitzetten vraagt het wachtwoord");
  r = await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "eva-wachtwoord" }, E);
  assert.equal(r.status, 400, "en een code: een open laptop met het wachtwoord erbij zet hem niet uit");
  assert.equal((await team(E)).ik.tweedeStap, true);
  r = await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "eva-wachtwoord", code: nieuw[1] }, E);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await team(E)).ik.tweedeStap, false);
  assert.doesNotMatch(await accountsTekst(), /totp/, "geheim en reservecodes zijn van schijf");
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord" })).status, 200, "inloggen gaat weer met alleen het wachtwoord");
  assert.equal((await post("/api/praktijk/team/tweede-stap/uit", { wachtwoord: "eva-wachtwoord", code: nieuw[2] }, E)).status, 400, "uitzetten als hij uit staat: niets te doen");
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-uit" && a.wie === "Eva Bos"));
  assert.ok(act.some((a) => a.actie === "reservecodes-vernieuwd" && a.wie === "Eva Bos"));

  // ---- 4f. herstelmail van beheer: de tweede stap blijft, tenzij beheer er uitdrukkelijk om vraagt ----
  const REDEN = "Praktijk belde: telefoon en reservecodes kwijt";
  const herstelLink = () => { const m = mails.filter((x) => /Nieuw wachtwoord kiezen/.test(x.subject || "") && x.to[0] === "eva@stap.invalid").pop(); return { mail: m, t: (m.text.match(/\/v2\/uitnodiging\?t=([a-f0-9]{48})/) || [])[1] }; };
  let evaStap = await stelIn(E, "eva-wachtwoord");
  E = evaStap.S;
  r = await post("/api/beheer/praktijk-herstel", { praktijk: P, reden: REDEN }, A);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).tweedeStap, undefined);
  let h = herstelLink();
  assert.doesNotMatch(h.mail.text, /tweede stap/, "een gewone herstelmail zegt niets over de tweede stap");
  assert.doesNotMatch(await (await get("/v2/uitnodiging?t=" + h.t)).text(), /tweede stap/);
  r = await formulier("/v2/uitnodiging", { t: h.t, naam: "Eva Bos", wachtwoord: "eva-wachtwoord-twee", regels: "1" });
  assert.ok(r.status < 400);
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-twee" });
  assert.equal(r.status, 401, "na een gewone herstelmail staat de tweede stap er nog: de mailbox alleen is niet genoeg");
  assert.equal((await r.json()).tweedeStap, true);
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-twee", code: evaStap.reservecodes[0] });
  assert.equal(r.status, 200);
  E = ses(await r.json());

  r = await post("/api/beheer/praktijk-herstel", { praktijk: P, reden: REDEN, tweedeStap: true }, A);
  assert.equal(r.status, 200, await r.clone().text());
  j = await r.json();
  assert.equal(j.tweedeStap, true, "beheer hoort dat de link ook de tweede stap laat vervallen");
  assert.ok(!JSON.stringify(j).includes("uitnodiging?t="), "de link staat alleen in de mail");
  h = herstelLink();
  assert.match(h.mail.text, /vervalt ook de tweede stap van je login/, "de mail zegt dat de tweede stap vervalt");
  assert.match(h.mail.text, new RegExp(REDEN), "en waarom beheer hem stuurde");
  assert.equal((await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-twee" })).status, 401, "tot de link gebruikt is, verandert er niets");
  assert.match(await (await get("/v2/uitnodiging?t=" + h.t)).text(), /Ook de tweede stap van je login/, "de pagina zegt het ook");
  r = await formulier("/v2/uitnodiging", { t: h.t, naam: "Eva Bos", wachtwoord: "eva-wachtwoord-drie", regels: "1" });
  assert.ok(r.status < 400);
  assert.match(await r.text(), /Je tweede stap is vervallen/);
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie" });
  assert.equal(r.status, 200, "na de link met tweedeStap: true logt Eva in met alleen het nieuwe wachtwoord");
  E = ses(await r.json());
  assert.equal((await team(E)).ik.tweedeStap, false);
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-gewist" && /herstelmail van Fysiplan-beheer/.test(a.wie || "")), "ook dit wissen staat in de Activiteit");
  assert.ok(act.some((a) => a.actie === "herstel-door-beheer" && /de tweede stap vervalt bij gebruik van de link/.test(a.wie || "")), "met de reden en dat de tweede stap meeging");

  // ---- 4g. na een herstart staat de tweede stap er nog; te veel foute codes: alleen nog een reservecode ----
  evaStap = await stelIn(E, "eva-wachtwoord-drie");
  E = evaStap.S;
  await stop(app);
  app = await start({ TOTP_MIS_PER_DAG: "3" });
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie" });
  assert.equal(r.status, 401, "de tweede stap overleeft een herstart");
  const slotMails = () => mails.filter((x) => /te veel foute codes/.test(x.subject || ""));
  for (let i = 0; i < 2; i++) {
    r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: mis(evaStap.geheim) });
    assert.equal(r.status, 403, "foute code " + (i + 1));
  }
  assert.equal((await lidOpSchijf("eva@stap.invalid")).totp.mis.n, 2, "de teller van foute codes staat op schijf");
  assert.equal(slotMails().length, 0, "onder het maximum gaat er geen mail uit");
  // een herstart (een uitrol) geeft geen nieuwe pogingen: de derde foute code is de laatste
  await stop(app);
  app = await start({ TOTP_MIS_PER_DAG: "3" });
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: mis(evaStap.geheim) });
  assert.equal(r.status, 403, "foute code 3, na de herstart");
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: versKijk(evaStap.geheim) });
  assert.equal(r.status, 429, "na te veel foute codes komt ook een goede code er niet meer in");
  j = await r.json();
  assert.equal(j.tweedeStap, true);
  assert.match(j.fout, /reservecode/, "de melding wijst naar de reservecode");
  assert.match(j.fout, /nieuw wachtwoord/, "en zegt wat te doen als je het niet zelf was");
  assert.equal(j.sessie, undefined);
  r = await formulier("/v2/gegevens/download", { praktijk: P, email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: versKijk(evaStap.geheim) });
  assert.equal(r.status, 429, "ook op de formulieren");
  // wie het maximum haalt, kende het wachtwoord: de eigenaar van de login krijgt één mail en
  // de praktijk ziet het in de Activiteit
  for (let i = 0; i < 60 && slotMails().length < 1; i++) await wacht(50);
  assert.equal(slotMails().length, 1, "één mail bij het bereiken van het maximum");
  const sm = slotMails()[0];
  assert.deepEqual(sm.to, ["eva@stap.invalid"], "naar het adres van de login zelf");
  assert.match(sm.text, /Fysio Stap/);
  assert.match(sm.text, /kent iemand anders je wachtwoord/);
  assert.match(sm.text, /Log in met een reservecode en kies meteen een nieuw wachtwoord/);
  assert.ok(!sm.text.includes(evaStap.geheim) && !evaStap.reservecodes.some((c) => sm.text.includes(c)), "geen geheim en geen reservecode in de mail");
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: "AAAA-BBBB-CCCC-DDDD" });
  assert.equal(r.status, 403, "een verzonnen reservecode op slot: fout, en geen ingang");
  await wacht(300);
  assert.equal(slotMails().length, 1, "verdere foute pogingen geven geen tweede mail");
  act = await activiteit(E);
  assert.ok(act.some((a) => a.actie === "tweede-stap-op-slot" && a.wie === "Eva Bos"), "het slot staat in de Activiteit, met de login waar het om gaat");
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: evaStap.reservecodes[0] });
  assert.equal(r.status, 200, "een reservecode werkt dan nog wel");
  assert.equal((await r.json()).reservecodesOver, 7);
  assert.equal((await lidOpSchijf("eva@stap.invalid")).totp.mis, undefined, "na een geslaagde login begint de teller opnieuw");
  r = await login({ email: "eva@stap.invalid", wachtwoord: "eva-wachtwoord-drie", code: vers(evaStap.geheim) });
  assert.equal(r.status, 200, "en daarna telt de code-app weer: " + await r.clone().text());

  assert.doesNotMatch(log, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  assert.ok(!log.includes(st.geheim) && !log.includes(evaStap.geheim), "geen geheim in het serverlog");
  console.log("test-tweede-stap: ok (code-app na het wachtwoord, één keer per code, reservecodes, instellen en uitzetten met wachtwoord, wissen door een beheerder, formulieren, herstelmail, teller van foute codes op schijf met een mail bij het maximum)");
} catch (e) {
  console.error(log.slice(-2500));
  throw e;
} finally {
  try { await stop(app); } catch {}
  mailApi.close();
  await rm(dataDir, { recursive: true, force: true });
}
