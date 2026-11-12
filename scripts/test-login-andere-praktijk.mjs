// Regressietest gebruikers-sweep 2026-11-12 06u (Karin, beheerder): inloggen met e-mail en wachtwoord negeerde de
// praktijknaam op het scherm als de login maar bij één praktijk hoorde. Een verwijderde collega met een login bij een
// andere praktijk kwam zo stil bij die andere praktijk binnen, terwijl het scherm de eerste praktijk liet zien.
// Nu: 409 met de naam van de eigen praktijk; zonder praktijknaam of met de goede naam (of praktijkcode) gewoon 200.
// Zonder browser, past in CI. `npm run test:loginanderepraktijk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-loginander-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.67.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const alfa = await post("/api/praktijk/claim", { praktijk: "Praktijk Alfa", wachtwoord: "alfa-wachtwoord", akkoord: true });
  assert.equal(alfa.status, 200);
  const beta = await post("/api/praktijk/claim", { praktijk: "Praktijk Beta", wachtwoord: "beta-wachtwoord", akkoord: true });
  assert.equal(beta.status, 200);
  const B = ses(await beta.json());
  // Tom heeft alleen bij Beta een eigen login
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Tom Test", email: "tom@voorbeeld.test", wachtwoord: "tom-wachtwoord", regels: true }, B);
  assert.equal(eigen.status, 200, "eigen login bij Beta");

  // op het scherm van Alfa: geen stille login bij Beta
  const mis = await post("/api/praktijk/login", { praktijk: "Praktijk Alfa", email: "tom@voorbeeld.test", wachtwoord: "tom-wachtwoord" });
  assert.equal(mis.status, 409, "login hoort bij een andere praktijk: 409");
  const md = await mis.json();
  assert.equal(md.sessie, undefined, "geen sessie bij de andere praktijk");
  assert.deepEqual(md.kies, ["Praktijk Beta"], "noemt de eigen praktijk");
  assert.match(md.fout, /hoort niet bij deze praktijk.*Praktijk Beta/, "begrijpelijke zin");

  // goede naam (ook andere hoofdletters), zonder naam, en een fout wachtwoord blijven zoals ze waren
  const goed = await post("/api/praktijk/login", { praktijk: "praktijk beta", email: "tom@voorbeeld.test", wachtwoord: "tom-wachtwoord" });
  assert.equal(goed.status, 200, "goede praktijknaam: ingelogd");
  assert.equal((await goed.json()).praktijk, "Praktijk Beta");
  assert.equal((await post("/api/praktijk/login", { email: "tom@voorbeeld.test", wachtwoord: "tom-wachtwoord" })).status, 200, "zonder praktijknaam: ingelogd");
  const fout = await post("/api/praktijk/login", { praktijk: "Praktijk Alfa", email: "tom@voorbeeld.test", wachtwoord: "fout-wachtwoord" });
  assert.equal(fout.status, 403, "fout wachtwoord blijft 'klopt niet', zonder praktijknaam te verraden");
  assert.equal((await fout.json()).kies, undefined);
  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-login-andere-praktijk: login bij een andere praktijk 409 met uitleg, goede naam en zonder naam 200");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await wacht(200);
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
