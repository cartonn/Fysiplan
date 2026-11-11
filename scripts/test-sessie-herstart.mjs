// Sessies overleven een herstart (platformreview 2026-11-11). Elke uitrol logde alle
// therapeuten uit, ruim twintig keer per dag: de sessies stonden alleen in het geheugen.
// - Ingelogd blijven over een herstart heen: gedeeld praktijkwachtwoord en eigen login.
// - Op schijf staat nooit het token zelf, alleen de SHA-256 ervan.
// - Uitloggen en een wachtwoordwijziging blijven gelden na een herstart.
// - Vangnet: stond een sessie nog in het bestand terwijl het wachtwoord intussen anders is
//   (reservekopie teruggezet, praktijknaam opnieuw beveiligd door een ander), dan werkt hij niet.
// - Verlopen, kapotte en toekomstige rijen worden bij het inlezen overgeslagen; een kapot
//   bestand houdt de server niet tegen.
// - SIGTERM sluit netjes af (code 0) en het bestand staat op schijf.
// Zonder browser, past in CI. `npm run test:sessieherstart`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSIE_MS, SessieTabel, laadSessies, sessieSleutel, wachtwoordAfdruk } from "../lib/sessie-opslag.js";

const root = process.cwd();
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-sessieherstart-"));
const sessiesPad = join(dataDir, "praktijk-sessies.json");
const accountsPad = join(dataDir, "praktijk-accounts.json");

// ---- de tabel zelf: bewaart bij elke wijziging, niet bij het inlezen ----
{
  const bewaard = [];
  const tabel = new SessieTabel(async (inhoud) => { await wacht(5); bewaard.push(JSON.parse(JSON.stringify(inhoud))); });
  tabel.vul([["a".repeat(64), { pk: "p", t: 1, w: "x" }]]);
  await tabel.opSchijf();
  assert.equal(bewaard.length, 0, "inlezen schrijft niet terug");
  tabel.set("b".repeat(64), { pk: "p", t: 2, w: "x" });
  tabel.set("c".repeat(64), { pk: "q", t: 3, lid: "l1", w: "y" });
  tabel.delete("a".repeat(64));
  assert.equal(tabel.delete("bestaat-niet"), false);
  await tabel.opSchijf();
  assert.ok(bewaard.length >= 1 && bewaard.length <= 2, "wijzigingen uit één beurt gaan samen weg, niet per stuk: " + bewaard.length);
  assert.deepEqual(Object.keys(bewaard.at(-1).sessies).sort(), ["b".repeat(64), "c".repeat(64)], "het laatste bestand heeft de eindstand");
  const n = bewaard.length;
  tabel.clear();
  await tabel.opSchijf();
  assert.equal(bewaard.length, n + 1);
  assert.deepEqual(bewaard.at(-1).sessies, {});
  // een schrijffout houdt de tabel niet tegen
  const kapot = new SessieTabel(async () => { throw new Error("schijf vol"); });
  kapot.vul([]);
  const fout = console.error; const gemeld = []; console.error = (...a) => gemeld.push(a.join(" "));
  kapot.set("d".repeat(64), { pk: "p", t: 1, w: "x" });
  await kapot.opSchijf();
  console.error = fout;
  assert.equal(kapot.size, 1);
  assert.match(gemeld.join("\n"), /sessies bewaren: schijf vol/);
}

