// Vertalingen vooraf en nalezen (reviewlijst punt 10). `npm run test:vertalingen`
//
// - de rekenregels van lib/vertaling.js (sleutel, nagelezen blijft staan, plafond, bladzijde)
// - een lezer (beheeraccount met alleen het recht "vertalen") komt bij de vertalingen en nergens anders;
//   een account met alleen finance komt er niet bij
// - de bibliotheek vooraf vertalen: alleen wat ontbreekt, in rondes, één ronde tegelijk, te stoppen;
//   een nagelezen tekst wordt nooit overschreven
// - de kaart krijgt een lange uitleg nu wel vertaald (eerst bleef hij Nederlands) en hoort welke
//   teksten zijn nagelezen; de kaart zegt "automatisch vertaald" alleen bij de rest, en toont de
//   Nederlandse tekst bij elke vertaalde uitleg
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TALEN, bron, sleutelVan, lees, zetAuto, zetNagelezen, trekIn, begrens, bibliotheekTeksten, stand, bladzijde, vertaalOpdracht, BRON_MAX } from "../lib/vertaling.js";
import { magBuiten, rechtenVan, RECHTEN } from "../lib/beheer-toegang.js";
import { codeVoor, stapVan } from "../lib/totp.js";

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const DAG = 86400e3;

// ---------- de rekenregels ----------
{
  const lang = "a".repeat(350) + " einde";
  assert.equal(bron(lang), lang, "een uitleg van ruim 300 tekens blijft heel");
  assert.equal(bron("x".repeat(BRON_MAX + 50)).length, BRON_MAX);
  assert.notEqual(sleutelVan(lang), sleutelVan(lang.slice(0, 300)), "de sleutel hoort bij de hele tekst");
  assert.equal(sleutelVan("Squat"), sleutelVan("Squat"));

  const c = {};
  assert.equal(lees(c, "Squat"), null);
  assert.equal(zetAuto(c, "Squat", "  [en] Squat "), true);
  assert.deepEqual(lees(c, "Squat"), { t: "[en] Squat", nagelezen: false });
  assert.equal(typeof c[sleutelVan("Squat")], "string", "een automatische vertaling blijft een tekst, zoals het was");
  assert.equal(zetAuto(c, "Squat", ""), false, "een lege vertaling telt niet");
  assert.equal(zetNagelezen(c, "Squat", "Squat (checked)", "lies@x", 1000), true);
  assert.deepEqual(lees(c, "Squat"), { t: "Squat (checked)", nagelezen: true, wie: "lies@x", op: 1000 });
  assert.equal(zetAuto(c, "Squat", "overschreven?"), false, "een nagelezen tekst blijft staan");
  assert.equal(lees(c, "Squat").t, "Squat (checked)");
  assert.equal(trekIn(c, "Squat"), true);
  assert.deepEqual(lees(c, "Squat"), { t: "Squat (checked)", nagelezen: false }, "intrekken houdt de tekst, nu als niet nagelezen");
  assert.equal(trekIn(c, "Squat"), false);
  assert.equal(zetNagelezen(c, "Lunge", "   ", "lies@x"), false, "nalezen met een lege tekst kan niet");

  // plafond: de oudste automatische gaan eruit, nagelezen nooit
  const p = {};
  zetNagelezen(p, "oud nagelezen", "x", "l");
  for (let i = 0; i < 6; i++) zetAuto(p, "t" + i, "v" + i);
  assert.equal(begrens(p, 4), 3);
  assert.ok(lees(p, "oud nagelezen"), "nagelezen blijft");
  assert.deepEqual(["t0", "t1", "t2", "t3", "t4", "t5"].map((t) => !!lees(p, t)), [false, false, false, true, true, true]);

  // bibliotheek: naam en uitleg, elke tekst één keer
  const m = [{ naam: "A", uitleg: "Doe A." }, { naam: "B", uitleg: "Doe A." }, { naam: "A", uitleg: "" }, null, { naam: "", uitleg: "Doe C." }];
  const t = bibliotheekTeksten(m);
  assert.deepEqual(t.map((x) => [x.soort, x.oef, x.nl]), [["naam", "A", "A"], ["uitleg", "A", "Doe A."], ["naam", "B", "B"], ["uitleg", "", "Doe C."]]);
  const c2 = {};
  zetAuto(c2, "A", "[en] A"); zetNagelezen(c2, "Doe A.", "Do A.", "l");
  assert.deepEqual(stand(c2, t), { totaal: 4, vertaald: 2, nagelezen: 1 });
  assert.deepEqual(bladzijde(c2, t, { filter: "open" }).rijen.map((r) => r.nl), ["A"]);
  assert.deepEqual(bladzijde(c2, t, { filter: "ontbreekt" }).rijen.map((r) => r.nl), ["B", "Doe C."]);
  assert.deepEqual(bladzijde(c2, t, { filter: "nagelezen" }).rijen.map((r) => [r.nl, r.vertaling, r.wie]), [["Doe A.", "Do A.", "l"]]);
  assert.deepEqual(bladzijde(c2, t, { filter: "alles", zoek: "do a" }).rijen.map((r) => r.nl), ["Doe A."]);
  assert.deepEqual(bladzijde(c2, t, { filter: "alles", van: 1, aantal: 2 }), { totaal: 4, van: 1, rijen: bladzijde(c2, t, { filter: "alles" }).rijen.slice(1, 3) });

  // de opdracht noemt de taal en links/rechts
  assert.match(vertaalOpdracht("de"), /^Je vertaalt .* naar het Duits\. .*links en rechts/s);
  assert.equal(Object.keys(TALEN).length, 8);

  // rechten: een lezer komt alleen bij de vertalingen (en de omgeving, zoals elk beperkt account)
  assert.ok(RECHTEN.vertalen && RECHTEN.vertalen.titel);
  const lezer = { rechten: ["vertalen"] }, finance = { rechten: ["finance"] };
  assert.deepEqual([...rechtenVan(lezer)], ["vertalen"]);
  assert.equal(magBuiten(lezer, "/api/beheer/vertalingen"), true);
  assert.equal(magBuiten(lezer, "/api/beheer/vertalingen/lijst?taal=en"), true);
  assert.equal(magBuiten(lezer, "/api/beheer/vertalingenx"), false);
  assert.equal(magBuiten(lezer, "/api/beheer/accounts"), false);
  assert.equal(magBuiten(finance, "/api/beheer/vertalingen"), false);
  assert.equal(magBuiten({ email: "alles" }, "/api/beheer/vertalingen"), true);
}

