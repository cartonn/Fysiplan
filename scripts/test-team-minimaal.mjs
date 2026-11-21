// Legal 2026-11-21 (gebruikers-sweep 10u, Karin op iPad): een gewone therapeut zag onder Team van elke collega
// wanneer die het laatst inlogde en of de tweede stap aan stond. Dat is beheerwerk (art. 5 lid 1 c AVG,
// dataminimalisatie): een therapeut ziet van collega's alleen naam, e-mail, rol en status, van zichzelf alles.
// De beheerder ziet alles. /privacy zegt dat ook. Zonder browser, draait in CI. `npm run test:teamminimaal`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const juridisch = await readFile(join(root, "public/juridisch.html"), "utf8");
assert.match(juridisch, /Wanneer iemand het laatst inlogde en of de tweede stap aan staat, ziet alleen de beheerder\./,
  "/privacy zegt wie de laatste login en de tweede stap ziet");
const index = await readFile(join(root, "public/index.html"), "utf8");
assert.match(index, /d\.stapVerplicht&&l\.status==='actief'&&l\.tweedeStap===false/,
  "Team zegt 'stelt de tweede stap in' alleen als de server de stand meegaf");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-teamminimaal-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7.21." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.7.22." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const adres = (n) => [n, "minimaal.nl"].join("@");
const P = "Fysio Teamminimaal";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "minimaal-wachtwoord", akkoord: true })).json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin Beheer", email: adres("karin"), wachtwoord: "karin-minimaal-ww", regels: true }, G);
  assert.equal(eigen.status, 200, "eigen login beheerder");
  const K = ses(await eigen.json());
  const { link } = await (await post("/api/praktijk/team/uitnodigen", { email: adres("lisa"), naam: "Lisa", rol: "therapeut" }, K)).json();
  const token = new URL(link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t: token, naam: "Lisa", wachtwoord: "lisa-minimaal-ww", regels: "1" })).status, 200, "Lisa neemt aan");
  // nog een openstaande uitnodiging
  assert.equal((await post("/api/praktijk/team/uitnodigen", { email: adres("noor"), naam: "Noor", rol: "therapeut" }, K)).status, 200);
  const L = ses(await (await post("/api/praktijk/login", { email: adres("lisa"), wachtwoord: "lisa-minimaal-ww", praktijk: P })).json());
  assert.ok(L["x-praktijk-sessie"], "Lisa logt in");

  // beheerder: ziet van iedereen laatste login, tweede stap en uitnodigingsduur
  const kb = await (await get("/api/praktijk/team", K)).json();
  assert.equal(kb.beheer, true);
  for (const l of kb.leden) {
    assert.ok("laatst" in l && "tweedeStap" in l && "uitnodigingTot" in l, "beheerder ziet alles van " + l.naam);
  }
  assert.ok(kb.leden.find((l) => l.naam === "Lisa").laatst, "Lisa heeft een laatste login");

  // therapeut: van collega's alleen naam, e-mail, rol, status; van zichzelf alles
  const lb = await (await get("/api/praktijk/team", L)).json();
  assert.equal(lb.beheer, false);
  assert.equal(lb.leden.length, 3, "Lisa ziet wel wie er in het team zit");
  for (const l of lb.leden) {
    if (l.naam === "Lisa") {
      assert.ok(l.laatst && "tweedeStap" in l, "Lisa ziet haar eigen laatste login en tweede stap");
      continue;
    }
    assert.deepEqual(Object.keys(l).sort(), ["email", "id", "naam", "rol", "status"], "Lisa ziet van " + l.naam + " alleen naam, e-mail, rol en status");
  }
  assert.ok(lb.ik && lb.ik.laatst && "tweedeStap" in lb.ik, "eigen gegevens in ik blijven volledig");
  console.log("team minimaal: ok (therapeut ziet geen laatste login of tweede stap van collega's; beheerder wel)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
