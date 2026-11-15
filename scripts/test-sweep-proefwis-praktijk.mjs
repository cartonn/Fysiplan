// Gebruikers-sweep 2026-11-15 (Karin, beheerder, iPad + API): op Mijn proef "Ja, wis mijn gegevens en stop
// mijn proef" wiste de aanmelding terwijl de proef van de praktijk gewoon doorliep (het slot staat op het
// account). De pagina zei "je proef is gestopt", er kwam niets in Activiteit, de beheerder kwam daarna niet
// meer op Mijn proef, en na de einddatum zat de praktijk op slot zonder weg naar doorgaan of betalen.
// Nu wist die route niets meer zodra er een praktijk aan de proef hangt; Mijn proef wijst naar Mijn gegevens.
// Zonder browser, past in CI. `npm run test:proefwispraktijk`
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
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefwispraktijk-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000;
const tok = randomBytes(24).toString("hex");
const verloopt = Date.now() + 10 * dag;
const KARIN = ["karin", "zandpad.invalid"].join("@");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  proefkarin000001: { id: "proefkarin000001", email: KARIN, naam: "Karin Smit", tel: "+31612340099", akkoord: "x",
    praktijk: "Fysio Zandpad", gestart: Date.now() - 4 * dag, verloopt, tokens: [sha(tok)] }
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
let app;
async function start() {
  app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (c) => { log += c; });
  app.stderr.on("data", (c) => { log += c; });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); }
}
async function stop() {
  if (!app || app.exitCode !== null) return;
  const weg = new Promise((r) => app.once("exit", r));
  app.kill();
  await weg;
}

let ip = 1;
const adres = () => "10.82." + ((ip >> 8) & 255) + "." + (ip++ & 255);
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": adres(), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const pagina = async (pad, extra = {}) => {
  const r = await fetch(origin + pad, { redirect: "manual", headers: { "x-forwarded-for": adres(), ...extra } });
  return { status: r.status, html: await r.text() };
};
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": adres(), origin, ...extra },
  body: new URLSearchParams(velden).toString() });
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
  return { "x-praktijk-sessie": d.sessie };
}
const lees = async (f) => JSON.parse(await readFile(join(dataDir, f), "utf8"));

try {
  await start();
  let r = await post("/api/praktijk/claim", { praktijk: "Fysio Zandpad", wachtwoord: "Lang-wachtwoord-2026!", naam: "Karin Smit",
    email: KARIN, akkoord: true, regels: true }, PROEFCOOKIE);
  assert.equal(r.status, 200, await r.clone().text());
  const SES = await inloggen(KARIN, "Lang-wachtwoord-2026!");
  const BEHEER = { ...PROEFCOOKIE, ...SES };

  // Mijn proef: geen wisformulier dat de proef belooft te stoppen, maar de weg naar Mijn gegevens
  let p = await pagina("/v2/proef?mijn=1", BEHEER);
  assert.equal(p.status, 200);
  assert.doesNotMatch(p.html, /stop mijn proef|stopt je proef direct|action="\/v2\/proef\/wissen"/, "geen wisformulier bij een praktijk");
  assert.match(p.html, /Je proef hoort nu bij je praktijk/);
  assert.match(p.html, /href="\/v2\/gegevens"/, "knop naar Mijn gegevens");

  // een oude pagina of een direct verzoek: niets gewist, en dat staat er ook
  r = await formulier("/v2/proef/wissen", { zeker: "1" }, BEHEER);
  const na = await r.text();
  assert.equal(r.status, 409);
  assert.match(na, /Er is niets gewist/);
  assert.doesNotMatch(na, /proef is gestopt|Je gegevens zijn gewist/);
  assert.ok((await lees("proef-aanmeldingen.json")).proefkarin000001?.email === KARIN, "aanmelding staat er nog");
  assert.ok(!/fpproef=;/.test(r.headers.get("set-cookie") || ""), "proefcookie niet leeggemaakt");

  // de beheerder komt daarna gewoon op Mijn proef (betalen en doorgaan blijven bereikbaar)
  p = await pagina("/v2/proef?mijn=1", BEHEER);
  assert.match(p.html, /Mijn proef/);
  assert.doesNotMatch(p.html, /regelt een beheerder van je praktijk/);

  assert.doesNotMatch(log, /TypeError|ReferenceError/);
  console.log("PASS proef wissen bij een beveiligde praktijk wist niets en wijst naar Mijn gegevens");
} catch (e) {
  console.error(log.slice(-3000));
  throw e;
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
}
