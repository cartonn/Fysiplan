// Rechten van betrokkenen (AVG art. 15 en 17): de proefaanmelding (contactpersoon,
// e-mail, telefoon, betaling) hoort bij de praktijk. Download op /v2/gegevens geeft
// haar mee (zonder apparaat-tokens) en "Alles wissen" neemt haar mee. Na een online
// betaling blijft alleen wat de fiscale bewaarplicht vraagt: geen telefoon, geen
// apparaten, en hervatten met hetzelfde e-mailadres kan niet meer. Zonder browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gegevens-proef-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tokenGratis = "a".repeat(48);
const tokenBetaald = "b".repeat(48);
const proef = (id, email, naam, token, extra = {}) => ({ id, email, naam, tel: "+31612345678", praktijk: naam + " Fysio",
  gestart: nu - 2 * dag, verloopt: nu + 12 * dag, akkoord: nu - 2 * dag, tokens: [hash(token)], kaarten: 3, ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p_gratis: proef("p_gratis", "gerda@praktijk.nl", "Gerda", tokenGratis),
  p_betaald: proef("p_betaald", "bert@praktijk.nl", "Bert", tokenBetaald, {
    klant: true,
    betaling: { id: "tr_test12345", klant: "cst_test12345", aantal: 2, status: "paid", gemaakt: nu - dag, av: { versie: "2026-11-07-3", t: new Date(nu).toISOString() } },
    abonnement: { status: "actief", aantal: 2, bedrag: "20.00", sinds: nu - dag, betaaldTot: nu + 29 * dag, eersteBetaling: "tr_test12345", mollieKlant: "cst_test12345", mandaat: null }
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
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let appOutput = "";
app.stdout.on("data", (c) => { appOutput += c; });
app.stderr.on("data", (c) => { appOutput += c; });

let ipTeller = 1;
const nieuwIp = () => "10.2.0." + (ipTeller++);
const claim = (praktijk, wachtwoord, token) => fetch(origin + "/api/praktijk/claim", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": nieuwIp(), cookie: "fpproef=" + token },
  body: JSON.stringify({ praktijk, wachtwoord, akkoord: true })
});
const formulier = (pad, velden) => fetch(origin + pad, {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": nieuwIp() },
  body: new URLSearchParams(velden).toString()
});
const proeven = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  assert.equal((await claim("Gerda Fysio", "gerda-wachtwoord-1", tokenGratis)).status, 200);
  assert.equal((await claim("Bert Fysio", "bert-wachtwoord-1", tokenBetaald)).status, 200);

  // ---- download: de eigen aanmelding zit erin, zonder tokens; die van een ander niet ----
  const dl = await formulier("/v2/gegevens/download", { praktijk: "Gerda Fysio", wachtwoord: "gerda-wachtwoord-1" });
  assert.equal(dl.status, 200);
  const tekst = await dl.text();
  const pakket = JSON.parse(tekst);
  assert.equal(pakket.aanmelding?.email, "gerda@praktijk.nl", "proefaanmelding staat in de download");
  assert.equal(pakket.aanmelding.tel, "+31612345678");
  assert.equal(pakket.aanmelding.tokens, undefined, "geen apparaat-tokens");
  assert.doesNotMatch(tekst, /bert@praktijk|Bert|tr_test/, "niets van een andere praktijk");
  assert.doesNotMatch(tekst, new RegExp(hash(tokenGratis)), "geen tokenhash");

  // ---- alles wissen zonder betaling: aanmelding weg, cookie werkt niet meer ----
  const wisG = await formulier("/v2/gegevens/wissen", { praktijk: "Gerda Fysio", wachtwoord: "gerda-wachtwoord-1", zeker: "WISSEN" });
  assert.equal(wisG.status, 200);
  assert.match(await wisG.text(), /proefaanmelding/);
  assert.equal((await proeven()).p_gratis, undefined, "proefaanmelding zonder betaling is weg");

  // ---- alles wissen na online betalen: alleen de fiscale kern blijft ----
  const wisB = await formulier("/v2/gegevens/wissen", { praktijk: "Bert Fysio", wachtwoord: "bert-wachtwoord-1", zeker: "WISSEN" });
  assert.equal(wisB.status, 200);
  assert.match(await wisB.text(), /7 jaar/);
  const rest = (await proeven()).p_betaald;
  assert.ok(rest, "betaalgegevens blijven (fiscale bewaarplicht)");
  assert.equal(rest.betaling.id, "tr_test12345");
  assert.equal(rest.email, "bert@praktijk.nl");
  for (const veld of ["tel", "tokens", "kaarten", "akkoord"]) assert.equal(rest[veld], undefined, veld + " is gewist");
  assert.ok(rest.gewist && rest.bewaarTot > nu + 6 * 365 * dag && rest.bewaarTot < nu + 8 * 365 * dag, "bewaren tot 7 jaar");
  assert.equal(rest.abonnement.status, "gestopt");

  // het oude apparaat-token opent de proef niet meer (geen "Mijn proef" met gegevens)
  const mijn = await fetch(origin + "/v2/proef/mijn", { headers: { cookie: "fpproef=" + tokenBetaald, "x-forwarded-for": nieuwIp() }, redirect: "manual" });
  assert.doesNotMatch(await mijn.text(), /bert@praktijk\.nl|06 1234 5678/, "oude cookie toont de aanmelding niet meer");

  // opnieuw aanmelden met hetzelfde e-mailadres maakt een nieuwe proef, geen klant
  const opnieuw = await formulier("/v2/proef", { email: "bert@praktijk.nl", naam: "Bert de Vries", tel: "06 1234 5679", praktijk: "", akkoord: "1", vwo: "1" });
  const opnieuwTekst = await opnieuw.text();
  assert.ok([303].includes(opnieuw.status), "aanmelden lukt: " + opnieuw.status + " " + (opnieuwTekst.match(/role="alert">[^<]*/g) || []).join(" | "));
  const na = Object.values(await proeven()).filter((p) => p.email === "bert@praktijk.nl");
  {
    assert.equal(na.length, 2, "een nieuwe aanmelding naast de fiscale kern");
    assert.ok(na.some((p) => !p.gewist && !p.klant), "de nieuwe proef is geen klant");
  }

  console.log("Gegevens van je praktijk: proefaanmelding in download en wissen.");
} catch (e) {
  console.error(appOutput.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