// ---- inlezen: alleen rijen die nog kunnen gelden ----
{
  const nu = Date.now();
  const goed = "1".repeat(64), lid = "2".repeat(64);
  await writeFile(sessiesPad, JSON.stringify({ v: 1, sessies: {
    [goed]: { pk: "fysio a", t: nu - 1000, w: "abc" },
    [lid]: { pk: "fysio a", t: nu - 2000, lid: "l1", w: "def", extra: "weg" },
    ["3".repeat(64)]: { pk: "fysio a", t: nu - SESSIE_MS - 1000, w: "abc" },          // verlopen
    ["4".repeat(64)]: { pk: "fysio a", t: nu + 3600000, w: "abc" },                   // uit de toekomst
    ["5".repeat(64)]: { pk: "fysio a", t: nu - 1000 },                                // zonder afdruk
    ["6".repeat(64)]: { pk: "", t: nu - 1000, w: "abc" },                             // zonder praktijk
    "geen-hash": { pk: "fysio a", t: nu - 1000, w: "abc" },                           // sleutel is geen SHA-256
    ["7".repeat(64)]: "tekst"
  } }));
  const rijen = await laadSessies(sessiesPad, nu);
  assert.deepEqual(rijen, [[goed, { pk: "fysio a", t: nu - 1000, w: "abc" }], [lid, { pk: "fysio a", t: nu - 2000, lid: "l1", w: "def" }]]);
  await writeFile(sessiesPad, "{ kapot");
  assert.deepEqual(await laadSessies(sessiesPad), [], "kapot bestand = lege lijst");
  assert.deepEqual(await laadSessies(join(dataDir, "bestaat-niet.json")), [], "geen bestand = lege lijst");
  assert.equal(sessieSleutel("abc").length, 64);
  assert.notEqual(wachtwoordAfdruk("scrypt$a$b"), wachtwoordAfdruk("scrypt$a$c"));
}

// ---- de server: start, stop, herstart op dezelfde datamap ----
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let app = null, uit = "";
async function start() {
  app = spawn(process.execPath, ["server.js"], {
    cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); }
  throw new Error("server start niet:\n" + uit);
}
// stoppen zoals een uitrol dat doet: SIGTERM, en wachten tot het proces weg is
async function stop() {
  const klaar = new Promise((r) => app.once("exit", (code, signaal) => r({ code, signaal })));
  app.kill("SIGTERM");
  const einde = await klaar;
  app = null;
  return einde;
}
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const ses = (token) => ({ "x-praktijk-sessie": token });
const team = async (token) => (await get("/api/praktijk/team", ses(token))).status;
const opSchijf = async () => JSON.parse(await readFile(sessiesPad, "utf8"));
// wacht tot het sessiebestand aan de voorwaarde voldoet (schrijven gaat vlak na het antwoord)
async function wachtOpBestand(test, wat) {
  let laatste = null;
  for (let i = 0; i < 100; i++) {
    try { laatste = await opSchijf(); if (test(laatste)) return laatste; } catch {}
    await wacht(20);
  }
  assert.fail("sessiebestand: " + wat + " — " + JSON.stringify(laatste));
}

