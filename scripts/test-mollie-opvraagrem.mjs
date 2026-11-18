// De terugkeerpagina's na een Mollie-betaling (/v2/proef/betaald, /v2/proef/maand-betaald) en de
// webhook vragen dezelfde betaling niet meer bij elk verzoek bij Mollie op. Een praktijk met een
// openstaande eigen betaling kon met een lus de Mollie-sleutel van Fysiplan laten remmen (dan liepen
// ook de betalingen van andere praktijken vast). Nu: pagina hooguit 1x per 10 s per betaling,
// webhook hooguit 10x per minuut per betaling (daarboven 503, Mollie probeert later opnieuw).
// Zonder browser, met een nep-Mollie. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dag = 86400000;
const nu = Date.now();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-mollierem-"));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokens = { nieuw: "e".repeat(48), mis: "f".repeat(48) };
const per = nu - 2 * dag;
const basis = (id) => ({ id, email: id + "@praktijk.voorbeeld", naam: "Naam " + id, tel: "+31612345678", praktijk: id + " Fysio",
  tokens: [hash(tokens[id])] });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  // proef die net op betalen drukte: eerste betaling staat open
  nieuw: { ...basis("nieuw"), gestart: nu - 3 * dag, verloopt: nu + 11 * dag, akkoord: nu - 3 * dag,
    betaling: { id: "tr_eerstenieuw", klant: "cst_nieuw1234", aantal: 1, bedrag: "12.09", status: "open", gemaakt: nu - 60000 } },
  // klant met een mislukte maandincasso die de maand zelf betaalt: poging staat open
  mis: { ...basis("mis"), gestart: nu - 60 * dag, verloopt: nu - 46 * dag, akkoord: nu - 60 * dag, klant: true,
    betaling: { id: "tr_eerstemis", klant: "cst_mis1234", aantal: 2, status: "paid", gemaakt: nu - 32 * dag },
    abonnement: { status: "actief", aantal: 2, bedrag: "19.98", sinds: nu - 32 * dag, betaaldTot: per,
      eersteBetaling: "tr_eerstemis", factuurNr: "FP-2026-0001", mollieKlant: "cst_mis1234", mandaat: "mdt_mis1234",
      gemeld: per, gemeldOp: per - 6 * dag,
      incasso: { id: "tr_incmis", periode: per, aantal: 2, status: "mislukt", gemaakt: per, bedrag: "24.18", mollieStatus: "failed",
        zelf: { id: "tr_zelfmis", status: "open", gemaakt: nu - 60000 } } } }
}));
await writeFile(join(dataDir, "finance-instellingen.json"), JSON.stringify({ kor: "nee", prijsBtw: "exclusief" }));

const opgevraagd = new Map();
const nep = createServer((req, res) => {
  req.resume();
  const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  const m = /^\/v2\/payments\/(tr_\w+)$/.exec(req.url);
  if (m && req.method === "GET") {
    opgevraagd.set(m[1], (opgevraagd.get(m[1]) || 0) + 1);
    return json(200, { id: m[1], status: "open", amount: { currency: "EUR", value: "24.18" }, metadata: {} });
  }
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
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MOLLIE_API_KEY: "test_nep", MOLLIE_API_BASIS: nepUrl, MOLLIE_INCASSO: "", MAIL_API_SLEUTEL: "" },
  stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
const pagina = (pad, id) => fetch(origin + pad, { headers: { cookie: "fpproef=" + tokens[id] }, redirect: "manual" });
const webhook = (id) => fetch(origin + "/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + id });

try {
  // terug van Mollie: de eerste keer wordt de status opgehaald, een lus daarna niet meer
  for (let i = 0; i < 15; i++) {
    const r = await pagina("/v2/proef/maand-betaald", "mis");
    assert.equal(r.status, 200);
    assert.match(await r.text(), /wachten nog op de bevestiging/, "toont de bewaarde status");
  }
  assert.equal(opgevraagd.get("tr_zelfmis"), 1, "maand-betaald: hooguit 1x per 10 s bij Mollie");

  for (let i = 0; i < 15; i++) assert.equal((await pagina("/v2/proef/betaald", "nieuw")).status, 200);
  assert.equal(opgevraagd.get("tr_eerstenieuw"), 1, "betaald: hooguit 1x per 10 s bij Mollie");

  // webhook: een id dat iemand kent (staat op de eigen factuur) is geen pomp naar Mollie
  const codes = [];
  for (let i = 0; i < 25; i++) codes.push((await webhook("tr_zelfmis")).status);
  assert.equal(opgevraagd.get("tr_zelfmis"), 1 + 10, "webhook: hooguit 10x per minuut per betaling");
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
  assert.ok(codes.slice(10).every((c) => c === 503), "daarboven 503, dan probeert Mollie het later opnieuw");
  // een andere betaling heeft een eigen teller
  assert.equal((await webhook("tr_eerstenieuw")).status, 200);
  // onbekende id's vragen niets op (zoals voorheen)
  assert.equal((await webhook("tr_onbekend1")).status, 200);
  assert.equal(opgevraagd.get("tr_onbekend1"), undefined);
  console.log("test-mollie-opvraagrem: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  nep.close();
  await rm(dataDir, { recursive: true, force: true });
}
