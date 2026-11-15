// Security 2026-11-15 (audit c, proef-tokens): de proefcookie alleen gaf ook nadat de praktijk een
// beheerder met eigen login had de hele proef- en abonnementskant: Mijn proef met e-mail en telefoon
// van de aanmelder, facturen, factuurgegevens, betalen en "gegevens wissen". Op een gedeelde
// praktijkcomputer waar de aanmelder ooit begon (de cookie leeft 44 dagen) kon zo een collega met de rol
// therapeut, of iemand die niet eens was ingelogd, wat de server verder alleen een beheerder geeft.
// Nu telt de proefcookie daar alleen zolang de praktijk nog geen beheerder met eigen login heeft.
// Zonder browser, past in CI. `npm run test:proefcookiebeheer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeVoor, stapVan } from "../lib/totp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefcookie-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const VERLOOPT_OVER = 9000;
const tok = randomBytes(24).toString("hex");
const verloopt = Date.now() + VERLOOPT_OVER;
const MARK_ADRES = ["mark", "duinzicht.invalid"].join("@");
const LOTTE_ADRES = ["lotte", "duinzicht.invalid"].join("@");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proefmark0000002: { id: "proefmark0000002", email: MARK_ADRES, naam: "Mark Jansen", tel: "+31612349876", akkoord: "x",
    praktijk: "Fysio Duinzicht", gestart: Date.now() - 13 * dag, verloopt, tokens: [sha(tok)] }
}));
const PROEFCOOKIE = { cookie: "fpproef=" + tok };

async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
  ACCOUNT_BEHEER_EMAILS: "", PROEF_MELDING_AAN: "", MAIL_API_SLEUTEL: "", EIGEN_LOGIN_VERPLICHT: "aan", PROEF_VERPLICHT: "aan" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV") delete kind[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

let ip = 1;
const adres = () => "10.81." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const pagina = async (pad, extra = {}) => {
  const r = await fetch(origin + pad, { redirect: "manual", headers: { "x-forwarded-for": adres(), ...extra } });
  return { status: r.status, waar: r.headers.get("location") || "", html: await r.text() };
};
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), origin, ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const met = (a, b) => ({ ...a, ...b });
const laatst = new Map();
function vers(geheim) {
  const s = Math.max(stapVan(Date.now()), (laatst.get(geheim) || 0) + 1);
  laatst.set(geheim, s);
  return codeVoor(geheim, s);
}
async function inloggen(email, wachtwoord) {
  let d = await (await post("/api/praktijk/login", { email, wachtwoord })).json();
  assert.equal(d.stapInstellen, true, JSON.stringify(d));
  const r = await post("/api/praktijk/login", { email, wachtwoord, geheim: d.geheim, code: vers(d.geheim) });
  d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return ses(d);
}
const proeven = async () => JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
const lekt = /mark@duinzicht|12349876|1234 ?9876|Mijn proef/;