try {
  await start(); // het kapotte bestand van hierboven staat er nog: de server start gewoon
  const claimA = await post("/api/praktijk/claim", { praktijk: "Fysio Herstart", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claimA.status, 200);
  const G = (await claimA.json()).sessie;
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin", email: "karin@herstart.nl", wachtwoord: "karin-wachtwoord", regels: true }, ses(G));
  assert.equal(eigen.status, 200);
  const K = (await eigen.json()).sessie;
  const claimB = await post("/api/praktijk/claim", { praktijk: "Fysio Buur", wachtwoord: "buur-wachtwoord-1", akkoord: true });
  const B = (await claimB.json()).sessie;
  assert.equal(await team(G), 200);
  assert.equal(await team(K), 200);
  assert.equal(await team(B), 200);

  // op schijf: drie sessies, alleen als SHA-256, nooit het token zelf
  const eerste = await wachtOpBestand((b) => Object.keys(b.sessies || {}).length === 3, "drie sessies");
  const tekst = await readFile(sessiesPad, "utf8");
  for (const token of [G, K, B]) {
    assert.ok(!tekst.includes(token), "het token zelf staat niet in het bestand");
    assert.ok(eerste.sessies[sessieSleutel(token)], "wel de SHA-256 ervan");
  }
  assert.equal(eerste.sessies[sessieSleutel(K)].pk, eerste.sessies[sessieSleutel(G)].pk);
  assert.ok(eerste.sessies[sessieSleutel(K)].lid, "eigen login: het lid staat erbij");
  assert.ok(!tekst.includes("wachtwoord") && !tekst.includes("scrypt"), "geen wachtwoord of wachtwoordhash in het sessiebestand");

  // ---- herstart 1: iedereen blijft ingelogd ----
  let einde = await stop();
  assert.equal(einde.code, 0, "SIGTERM sluit netjes af: " + JSON.stringify(einde));
  assert.match(uit, /SIGTERM: afsluiten/);
  await start();
  assert.equal(await team(G), 200, "gedeelde sessie werkt na een herstart");
  assert.equal(await team(K), 200, "eigen login werkt na een herstart");
  assert.equal(await team(B), 200);
  assert.equal(await team("f".repeat(48)), 401, "een onbekend token blijft geweigerd");
  // elke sessie hoort na de herstart nog bij haar eigen praktijk
  const teamA = await (await get("/api/praktijk/team", ses(G))).json();
  const teamB = await (await get("/api/praktijk/team", ses(B))).json();
  assert.deepEqual(teamA.leden.map((l) => l.naam), ["Karin"]);
  assert.deepEqual(teamB.leden, []);

  // uitloggen en wachtwoord wijzigen
  assert.equal((await post("/api/praktijk/logout", {}, ses(K))).status, 200);
  assert.equal(await team(K), 401, "uitgelogd");
  const ww = await post("/api/praktijk/wachtwoord", { praktijk: "Fysio Herstart", huidig: "praktijk-wachtwoord", nieuw: "nieuw-praktijk-wachtwoord" }, ses(G));
  assert.equal(ww.status, 200);
  const G2 = (await ww.json()).sessie;
  assert.equal(await team(G), 401, "oude sessie vervalt bij een wachtwoordwijziging");
  assert.equal(await team(G2), 200);
  await wachtOpBestand((b) => !b.sessies[sessieSleutel(K)] && !b.sessies[sessieSleutel(G)] && !!b.sessies[sessieSleutel(G2)], "uitloggen en wijziging op schijf");

  // ---- herstart 2: uitgelogd blijft uitgelogd, de nieuwe sessie blijft ----
  einde = await stop();
  assert.equal(einde.code, 0);
  await start();
  assert.equal(await team(K), 401, "uitgelogd blijft uitgelogd na een herstart");
  assert.equal(await team(G), 401, "ingetrokken blijft ingetrokken na een herstart");
  assert.equal(await team(G2), 200, "de sessie van na de wachtwoordwijziging blijft");
  assert.equal(await team(B), 200);

  // ---- vangnet: het bestand kent een sessie die niet meer bij het wachtwoord van nu hoort ----
  // (a) de ingetrokken sessie G staat weer in het bestand, zoals na het terugzetten van een kopie
  // (b) praktijk "Fysio Buur" verdwijnt en iemand anders beveiligt dezelfde naam opnieuw
  await stop();
  const bestand = await opSchijf();
  bestand.sessies[sessieSleutel(G)] = eerste.sessies[sessieSleutel(G)];
  await writeFile(sessiesPad, JSON.stringify(bestand));
  const accounts = JSON.parse(await readFile(accountsPad, "utf8"));
  const pkBuur = eerste.sessies[sessieSleutel(B)].pk;
  assert.ok(accounts[pkBuur], "account van de buurpraktijk gevonden");
  delete accounts[pkBuur];
  await writeFile(accountsPad, JSON.stringify(accounts));
  await start();
  assert.equal(await team(G), 401, "een sessie van vóór de wachtwoordwijziging werkt niet, ook niet vanuit het bestand");
  assert.equal(await team(B), 401, "de praktijk bestaat niet meer");
  const ander = await post("/api/praktijk/claim", { praktijk: "Fysio Buur", wachtwoord: "iemand-anders-1", akkoord: true });
  assert.equal(ander.status, 200, "dezelfde naam opnieuw beveiligd: " + ander.status);
  assert.equal(await team(B), 401, "de oude sessie geeft geen toegang tot de opnieuw beveiligde praktijk");
  assert.equal(await team((await ander.json()).sessie), 200);
  assert.equal(await team(G2), 200);

  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled|sessies bewaren:/, "geen serverfout in het log:\n" + uit.slice(-800));
  console.log("test-sessie-herstart: ok");
} finally {
  if (app) await stop();
  await rm(dataDir, { recursive: true, force: true });
}
