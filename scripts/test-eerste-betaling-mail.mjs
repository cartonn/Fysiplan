// Na de eerste online betaling krijgt de praktijk zelf een bevestiging (bedrag, tot wanneer,
// waar de factuur staat; de maandincasso alleen als die aan staat), één keer, ook bij een
// tweede webhook. En /v2/proef/factuur zonder factuur geeft een uitleg in plaats van een kale
// "Not found". Zonder browser, met een nep-Mollie en een nep-mailserver. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dag = 86400000;
const nu = Date.now();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-eerstebetaling-"));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokens = { a: "e".repeat(48), b: "f".repeat(48), c: "g".repeat(48) };
const adres = (id) => id + "@praktijk.voorbeeld";
const proef = (id, metBetaling) => ({ id, email: adres(id), naam: "Naam" + id + " Achter", tel: "+31612345678", praktijk: id + " Fysio",
  gestart: nu - 10 * dag, verloopt: nu + 4 * dag, akkoord: nu - 10 * dag, tokens: [hash(tokens[id])],
  ...(metBetaling ? { betaling: { id: "tr_eerste" + id + "1", klant: "cst_" + id + "1234", aantal: 2, bedrag: "19.98", status: "open", gemaakt: nu - 60000 } } : {}) });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({ a: proef("a", true), b: proef("b", false), c: proef("c", true) }));
await writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify({ kor: "nee", prijsBtw: "exclusief" }));

const mails = [];
const leesBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => r(d)); });
const nep = createServer(async (req, res) => {
  const body = await leesBody(req);
  const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.url === "/emails") { mails.push(JSON.parse(body)); return json(200, { id: "m" }); }
  const m = /^\/v2\/payments\/tr_eerste(\w)1$/.exec(req.url);
  if (m) return json(200, { id: "tr_eerste" + m[1] + "1", status: "paid", amount: { currency: "EUR", value: "19.98" }, metadata: { proef: m[1] }, mandateId: "mdt_" + m[1] + "1234" });
  json(404, {});
});
await new Promise((r) => nep.listen(0, "127.0.0.1", r));
const nepUrl = "http://127.0.0.1:" + nep.address().port;

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
async function start(incasso) {
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MOLLIE_API_KEY: "test_nep", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: incasso ? "aan" : "",
      MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
const lees = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
const wacht = async (klaar) => { for (let i = 0; i < 60; i++) { if (await klaar()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const metCookie = (id) => ({ headers: { cookie: "fpproef=" + tokens[id], origin }, redirect: "manual" });
const webhook = (id) => fetch(origin + "/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + id });
const aanPraktijk = (id) => mails.filter((m) => [].concat(m.to).includes(adres(id)) && /eerste betaling is gelukt/.test(m.subject));

let app = await start(false);
try {
  // factuur zonder proefcookie of login: uitleg, geen kale "Not found"
  const r0 = await fetch(origin + "/v2/proef/factuur", { redirect: "manual" });
  assert.equal(r0.status, 404);
  assert.match(r0.headers.get("content-type") || "", /text\/html/);
  const t0 = await r0.text();
  assert.doesNotMatch(t0, /^Not found$/);
  assert.match(t0, /Deze factuur is hier niet te zien/);
  assert.match(t0, /eigen login van een beheerder/);
  // een praktijk die nog niet betaalde
  const t1 = await (await fetch(origin + "/v2/proef/factuur", metCookie("b"))).text();
  assert.match(t1, /nog niet online betaald/);
  assert.match(t1, /href="\/v2\/proef\?mijn=1"/);

  // eerste betaling via de webhook: bevestiging aan de praktijk, één keer
  for (let i = 0; i < 2; i++) assert.equal((await webhook("tr_eerstea1")).status, 200);
  assert.ok(await wacht(() => aanPraktijk("a").length > 0), "praktijk krijgt een bevestiging");
  assert.ok(mails.some((m) => /^Betaald: a Fysio/.test(m.subject)), "beheer hoort het nog steeds");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(aanPraktijk("a").length, 1, "tweede webhook: geen tweede mail");
  const tekst = aanPraktijk("a")[0].text;
  assert.match(tekst, /^Hoi Naama,/);
  assert.match(tekst, /EUR 19\.98/);
  assert.match(tekst, /2 therapeuten/);
  assert.match(tekst, /v2\/proef\?mijn=1/);
  assert.match(tekst, /naam en het adres van je praktijk/, "zonder factuurgegevens: vraag ze in te vullen");
  assert.doesNotMatch(tekst, /automatisch af/, "zonder maandincasso geen belofte over afschrijven");
  const a = (await lees()).a;
  assert.equal(a.klant, true);
  assert.match(tekst, /Opzeggen kan elke dag/);

  // de eigen factuur werkt; een onbekend nummer geeft de uitleg met de weg terug
  assert.equal((await fetch(origin + "/v2/proef/factuur", metCookie("a"))).status, 200);
  const r2 = await fetch(origin + "/v2/proef/factuur?nr=FP-1999-9999", metCookie("a"));
  assert.equal(r2.status, 404);
  const t2 = await r2.text();
  assert.match(t2, /hoort niet bij je praktijk of bestaat niet/);
  assert.doesNotMatch(t2, new RegExp(a.abonnement.factuurNr), "noemt geen factuurnummer");
  await stop(app);

  // met maandincasso aan: de mail zegt dat de volgende maand vooraf wordt aangekondigd
  app = await start(true);
  await webhook("tr_eerstec1");
  assert.ok(await wacht(() => aanPraktijk("c").length > 0));
  assert.match(aanPraktijk("c")[0].text, /automatisch af met de machtiging/);
  assert.match(aanPraktijk("c")[0].text, /5 dagen vooraf een mail/);
  console.log("test-eerste-betaling-mail: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
