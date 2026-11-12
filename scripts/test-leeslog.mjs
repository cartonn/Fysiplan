// Het leeslog per kaart (lib/leeslog.js): wie welke kaart zag of bewaarde.
//
// 1. de regels zelf
// 2. de echte server: wat er in het leeslog komt, wie het mag zien, wat er weer uit verdwijnt
// Zonder browser, past in CI. `npm run test:leeslog`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SOORTEN, SAMEN_MS, BEWAAR_DAGEN, MAX_PER_KAART, MAX_PER_PRAKTIJK, merk, vanKaart, vanPraktijk, snoei, wisKaart, wisPraktijk } from "../lib/leeslog.js";

// ---- 1. de regels ----
{
  const log = {}, t0 = 1_000_000_000_000, min = 60000;
  const sanne = { wie: "Sanne", lid: "l1" }, joris = { wie: "Joris", lid: "l2" };
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", ...sanne }, t0), "nieuw");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", ...sanne }, t0 + 5 * min), "verschoven", "dezelfde persoon, kaart en soort binnen een kwartier: één regel");
  assert.deepEqual(log.pk, [{ t: t0, tot: t0 + 5 * min, n: 2, k: "k1", s: "geopend", wie: "Sanne", lid: "l1" }]);
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", ...sanne }, t0 + 5 * min + SAMEN_MS), "verschoven", "het kwartier telt vanaf de laatste keer");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", ...sanne }, t0 + 5 * min + 2 * SAMEN_MS + 1), "nieuw", "na een kwartier stilte een nieuwe regel");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", ...joris }, t0 + 60 * min), "nieuw", "een ander is een eigen regel");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "bewaard", ...joris }, t0 + 60 * min), "nieuw", "een andere soort ook");
  assert.equal(merk(log, "pk", { kaart: "k2", soort: "geopend", ...joris }, t0 + 60 * min), "nieuw", "een andere kaart ook");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", wie: "Joris" }, t0 + 60 * min), "nieuw", "dezelfde naam zonder login-id is iemand anders");
  assert.equal(merk(log, "pk", { soort: "overzicht", ...sanne }, t0 + 61 * min), "nieuw");
  assert.equal(log.pk[0].k, "", "zonder kaart: een regel over alle kaarten");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", ...joris }, t0 + 62 * min), "verschoven");
  assert.deepEqual([log.pk[0].wie, log.pk[0].s, log.pk[0].n], ["Joris", "geopend", 2], "een opgeschoven regel staat weer vooraan");
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "gegluurd", ...sanne }, t0), false, "een onbekende soort komt er niet in");
  assert.equal(merk(log, "", { kaart: "k1", soort: "geopend", ...sanne }, t0), false);
  assert.equal(merk(log, "pk", { kaart: "k1", soort: "geopend", wie: "  Naam\nmet regel  " }, t0 + 63 * min), "nieuw");
  assert.equal(log.pk[0].wie, "Naam met regel", "geen regeleinden in een naam");
  merk(log, "pk", { kaart: "k3", soort: "geopend" }, t0 + 64 * min);
  assert.equal(log.pk[0].wie, "onbekend");
  assert.ok(!("lid" in log.pk[0]));
  assert.equal(merk(log, "__proto__", { kaart: "k1", soort: "geopend", ...sanne }, t0), false, "een sleutel die het object zelf zou veranderen, komt er niet in");
  assert.equal(Object.getPrototypeOf(log), Object.prototype);

  // lezen
  const k1 = vanKaart(log, "pk", "k1");
  assert.ok(k1.every((r) => r.k === "k1" || r.k === ""), "alleen de eigen regels en de regels over alle kaarten");
  assert.deepEqual(k1.filter((r) => !r.kaart).map((r) => r.wat), ["overzicht van alle kaarten bekeken"]);
  assert.equal(k1.find((r) => r.s === "bewaard").wat, SOORTEN.bewaard);
  assert.deepEqual(vanKaart(log, "andere", "k1"), []);
  assert.equal(vanPraktijk(log, "pk").length, log.pk.length);
  assert.deepEqual(vanPraktijk(log, "weg"), []);

  // opruimen
  const kopie = () => JSON.parse(JSON.stringify(log));
  let l = kopie();
  assert.equal(wisKaart(l, "pk", "k1"), log.pk.filter((r) => r.k === "k1").length);
  assert.ok(!l.pk.some((r) => r.k === "k1") && l.pk.some((r) => r.k === "k2") && l.pk.some((r) => r.k === ""), "alleen de regels van die kaart");
  assert.equal(wisKaart(l, "pk", ""), 0, "zonder kaart-id gaat er niets weg");
  assert.equal(wisKaart(l, "andere", "k1"), 0);
  l = kopie();
  const nu = t0 + 2 * 3600000;
  assert.equal(snoei(l, () => new Set(["k1", "k2", "k3"]), nu), 0, "alles bestaat nog en is jong");
  assert.equal(snoei(l, () => new Set(["k2"]), nu), log.pk.filter((r) => r.k === "k1" || r.k === "k3").length, "regels van een kaart die weg is, gaan weg");
  assert.ok(l.pk.some((r) => r.k === ""), "regels over alle kaarten blijven");
  l = kopie();
  snoei(l, () => new Set(["k1", "k2", "k3"]), t0 + 30 * min + BEWAAR_DAGEN * 86400000);
  assert.ok(l.pk.length > 0 && l.pk.every((r) => r.tot >= t0 + 30 * min), "ouder dan de bewaartijd gaat weg, de rest blijft");
  l = kopie();
  snoei(l, () => null, nu);
  assert.deepEqual(l, {}, "een praktijk die weg is, heeft geen leeslog meer");
  l = kopie();
  assert.equal(wisPraktijk(l, "pk"), true); assert.deepEqual(l, {}); assert.equal(wisPraktijk(l, "pk"), false);

  // plafonds
  const vol = {};
  for (let i = 0; i < MAX_PER_KAART + 5; i++) merk(vol, "pk", { kaart: "k1", soort: "geopend", wie: "W" }, t0 + i * (SAMEN_MS + 1));
  merk(vol, "pk", { kaart: "k2", soort: "geopend", wie: "W" }, t0);
  assert.equal(vol.pk.filter((r) => r.k === "k1").length, MAX_PER_KAART, "per kaart een plafond");
  assert.equal(Math.min(...vol.pk.filter((r) => r.k === "k1").map((r) => r.t)), t0 + 5 * (SAMEN_MS + 1), "de oudste regels gaan eruit");
  assert.ok(vol.pk.some((r) => r.k === "k2"), "een andere kaart blijft");
  const groot = {};
  for (let i = 0; i < MAX_PER_PRAKTIJK + 3; i++) merk(groot, "pk", { kaart: "k" + i, soort: "geopend", wie: "W" }, t0 + i);
  assert.equal(groot.pk.length, MAX_PER_PRAKTIJK, "per praktijk een plafond");
  assert.equal(groot.pk[0].k, "k" + (MAX_PER_PRAKTIJK + 2), "de nieuwste blijft");
}

