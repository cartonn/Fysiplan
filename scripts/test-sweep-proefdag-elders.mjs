// Gebruikers-sweep 2026-11-13 (Mark + collega Lotte, drie runs open sinds 2026-11-12): de proefbalk met
// "laatste dag, t/m …" kwam alleen op het apparaat waar de proef begon (proefcookie). Op een tweede
// apparaat en bij collega's stond nergens dat de proef bijna afliep, tot opslaan ineens werd geweigerd.
// Nu krijgt /v2/app voor elke ingelogde sessie van de praktijk de einddatum mee, zonder naam, e-mail of
// telefoon van wie de proef aanmeldde, en zonder proefwelkom. Alleen een beheerder krijgt de link
// "Mijn proef". Zonder browser, past in CI. `npm run test:proefdag`
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
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefdag-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
// de proef verloopt kort na de start van de server: eerst lopend testen, daarna verlopen
const VERLOOPT_OVER = 10 * 3600000;
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
const adres = () => "10.81." + ((ip >> 8) & 255) + "." + (ip++ & 255);
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


const proefVan = (html) => {
  const m = html.match(/window\.FYSIPLAN_PROEF=(\{.*?\})<\/script>/);
  return m ? JSON.parse(m[1]) : null;
};
try {
  let r = await post("/api/praktijk/claim", { praktijk: "Fysio Duinzicht", wachtwoord: "Lang-wachtwoord-2026!", naam: "Mark Jansen",
    email: "mark@duinzicht.invalid", akkoord: true, regels: true }, PROEFCOOKIE);
  assert.equal(r.status, 200, await r.clone().text());
  const MARK = await inloggen("mark@duinzicht.invalid", "Lang-wachtwoord-2026!");
  const u = await (await post("/api/praktijk/team/uitnodigen", { email: "lotte@duinzicht.invalid", naam: "Lotte Bakker", rol: "therapeut" }, MARK)).json();
  assert.ok(u.ok, JSON.stringify(u));
  r = await formulier("/v2/uitnodiging", { t: new URL(u.link).searchParams.get("t"), naam: "Lotte Bakker", wachtwoord: "lotte-wachtwoord-2026", regels: "1" });
  assert.ok(r.status < 400, "Lotte neemt de uitnodiging aan: " + r.status);
  const LOTTE = await inloggen("lotte@duinzicht.invalid", "lotte-wachtwoord-2026");

  // apparaat van de aanmelding: zoals altijd, met voornaam voor het welkom
  let p = await pagina("/v2/app", PROEFCOOKIE);
  let d = proefVan(p.html);
  assert.ok(d, "proefcookie: proefbalk");
  assert.equal(d.naam, "Mark");
  assert.equal(d.dagenOver, 1, "laatste dag");
  assert.ok(!d.elders);

  // tweede apparaat van de beheerder: einddatum en de link naar zijn proef
  p = await pagina("/v2/app", MARK);
  assert.equal(p.status, 200);
  d = proefVan(p.html);
  assert.ok(d, "beheerder op tweede apparaat ziet de proefbalk");
  assert.equal(d.dagenOver, 1, "met 'laatste dag'");
  assert.ok(d.tot, "en de einddatum");
  assert.equal(d.elders, true, "geen proefwelkom of voorbeeldkaart");
  assert.equal(d.beheer, true);
  assert.equal(d.naam, "");
  assert.equal(d.praktijk, "Fysio Duinzicht");

  // collega: ook de einddatum, maar geen gegevens van de aanmelder en geen proeflink
  p = await pagina("/v2/app", LOTTE);
  d = proefVan(p.html);
  assert.ok(d, "collega ziet de proefbalk ook");
  assert.equal(d.dagenOver, 1);
  assert.equal(d.beheer, false);
  assert.doesNotMatch(p.html, /mark@duinzicht|Mark Jansen|612340000/, "geen e-mail, naam of telefoon van de aanmelder");

  // zonder sessie en zonder proefcookie: geen proef
  p = await pagina("/v2/app");
  assert.equal(proefVan(p.html), null, "zonder sessie geen proefbalk");

  // gebruikers-sweep 2026-11-13 18u/22u (Mark): wie op een tweede apparaat inlogt, had /v2/app al geladen
  // zonder sessie; de proefbalk kwam pas na herladen. /api/praktijk/status (dat de app na elke login
  // opnieuw vraagt) geeft nu dezelfde einddatum mee, zonder gegevens van de aanmelder.
  const status = async (extra) => {
    const r = await fetch(origin + "/api/praktijk/status?praktijk=" + encodeURIComponent("Fysio Duinzicht"),
      { headers: { "x-forwarded-for": adres(), ...extra } });
    return { status: r.status, tekst: await r.text() };
  };
  let st = await status(MARK);
  assert.equal(st.status, 200);
  let sd = JSON.parse(st.tekst);
  assert.ok(sd.proef, "status na inloggen noemt de lopende proef: " + st.tekst);
  assert.equal(sd.proef.dagenOver, 1, "met 'laatste dag'");
  assert.ok(sd.proef.tot, "en de einddatum");
  assert.equal(sd.proef.elders, true, "zonder proefwelkom of voorbeeldkaart");
  assert.equal(sd.proef.beheer, true);
  assert.equal(sd.proef.naam, "");
  st = await status(LOTTE);
  sd = JSON.parse(st.tekst);
  assert.ok(sd.proef, "collega krijgt de einddatum ook");
  assert.equal(sd.proef.beheer, false, "collega zonder link naar de proef");
  assert.doesNotMatch(JSON.stringify(sd.proef), /mark|Jansen|612340000/i, "geen gegevens van de aanmelder in de proefstand");
  sd = JSON.parse((await status()).tekst);
  assert.equal(sd.proef, undefined, "zonder sessie geen proef in de status");
  sd = JSON.parse((await status(PROEFCOOKIE)).tekst);
  assert.equal(sd.proef, undefined, "apparaat met proefcookie kreeg de proef al bij het laden");

  // de app gebruikt elders: geen welkom/voorbeeldkaart, collega zonder link "Mijn proef"
  const index = await readFile(join(root, "public", "index.html"), "utf8");
  assert.match(index, /d\.proef&&d\.proef\.elders&&!PROEF&&!PROEF_VOORBIJ\)\{PROEF=d\.proef;proefStart\(\);\}/,
    "na inloggen zet de app de proefbalk meteen neer (uit /api/praktijk/status)");
  assert.match(index, /if\(PROEF&&!PROEF\.elders\)\{try\{PROEF_VERS=/, "proefwelkom alleen op het apparaat van de aanmelding");
  assert.match(index, /PROEF\.elders&&!PROEF\.beheer/, "collega krijgt geen link naar de proefpagina");

  assert.doesNotMatch(log, /TypeError|ReferenceError/);
  console.log("PASS laatste proefdag ook op een tweede apparaat en bij collega's, zonder gegevens van de aanmelder");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
