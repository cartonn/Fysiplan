// Proef zonder abonnement (voorwaarden art. 3, privacyverklaring "Voor praktijken"): de
// aanmelding verdwijnt 90 dagen na de proef, en vóór deze fix bleef het praktijkaccount
// (team met namen en e-mail, profiel, sjablonen, eigen oefeningen) daarna voor altijd staan.
// Nu gaat het mee zodra er ook geen gedeelde kaarten meer zijn; zolang er nog kaarten zijn,
// blijft het account staan. Zonder browser. `npm run test:privacy`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-einde-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tok = { oud: "a".repeat(48), kaart: "b".repeat(48), recent: "e".repeat(48), klant: "f".repeat(48) };
const proef = (id, token, extra = {}) => ({ id, email: id + "@praktijk.nl", naam: "Therapeut " + id, tel: "+31612345678",
  praktijk: "Praktijk " + id, gestart: nu - 20 * dag, verloopt: nu - 6 * dag, akkoord: nu - 20 * dag, tokens: [hash(token)], ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud: proef("oud", tok.oud), kaart: proef("kaart", tok.kaart), recent: proef("recent", tok.recent), klant: proef("klant", tok.klant, { klant: true })
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
  headers: { "content-type": "application/json", "x-forwarded-for": "10.4.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));

let app = await start();
try {
  // vier praktijken beveiligen tijdens hun proef (koppelt het account aan de aanmelding)
  for (const [id, token] of Object.entries(tok)) {
    const r = await post("/api/praktijk/claim", { praktijk: "Praktijk " + id, wachtwoord: "wachtwoord-" + id + "-123", akkoord: true }, { cookie: "fpproef=" + token });
    assert.equal(r.status, 200, id + " beveiligen");
  }
  const accounts = await lees("praktijk-accounts.json");
  const pkVan = (id) => Object.keys(accounts).find((k) => accounts[k].proef?.id === id);
  const pk = Object.fromEntries(Object.keys(tok).map((id) => [id, pkVan(id)]));
  assert.ok(Object.values(pk).every(Boolean), "accounts gekoppeld aan de aanmelding");
  await stop(app);

  // de tijd verspringt: drie proeven zijn al meer dan 90 dagen voorbij (aanmelding wordt gewist),
  // "recent" pas 30 dagen; "klant" werd klant. Praktijk "kaart" heeft nog een gedeelde kaart.
  const acc = await lees("praktijk-accounts.json");
  const pr = await lees("proef-aanmeldingen.json");
  for (const id of ["oud", "kaart", "klant"]) { pr[id].verloopt = nu - 95 * dag; acc[pk[id]].proef.verloopt = nu - 95 * dag; }
  pr.recent.verloopt = nu - 30 * dag; acc[pk.recent].proef.verloopt = nu - 30 * dag;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify(pr));
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(acc));
  await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ [pk.kaart]: { k1: { id: "k1", naam: "Roepnaam", oefeningen: [], ts: nu - dag } } }));

  app = await start();
  let na = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    na = await lees("praktijk-accounts.json");
    if (!(pk.oud in na)) break;
  }
  const proevenNa = await lees("proef-aanmeldingen.json");
  assert.ok(!proevenNa.oud && !proevenNa.kaart, "aanmeldingen 90 dagen na de proef gewist (bestond al)");
  assert.ok(!(pk.oud in na), "account van een proef zonder abonnement gewist zodra er geen kaarten meer zijn");
  assert.ok(pk.kaart in na, "account blijft zolang er nog een gedeelde kaart is");
  assert.ok((await lees("kaarten.json"))[pk.kaart]?.k1, "die kaart volgt haar eigen bewaartermijn");
  assert.ok(pk.recent in na, "proef binnen de bewaartermijn niet geraakt");
  assert.ok(pk.klant in na, "klant niet geraakt");
  console.log("test-proef-einde-wissen: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  await stop(app).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
