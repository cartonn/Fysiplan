// Security (2026-11-12):
// 1. Een apparaattoken van de proef (cookie fpproef) gold op de server zolang de aanmelding bestond.
//    De cookie zelf vervalt na PROEF_DAGEN + 30 dagen, maar wie hem kopieerde (gedeelde computer,
//    back-up van een browserprofiel) hield ook maanden later, ook bij een betalende klant, het
//    abonnementsbeheer: opzeggen, factuurgegevens, facturen, en "Mijn proef" met naam en telefoon.
//    Nu leeft een token op de server even lang als de cookie, vanaf het uitgeven. Een token van
//    vóór deze regel telt vanaf de eerste start erna, en dat moment wordt meteen bewaard.
// 2. `<script>@x.nl` gold als e-mailadres (uitnodigen, eigen login, aanmelden). Nu niet meer.
// Zonder browser. `npm run test:proeftokenverloop`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROEF_DAGEN, geldigEmail, valideerAanmelding } from "../lib/proef.js";

// ---- 2. e-mailadressen ----
for (const goed of ["a@b.nl", "anna.de-vries+fysio@praktijk-zonnig.co.uk", "o'brien@fysio.nl", "x_y@sub.domein.com"]) assert.ok(geldigEmail(goed), goed);
for (const fout of ["<script>@x.nl", "a<b>@x.nl", "\"a\"@x.nl", "a,b@x.nl", "a;b@x.nl", "a:b@x.nl", "a(b)@x.nl", "a[b]@x.nl", "a\\b@x.nl",
  "a@<b>.nl", "a@b'c.nl", "a@b.c", "a b@x.nl", "a@@x.nl", "", null]) assert.ok(!geldigEmail(fout), String(fout));
assert.ok(valideerAanmelding({ email: "a;b(c)@x.nl", naam: "Anna", tel: "0612345678", praktijk: "Zonnig", akkoord: "1" }).fouten.email,
  "aanmelden weigert het adres ook");

// ---- 1. tokens van de proef ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proef-token-verloop-"));
const nu = Date.now(), dag = 86400000, COOKIE_MS = (PROEF_DAGEN + 30) * dag;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tVers = "1".repeat(48), tOud = "2".repeat(48), tLegacy = "3".repeat(48), tGrens = "4".repeat(48);
const klant = (id, tokens, tokenT) => ({ id, email: id + "@praktijk.nl", naam: "Anna", tel: "+31612345678", praktijk: id + " Fysio",
  gestart: nu - 120 * dag, verloopt: nu - 106 * dag, akkoord: nu - 120 * dag, tokens: tokens.map(hash), ...(tokenT ? { tokenT } : {}), klant: true,
  abonnement: { status: "actief", aantal: 1, bedrag: "9.99", sinds: nu - 100 * dag, betaaldTot: nu + 5 * dag } });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  vers: klant("vers", [tVers], { [hash(tVers)]: nu - 2 * dag }),
  oud: klant("oud", [tOud, tGrens], { [hash(tOud)]: nu - 100 * dag, [hash(tGrens)]: nu - COOKIE_MS + 60000 }),
  legacy: klant("legacy", [tLegacy])
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(env)) if (/^(RAILWAY|BACKUP|OMGEVING$|NODE_ENV$)/.test(k)) delete env[k];
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
let ip = 1;
const mijn = (token) => fetch(origin + "/v2/proef?mijn=1", { redirect: "manual",
  headers: { cookie: "fpproef=" + token, "x-forwarded-for": "10.9.0." + (ip++) } });
const isMijn = async (r, id) => r.status === 200 && (await r.text()).includes(id + "@praktijk.nl");
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  assert.ok(await isMijn(await mijn(tVers), "vers"), "een token van twee dagen oud werkt");
  assert.ok(await isMijn(await mijn(tGrens), "oud"), "een token net binnen de levensduur van de cookie werkt");
  assert.ok(!(await isMijn(await mijn(tOud), "oud")), "een token ouder dan de cookie geeft geen toegang meer tot Mijn proef");
  const opzeg = await fetch(origin + "/v2/proef/opzeggen", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: "fpproef=" + tOud, "x-forwarded-for": "10.9.1.1" }, body: "actie=opzeggen&zeker=1" });
  assert.equal(opzeg.status, 303, "opzeggen met een verlopen token stuurt terug naar de proefpagina");
  assert.equal(opzeg.headers.get("location"), "/v2/proef");
  assert.ok(await isMijn(await mijn(tLegacy), "legacy"), "een token van vóór deze regel blijft werken");

  const na = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
  assert.equal(na.oud.abonnement.status, "actief", "niet opgezegd met het verlopen token");
  assert.ok(Number.isFinite(na.legacy.tokenT?.[hash(tLegacy)]) && Math.abs(na.legacy.tokenT[hash(tLegacy)] - nu) < 60000,
    "het oude token krijgt bij de start een moment van uitgeven, en dat staat op schijf");
  assert.equal(na.vers.tokenT[hash(tVers)], nu - 2 * dag, "een bestaand moment blijft staan");

  // een nieuwe aanmelding: het token staat met een moment op schijf en werkt
  const r = await fetch(origin + "/v2/proef", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.2.1" },
    body: new URLSearchParams({ email: "nieuw@zonnig.nl", naam: "Nina", tel: "0687654321", praktijk: "Zonnig", akkoord: "1", vwo: "1" }).toString() });
  assert.equal(r.status, 303, "aanmelden lukt");
  const cookie = String(r.headers.get("set-cookie") || "");
  const token = (cookie.match(/fpproef=([a-f0-9]{48})/) || [])[1];
  assert.ok(token, "proefcookie gezet");
  assert.match(cookie, new RegExp("Max-Age=" + COOKIE_MS / 1000 + "(;|$)"), "cookie en server rekenen met dezelfde levensduur");
  await new Promise((res) => setTimeout(res, 300));
  const p = Object.values(JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"))).find((x) => x.email === "nieuw@zonnig.nl");
  assert.ok(Number.isFinite(p.tokenT[hash(token)]), "nieuw token met moment van uitgeven");
  assert.ok(await isMijn(await mijn(token), "nieuw").catch(() => false) || (await (await mijn(token)).text()).includes("nieuw@zonnig.nl"), "het nieuwe token werkt");

  assert.ok(!/TypeError|ReferenceError|at .*server\.js/.test(uitvoer), "geen fout in het serverlog:\n" + uitvoer);
  console.log("ok: proeftokens verlopen op de server met de cookie, e-mailadressen zonder <>\"(),;:[]\\");
} finally {
  app.kill(); await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
