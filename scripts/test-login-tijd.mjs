// Regressietest security 2026-11-16 08u: inloggen met een onbekend e-mailadres (of een onbekende praktijknaam)
// deed geen enkele wachtwoordvergelijking en kwam tientallen milliseconden sneller terug dan een bekend adres met
// een fout wachtwoord. Aan de duur was dus te zien of een adres een login heeft. Nu kost elk antwoord minstens één
// scrypt-vergelijking. De test vergelijkt de mediaan van beide; zonder de fix is onbekend ruim 10× sneller.
// Zonder browser, past in CI. `npm run test:logintijd`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-logintijd-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.71." + Math.floor(ip / 250) + "." + (ip++ % 250 + 1), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const mail = (n) => [n, "voorbeeld.test"].join("@");
const mediaan = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
async function duur(body) {
  const t = process.hrtime.bigint();
  const r = await post("/api/praktijk/login", body);
  await r.arrayBuffer();
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, status: r.status };
}

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: "Praktijk Tijd", wachtwoord: "tijd-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200, "claim");
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Tom Test", email: mail("tom"), wachtwoord: "tom-wachtwoord", regels: true }, S);
  assert.equal(eigen.status, 200, "eigen login");

  // om en om, zodat een trage seconde van de machine beide rijen raakt; hooguit 8 per adres/naam (rem bij 10)
  const bekend = [], onbekend = [], naamBekend = [], naamOnbekend = [];
  for (let i = 0; i < 8; i++) {
    const a = await duur({ email: mail("tom"), wachtwoord: "fout-" + i });
    const b = await duur({ email: mail("niemand" + i), wachtwoord: "fout-" + i });
    const c = await duur({ praktijk: "Praktijk Tijd", wachtwoord: "fout-" + i });
    const d = await duur({ praktijk: "Praktijk Bestaat Niet " + i, wachtwoord: "fout-" + i });
    for (const x of [a, b, c, d]) assert.equal(x.status, 403, "fout wachtwoord of onbekend: 403");
    bekend.push(a.ms); onbekend.push(b.ms); naamBekend.push(c.ms); naamOnbekend.push(d.ms);
  }
  const [mb, mo, nb, no] = [bekend, onbekend, naamBekend, naamOnbekend].map(mediaan);
  console.log(`mediaan e-mail bekend ${mb.toFixed(1)} ms, onbekend ${mo.toFixed(1)} ms; naam bekend ${nb.toFixed(1)} ms, onbekend ${no.toFixed(1)} ms`);
  assert.ok(mo >= mb * 0.5, `onbekend e-mailadres komt veel sneller terug (${mo.toFixed(1)} vs ${mb.toFixed(1)} ms): de duur verraadt of er een login is`);
  assert.ok(no >= nb * 0.5, `onbekende praktijknaam komt veel sneller terug (${no.toFixed(1)} vs ${nb.toFixed(1)} ms)`);

  // het goede wachtwoord werkt nog
  assert.equal((await post("/api/praktijk/login", { email: mail("tom"), wachtwoord: "tom-wachtwoord" })).status, 200, "eigen login werkt");
  assert.doesNotMatch(uit, /TypeError|ReferenceError/, "geen serverfout");
  console.log("test-login-tijd: onbekend adres en onbekende naam duren even lang als een fout wachtwoord");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => (app.exitCode != null ? r() : app.once("exit", r)));
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
