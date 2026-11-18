// De ideeënbox (lib/ideeen.js, lib/ideeen-routes.js).
// - Rekenwerk: score, volgorde bij gelijke stand, einde van de ronde, sluiten, "Niet nu", wissen.
// - Routes: alleen met een sessie van een beveiligde praktijk; één stem per login; nooit een naam
//   of praktijk in het antwoord; weghalen door wie het plaatste of een beheerder van die praktijk.
// - Beheer: alleen met een eigen sleutel; ronde sluiten geeft de top 4, stemmen ligt dan vast;
//   besluiten (afwijzen vraagt een reden), verbergen, en alles blijft staan na een herstart.
// Zonder browser, past in CI. `npm run test:ideeenbox`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  leegBestand, normaliseer, telling, ranglijst, huidigeTop, sluitRonde, rondeEinde, besluit, wisPraktijk, lijktOp, agentUitkomst, agentInvoer, ideeVoorPraktijk
} from "../lib/ideeen.js";

// ---------- rekenwerk ----------
{
  const nu = Date.UTC(2026, 10, 12, 14);
  assert.equal(rondeEinde(nu), Date.UTC(2026, 11, 1, 8), "ronde van november sluit op 1 december 08:00 UTC");
  assert.equal(rondeEinde(Date.UTC(2026, 11, 1, 7, 59)), Date.UTC(2026, 11, 1, 8), "vlak voor sluiten hoort nog bij de oude ronde");
  assert.equal(rondeEinde(Date.UTC(2026, 11, 1, 8)), Date.UTC(2027, 0, 1, 8), "daarna de volgende maand");
  assert.equal(rondeEinde(Date.UTC(2026, 11, 20)), Date.UTC(2027, 0, 1, 8), "december loopt door tot januari");

  const b = leegBestand(nu);
  const maak = (id, t, stemmen, pk = "p-a") => { b.ideeen[id] = { id, titel: "Idee " + id, tekst: "", pk, lid: "l1", t, stemmen, stand: "open" }; };
  maak("i-000000000001", 1, { "p-a:1": 1, "p-b:1": 1, "p-c:1": -1 });        // score 1, 2 omhoog
  maak("i-000000000002", 2, { "p-a:1": 1 });                                // score 1, 1 omhoog
  maak("i-000000000003", 3, { "p-a:1": 1, "p-b:1": 1, "p-b:2": 1 });        // score 3
  maak("i-000000000004", 0, { "p-a:1": 1 });                                // score 1, 1 omhoog, ouder dan 2
  maak("i-000000000005", 5, { "p-a:1": -1 });                               // score -1: gaat nooit door
  maak("i-000000000006", 6, { "p-a:1": 1, "p-a:2": 1 });                    // score 2
  assert.deepEqual(telling(b.ideeen["i-000000000003"]), { op: 3, neer: 0, score: 3, praktijken: 2 });
  assert.deepEqual(ranglijst(b).map((i) => i.id.slice(-1)), ["3", "6", "1", "4", "2", "5"], "score, dan meer omhoog, dan oudste");
  assert.deepEqual(huidigeTop(b).map((i) => i.id.slice(-1)), ["3", "6", "1", "4"]);

  const v = sluitRonde(b, nu + 1000, "beheer");
  assert.equal(v.ideeen.length, 4);
  assert.deepEqual(v.ideeen.map((x) => x.plek), [1, 2, 3, 4]);
  assert.equal(b.ideeen["i-000000000003"].stand, "voorgesteld");
  assert.equal(b.ideeen["i-000000000002"].stand, "open", "nummer 5 doet de volgende ronde weer mee, met zijn stemmen");
  assert.equal(b.ronde.nr, 2);
  assert.equal(b.ronde.eind, Date.UTC(2026, 11, 1, 8));

  // een ronde zonder idee met score >= 1 sluit ook, zonder voorstel
  const leeg = leegBestand(nu);
  leeg.ideeen["i-00000000000a"] = { id: "i-00000000000a", titel: "x", tekst: "", pk: "p", lid: "", t: 1, stemmen: { "p:1": -1 }, stand: "open" };
  assert.equal(sluitRonde(leeg, nu), null);
  assert.equal(leeg.ronde.nr, 2);

  // besluiten
  assert.match(besluit(b, "i-000000000003", "afwijzen", "", "ahmed@x.nl"), /reden/);
  assert.match(besluit(b, "i-000000000003", "gebouwd", "", "ahmed@x.nl"), /gepland/);
  assert.equal(besluit(b, "i-000000000003", "bouwen", "", "ahmed@x.nl"), "");
  assert.equal(b.ideeen["i-000000000003"].stand, "gepland");
  assert.equal(besluit(b, "i-000000000003", "gebouwd", "", "ahmed@x.nl"), "");
  assert.equal(b.ideeen["i-000000000003"].stand, "gebouwd");
  assert.equal(besluit(b, "i-000000000006", "niet-nu", "Eerst de betalingen.", "ahmed@x.nl"), "");
  assert.equal(b.ideeen["i-000000000006"].parkTot, 5, "drie rondes geparkeerd");
  for (let r = 0; r < 2; r++) sluitRonde(b, nu + 2000 + r);
  assert.equal(b.ideeen["i-000000000006"].stand, "niet-nu", "na twee rondes nog geparkeerd");
  sluitRonde(b, nu + 9000);
  assert.equal(b.ideeen["i-000000000006"].stand, "open", "na drie rondes doet het weer mee");

  // wissen van een praktijk: open ideeën weg, besloten zonder herkomst, stemmen tellen nog
  const w = leegBestand(nu);
  w.ideeen["i-0000000000b1"] = { id: "i-0000000000b1", titel: "open", tekst: "", pk: "p-weg", lid: "l", t: 1, stemmen: { "p-weg:l": 1 }, stand: "open" };
  w.ideeen["i-0000000000b2"] = { id: "i-0000000000b2", titel: "gepland", tekst: "", pk: "p-weg", lid: "l", t: 1, stemmen: { "p-weg:l": 1, "p-blijft:x": 1 }, stand: "gepland" };
  w.ideeen["i-0000000000b3"] = { id: "i-0000000000b3", titel: "ander", tekst: "", pk: "p-blijft", lid: "x", t: 1, stemmen: { "p-weg:l": -1 }, stand: "open" };
  assert.equal(wisPraktijk(w, "p-weg"), 1);
  assert.ok(!w.ideeen["i-0000000000b1"]);
  assert.equal(w.ideeen["i-0000000000b2"].pk, "");
  assert.equal(telling(w.ideeen["i-0000000000b2"]).op, 2);
  assert.equal(telling(w.ideeen["i-0000000000b3"]).score, -1);
  assert.doesNotMatch(JSON.stringify(w), /p-weg/, "de gewiste praktijk komt nergens meer voor");

  // lijkt op
  const l = leegBestand(nu);
  l.ideeen["i-0000000000c1"] = { id: "i-0000000000c1", titel: "Oefeningen in het Arabisch vertalen", tekst: "", pk: "p", lid: "", t: 1, stemmen: {}, stand: "open" };
  l.ideeen["i-0000000000c2"] = { id: "i-0000000000c2", titel: "Donkere modus", tekst: "", pk: "p", lid: "", t: 1, stemmen: {}, stand: "open" };
  assert.deepEqual(lijktOp(l, "vertaling naar het arabisch").map((i) => i.id), ["i-0000000000c1"]);
  assert.deepEqual(lijktOp(l, "een idee voor de app"), [], "alleen stopwoorden: niets");

  // wat de praktijk ziet: nooit pk of lid
  const zicht = ideeVoorPraktijk(l.ideeen["i-0000000000c1"], { pk: "p", lid: "", beheer: true }, new Set());
  assert.equal(zicht.van, "jij");
  assert.ok(!("pk" in zicht) && !("lid" in zicht));

  // agent: invoer zonder herkomst, uitkomst alleen voor de ideeën in het voorstel
  const vs = { ideeen: [{ id: "i-0000000000c1", titel: "Oefeningen in het Arabisch vertalen", op: 2, neer: 0, praktijken: 1 }] };
  assert.doesNotMatch(agentInvoer(l, vs), /"p"|pk|lid/);
  const uit = agentUitkomst(vs, { ideeen: [
    { id: "i-0000000000c1", samenvatting: "Vertalen.", grootte: "middel", letOp: "", advies: "bouwen", waarom: "Veel gevraagd." },
    { id: "i-andersiets", samenvatting: "x", grootte: "klein", letOp: "", advies: "bouwen", waarom: "" }
  ] });
  assert.deepEqual(Object.keys(uit), ["i-0000000000c1"]);
  assert.equal(uit["i-0000000000c1"].grootte, "middel");

  // een bestand met rommel: alleen de goede vorm blijft
  const n = normaliseer({ ronde: { nr: 7, start: 1, eind: 2 }, ideeen: { "geen-id": { titel: "x" }, "i-0000000000d1": { titel: "ok", stemmen: { a: 1, b: 5 }, stand: "raar" } } });
  assert.equal(n.ronde.nr, 7);
  assert.deepEqual(Object.keys(n.ideeen), ["i-0000000000d1"]);
  assert.deepEqual(n.ideeen["i-0000000000d1"].stemmen, { a: 1 });
  assert.equal(n.ideeen["i-0000000000d1"].stand, "open");
}

