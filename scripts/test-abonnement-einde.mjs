// Einde van een opgezegd abonnement (voorwaarden art. 5, verwerkersovereenkomst art. 10):
// na de betaalde maand maakt de praktijk geen nieuwe kaarten meer, en 30 dagen later wist
// de server alles van die praktijk; alleen de fiscale bewaarplicht blijft. Vóór deze fix
// bleef een opgezegde praktijk voor altijd klant en werd er nooit iets gewist.
// Zonder browser. `npm run test:abonnement`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-abonnement-einde-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokenKort = "c".repeat(48), tokenLang = "d".repeat(48);
const klant = (id, naam, token, betaaldTot) => ({ id, email: id + "@praktijk.nl", naam, tel: "+31612345678", praktijk: naam + " Fysio",
  gestart: nu - 90 * dag, verloopt: nu - 76 * dag, akkoord: nu - 90 * dag, tokens: [hash(token)], klant: true,
  betaling: { id: "tr_" + id, klant: "cst_" + id, aantal: 1, status: "paid", gemaakt: nu - 80 * dag },
  abonnement: { status: "actief", aantal: 1, bedrag: "9.99", sinds: nu - 80 * dag, betaaldTot, eersteBetaling: "tr_" + id, factuurNr: "FP-2026-00" + id.length } });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  kort: klant("kort", "Karin", tokenKort, nu + 5 * dag),
  lang: klant("lang", "Lars", tokenLang, nu + 5 * dag)
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
  headers: { "content-type": "application/json", "x-forwarded-for": "10.3.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));

let app = await start();
try {
  // twee betalende praktijken beveiligen (koppelt het account aan de aanmelding) en zeggen op
  const sessies = {};
  for (const [naam, token] of [["Karin Fysio", tokenKort], ["Lars Fysio", tokenLang]]) {
    const r = await post("/api/praktijk/claim", { praktijk: naam, wachtwoord: "wachtwoord-" + token.slice(0, 6), akkoord: true }, { cookie: "fpproef=" + token });
    assert.equal(r.status, 200, naam + " beveiligen");
    sessies[naam] = (await r.json()).sessie;
    const o = await fetch(origin + "/v2/proef/opzeggen", { method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: "fpproef=" + token, "x-forwarded-for": "10.3.1." + (ip++) },
      body: "actie=opzeggen&zeker=1" });
    assert.equal(o.status, 200, naam + " opzeggen");
    assert.match(await o.text(), /30 dagen later wissen we alles/);
  }
  const accounts = await lees("praktijk-accounts.json");
  const pkVan = (id) => Object.keys(accounts).find((k) => accounts[k].proef?.id === id);
  const pkKort = pkVan("kort"), pkLang = pkVan("lang");
  assert.ok(pkKort && pkLang, "accounts gekoppeld aan de aanmelding");
  await stop(app);

  // de tijd verspringt: Karins betaalde maand is net voorbij, die van Lars al 31 dagen
  const pr = await lees("proef-aanmeldingen.json");
  assert.equal(pr.kort.abonnement.status, "opgezegd");
  pr.kort.abonnement.betaaldTot = nu - dag;
  pr.lang.abonnement.betaaldTot = nu - 31 * dag;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(pr));
  const kaart = (id) => ({ id, naam: "Roepnaam", oefeningen: [], ts: nu - dag });
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ [pkKort]: { k1kort: kaart("k1kort") }, [pkLang]: { k1lang: kaart("k1lang") } }));

  app = await start();
  // de proefronde draait 5 seconden na de start
  let na = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    na = await lees("proef-aanmeldingen.json");
    if (na.lang?.gewist && na.kort?.abonnement?.status === "beeindigd") break;
  }
  // Karin: gestopt, geen klant, kaarten nog op de server, nieuwe kaarten geweigerd
  assert.equal(na.kort.abonnement.status, "beeindigd", "opgezegd abonnement stopt na de betaalde maand");
  assert.equal(na.kort.klant, false);
  const kaartenNa = await lees("kaarten.json");
  assert.ok(kaartenNa[pkKort]?.k1kort, "binnen 30 dagen na het einde blijven de kaarten");
  const nieuw = await post("/api/kaarten", { naam: "Nieuw", oefeningen: [] }, { cookie: "fpproef=" + tokenKort });
  assert.notEqual(nieuw.status, 200, "na het einde geen nieuwe kaarten meer");
  // Lars: 30 dagen voorbij, alles van de praktijk gewist, alleen de fiscale gegevens blijven
  assert.ok(!kaartenNa[pkLang], "kaarten 30 dagen na het einde gewist");
  assert.ok(!(pkLang in await lees("praktijk-accounts.json")), "account gewist");
  assert.ok(na.lang.gewist, "aanmelding teruggebracht tot de fiscale bewaarplicht");
  assert.equal(na.lang.tel, undefined, "geen telefoon meer");
  assert.equal(na.lang.tokens, undefined, "geen apparaten meer");
  assert.equal(na.lang.betaling.id, "tr_lang", "betaling blijft (7 jaar)");
  assert.ok(pkKort in await lees("praktijk-accounts.json"), "andere praktijk niet geraakt");
  console.log("test-abonnement-einde: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
