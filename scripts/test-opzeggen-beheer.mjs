// Security (2026-11-11, security-backlog LAAG "abonnementsacties zonder beheerdersrol"):
// /v2/proef/opzeggen hing alleen aan de proefcookie van het apparaat. Op een gedeelde
// praktijkcomputer kon elke collega, ook met rol therapeut, het abonnement opzeggen; 30 dagen
// na de betaalde maand wist de server dan alle patiëntkaarten van de praktijk.
// Repro vóór de fix: cookie + actie=opzeggen&zeker=1 → 200 "Je abonnement is opgezegd".
// Nu: hoort de aanmelding bij een beveiligde praktijk, dan ook het wachtwoord van een
// beheerder (of het gedeelde praktijkwachtwoord zolang dat aan staat); anders 403 en een
// regel in Activiteit. Intrekken blijft zonder wachtwoord. Zonder browser.
// `npm run test:opzeggenbeheer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-opzeggen-beheer-"));
const nu = Date.now(), dag = 86400000;
const token = "e".repeat(48);
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  opz: { id: "opz", email: "eigenaar@opzeg.nl", naam: "Olga", tel: "+31612345678", praktijk: "Fysio Opzeg",
    gestart: nu - 40 * dag, verloopt: nu - 26 * dag, akkoord: nu - 40 * dag, tokens: [createHash("sha256").update(token).digest("hex")], klant: true,
    betaling: { id: "tr_opz", klant: "cst_opz", aantal: 2, status: "paid", gemaakt: nu - 20 * dag },
    abonnement: { status: "actief", aantal: 2, bedrag: "19.98", sinds: nu - 20 * dag, betaaldTot: nu + 10 * dag, eersteBetaling: "tr_opz", factuurNr: "FP-2026-0099" } }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const cookie = "fpproef=" + token;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.62.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.62.1." + (ip++), ...extra },
  body: new URLSearchParams(velden).toString() });
const opzeggen = (velden) => formulier("/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1", ...velden }, { cookie });
const status = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8")).opz.abonnement.status;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // praktijk beveiligen met de proefcookie: het account hangt nu aan deze aanmelding
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Opzeg", wachtwoord: "praktijk-wachtwoord", akkoord: true }, { cookie });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Olga Beheer", email: "olga@opzeg.nl", wachtwoord: "olga-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const O = ses(await eigen.json());
  const uitn = await post("/api/praktijk/team/uitnodigen", { email: "tim@opzeg.nl", naam: "Tim", rol: "therapeut" }, O);
  assert.equal(uitn.status, 200);
  const t = new URL((await uitn.json()).link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t, naam: "Tim Therapeut", wachtwoord: "tim-wachtwoord", regels: "1" })).status, 200);

  // 1. Mijn proef vraagt bij opzeggen om het wachtwoord van een beheerder
  const mijn = await (await get("/v2/proef?mijn=1", { cookie })).text();
  assert.match(mijn, /action="\/v2\/proef\/opzeggen"/);
  assert.match(mijn, /name="wachtwoord" type="password"/, "opzegformulier vraagt om een wachtwoord");

  // 2. alleen de cookie (een collega aan de praktijkcomputer): geweigerd
  let r = await opzeggen({});
  assert.equal(r.status, 403, "opzeggen zonder wachtwoord moet 403 geven (was " + r.status + ")");
  assert.match(await r.text(), /beheerder/);
  assert.equal(await status(), "actief", "abonnement loopt door");

  // 3. het eigen wachtwoord van een therapeut: geweigerd
  r = await opzeggen({ wachtwoord: "tim-wachtwoord" });
  assert.equal(r.status, 403, "therapeut mag niet opzeggen");
  r = await opzeggen({ wachtwoord: "fout-wachtwoord" });
  assert.equal(r.status, 403, "fout wachtwoord");
  assert.equal(await status(), "actief");

  // 4. beheerder met eigen wachtwoord: opgezegd, en Activiteit noemt wie
  r = await opzeggen({ wachtwoord: "olga-wachtwoord" });
  assert.equal(r.status, 200, "beheerder zegt op");
  assert.match(await r.text(), /Je abonnement is opgezegd/);
  assert.equal(await status(), "opgezegd");
  const act = (await (await get("/api/praktijk/activiteit", O)).json()).activiteit;
  const opgezegd = act.find((e) => e.actie === "abonnement-opgezegd");
  assert.ok(opgezegd, "opzeggen staat in Activiteit");
  assert.equal(opgezegd.wie, "Olga Beheer");
  assert.ok(act.some((e) => e.actie === "opzeggen-mislukt"), "geweigerde poging staat in Activiteit");

  // 5. intrekken blijft zonder wachtwoord (beschermt de praktijk)
  r = await formulier("/v2/proef/opzeggen", { actie: "intrekken" }, { cookie });
  assert.equal(r.status, 200);
  assert.equal(await status(), "actief", "opzegging ingetrokken");

  // 6. gedeeld praktijkwachtwoord werkt zolang het aan staat
  r = await opzeggen({ wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 200, "praktijkwachtwoord zegt op");
  assert.equal(await status(), "opgezegd");
  await formulier("/v2/proef/opzeggen", { actie: "intrekken" }, { cookie });
  assert.equal(await status(), "actief");

  // 7. praktijkwachtwoord uit: dan telt het niet meer
  assert.equal((await post("/api/praktijk/team/gedeeld-uit", { uit: true }, O)).status, 200);
  r = await opzeggen({ wachtwoord: "praktijk-wachtwoord" });
  assert.equal(r.status, 403, "uitgezet praktijkwachtwoord zegt niet op");
  assert.equal(await status(), "actief");

  // 8. rem: na 20 missers vanaf één verbinding 429, ook met het goede wachtwoord
  const vast = { cookie, "x-forwarded-for": "10.62.9.9" };
  for (let i = 0; i < 21; i++) await formulier("/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1", wachtwoord: "fout-" + i }, vast);
  r = await formulier("/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1", wachtwoord: "olga-wachtwoord" }, vast);
  assert.equal(r.status, 429, "rem na te veel missers");
  assert.equal(await status(), "actief");

  assert.doesNotMatch(uit, /TypeError|ReferenceError|SyntaxError/, "geen fout in het serverlog");
  console.log("test-opzeggen-beheer: ok (opzeggen alleen door een beheerder; intrekken vrij; rem en Activiteit)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
