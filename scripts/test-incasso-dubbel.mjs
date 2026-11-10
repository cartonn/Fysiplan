// Maandincasso: valt het antwoord van Mollie weg (time-out, 5xx) terwijl de betaling daar wel
// is aangemaakt, dan mag de volgende ronde geen tweede afschrijving maken. De server stuurt
// daarom een vaste Idempotency-Key per praktijk en periode mee; de nep-Mollie gedraagt zich
// zoals Mollie (zelfde sleutel = zelfde betaling). Zonder browser. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dag = 86400000;
const nu = Date.now();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-incasso-dubbel-"));
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({ een: {
  id: "een", email: "een@praktijk.nl", naam: "Naam", tel: "+31612345678", praktijk: "Een Fysio",
  gestart: nu - 60 * dag, verloopt: nu - 46 * dag, akkoord: nu - 60 * dag, tokens: [], klant: true,
  betaling: { id: "tr_eersteeen", klant: "cst_een1234", aantal: 1, status: "paid", gemaakt: nu - 31 * dag },
  abonnement: { status: "actief", aantal: 1, bedrag: "9.99", sinds: nu - 31 * dag, betaaldTot: nu - 3600e3,
    gemeld: nu - 3600e3, gemeldOp: nu - 6 * dag, eersteBetaling: "tr_eersteeen", factuurNr: "FP-2026-0001",
    mollieKlant: "cst_een1234", mandaat: "mdt_een1234" } } }));

const posts = [], betalingen = new Map(), perSleutel = new Map();
let teller = 0;
const leesBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => { d += c; }); req.on("end", () => r(d)); });
const nep = createServer(async (req, res) => {
  const body = await leesBody(req);
  const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.url === "/emails") return json(200, { id: "m" });
  if (req.url === "/v2/payments" && req.method === "POST") {
    const sleutel = req.headers["idempotency-key"];
    posts.push(sleutel || null);
    if (sleutel && perSleutel.has(sleutel)) return json(201, betalingen.get(perSleutel.get(sleutel)));
    const b = JSON.parse(body);
    const betaling = { id: "tr_inc" + (++teller), status: "open", amount: b.amount, metadata: b.metadata, customerId: b.customerId };
    betalingen.set(betaling.id, betaling);
    if (sleutel) perSleutel.set(sleutel, betaling.id);
    // eerste keer: aangemaakt bij Mollie, maar het antwoord komt nooit aan
    if (teller === 1) return json(502, {});
    return json(201, betaling);
  }
  const m = /^\/v2\/payments\/(tr_\w+)$/.exec(req.url);
  if (m && betalingen.has(m[1])) return json(200, betalingen.get(m[1]));
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
async function start() {
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MOLLIE_API_KEY: "test_nep", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: "aan",
      MAIL_API_SLEUTEL: "nep", MAIL_AFZENDER: "fysiplan@voorbeeld.nl", MAIL_API_BASIS: nepUrl, PROEF_MELDING_AAN: "beheer@voorbeeld.nl" },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
const wacht = async (klaar) => { for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 150)); if (await klaar()) return true; } return false; };
const lees = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));

let app = await start();
try {
  // ronde 1: Mollie maakt de betaling aan, maar het antwoord valt weg
  assert.ok(await wacht(async () => posts.length >= 1), "eerste incassopoging");
  await new Promise((r) => setTimeout(r, 500));
  await stop(app);
  // ronde 2 (volgende start): opnieuw proberen mag, een tweede afschrijving niet
  app = await start();
  assert.ok(await wacht(async () => (await lees()).een?.abonnement?.incasso?.id), "incasso opgeslagen na tweede poging");
  assert.equal(posts.length, 2, "twee pogingen");
  assert.ok(posts[0] && posts[0] === posts[1], "beide pogingen met dezelfde Idempotency-Key");
  assert.equal(betalingen.size, 1, "maar één betaling bij Mollie: geen dubbele afschrijving");
  assert.equal((await lees()).een.abonnement.incasso.id, "tr_inc1", "de eerste betaling wordt gevolgd");
  console.log("test-incasso-dubbel: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
