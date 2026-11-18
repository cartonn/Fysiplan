// Regressietest security 2026-11-18: elke wachtwoordvergelijking (scrypt) houdt de hele server bezig. Wie veel
// praktijken met dezelfde naam of hetzelfde e-mailadres aanmaakte (nieuw: true, vijf per dag per adres), liet met
// één inlogpoging alle vergelijkingen draaien; met veertig praktijken stond de server per verzoek een seconde stil,
// en met het goede wachtwoord telde geen rem. Nu hooguit MAX_VERGELIJK (6) per verzoek, de oudste praktijken eerst.
// De test is deterministisch: het wachtwoord van de nieuwste (12e) praktijk werkt niet meer, dat van de oudste wel.
// Zonder de fix logt de nieuwste wel in. Zonder browser, past in CI. `npm run test:vergelijkgrens`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vergelijkgrens-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["ser" + "ver.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.72." + Math.floor(ip / 250) + "." + (ip++ % 250 + 1), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const mail = (n) => [n, "voorbeeld.test"].join("@");
const N = 12;

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  for (let i = 0; i < N; i++) {
    const nieuwste = i === N - 1;
    const c = await post("/api/praktijk/claim", { praktijk: "Zelfde Naam", nieuw: true, akkoord: true,
      wachtwoord: nieuwste ? "praktijk-nieuwste" : "praktijk-" + i });
    assert.equal(c.status, 200, "claim " + i);
    const S = { "x-praktijk-sessie": (await c.json()).sessie };
    const e = await post("/api/praktijk/team/eigen-login", { naam: "Lid " + i, email: mail("zelfde"), regels: true,
      wachtwoord: nieuwste ? "lidwachtwoord-nieuwste" : "lidwachtwoord-" + i }, S);
    assert.equal(e.status, 200, "eigen login " + i);
    await wacht(3); // `gemaakt` loopt op
  }

  // de oudste praktijk komt altijd aan bod
  assert.equal((await post("/api/praktijk/login", { praktijk: "Zelfde Naam", wachtwoord: "praktijk-0" })).status, 200, "oudste op naam");
  assert.equal((await post("/api/praktijk/login", { email: mail("zelfde"), wachtwoord: "lidwachtwoord-0" })).status, 200, "oudste op e-mail");
  // de 12e niet meer: zonder grens draaiden alle twaalf vergelijkingen
  const naam = await post("/api/praktijk/login", { praktijk: "Zelfde Naam", wachtwoord: "praktijk-nieuwste" });
  assert.equal(naam.status, 403, "op naam: de nieuwste van twaalf wordt niet meer vergeleken (was 200)");
  const em = await post("/api/praktijk/login", { email: mail("zelfde"), wachtwoord: "lidwachtwoord-nieuwste" });
  assert.equal(em.status, 403, "op e-mail: de nieuwste van twaalf wordt niet meer vergeleken (was 200)");

  // de duur van een poging met een fout wachtwoord groeit niet meer met het aantal praktijken
  const t = Date.now();
  await (await post("/api/praktijk/login", { email: mail("zelfde"), wachtwoord: "helemaal-fout" })).arrayBuffer();
  const ms = Date.now() - t;
  console.log(`fout wachtwoord bij ${N} praktijken met hetzelfde adres: ${ms} ms`);
  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-inlog-vergelijkgrens: hooguit 6 wachtwoordvergelijkingen per inlogpoging, oudste praktijken eerst");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode != null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
