// Security (2026-11-11): "Gegevens wissen" op /v2/proef (alleen de proefcookie nodig) bracht
// de aanmelding van een BETALENDE praktijk terug tot de fiscale bewaarplicht met klant: true.
// Gevolg: de maandincasso stopte (de proefronde slaat gewiste aanmeldingen over), het einde
// van het abonnement werd nooit meer bereikt, en de praktijk bleef zonder te betalen voor
// altijd kaarten maken; nooit gewist. Ook na een beëindigd abonnement zette wissen klant
// weer op true: de app ging weer open. Wie alleen de proefcookie heeft (een gedeelde
// praktijkcomputer) kon dit zonder beheerdersrol. Nu: met een lopend of beëindigd abonnement
// en een gekoppelde praktijk weigert deze route en verwijst naar opzeggen of Mijn gegevens;
// en een praktijk aan een gewiste aanmelding blijft op slot.
// Zonder browser. `node scripts/test-proef-wissen-klant.mjs`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-wissen-klant-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tActief = "a".repeat(48), tEinde = "b".repeat(48), tOud = "e".repeat(48), tProef = "f".repeat(48);
const klant = (id, naam, token, extra = {}) => ({ id, email: id + "@praktijk.nl", naam, tel: "+31612345678", praktijk: naam + " Fysio",
  gestart: nu - 90 * dag, verloopt: nu - 76 * dag, akkoord: nu - 90 * dag, tokens: [hash(token)], klant: true,
  betaling: { id: "tr_" + id, klant: "cst_" + id, aantal: 1, status: "paid", gemaakt: nu - 80 * dag },
  abonnement: { status: "actief", aantal: 1, bedrag: "9.99", sinds: nu - 80 * dag, betaaldTot: nu + 5 * dag, eersteBetaling: "tr_" + id }, ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  actief: klant("actief", "Anna", tActief),
  einde: klant("einde", "Erik", tEinde),
  oud: klant("oud", "Olga", tOud),
  // gewone proef zonder betaling: wissen blijft gewoon werken
  proef: { id: "proef", email: "p@praktijk.nl", naam: "Piet", tel: "+31612345678", praktijk: "Piet Fysio", gestart: nu - dag,
    verloopt: nu + 13 * dag, akkoord: nu - dag, tokens: [hash(tProef)], kaarten: 0 }
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
async function start() {
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return app;
}
const stop = async (app) => { app.kill(); await new Promise((r) => app.once("exit", r)); };
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const wis = (token) => fetch(origin + "/v2/proef/wissen", { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: "fpproef=" + token, "x-forwarded-for": "10.7.1." + (ip++) }, body: "zeker=1" });
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));

let app = await start();
try {
  const ww = {};
  for (const [naam, token] of [["Anna Fysio", tActief], ["Erik Fysio", tEinde], ["Olga Fysio", tOud]]) {
    ww[naam] = "wachtwoord-" + token.slice(0, 6);
    const r = await post("/api/praktijk/claim", { praktijk: naam, wachtwoord: ww[naam], akkoord: true }, { cookie: "fpproef=" + token });
    assert.equal(r.status, 200, naam + " beveiligen");
  }
  await stop(app);
  // Erik: abonnement opgezegd en de betaalde maand is voorbij (beëindigd, geen klant meer)
  // Olga: een aanmelding die al eerder (met de oude code) via deze route is gewist
  const pr = await lees("proef-aanmeldingen.json");
  Object.assign(pr.einde, { klant: false, verloopt: nu - 2 * dag });
  Object.assign(pr.einde.abonnement, { status: "beeindigd", betaaldTot: nu - 2 * dag, beeindigd: nu - 2 * dag });
  pr.oud = { id: "oud", email: pr.oud.email, naam: pr.oud.naam, praktijk: pr.oud.praktijk, gestart: pr.oud.gestart, verloopt: pr.oud.verloopt,
    klant: true, betaling: pr.oud.betaling, abonnement: { ...pr.oud.abonnement, status: "gestopt" }, gewist: nu - dag, bewaarTot: nu + 2000 * dag };
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(pr));
  app = await start();

  // 1. lopend abonnement: wissen via de proefpagina wordt geweigerd, abonnement loopt door
  const r1 = await wis(tActief);
  assert.equal(r1.status, 409, "wissen met een lopend abonnement geweigerd");
  assert.match(await r1.text(), /Mijn gegevens/);
  let na = await lees("proef-aanmeldingen.json");
  assert.ok(!na.actief.gewist, "aanmelding niet gewist");
  assert.equal(na.actief.abonnement.status, "actief", "abonnement loopt door (incasso blijft)");
  assert.ok(na.actief.tokens?.length, "apparaat blijft gekoppeld");

  // 2. beëindigd abonnement: wissen zet de praktijk niet weer open als klant
  const r2 = await wis(tEinde);
  assert.equal(r2.status, 409, "wissen na een beëindigd abonnement geweigerd (wissen gaat via Mijn gegevens)");
  na = await lees("proef-aanmeldingen.json");
  assert.equal(na.einde.klant, false, "geen klant geworden");
  assert.ok(!na.einde.gewist);

  // 3. een praktijk aan een al gewiste aanmelding maakt geen nieuwe kaarten meer
  const login = await post("/api/praktijk/login", { praktijk: "Olga Fysio", wachtwoord: ww["Olga Fysio"] });
  assert.equal(login.status, 200, "Olga logt in");
  const sessie = (await login.json()).sessie;
  const k = await post("/api/kaarten", { praktijk: "Olga Fysio", naam: "Roepnaam", oefeningen: [] }, { "x-praktijk-sessie": sessie });
  assert.equal(k.status, 403, "gewiste aanmelding: geen gratis kaarten meer");

  // 4. gewone proef zonder betaling: wissen werkt zoals altijd
  const r4 = await wis(tProef);
  assert.equal(r4.status, 200);
  assert.match(await r4.text(), /Je gegevens zijn gewist/);
  na = await lees("proef-aanmeldingen.json");
  assert.ok(!na.proef, "proef zonder betaling helemaal weg");
  console.log("test-proef-wissen-klant: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
