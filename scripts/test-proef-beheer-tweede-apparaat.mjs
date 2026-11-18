// Gebruikers-sweep 2026-11-13 02u (Mark, iPad, tweede apparaat): de beheerder van een praktijk
// logde op een tweede apparaat in (eigen login met tweede stap, zonder proefcookie). De tegel
// "Proef en abonnement" en de knop "Wil je doorgaan?" openden het aanmeldformulier, en met zijn
// eigen e-mailadres kreeg hij "Met dit e-mailadres loopt al een proef" terwijl die voorbij was.
// Na een verlopen proef kon hij zo nergens doorgaan of betalen.
// Nu: /v2/proef en de formulieren erachter kennen ook de proef van de ingelogde praktijk, maar
// alleen voor een beheerder met een eigen login. Een collega (therapeut) ziet wie het regelt.
// Zonder browser, past in CI. `npm run test:proefbeheer`
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
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefbeheer-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
// de proef verloopt kort na de start van de server: eerst lopend testen, daarna verlopen
const VERLOOPT_OVER = 9000;
const tok = randomBytes(24).toString("hex");
const verloopt = Date.now() + VERLOOPT_OVER;
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proefmark0000001: { id: "proefmark0000001", email: "mark@duinzicht.invalid", naam: "Mark Jansen", tel: "+31612340000", akkoord: "x",
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
const adres = () => "10.79." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const pagina = async (pad, extra = {}) => {
  const r = await fetch(origin + pad, { redirect: "manual", headers: { "x-forwarded-for": adres(), ...extra } });
  return { status: r.status, waar: r.headers.get("location") || "", html: await r.text() };
};
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
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
const isFormulier = (h) => /Maak je eerste trainingskaart/.test(h);

try {
  // Mark beveiligt op het apparaat van de proef de praktijk met zijn eigen login
  let r = await post("/api/praktijk/claim", { praktijk: "Fysio Duinzicht", wachtwoord: "Lang-wachtwoord-2026!", naam: "Mark Jansen",
    email: "mark@duinzicht.invalid", akkoord: true, regels: true }, PROEFCOOKIE);
  assert.equal(r.status, 200, await r.clone().text());
  // op een tweede apparaat (geen proefcookie) logt hij in, net als een collega
  const MARK = await inloggen("mark@duinzicht.invalid", "Lang-wachtwoord-2026!");
  const u = await (await post("/api/praktijk/team/uitnodigen", { email: "lotte@duinzicht.invalid", naam: "Lotte Bakker", rol: "therapeut" }, MARK)).json();
  assert.ok(u.ok, JSON.stringify(u));
  r = await formulier("/v2/uitnodiging", { t: new URL(u.link).searchParams.get("t"), naam: "Lotte Bakker", wachtwoord: "lotte-wachtwoord-2026", regels: "1" });
  assert.ok(r.status < 400, "Lotte neemt de uitnodiging aan: " + r.status);
  const LOTTE = await inloggen("lotte@duinzicht.invalid", "lotte-wachtwoord-2026");

  // ---- proef loopt ----
  let p = await pagina("/v2/proef?mijn=1", MARK);
  assert.equal(p.status, 200);
  assert.ok(!isFormulier(p.html), "beheerder op tweede apparaat krijgt geen aanmeldformulier");
  assert.match(p.html, /Mijn proef/, "maar zijn eigen proef");
  assert.match(p.html, /Hoi Mark, je proef loopt nog/);
  p = await pagina("/v2/proef", MARK);
  assert.equal(p.status, 303, "zonder ?mijn gaat een lopende proef door naar de app");
  assert.equal(p.waar, "/v2/app");

  p = await pagina("/v2/proef?mijn=1", LOTTE);
  assert.ok(!isFormulier(p.html), "collega krijgt geen aanmeldformulier");
  assert.doesNotMatch(p.html, /mark@duinzicht|Mijn proef/, "en ziet geen proef- of betaalgegevens van de beheerder");
  assert.match(p.html, /regelt een beheerder van je praktijk/);

  p = await pagina("/v2/proef?mijn=1");
  assert.ok(isFormulier(p.html), "zonder sessie en zonder proefcookie blijft het het aanmeldformulier");

  // ---- proef voorbij ----
  await wacht(Math.max(0, verloopt - Date.now()) + 300);
  p = await pagina("/v2/proef", MARK);
  assert.equal(p.status, 200);
  assert.match(p.html, /Proefperiode voorbij/, "beheerder op tweede apparaat ziet de verlopen-pagina, met de weg om door te gaan");
  assert.ok(!isFormulier(p.html));

  // doorgaan: een collega kan het niet namens de praktijk, de beheerder wel
  r = await formulier("/v2/proef/doorgaan", {}, { ...LOTTE, origin });
  assert.equal(r.status, 303, "collega: terug naar /v2/proef");
  assert.equal((await proeven()).proefmark0000001.doorgaan, undefined, "collega zette niets in gang");
  r = await formulier("/v2/proef/doorgaan", {}, { ...MARK, origin });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /We bellen je binnen een werkdag/);
  assert.ok((await proeven()).proefmark0000001.doorgaan > 0, "de beheerder meldde dat hij door wil");

  // aanmeldformulier opnieuw met hetzelfde adres: de kop zegt niet meer dat de proef "loopt"
  r = await formulier("/v2/proef", { naam: "Mark Jansen", email: "mark@duinzicht.invalid", tel: "0612340000", praktijk: "Fysio Duinzicht",
    akkoord: "1", vwo: "1" }, { origin });
  const h = await r.text();
  assert.match(h, /Kijk in je mail/, "zelfde adres: link per mail, geen nieuwe proef");
  assert.match(h, /is al een proef gestart/, "na verloop geen 'loopt al een proef'");

  assert.doesNotMatch(log, /TypeError|ReferenceError/);
  console.log("PASS proef van de praktijk: beheerder op tweede apparaat ziet Mijn proef en de verlopen-pagina, collega ziet wie het regelt, doorgaan alleen door beheerder");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