// ---------- een echte server ----------
const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vertalingen-"));
const lib = JSON.parse(await readFile(join(root, "public", "oefeningen-v2.json"), "utf8"));
const LANG = lib.find((e) => e.uitleg && e.uitleg.length > 320 && e.uitleg.length < 900);
const KORT = lib.find((e) => e.uitleg && e.uitleg.length < 200 && e !== LANG);
assert.ok(LANG && KORT, "de bibliotheek heeft een lange en een korte uitleg");

// nagebootste AI-dienst: vertaalt met een voorvoegsel; kan traag zijn of falen
const aiAanvragen = [];
let aiTraag = 0, aiFaalt = false;
const ai = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const b = JSON.parse(body || "{}");
  aiAanvragen.push(b);
  if (aiTraag) await wacht(aiTraag);
  if (aiFaalt) { response.writeHead(500, { "content-type": "application/json" }); response.end("{}"); return; }
  const taal = (String(b.system).match(/naar het (\S+)\./) || [])[1] || "?";
  const tekst = JSON.stringify(JSON.parse(b.messages[0].content).map((t) => "[" + taal + "] " + t));
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ content: [{ type: "text", text: tekst }] }));
});
await new Promise((r) => ai.listen(0, "127.0.0.1", r));

const KAART = "abcdefabcdef";
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio test": { k1: { id: KAART, praktijk: "Fysio Test", naam: "Test", ts: Date.now() - DAG, rows: {}, cells: {}, vids: {},
    chosen: [{ n: LANG.naam, id: "", i: 0 }, { n: KORT.naam, id: "", i: 1 }], client: { c_naam: "Test", c_doel: "GEHEIM-DOEL-traplopen" } } }
}));
const hashVan = (ww) => { const zout = randomBytes(16); return "scrypt$" + zout.toString("hex") + "$" + scryptSync(ww, zout, 32).toString("hex"); };
const WW = { vera: "vera-" + randomBytes(6).toString("hex"), lies: "lies-" + randomBytes(6).toString("hex"), finn: "finn-" + randomBytes(6).toString("hex") };
const GEHEIM = { vera: "JBSWY3DPEHPK3PXP", lies: "KRSXG5CTMVRXEZLU", finn: "GEZDGNBVGY3TQOJQ" };
const beheerder = (wie, extra = {}) => ({ email: wie + "@beheer.example", naam: wie, hash: hashVan(WW[wie]), gemaakt: new Date(Date.now() - 5 * DAG).toISOString(), door: "test",
  totp: { geheim: GEHEIM[wie], sinds: Date.now() - 5 * DAG, stap: 0, reserve: [] }, ...extra });
