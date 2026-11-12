// Gedeeld praktijkwachtwoord vs. beheerder met eigen login (security, 2026-11-11 20u).
// Zolang het gedeelde wachtwoord aan staat, kent vaak het hele team het. Zonder deze fix kon
// een sessie daarmee elke beheerder met eigen login naar therapeut zetten of uit het team
// halen, zonder naam in het logboek (gebruikers-sweep 2026-11-11 18u, Karin).
// - Gedeelde sessie: eigen-login-beheerder degraderen of verwijderen → 403, niets verandert,
//   en de poging staat met naam in Activiteit.
// - Gedeelde sessie: een therapeut beheren en iemand beheerder maken blijft werken.
// - Beheerder met eigen login: een andere eigen-login-beheerder aanpassen blijft werken.
// - Rol gewijzigd en collega verwijderd tonen wie en welke collega.
// Zonder browser, past in CI. `npm run test:teameigenbeheer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-teameigen-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Eigenbeheer", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());

  // de eigenaar maakt een eigen login (beheerder)
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Karin", email: "karin@eigen.nl", wachtwoord: "karin-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const ej = await eigen.json();
  const K = ses(ej), karinId = ej.ik.id;

  // een collega logt in met het gedeelde praktijkwachtwoord
  const gl = await post("/api/praktijk/login", { praktijk: "Fysio Eigenbeheer", wachtwoord: "praktijk-wachtwoord" });
  assert.equal(gl.status, 200);
  const C = ses(await gl.json());

  const voor = await readFile(join(dataDir, "praktijk-accounts.json"), "utf8");
  const deg = await post("/api/praktijk/team/rol", { id: karinId, rol: "therapeut" }, C);
  assert.equal(deg.status, 403, "gedeelde sessie zet een eigen-login-beheerder niet naar therapeut");
  assert.equal((await deg.json()).eigenLogin, true);
  for (const gedeeld of [undefined, "laten", "uit"]) {
    const weg = await post("/api/praktijk/team/verwijder", { id: karinId, ...(gedeeld ? { gedeeld } : {}) }, C);
    assert.equal(weg.status, 403, "gedeelde sessie verwijdert een eigen-login-beheerder niet (" + gedeeld + ")");
  }
  assert.equal(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"), voor, "account onveranderd");
  const team = await (await get("/api/praktijk/team", K)).json();
  assert.equal(team.leden.find((l) => l.id === karinId).rol, "beheerder", "Karin blijft beheerder");
  assert.equal(team.beheer, true);

  // beheerder maken mag wel met de gedeelde sessie (ook voor Karin zelf: geen wijziging)
  assert.equal((await post("/api/praktijk/team/rol", { id: karinId, rol: "beheerder" }, C)).status, 200);

  // een therapeut uitnodigen, laten aannemen en beheren met de gedeelde sessie blijft werken
  const nodig = await post("/api/praktijk/team/uitnodigen", { email: "mark@eigen.nl", naam: "Mark", rol: "therapeut" }, C);
  assert.equal(nodig.status, 200);
  const nj = await nodig.json();
  const token = new URL(nj.link).searchParams.get("t");
  const aan = await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.1.1" },
    body: new URLSearchParams({ t: token, naam: "Mark", wachtwoord: "mark-wachtwoord", regels: "1" }).toString() });
  assert.ok(aan.status < 400, "uitnodiging aannemen: " + aan.status);
  const markId = nj.lid.id;
  assert.equal((await post("/api/praktijk/team/rol", { id: markId, rol: "beheerder" }, C)).status, 200, "gedeelde sessie maakt iemand beheerder");
  // Mark is nu een eigen-login-beheerder: de gedeelde sessie kan hem niet meer terugzetten
  assert.equal((await post("/api/praktijk/team/rol", { id: markId, rol: "therapeut" }, C)).status, 403);
  // Karin (eigen login, beheerder) wel
  assert.equal((await post("/api/praktijk/team/rol", { id: markId, rol: "therapeut" }, K)).status, 200, "eigen-login-beheerder past een andere beheerder aan");
  // een therapeut verwijderen met de gedeelde sessie blijft werken
  assert.equal((await post("/api/praktijk/team/verwijder", { id: markId, gedeeld: "laten" }, C)).status, 200, "gedeelde sessie verwijdert een therapeut");

  // logboek: pogingen en wijzigingen met wie en welke collega
  const act = (await (await get("/api/praktijk/activiteit", K)).json()).activiteit;
  const regel = (actie) => act.filter((a) => a.actie === actie).map((a) => a.wie || "");
  assert.ok(regel("team-wijziging-geweigerd").some((w) => w.includes("praktijkwachtwoord") && w.includes("Karin")),
    "geweigerde poging staat met naam in Activiteit: " + JSON.stringify(act));
  assert.ok(regel("rol-gewijzigd").some((w) => w.startsWith("Karin") && w.includes("Mark") && w.includes("therapeut")),
    "rolwijziging toont wie en welke collega");
  assert.ok(regel("collega-verwijderd").some((w) => w.startsWith("praktijkwachtwoord") && w.includes("Mark")),
    "verwijderen toont wie en welke collega");

  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  console.log("test-team-eigenbeheer: ok");
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