try {
  // vóór het beveiligen is de proefcookie de enige sleutel: Mijn proef blijft gewoon werken
  let p = await pagina("/v2/proef?mijn=1", PROEFCOOKIE);
  assert.equal(p.status, 200);
  assert.match(p.html, /Mijn proef/, "nog niet beveiligd: de proefcookie opent Mijn proef");
  const status = async () => (await pagina("/api/praktijk/status?praktijk=" + encodeURIComponent("Fysio Duinzicht"), PROEFCOOKIE)).html;
  assert.match(await status(), /"voorstel":\{[^}]*mark@duinzicht/, "vóór het beveiligen: naam en e-mail als voorzet");

  // Mark beveiligt de praktijk met zijn eigen login (beheerder) en nodigt Lotte uit als therapeut
  let r = await post("/api/praktijk/claim", { praktijk: "Fysio Duinzicht", wachtwoord: "Lang-wachtwoord-2026!", naam: "Mark Jansen",
    email: MARK_ADRES, akkoord: true, regels: true }, PROEFCOOKIE);
  assert.equal(r.status, 200, await r.clone().text());
  const MARK = await inloggen(MARK_ADRES, "Lang-wachtwoord-2026!");
  const u = await (await post("/api/praktijk/team/uitnodigen", { email: LOTTE_ADRES, naam: "Lotte Bakker", rol: "therapeut" }, MARK)).json();
  assert.ok(u.ok, JSON.stringify(u));
  r = await formulier("/v2/uitnodiging", { t: new URL(u.link).searchParams.get("t"), naam: "Lotte Bakker", wachtwoord: "lotte-wachtwoord-2026", regels: "1" });
  assert.ok(r.status < 400, "Lotte neemt de uitnodiging aan: " + r.status);
  const LOTTE = await inloggen(LOTTE_ADRES, "lotte-wachtwoord-2026");

  // ---- de gedeelde computer: de proefcookie van Mark staat er nog ----
  assert.doesNotMatch(await status(), /mark@duinzicht|"voorstel"/, "na het beveiligen geen voorzet met naam en e-mail meer");
  p = await pagina("/v2/proef?mijn=1", PROEFCOOKIE);
  assert.equal(p.status, 200);
  assert.doesNotMatch(p.html, lekt, "niet ingelogd met alleen de proefcookie: geen Mijn proef, e-mail of telefoon");
  assert.match(p.html, /regelt een beheerder van je praktijk/);
  p = await pagina("/v2/proef?mijn=1", met(PROEFCOOKIE, LOTTE));
  assert.doesNotMatch(p.html, lekt, "collega (therapeut) met de proefcookie ziet de proef niet");
  assert.match(p.html, /regelt een beheerder van je praktijk/);
  p = await pagina("/v2/proef?mijn=1", met(PROEFCOOKIE, MARK));
  assert.match(p.html, /Mijn proef/, "de beheerder zelf ziet zijn proef wel");

  // gegevens wissen en doorgaan: met alleen de proefcookie of als collega gebeurt er niets
  for (const wie of [PROEFCOOKIE, met(PROEFCOOKIE, LOTTE)]) {
    r = await formulier("/v2/proef/wissen", { zeker: "1" }, wie);
    assert.doesNotMatch(await r.text(), /Je gegevens zijn gewist/);
    r = await formulier("/v2/proef/doorgaan", {}, wie);
    assert.equal(r.status, 303);
  }
  let pr = (await proeven()).proefmark0000002;
  assert.ok(pr && !pr.gewist && pr.email === MARK_ADRES, "de aanmelding staat er nog");
  assert.equal(pr.doorgaan, undefined, "niemand meldde namens de praktijk dat hij doorgaat");
  r = await fetch(origin + "/v2/proef/factuur", { headers: { "x-forwarded-for": adres(), ...PROEFCOOKIE } });
  assert.doesNotMatch(await r.text(), lekt, "factuurpagina noemt niets van de aanmelding");

  // opnieuw aanmelden met hetzelfde adres vanaf die computer: contactgegevens blijven, link per mail
  r = await formulier("/v2/proef", { naam: "Iemand Anders", email: MARK_ADRES, tel: "0687654321", praktijk: "Fysio Duinzicht",
    akkoord: "1", vwo: "1" }, PROEFCOOKIE);
  assert.match(await r.text(), /Kijk in je mail/, "zelfde adres: link per mail");
  pr = (await proeven()).proefmark0000002;
  assert.equal(pr.naam, "Mark Jansen", "naam van de aanmelder niet overschreven");
  assert.equal(pr.tel, "+31612349876", "telefoon van de aanmelder niet overschreven");

  // ---- proef voorbij: de verlopen-pagina blijft (overzicht met wachtwoord), zonder telefoon of betaalknop ----
  await wacht(Math.max(0, verloopt - Date.now()) + 300);
  p = await pagina("/v2/app", PROEFCOOKIE);
  assert.match(p.html, /Proefperiode voorbij/);
  assert.doesNotMatch(p.html, lekt, "verlopen-pagina op de gedeelde computer zonder telefoon van de aanmelder");
  assert.match(p.html, /regelt een beheerder van je praktijk/);
  p = await pagina("/v2/proef", PROEFCOOKIE);
  assert.match(p.html, /Proefperiode voorbij/, "ook via /v2/proef de verlopen-pagina");
  // het overzicht na de proef werkt nog met de proefcookie (en het wachtwoord van een lid)
  r = await formulier("/v2/proef/overzicht", { praktijk: "Fysio Duinzicht", email: LOTTE_ADRES, wachtwoord: "fout-wachtwoord" }, PROEFCOOKIE);
  assert.equal(r.status, 403, "overzicht bereikbaar, fout wachtwoord geweigerd");
  assert.doesNotMatch(await r.text(), lekt);
  p = await pagina("/v2/proef", met(PROEFCOOKIE, MARK));
  assert.match(p.html, /Proefperiode voorbij/);
  assert.doesNotMatch(p.html, /het nummer van de aanmelding/, "de beheerder ziet zijn eigen telefoonnummer wel");

  assert.doesNotMatch(log, /TypeError|ReferenceError/);
  console.log("PASS proefcookie geeft na het beveiligen geen proef- of abonnementskant meer zonder beheerderssessie");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