await writeFile(join(dataDir, "beheer-accounts.json"), JSON.stringify({
  "vera@beheer.example": beheerder("vera"), "lies@beheer.example": beheerder("lies", { rechten: ["vertalen"] }), "finn@beheer.example": beheerder("finn", { rechten: ["finance"] })
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.address().port}`,
  PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_MELDING_AAN: "", ACCOUNT_BEHEER_EMAILS: "", VRAAGHULP: "" };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_|ADMIN_|MAIL_)/.test(k) || k === "NODE_ENV") delete env[k];
let uit = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let browser = null;

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  let ip = 1;
  const xff = () => "10.91.0." + (ip++ & 255);
  async function login(wie) {
    const r = await fetch(origin + "/api/beheer/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff() },
      body: JSON.stringify({ email: wie + "@beheer.example", wachtwoord: WW[wie], code: codeVoor(GEHEIM[wie], stapVan(Date.now())) }) });
    assert.equal(r.status, 200, "inloggen als " + wie + ": " + (await r.clone().text()));
    return (r.headers.get("set-cookie") || "").split(";")[0];
  }
  const cookie = { vera: await login("vera"), lies: await login("lies"), finn: await login("finn") };
  const kop = (wie) => ({ "content-type": "application/json", "x-forwarded-for": xff(), "x-admin-sleutel": "account", cookie: cookie[wie], origin });
  const get = async (wie, pad) => { const r = await fetch(origin + pad, { headers: kop(wie) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const post = async (wie, pad, body) => { const r = await fetch(origin + pad, { method: "POST", headers: kop(wie), body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const kaartVertaal = async (taal) => (await fetch(origin + "/api/kaart/vertaal?id=" + KAART + "&taal=" + taal, { headers: { "x-forwarded-for": xff() } })).json();
  const ronde = async (wie = "lies") => {
    for (let i = 0; i < 600; i++) { const o = (await get(wie, "/api/beheer/vertalingen")).body; if (!o.ronde || o.ronde.klaar) return o; await wacht(50); }
    throw new Error("de ronde werd niet klaar");
  };

  // 1) de kaart: ook de lange uitleg komt vertaald terug (eerst bleef die Nederlands)
  let k = await kaartVertaal("en");
  assert.equal(k.ok, true);
  assert.equal(k.teksten[LANG.uitleg], "[Engels] " + LANG.uitleg, "lange uitleg heel vertaald, onder de hele tekst als sleutel");
  assert.equal(k.teksten[KORT.uitleg], "[Engels] " + KORT.uitleg);
  assert.deepEqual(k.nagelezen, []);
  assert.doesNotMatch(JSON.stringify(aiAanvragen), /GEHEIM-DOEL/, "vrije tekst van de therapeut gaat niet naar de AI-dienst");
  const naKaart = aiAanvragen.length;
  k = await kaartVertaal("en");
  assert.equal(aiAanvragen.length, naKaart, "de tweede keer uit de cache");

  // 2) wie mag erbij
  assert.equal((await get("finn", "/api/beheer/vertalingen")).status, 403, "alleen finance: niet bij de vertalingen");
  assert.equal((await fetch(origin + "/api/beheer/vertalingen", { headers: { "x-forwarded-for": xff() } })).status, 403, "zonder login niet");
  assert.notEqual((await get("lies", "/api/beheer/accounts")).status, 200, "een lezer komt niet bij de accounts");
  let o = (await get("lies", "/api/beheer/vertalingen")).body;
  assert.equal(o.ok, true);
  assert.equal(o.ai, true);
  assert.deepEqual(o.talen.map((t) => t.code), Object.keys(TALEN));
  const en = o.talen.find((t) => t.code === "en");
  assert.ok(en.totaal > 800, "de hele bibliotheek telt: " + en.totaal);
  assert.ok(en.vertaald >= 2 && en.vertaald <= 4, "alleen de teksten van de kaart zijn al vertaald: " + en.vertaald);
  assert.equal(en.nagelezen, 0);
  const pagina = await fetch(origin + "/dashboard88/vertalingen");
  assert.equal(pagina.status, 200);
  assert.match(await pagina.text(), /vertalingen-beheer\.js/);
  assert.match(pagina.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal((await fetch(origin + "/vertalingen-beheer.js")).status, 200);

  // 3) vooraf vertalen: alleen wat ontbreekt, in rondes van hooguit 20
  const voor = aiAanvragen.length;
  let r = await post("lies", "/api/beheer/vertalingen/vooraf", { taal: "en" });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  o = await ronde();
  assert.equal(o.ronde.fout, "");
  assert.equal(o.ronde.gedaan, en.totaal - en.vertaald, "alleen de ontbrekende teksten");
  const enNa = o.talen.find((t) => t.code === "en");
  assert.equal(enNa.vertaald, enNa.totaal);
  const nieuw = aiAanvragen.slice(voor);
  assert.equal(nieuw.length, Math.ceil((en.totaal - en.vertaald) / 20));
  assert.ok(nieuw.every((b) => JSON.parse(b.messages[0].content).length <= 20 && /naar het Engels\./.test(b.system)));
  assert.ok(!nieuw.some((b) => JSON.parse(b.messages[0].content).includes(LANG.uitleg)), "wat al vertaald was, gaat niet opnieuw");
  assert.doesNotMatch(JSON.stringify(nieuw), /GEHEIM-DOEL/);
  assert.equal(Object.keys(JSON.parse(await readFile(join(dataDir, "vertalingen.json"), "utf8")).en).length, enNa.totaal, "alles staat op schijf");
  // een andere website kan geen ronde starten
  const kruis = await fetch(origin + "/api/beheer/vertalingen/vooraf", { method: "POST", headers: { ...kop("lies"), origin: "https://kwaad.example", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ taal: "pl" }) });
  assert.equal(kruis.status, 403, "kruissite geweigerd");

  // 4) nalezen: de lezer verbetert de lange uitleg
  r = await get("lies", "/api/beheer/vertalingen/lijst?taal=en&filter=open&zoek=" + encodeURIComponent(LANG.uitleg.slice(0, 40)));
  assert.equal(r.status, 200);
  const rij = r.body.rijen.find((x) => x.nl === LANG.uitleg);
  assert.ok(rij, "de lange uitleg staat in de lijst");
  assert.equal(rij.vertaling, "[Engels] " + LANG.uitleg);
  assert.equal((await post("lies", "/api/beheer/vertalingen/nagelezen", { taal: "xx", sleutel: rij.sleutel, vertaling: "x" })).status, 400);
  assert.equal((await post("lies", "/api/beheer/vertalingen/nagelezen", { taal: "en", sleutel: "0000000000000000", vertaling: "x" })).status, 404);
  assert.equal((await post("lies", "/api/beheer/vertalingen/nagelezen", { taal: "en", sleutel: rij.sleutel, vertaling: "  " })).status, 400);
  assert.equal((await post("finn", "/api/beheer/vertalingen/nagelezen", { taal: "en", sleutel: rij.sleutel, vertaling: "x" })).status, 403);
  r = await post("lies", "/api/beheer/vertalingen/nagelezen", { taal: "en", sleutel: rij.sleutel, vertaling: "Checked: do it slowly, left leg first." });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.rij.nagelezen, r.body.rij.wie, r.body.rij.vertaling], [true, "lies@beheer.example", "Checked: do it slowly, left leg first."]);
  k = await kaartVertaal("en");
  assert.equal(k.teksten[LANG.uitleg], "Checked: do it slowly, left leg first.");
  assert.deepEqual(k.nagelezen, [LANG.uitleg], "de kaart hoort welke tekst is nagelezen");
  const opgeslagen = JSON.parse(await readFile(join(dataDir, "vertalingen.json"), "utf8"));
  assert.deepEqual({ ...opgeslagen.en[sleutelVan(LANG.uitleg)], op: 0 }, { t: "Checked: do it slowly, left leg first.", door: "lezer", wie: "lies@beheer.example", op: 0 });
  assert.equal(typeof opgeslagen.en[sleutelVan(KORT.uitleg)], "string", "de rest blijft een gewone tekst");
  const log = await readFile(join(dataDir, "beheer-log.jsonl"), "utf8");
  assert.match(log, /lies@beheer\.example.*vertalingen\/nagelezen.*en:/, "elk nalezen staat in het beheerlogboek");
  o = (await get("lies", "/api/beheer/vertalingen")).body;
  assert.equal(o.talen.find((t) => t.code === "en").nagelezen, 1);
  assert.equal((await get("lies", "/api/beheer/vertalingen/lijst?taal=en&filter=nagelezen")).body.totaal, 1);

  // 5) opnieuw vooraf vertalen laat de nagelezen tekst staan (en er ontbreekt niets meer)
  const voor2 = aiAanvragen.length;
  assert.equal((await post("lies", "/api/beheer/vertalingen/vooraf", { taal: "en" })).status, 202);
  o = await ronde();
  assert.equal(aiAanvragen.length, voor2, "niets te doen: geen aanvraag");
  assert.equal((await kaartVertaal("en")).teksten[LANG.uitleg], "Checked: do it slowly, left leg first.");

  // 6) een ronde tegelijk, en stoppen
  aiTraag = 40;
  assert.equal((await post("vera", "/api/beheer/vertalingen/vooraf", { taal: "alle" })).status, 202, "volledig beheer mag het ook");
  assert.equal((await post("lies", "/api/beheer/vertalingen/vooraf", { taal: "de" })).status, 409, "er loopt al een ronde");
  await wacht(150);
  assert.equal((await post("lies", "/api/beheer/vertalingen/stop", {})).status, 200);
  o = await ronde();
  aiTraag = 0;
  assert.equal(o.ronde.fout, "Gestopt.");
  assert.ok(o.ronde.gedaan > 0 && o.ronde.gedaan < o.ronde.totaal, "een deel was al gedaan: " + o.ronde.gedaan + "/" + o.ronde.totaal);
  assert.equal(o.talen.find((t) => t.code === "de").vertaald, o.ronde.gedaan, "wat klaar was, is bewaard (Duits stond nog op nul)");

  // 7) de AI-dienst faalt: na drie mislukte rondes stopt het vanzelf, er gaat niets kapot
  aiFaalt = true;
  assert.equal((await post("lies", "/api/beheer/vertalingen/vooraf", { taal: "fr" })).status, 202);
  o = await ronde();
  aiFaalt = false;
  assert.match(o.ronde.fout, /Drie rondes/);
  assert.equal(o.ronde.mislukt, 60);
  assert.equal(o.talen.find((t) => t.code === "fr").vertaald, 0);

  // 8) intrekken: de tekst blijft, maar telt weer als niet nagelezen
  r = await post("lies", "/api/beheer/vertalingen/intrekken", { taal: "en", sleutel: rij.sleutel });
  assert.equal(r.status, 200);
  assert.equal(r.body.rij.nagelezen, false);
  k = await kaartVertaal("en");
  assert.deepEqual([k.teksten[LANG.uitleg], k.nagelezen], ["Checked: do it slowly, left leg first.", []]);

  // 9) de kaart in de browser: "automatisch vertaald" alleen bij een niet nagelezen tekst, het Nederlands erbij
  const require = createRequire(import.meta.url);
  try { browser = await require("playwright").chromium.launch(); } catch { browser = null; }
  if (!browser) console.log("test-vertalingen: geen Chromium, kaartdeel overgeslagen");
  else {
    assert.equal((await post("lies", "/api/beheer/vertalingen/nagelezen", { taal: "en", sleutel: rij.sleutel, vertaling: "Checked: do it slowly, left leg first." })).status, 200);
    const ctx = await browser.newContext({ locale: "en-GB", extraHTTPHeaders: { "x-forwarded-for": "10.91.9.9" } });
    const page = await ctx.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(String(e)));
    await page.goto(origin + "/k/" + KAART + "?taal=en");
    await page.waitForSelector(".oef .naam");
    await page.waitForFunction(() => document.querySelectorAll(".oefuitleg").length >= 2);
    const blokken = await page.evaluate(() => [...document.querySelectorAll(".oefuitleg")].map((b) => ({
      tekst: [...b.querySelectorAll(":scope > p")].map((p) => p.textContent).join(" "),
      auto: !!b.querySelector(".autovertaald"),
      nl: (b.querySelector("details.nlorigineel p") || {}).textContent || "",
      knop: (b.querySelector("details.nlorigineel summary") || {}).textContent || ""
    })));
    const lang = blokken.find((b) => /Checked: do it slowly/.test(b.tekst));
    const kort = blokken.find((b) => b.tekst.includes("[Engels]"));
    assert.ok(lang && kort, JSON.stringify(blokken));
    assert.equal(lang.auto, false, "nagelezen: geen melding 'automatisch vertaald'");
    assert.equal(lang.nl, LANG.uitleg, "het Nederlands staat erbij");
    assert.equal(kort.auto, true, "niet nagelezen: wel de melding");
    assert.equal(kort.nl, KORT.uitleg);
    assert.equal(kort.knop, "Show the original Dutch text");
    assert.deepEqual(fouten, []);
    await ctx.close();
  }
  console.log("test-vertalingen: ok (rekenregels, lezer alleen bij de vertalingen, vooraf alleen wat ontbreekt, één ronde tegelijk en stoppen, nagelezen blijft staan, lange uitleg vertaald, kaart met melding en Nederlands)");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  if (browser) await browser.close().catch(() => {});
  app.kill();
  ai.close();
  await new Promise((r) => app.once("exit", r)).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
