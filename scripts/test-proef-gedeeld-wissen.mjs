// Rechten van betrokkenen (AVG art. 5 lid 1 e en art. 17): één proef kan tot drie praktijken
// beveiligen (#370). "Alles wissen" van de ene praktijk mag de aanmelding en het betaalde
// abonnement van de andere niet meenemen: anders stond het abonnement van die andere praktijk
// stil en bleven haar gegevens tot het einde van de fiscale termijn (7 jaar) staan. Pas de
// laatste praktijk neemt de aanmelding mee. Zonder browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-gedeeld-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokenGratis = "c".repeat(48);
const tokenBetaald = "d".repeat(48);
const proef = (id, email, naam, token, extra = {}) => ({ id, email, naam, tel: "+31612345678", praktijk: naam + " Fysio",
  gestart: nu - 2 * dag, verloopt: nu + 12 * dag, akkoord: nu - 2 * dag, tokens: [hash(token)], kaarten: 3, ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p_gratis: proef("p_gratis", "test-gratis@voorbeeld.test", "Testa", tokenGratis),
  p_betaald: proef("p_betaald", "test-betaald@voorbeeld.test", "Testb", tokenBetaald, {
    klant: true,
    betaling: { id: "tr_test67890", klant: "cst_test67890", aantal: 2, status: "paid", gemaakt: nu - dag, av: { versie: "2026-11-07-3", t: new Date(nu).toISOString() } },
    abonnement: { status: "actief", aantal: 2, bedrag: "20.00", sinds: nu - dag, betaaldTot: nu + 29 * dag, eersteBetaling: "tr_test67890", mollieKlant: "cst_test67890", mandaat: null }
  })
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu }));

const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const appPort = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${appPort}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let appOutput = "";
app.stdout.on("data", (c) => { appOutput += c; });
app.stderr.on("data", (c) => { appOutput += c; });

let ipTeller = 1;
const nieuwIp = () => "10.3.0." + (ipTeller++);
const claim = (praktijk, wachtwoord, token) => fetch(origin + "/api/praktijk/claim", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": nieuwIp(), cookie: "fpproef=" + token },
  body: JSON.stringify({ praktijk, wachtwoord, akkoord: true })
});
const wis = (praktijk, wachtwoord) => fetch(origin + "/v2/gegevens/wissen", {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": nieuwIp() },
  body: new URLSearchParams({ praktijk, wachtwoord, zeker: "WISSEN" }).toString()
});
const proeven = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // twee praktijken per proef, met hetzelfde apparaat
  for (const [naam, token] of [["Testa Oost", tokenGratis], ["Testa West", tokenGratis], ["Testb Oost", tokenBetaald], ["Testb West", tokenBetaald]]) {
    const r = await claim(naam, "wachtwoord-" + naam.replace(/\s/g, "").toLowerCase(), token);
    assert.equal(r.status, 200, "beveiligen " + naam + ": " + await r.text());
  }
  const acc = await accounts();
  assert.equal(Object.values(acc).filter((a) => a.proef?.id === "p_gratis").length, 2, "twee praktijken op de gratis proef");
  assert.equal(Object.values(acc).filter((a) => a.proef?.id === "p_betaald").length, 2, "twee praktijken op het abonnement");

  // ---- gratis proef: de eerste praktijk gaat, de aanmelding blijft voor de andere ----
  const w1 = await wis("Testa Oost", "wachtwoord-testaoost");
  assert.equal(w1.status, 200);
  const t1 = await w1.text();
  assert.match(t1, /proefaanmelding blijft staan/, "de pagina zegt dat de aanmelding blijft");
  assert.ok((await proeven()).p_gratis, "aanmelding blijft voor de andere praktijk");
  assert.equal((await proeven()).p_gratis.tel, "+31612345678");
  // de laatste praktijk neemt de aanmelding wel mee
  const w2 = await wis("Testa West", "wachtwoord-testawest");
  assert.equal(w2.status, 200);
  assert.doesNotMatch(await w2.text(), /proefaanmelding blijft staan/);
  assert.equal((await proeven()).p_gratis, undefined, "aanmelding weg met de laatste praktijk");

  // ---- betaald abonnement: de andere praktijk blijft klant ----
  const w3 = await wis("Testb Oost", "wachtwoord-testboost");
  assert.equal(w3.status, 200);
  const b1 = (await proeven()).p_betaald;
  assert.ok(b1 && !b1.gewist, "abonnement niet gewist zolang er nog een praktijk aan hangt");
  assert.equal(b1.abonnement.status, "actief", "abonnement van de andere praktijk loopt door");
  assert.equal(b1.klant, true);
  // de laatste praktijk: alleen de fiscale kern blijft
  const w4 = await wis("Testb West", "wachtwoord-testbwest");
  assert.equal(w4.status, 200);
  assert.match(await w4.text(), /7 jaar/);
  const b2 = (await proeven()).p_betaald;
  assert.ok(b2 && b2.gewist, "fiscale kern blijft");
  assert.equal(b2.abonnement.status, "gestopt");
  assert.equal(b2.tel, undefined);
  assert.equal(Object.keys(await accounts()).length, 0, "alle vier praktijken zijn weg");

  // de lijst op /v2/gegevens zegt het ook
  const pagina = await (await fetch(origin + "/v2/gegevens", { headers: { "x-forwarded-for": nieuwIp() } })).text();
  assert.match(pagina, /behalve als je met dezelfde proef nog een andere praktijk beveiligde/);

  console.log("Alles wissen bij een gedeelde proef: aanmelding en abonnement blijven voor de andere praktijk.");
} catch (e) {
  console.error(appOutput.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
