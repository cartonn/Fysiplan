// Herstelcode na "gedeeld praktijkwachtwoord uit" (security, 2026-11-07).
// De herstelcode ligt op papier in de praktijkmap, dus ook een collega die al uit het team
// is kent hem. Zonder deze fix kon die via /api/praktijk/herstel het gedeelde wachtwoord
// omzetten, kreeg elke keer een verse herstelcode en logde het hele team uit.
// - Zolang het gedeelde wachtwoord aan staat, werkt herstel en blijven eigen logins ingelogd.
// - Staat het uit, dan weigert herstel (401, perEmail) en verandert er niets.
// - Weer aanzetten kan alleen met een nieuw wachtwoord; de oude code vervalt (2026-11-08).
// - /api/kaart/vraag met een kapotte body geeft 400, geen 502.
// Zonder browser, past in CI. `npm run test:teamherstel`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-teamherstel-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Herstel", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const cj = await claim.json();
  const G = ses(cj);
  let code = cj.herstelcode;
  assert.match(code, /^FP-/, "claim geeft een herstelcode");

  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: "sanne@herstel.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const S = ses(await eigen.json());

  // ---- gedeeld wachtwoord nog aan: herstel werkt, de eigen login blijft ingelogd ----
  const h1 = await post("/api/praktijk/herstel", { praktijk: "Fysio Herstel", herstelcode: code, nieuw: "nieuw-praktijkww" });
  assert.equal(h1.status, 200);
  code = (await h1.json()).herstelcode;
  assert.equal((await get("/api/praktijk/team", S)).status, 200, "eigen login blijft ingelogd na herstel van het gedeelde wachtwoord");
  assert.equal((await get("/api/praktijk/team", G)).status, 401, "oude sessie met het gedeelde wachtwoord vervalt");

  // ---- gedeeld wachtwoord uit ----
  assert.equal((await post("/api/praktijk/team/gedeeld-uit", {}, S)).status, 200);
  const voor = await readFile(join(dataDir, "praktijk-accounts.json"), "utf8");

  // een oud-collega met de herstelcode van papier
  const h2 = await post("/api/praktijk/herstel", { praktijk: "Fysio Herstel", herstelcode: code, nieuw: "aanvaller-ww-123" });
  assert.equal(h2.status, 401, "herstel weigert als de praktijk met eigen logins werkt");
  const j2 = await h2.json();
  assert.equal(j2.perEmail, true);
  assert.equal(j2.sessie, undefined, "geen sessie");
  assert.equal(j2.herstelcode, undefined, "geen nieuwe herstelcode");
  assert.equal(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"), voor, "account onveranderd");
  assert.equal((await get("/api/praktijk/team", S)).status, 200, "het team blijft ingelogd");

  // ---- gedeeld wachtwoord weer aan: alleen met een nieuw wachtwoord en een nieuwe code ----
  // (security 2026-11-08) het oude wachtwoord en de oude code kende ook een oud-collega
  const zonder = await post("/api/praktijk/team/gedeeld-uit", { uit: false }, S);
  assert.equal(zonder.status, 400, "weer aanzetten zonder nieuw wachtwoord wordt geweigerd");
  assert.equal((await zonder.json()).wachtwoord, true);
  assert.equal((await post("/api/praktijk/team/gedeeld-uit", { uit: false, wachtwoord: "kort" }, S)).status, 400);
  assert.equal((await post("/api/praktijk/login", { praktijk: "Fysio Herstel", wachtwoord: "nieuw-praktijkww" })).status, 401,
    "na een geweigerde poging blijft het gedeelde wachtwoord uit");
  const aan = await post("/api/praktijk/team/gedeeld-uit", { uit: false, wachtwoord: "vers-praktijkww" }, S);
  assert.equal(aan.status, 200);
  const aj = await aan.json();
  assert.equal(aj.gedeeldUit, false);
  assert.match(aj.herstelcode || "", /^FP-/, "weer aanzetten geeft een nieuwe herstelcode");
  assert.notEqual(aj.herstelcode, code);
  assert.equal((await post("/api/praktijk/login", { praktijk: "Fysio Herstel", wachtwoord: "nieuw-praktijkww" })).status, 403,
    "het oude gedeelde wachtwoord werkt niet meer");
  assert.equal((await post("/api/praktijk/herstel", { praktijk: "Fysio Herstel", herstelcode: code, nieuw: "aanvaller-ww-456" })).status, 403,
    "de oude herstelcode van papier werkt niet meer");
  assert.equal((await post("/api/praktijk/login", { praktijk: "Fysio Herstel", wachtwoord: "vers-praktijkww" })).status, 200,
    "het nieuwe gedeelde wachtwoord werkt");
  const h3 = await post("/api/praktijk/herstel", { praktijk: "Fysio Herstel", herstelcode: aj.herstelcode, nieuw: "weer-eigen-ww" });
  assert.equal(h3.status, 200, "de nieuwe herstelcode werkt");
  assert.equal((await get("/api/praktijk/team", S)).status, 200);
  // al aan: nogmaals aanzetten verandert niets en vraagt geen wachtwoord
  const nogmaals = await post("/api/praktijk/team/gedeeld-uit", { uit: false }, S);
  assert.equal(nogmaals.status, 200);
  assert.equal((await nogmaals.json()).herstelcode, undefined);
  assert.equal((await post("/api/praktijk/login", { praktijk: "Fysio Herstel", wachtwoord: "weer-eigen-ww" })).status, 200);

  // ---- vraaghulp: een kapotte body is 400, geen 502 "even niet bereikbaar" ----
  for (const body of ["{", "null", "[]", "42", "geen json"]) {
    const r = await fetch(origin + "/api/kaart/vraag", { method: "POST", headers: kop(), body });
    assert.equal(r.status, 400, "kapotte body " + JSON.stringify(body) + " geeft 400");
  }

  console.log("test-team-herstel: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
