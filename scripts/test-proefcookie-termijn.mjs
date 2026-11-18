// Legal 2026-11-18 (f, cookies): /privacy#opslag belooft dat de proefcookie (fpproef) zonder
// abonnement nooit langer leeft dan PROEF_BEWAAR dagen na het einde van de proef. De server gaf de
// cookie altijd een vaste Max-Age van PROEF_DAGEN + PROEF_BEWAAR dagen vanaf het uitgeven: wie op
// dag 13 (of na de proef) de persoonlijke link opende, hield hem tot ver na het wissen van de proef.
// Zonder browser, past in CI. `npm run test:proefcookietermijn`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROEF_DAGEN } from "../lib/proef.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefcookie-termijn-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const dag = 86400000, BEWAAR = 30, nu = Date.now();
const codeLaat = "a".repeat(48), codeKlant = "b".repeat(48);
const adres = (n) => ["praktijk" + n, "voorbeeld.invalid"].join("@");
const proef = (id, n, extra) => ({ id, email: adres(n), naam: "Test " + n, tel: "+31600000000", praktijk: "Proef " + n,
  akkoord: new Date(nu).toISOString(), tokens: [], kaarten: 0, ...extra });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  // proef zonder abonnement, 20 dagen geleden afgelopen: over 10 dagen wordt alles gewist
  laat0000000000001: proef("laat0000000000001", 1, { gestart: nu - (PROEF_DAGEN + 20) * dag, verloopt: nu - 20 * dag,
    mailLink: { h: sha(codeLaat), verloopt: nu + dag } }),
  // klant: wordt niet gewist, houdt de vaste levensduur
  klant000000000001: proef("klant000000000001", 2, { gestart: nu - 120 * dag, verloopt: nu - 106 * dag, klant: true,
    mailLink: { h: sha(codeKlant), verloopt: nu + dag } })
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 200 * dag }));

const s = createServer();
await new Promise((r) => s.listen(0, "127.0.0.1", r));
const port = s.address().port;
await new Promise((r) => s.close(r));
const origin = "http://127.0.0.1:" + port;
const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
  ACCOUNT_BEHEER_EMAILS: "", PROEF_MELDING_AAN: "", MAIL_API_SLEUTEL: "", MOLLIE_API_KEY: "" };
for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_|OMGEVING$|NODE_ENV$)/.test(k)) delete env[k];
let log = "";
const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
let ip = 1;
const terug = (code) => fetch(origin + "/v2/proef/terug", { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", origin, "x-forwarded-for": "10.77.0." + (ip++) },
  body: "code=" + code });
const maxAge = (r) => {
  const c = (r.headers.getSetCookie?.() || [String(r.headers.get("set-cookie") || "")]).find((x) => x.startsWith("fpproef=")) || "";
  assert.match(c, /^fpproef=[a-f0-9]{48};/, "proefcookie gezet: " + c);
  return Number((c.match(/Max-Age=(\d+)/) || [])[1]);
};
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  const laat = await terug(codeLaat);
  assert.equal(laat.status, 303, "de link uit de mail werkt");
  const ma = maxAge(laat), rest = (10 * dag) / 1000;
  assert.ok(ma <= rest && ma > rest - 120, "zonder abonnement leeft de cookie tot " + BEWAAR + " dagen na de proef (" + rest + " s), niet " + ma + " s");

  const kl = await terug(codeKlant);
  assert.equal(kl.status, 303, "de link werkt ook voor een klant");
  assert.equal(maxAge(kl), (PROEF_DAGEN + BEWAAR) * 86400, "een klant houdt de vaste levensduur");

  const privacy = await (await fetch(origin + "/privacy", { headers: { "x-forwarded-for": "10.77.1.1" } })).text();
  const rij = (privacy.match(/De proefcookie:[^<]*/) || [""])[0];
  assert.match(rij, new RegExp("nooit langer dan " + BEWAAR + " dagen na het einde van de proef"), "/privacy noemt de grens: " + rij);
  assert.match(rij, /Wis Fysiplan van dit apparaat/, "/privacy noemt dat Wis van dit apparaat de proefcookie weghaalt");
  assert.doesNotMatch(rij, /__/, "geen open invulplek");

  assert.ok(!/TypeError|ReferenceError|at .*server\.js/.test(log), "geen fout in het serverlog:\n" + log);
  console.log("PASS proefcookie leeft zonder abonnement niet langer dan de bewaartermijn van de proef");
} finally {
  app.kill(); await new Promise((r) => app.once("exit", r));
  await rm(dataDir, { recursive: true, force: true });
}
