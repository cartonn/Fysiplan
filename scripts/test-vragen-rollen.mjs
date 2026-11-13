// Vaste vragen en rollen (security, 2026-11-13; gebruikers-sweep 14u, Karin).
// Een therapeut kon met POST /api/praktijk/vragen {vragen: []} de vragen van een collega of
// beheerder van alle kaarten van de praktijk wissen of overschrijven. Nu geldt dezelfde regel
// als bij teamsjablonen en eigen oefeningen: wijzigen of weghalen alleen door de maker of een
// beheerder; erbij zetten mag iedereen. Zonder browser, past in CI. `npm run test:vragenrollen`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-vragenrollen-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let app, uit = "";
const start = () => {
  app = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
};
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.9." + (ip++ & 255) },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
// kleinste geldige PNG-kop + opvulling (server controleert magische bytes en ≥100 bytes)
const png = "data:image/png;base64," + Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(200, 1)]).toString("base64");
const P = "Fysio Vragen";

try {
  start(); await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: "sanne@vragen.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const lid = async (naam, email) => {
    const u = await post("/api/praktijk/team/uitnodigen", { email, naam, rol: "therapeut" }, S);
    assert.equal(u.status, 200);
    const t = new URL((await u.json()).link).searchParams.get("t");
    assert.equal((await formulier("/v2/uitnodiging", { t, naam, wachtwoord: naam.toLowerCase() + "-wachtwoord", regels: "1" })).status, 200);
    const l = await post("/api/praktijk/login", { email, wachtwoord: naam.toLowerCase() + "-wachtwoord" });
    assert.equal(l.status, 200);
    return ses(await l.json());
  };
  const J = await lid("Joris", "joris@vragen.nl");
  const M = await lid("Mark", "mark@vragen.nl");

  const zet = (oef, vragen, H) => post("/api/praktijk/vragen", { praktijk: P, oef, vragen }, H);
  const lees = async (H) => (await (await get("/api/praktijk/vragen?praktijk=" + encodeURIComponent(P), H)).json()).eigen;
  const vB = { v: "Mag ik dit ook staand doen?", a: "Ja, met steun van een stoel." };
  const vJ = { v: "Wat als het kraakt?", a: "Kraken zonder pijn is niet erg." };
  const vM = { v: "Hoe vaak per dag?", a: "Zoals op je kaart staat." };

  assert.equal((await zet("Squat", [vB], S)).status, 200, "beheerder zet een vraag");
  // therapeut wist de vraag van de beheerder: was 200
  const wis = await zet("Squat", [], J);
  assert.equal(wis.status, 403, "therapeut wist de vraag van de beheerder niet");
  assert.deepEqual((await lees(S)).Squat.map((x) => x.v), [vB.v], "vraag van de beheerder staat er nog");
  // overschrijven (tekst wijzigen) mag ook niet
  assert.equal((await zet("Squat", [{ v: vB.v, a: "Nee." }], J)).status, 403, "therapeut wijzigt het antwoord van de beheerder niet");
  assert.equal((await lees(S)).Squat[0].a, vB.a);
  // erbij zetten mag wel, en de vraag van de beheerder blijft
  assert.equal((await zet("Squat", [vB, vJ], J)).status, 200, "therapeut zet er een eigen vraag bij");
  let e = await lees(J);
  assert.deepEqual(e.Squat.map((x) => [x.v, x.mag]), [[vB.v, false], [vJ.v, true]], "app ziet welke vraag hij mag aanpassen");
  // een andere therapeut haalt de vraag van Joris niet weg
  assert.equal((await zet("Squat", [vB], M)).status, 403, "Mark haalt de vraag van Joris niet weg");
  // Joris haalt zijn eigen vraag weg
  assert.equal((await zet("Squat", [vB], J)).status, 200, "maker haalt zijn eigen vraag weg");
  // Mark zet een vraag op een nieuwe oefening en mag hem zelf wissen
  assert.equal((await zet("Brug", [vM], M)).status, 200);
  assert.equal((await zet("Brug", [], M)).status, 200, "maker wist zijn eigen oefening met vragen");
  // de beheerder mag alles
  assert.equal((await zet("Squat", [vB, vJ], J)).status, 200);
  e = await lees(S);
  assert.ok(e.Squat.every((x) => x.mag === true), "beheerder mag elke vraag aanpassen");
  assert.equal((await zet("Squat", [], S)).status, 200, "beheerder wist alle vragen");
  assert.equal((await lees(S)).Squat, undefined);

  console.log("test-vragen-rollen: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