// ---- 2. de echte server ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-leeslog-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let app, uit = "";
const start = async () => {
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", MOLLIE_API_KEY: "" };
  for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$)/.test(k)) delete env[k];
  app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
};
const stop = async (signaal) => { if (app && app.exitCode === null) { app.kill(signaal); await new Promise((r) => app.once("exit", r)); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.9." + (ip++ & 255) }, body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Leeslog", Q = encodeURIComponent(P);
const opSchijf = async () => { try { return JSON.parse(await readFile(join(dataDir, "leeslog.json"), "utf8")); } catch { return {}; } };
const wachtOpSchijf = async (klopt) => { for (let i = 0; i < 40; i++) { const l = await opSchijf(); if (klopt(l)) return l; await new Promise((r) => setTimeout(r, 100)); } return opSchijf(); };

try {
  await start();
  // een praktijk met een beheerder (Sanne) en een therapeut (Joris)
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: "sanne@leeslog.invalid", wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const u = await post("/api/praktijk/team/uitnodigen", { email: "joris@leeslog.invalid", naam: "Joris", rol: "therapeut" }, S);
  assert.equal(u.status, 200);
  const t = new URL((await u.json()).link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t, naam: "Joris", wachtwoord: "joris-wachtwoord", regels: "1" })).status, 200);
  const J = ses(await (await post("/api/praktijk/login", { email: "joris@leeslog.invalid", wachtwoord: "joris-wachtwoord" })).json());
  assert.ok(J["x-praktijk-sessie"], "Joris is ingelogd");

  const deel = async (naam, wie) => {
    const r = await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, wie);
    assert.equal(r.status, 200, "kaart " + naam + " delen");
    return (await r.json()).id;
  };
  const leeslog = async (id, wie) => get("/api/kaart/leeslog?praktijk=" + Q + "&id=" + id, wie);
  const regels = async (id) => { const r = await leeslog(id, S); assert.equal(r.status, 200); return (await r.json()).regels; };
  const kort = (rs) => rs.filter((r) => r.kaart).map((r) => r.wie + ": " + r.wat + (r.n > 1 ? " x" + r.n : ""));

  // Joris maakt een kaart, Sanne ook
  const kJoris = await deel("Dirk", J), kSanne = await deel("Truus", S);
  assert.deepEqual(kort(await regels(kJoris)), ["Joris: kaart bewaard"], "wie de kaart maakte, staat erin");
  assert.deepEqual(kort(await regels(kSanne)), ["Sanne: kaart bewaard"], "en alleen bij de eigen kaart");

  // Sanne opent de kaart van Joris, twee keer kort na elkaar; Joris opent de zijne
  for (const wie of [S, S, J]) assert.equal((await get("/api/praktijk/kaart?praktijk=" + Q + "&id=" + kJoris, wie)).status, 200);
  assert.deepEqual(kort(await regels(kJoris)), ["Joris: kaart geopend", "Sanne: kaart geopend x2", "Joris: kaart bewaard"], "de nieuwste eerst, een herhaling is één regel");
  assert.deepEqual(kort(await regels(kSanne)), ["Sanne: kaart bewaard"], "de andere kaart is niet geopend");
  const eerste = (await regels(kJoris)).find((r) => r.wie === "Sanne");
  assert.ok(eerste.t <= eerste.tot && Date.now() - eerste.t < 60000, "met het moment erbij");
  assert.deepEqual(Object.keys(eerste).sort(), ["kaart", "n", "t", "tot", "wat", "wie"], "geen login-id en geen kaart-id naar het scherm");

  // de patiënt die haar eigen kaart opent, komt niet in het leeslog; een mislukte poging ook niet
  assert.equal((await get("/api/kaart?id=" + kJoris)).status, 200);
  assert.equal((await get("/api/praktijk/kaart?praktijk=" + Q + "&id=" + kJoris)).status, 401);
  assert.equal((await get("/api/praktijk/kaart?praktijk=" + Q + "&id=bestaatniet", S)).status, 404);
  assert.equal(kort(await regels(kJoris)).length, 3, "de patiënt, een bezoeker zonder login en een kaart die niet bestaat: geen regel");

  // het overzicht, de berichten: regels over alle kaarten
  assert.equal((await get("/api/kaarten?praktijk=" + Q, J)).status, 200);
  assert.equal((await get("/api/praktijk/inbox?praktijk=" + Q, J)).status, 200);
  let alle = (await regels(kSanne)).filter((r) => !r.kaart).map((r) => r.wie + ": " + r.wat);
  assert.deepEqual(alle, ["Joris: berichten van patiënten bekeken", "Joris: overzicht van alle kaarten bekeken"], "wie alle kaarten tegelijk zag, staat bij elke kaart");

  // alleen een beheerder ziet het leeslog; het overzicht zegt bij wie de knop hoort
  assert.equal((await leeslog(kJoris, J)).status, 403, "een therapeut ziet het leeslog niet, ook niet van de eigen kaart");
  assert.equal((await leeslog(kJoris)).status, 401, "zonder login niets");
  assert.equal((await leeslog("bestaatniet", S)).status, 404);
  const lijstS = await (await get("/api/kaarten?praktijk=" + Q, S)).json(), lijstJ = await (await get("/api/kaarten?praktijk=" + Q, J)).json();
  assert.ok(lijstS.length === 2 && lijstS.every((k) => k.magLog === true), "de beheerder krijgt de knop Inzage bij elke kaart");
  assert.ok(lijstJ.every((k) => !("magLog" in k)), "een therapeut niet");
  // met het gedeelde wachtwoord van de praktijk: er staat geen naam, wel dat het zo ging
  assert.equal((await get("/api/praktijk/kaart?praktijk=" + Q + "&id=" + kSanne, G)).status, 200);
  assert.equal(kort(await regels(kSanne))[0], "gedeeld wachtwoord: kaart geopend");

  // het staat op schijf, zonder de naam van een patiënt, onder de sleutel van de praktijk
  const schijf = await wachtOpSchijf((l) => JSON.stringify(l).includes("gedeeld wachtwoord"));
  const pk = Object.keys(schijf)[0];
  assert.equal(Object.keys(schijf).length, 1);
  assert.ok(schijf[pk].some((r) => r.k === kJoris && r.s === "geopend" && r.wie === "Sanne" && r.lid), "de regel van Sanne staat op schijf, met haar login-id");
  assert.ok(!/Dirk|Truus/.test(JSON.stringify(schijf)), "geen naam van een patiënt in het leeslog");

  // een tweede praktijk ziet alleen haar eigen leeslog
  const P2 = "Fysio Buren";
  const B = ses(await (await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "buren-wachtwoord", akkoord: true })).json());
  const rb = await post("/api/kaarten", { praktijk: P2, naam: "Anna", client: { c_naam: "Anna" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, B);
  assert.equal(rb.status, 200);
  const kBuren = (await rb.json()).id;
  const buren = (await (await get("/api/kaart/leeslog?praktijk=" + encodeURIComponent(P2) + "&id=" + kBuren, B)).json()).regels;
  assert.deepEqual(buren.map((r) => r.wie + ": " + r.wat), ["gedeeld wachtwoord: kaart bewaard"], "geen regel van een andere praktijk, ook niet die over alle kaarten");
  assert.equal((await leeslog(kBuren, S)).status, 404, "en de eerste praktijk vindt de kaart van de buren niet");

  // een herstart: het leeslog is er nog, ook de regel van vlak voor het afsluiten
  assert.equal((await get("/api/praktijk/kaart?praktijk=" + Q + "&id=" + kSanne, J)).status, 200);
  await stop("SIGTERM"); await start();
  assert.deepEqual(kort(await regels(kJoris)), ["Joris: kaart geopend", "Sanne: kaart geopend x2", "Joris: kaart bewaard"], "na een herstart staat alles er nog");
  assert.equal(kort(await regels(kSanne))[0], "Joris: kaart geopend", "een regel van vlak voor het afsluiten staat op schijf");

  // de download van alle gegevens: staat in het leeslog en bevat het leeslog
  const d = await formulier("/v2/gegevens/download", { praktijk: P, email: "sanne@leeslog.invalid", wachtwoord: "sanne-wachtwoord" });
  assert.equal(d.status, 200, "download: " + uit.slice(-300));
  const pakket = await d.json();
  assert.ok(Array.isArray(pakket.leeslog) && pakket.leeslog.some((r) => r.k === kJoris && r.wie === "Sanne" && r.wat === "kaart geopend" && /^\d{4}-\d\d-\d\dT/.test(r.t)), "het leeslog zit in de download");
  assert.equal(pakket.leeslog[0].wat, "alle gegevens gedownload", "en de download zelf staat erin");
  alle = (await regels(kSanne)).filter((r) => !r.kaart).map((r) => r.wie + ": " + r.wat);
  assert.equal(alle[0], "Sanne: alle gegevens gedownload");

  // de kaart voorgoed weg: haar regels ook, die van de andere kaart niet
  assert.equal((await post("/api/kaarten/verwijder", { praktijk: P, naam: "Dirk", id: kJoris }, S)).status, 200);
  assert.equal((await regels(kJoris)).filter((r) => r.kaart).length, 3, "in de prullenbak is het leeslog er nog");
  assert.equal((await get("/api/praktijk/kaart?praktijk=" + Q + "&id=" + kJoris + "&prullenbak=1", S)).status, 200);
  assert.equal(kort(await regels(kJoris))[0], "Sanne: kaart geopend x3", "ook een kaart uit de prullenbak openen komt erin (bij haar regel van zojuist)");
  assert.equal((await post("/api/kaarten/definitief", { praktijk: P, id: kJoris }, S)).status, 200);
  assert.equal((await leeslog(kJoris, S)).status, 404);
  const na = await wachtOpSchijf((l) => !JSON.stringify(l).includes(kJoris));
  assert.ok(!JSON.stringify(na).includes(kJoris), "definitief verwijderd: geen regel meer over die kaart");
  assert.ok(na[pk].some((r) => r.k === kSanne), "de andere kaart houdt haar regels");

  // het leeslog gaat mee in de reservekopie
  const bron = await readFile(fileURLToPath(new URL("../server.js", import.meta.url)), "utf8");
  assert.match(bron, /^backupBestanden\.push\(leeslogPath\);$/m, "het leeslog staat in de lijst van de reservekopie");

  console.log("test-leeslog: ok (de regels, wie er in het leeslog komt en wie niet, alleen de beheerder leest het, het overleeft een herstart, het zit in de download en verdwijnt met de kaart)");
} catch (e) {
  e.message += "\n--- server ---\n" + uit.slice(-1500);
  throw e;
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