// ---------- routes ----------
const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-ideeen-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const SLEUTEL = "ideeen-test-sleutel-1234567890";
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", IDEEEN_AI: "",
  MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "uit" };
let app, uit = "";
const startApp = async () => {
  app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); }
  throw new Error("server start niet");
};
const stopApp = async () => { app.kill(); await new Promise((r) => app.once("exit", r)); };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.0." + (ip++ % 250), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.1." + (ip++ % 250) }, body: new URLSearchParams(velden).toString() });
function wacht(ms) { return new Promise((r) => setTimeout(r, ms)); }
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const BEHEER = { "x-admin-sleutel": SLEUTEL };

try {
  await startApp();
  // praktijk A: Sanne (beheerder) en Joris (therapeut); praktijk B: Bram
  const claimA = await post("/api/praktijk/claim", { praktijk: "Fysio Een", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claimA.status, 200);
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Sanne de Wit", email: "sanne@een.nl", wachtwoord: "sanne-wachtwoord", regels: true }, ses(await claimA.json()));
  const S = ses(await eigen.json());
  const uitn = await (await post("/api/praktijk/team/uitnodigen", { email: "joris@een.nl", naam: "Joris", rol: "therapeut" }, S)).json();
  await formulier("/v2/uitnodiging", { t: new URL(uitn.link).searchParams.get("t"), naam: "Joris Bakker", wachtwoord: "joris-wachtwoord", regels: "1" });
  const J = ses(await (await post("/api/praktijk/login", { email: "joris@een.nl", wachtwoord: "joris-wachtwoord" })).json());
  const claimB = await post("/api/praktijk/claim", { praktijk: "Fysio Twee", wachtwoord: "praktijk-wachtwoord-2", akkoord: true });
  const B = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Bram", email: "bram@twee.nl", wachtwoord: "bram-wachtwoord", regels: true }, ses(await claimB.json()))).json());

  // zonder sessie: niets
  assert.equal((await get("/api/ideeen")).status, 401);
  assert.equal((await post("/api/ideeen", { titel: "Zonder login" })).status, 401);

  // indienen
  assert.equal((await post("/api/ideeen", { titel: "kort" }, S)).status, 200, "vier tekens is genoeg");
  assert.equal((await post("/api/ideeen", { titel: "ab" }, S)).status, 400);
  const r1 = await post("/api/ideeen", { titel: "Oefeningen in het Arabisch vertalen", tekst: "Veel patiënten lezen\r\nliever Arabisch." }, S);
  assert.equal(r1.status, 200);
  const i1 = (await r1.json()).idee;
  assert.equal(i1.score, 1, "wie plaatst, stemt meteen omhoog");
  assert.equal(i1.mijnStem, 1);
  assert.equal(i1.van, "jij");
  assert.equal(i1.tekst, "Veel patiënten lezen\nliever Arabisch.");
  const i2 = (await (await post("/api/ideeen", { titel: "Donkere modus voor de app" }, J)).json()).idee;
  const i3 = (await (await post("/api/ideeen", { titel: "Kaart kopiëren naar een collega" }, B)).json()).idee;

  // wat iemand anders ziet: geen naam, geen praktijk
  const lijstB = await (await get("/api/ideeen", B)).json();
  const tekst = JSON.stringify(lijstB);
  for (const verboden of ["Sanne", "Joris", "Fysio Een", "sanne@", "joris@", "\"pk\"", "\"lid\""]) assert.ok(!tekst.includes(verboden), "niet in het antwoord: " + verboden);
  assert.equal(lijstB.ideeen.find((i) => i.id === i1.id).van, "ander");
  assert.equal((await (await get("/api/ideeen", J)).json()).ideeen.find((i) => i.id === i1.id).van, "praktijk");
  assert.equal(lijstB.ronde.top, 4);
  assert.ok(lijstB.ronde.eind > Date.now());

  // stemmen: één stem per login, te veranderen en in te trekken
  let s = await (await post("/api/ideeen/stem", { id: i1.id, stem: 1 }, J)).json();
  assert.equal(s.idee.score, 2);
  s = await (await post("/api/ideeen/stem", { id: i1.id, stem: 1 }, J)).json();
  assert.equal(s.idee.score, 2, "twee keer omhoog telt één keer");
  s = await (await post("/api/ideeen/stem", { id: i1.id, stem: -1 }, B)).json();
  assert.equal(s.idee.score, 1);
  assert.equal(s.idee.mijnStem, -1);
  s = await (await post("/api/ideeen/stem", { id: i1.id, stem: 0 }, B)).json();
  assert.equal(s.idee.score, 2, "stem ingetrokken");
  assert.equal((await post("/api/ideeen/stem", { id: i1.id, stem: 2 }, B)).status, 400);
  assert.equal((await post("/api/ideeen/stem", { id: "i-ffffffffffff", stem: 1 }, B)).status, 404);
  await post("/api/ideeen/stem", { id: i3.id, stem: 1 }, S);
  await post("/api/ideeen/stem", { id: i2.id, stem: -1 }, B);
  await post("/api/ideeen/stem", { id: i2.id, stem: -1 }, S); // Donkere modus: 1 - 2 = -1

  // lijkt op
  const lijkt = await (await get("/api/ideeen/lijkt?q=" + encodeURIComponent("vertaling arabisch"), B)).json();
  assert.deepEqual(lijkt.ideeen.map((i) => i.id), [i1.id]);

  // weghalen: niet door een ander, niet door een therapeut bij een collega, wel door de beheerder van de praktijk
  assert.equal((await post("/api/ideeen/weg", { id: i1.id }, B)).status, 403);
  assert.equal((await post("/api/ideeen/weg", { id: i1.id }, J)).status, 403);
  const i4 = (await (await post("/api/ideeen", { titel: "Idee van Joris om weg te halen" }, J)).json()).idee;
  assert.equal((await post("/api/ideeen/weg", { id: i4.id }, S)).status, 200, "beheerder van de praktijk haalt weg");
  const i5 = (await (await post("/api/ideeen", { titel: "Nog een idee van Joris" }, J)).json()).idee;
  assert.equal((await post("/api/ideeen/weg", { id: i5.id }, J)).status, 200, "eigen idee weghalen");

  // hooguit vijf nieuwe ideeën per login per dag
  for (let n = 0; n < 2; n++) assert.equal((await post("/api/ideeen", { titel: "Extra idee nummer " + n }, B)).status, 200);
  assert.equal((await post("/api/ideeen", { titel: "Extra idee nummer 3" }, B)).status, 200);
  assert.equal((await post("/api/ideeen", { titel: "Extra idee nummer 4" }, B)).status, 200);
  assert.equal((await post("/api/ideeen", { titel: "Te veel vandaag" }, B)).status, 429);

  // kruis-site geweigerd
  assert.equal((await post("/api/ideeen/stem", { id: i1.id, stem: 1 }, { ...B, "sec-fetch-site": "cross-site" })).status, 403);

  // ---- beheer ----
  assert.equal((await get("/api/beheer/ideeen")).status, 403);
  assert.equal((await get("/api/beheer/ideeen", { ...S })).status, 403, "een praktijkbeheerder is geen beheer van Fysiplan");
  const pagina = await fetch(origin + "/dashboard88/ideeen");
  assert.equal(pagina.status, 200);
  assert.equal(pagina.headers.get("x-frame-options"), "DENY");
  let bh = await (await get("/api/beheer/ideeen", BEHEER)).json();
  assert.equal(bh.ok, true);
  assert.equal(bh.ai, false);
  assert.deepEqual(bh.top.slice(0, 2), [i1.id, i3.id], "Arabisch (2) boven kaart kopiëren (2, jonger)");
  assert.ok(!bh.top.includes(i2.id), "een negatieve score gaat niet door");
  assert.doesNotMatch(JSON.stringify(bh), /Sanne|Joris|Bram|sanne@|Fysio Een/, "ook beheer ziet geen namen bij een idee");

  // verbergen: weg uit de lijst van de praktijken
  assert.equal((await post("/api/beheer/ideeen/verberg", { id: i2.id }, BEHEER)).status, 200);
  assert.ok(!(await (await get("/api/ideeen", S)).json()).ideeen.some((i) => i.id === i2.id));
  assert.equal((await post("/api/ideeen/stem", { id: i2.id, stem: 1 }, S)).status, 404);

  // ronde sluiten (met het juiste rondenummer)
  assert.equal((await post("/api/beheer/ideeen/ronde-sluiten", { ronde: 99 }, BEHEER)).status, 409);
  const sl = await (await post("/api/beheer/ideeen/ronde-sluiten", { ronde: bh.ronde.nr }, BEHEER)).json();
  assert.equal(sl.ok, true);
  assert.equal(sl.voorstel.ideeen[0].id, i1.id);
  assert.ok(sl.voorstel.ideeen.length <= 4);
  assert.equal(sl.voorstel.agent.bron, "regels");
  assert.match(sl.voorstel.ideeen[0].regel, /omhoog/);
  assert.equal((await post("/api/ideeen/stem", { id: i1.id, stem: -1 }, B)).status, 409, "voorgesteld: stemmen ligt vast");
  assert.equal((await post("/api/ideeen/weg", { id: i1.id }, S)).status, 409, "voorgesteld: blijft staan");
  bh = await (await get("/api/beheer/ideeen", BEHEER)).json();
  assert.equal(bh.ronde.nr, 2);
  assert.ok(bh.wacht >= 1);

  // besluiten
  assert.equal((await post("/api/beheer/ideeen/besluit", { id: i1.id, besluit: "afwijzen" }, BEHEER)).status, 400, "afwijzen vraagt een reden");
  assert.equal((await post("/api/beheer/ideeen/besluit", { id: i1.id, besluit: "bouwen" }, BEHEER)).status, 200);
  assert.equal((await post("/api/beheer/ideeen/besluit", { id: i3.id, besluit: "afwijzen", reden: "Kan al via Kaarten delen." }, BEHEER)).status, 200);
  const zicht = (await (await get("/api/ideeen", B)).json()).ideeen;
  assert.equal(zicht.find((i) => i.id === i1.id).stand, "gepland");
  assert.equal(zicht.find((i) => i.id === i3.id).reden, "Kan al via Kaarten delen.");
  assert.equal(zicht.find((i) => i.id === i3.id).kanStemmen, false);

  // het beheerlogboek noemt de besluiten
  const log = await readFile(join(dataDir, "beheer-log.jsonl"), "utf8");
  assert.match(log, /ideeënbox: besluit bouwen/);
  assert.match(log, /ideeënbox: ronde 1 eerder gesloten/);

  // na een herstart staat alles er nog
  await stopApp();
  await startApp();
  const na = await (await get("/api/ideeen", S)).json();
  assert.equal(na.ronde.nr, 2);
  assert.equal(na.ideeen.find((i) => i.id === i1.id).stand, "gepland");
  const opSchijf = await readFile(join(dataDir, "ideeen.json"), "utf8");
  assert.doesNotMatch(opSchijf, /Sanne|Joris|sanne@|joris@/, "op schijf geen namen of adressen");

  console.log("ideeënbox: alles in orde");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  try { await stopApp(); } catch {}
  await rm(dataDir, { recursive: true, force: true });
}
