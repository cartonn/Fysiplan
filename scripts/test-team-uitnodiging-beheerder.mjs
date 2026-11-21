// Uitnodigen als beheerder met het gedeelde praktijkwachtwoord (security 2026-11-20 20u,
// gebruikers-sweep 18u, Karin). Een sessie met het gedeelde wachtwoord mag een beheerder met
// eigen login niet aanpassen (test:teameigenbeheer), maar kon wel een nieuwe beheerder uitnodigen:
// collega Tom nodigde zichzelf uit als beheerder, nam de uitnodiging aan, logde in met die eigen
// login, zette het praktijkwachtwoord uit en verwijderde de eigenaar.
// - Gedeelde sessie + er is een eigen-login-beheerder: uitnodigen als beheerder → 403, niets bewaard,
//   poging met naam in Activiteit. Uitnodigen als therapeut blijft werken.
// - Een beheerder-uitnodiging uit de tijd vóór de eigen login van de eigenaar begint bij het
//   aannemen als therapeut (en kan de eigenaar dus niet verwijderen).
// - Een beheerder met eigen login nodigt gewoon een beheerder uit.
// - Een openstaande uitnodiging van een beheerder met eigen login kan de gedeelde sessie niet
//   overschrijven, van rol veranderen of weghalen (sweep 2026-11-20 22u); de link blijft werken.
// - "collega-uitgenodigd" in Activiteit noemt wie en welke collega (geen "undefined").
// Zonder browser, past in CI. `npm run test:uitnodigingbeheerder`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitnodbeh-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", EIGEN_LOGIN_VERPLICHT: "uit", PROEF_VERPLICHT: "uit" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.7." + Math.floor(ip / 250) + "." + (ip++ % 250), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const mail = (naam) => [naam, "uitnod.nl"].join("@");
async function aannemen(link, naam, ww) {
  const t = new URL(link).searchParams.get("t");
  const r = await fetch(origin + "/v2/uitnodiging", { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.0." + (ip++ % 250) },
    body: new URLSearchParams({ t, naam, wachtwoord: ww, regels: "1" }).toString() });
  assert.ok(r.status < 400, "uitnodiging aannemen: " + r.status);
}
async function inloggen(praktijk, email, wachtwoord) {
  const r = await post("/api/praktijk/login", { praktijk, email, wachtwoord });
  assert.equal(r.status, 200, "inloggen " + email);
  return ses(await r.json());
}

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // --- praktijk A: Ellen heeft al een eigen login als beheerder ---
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Uitnodiging A", wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const eigen = await post("/api/praktijk/team/eigen-login", { naam: "Ellen", email: mail("ellen"), wachtwoord: "ellen-wachtwoord", regels: true }, G);
  assert.equal(eigen.status, 200);
  const ej = await eigen.json();
  const E = ses(ej), ellenId = ej.ik.id;
  const T = ses(await (await post("/api/praktijk/login", { praktijk: "Fysio Uitnodiging A", wachtwoord: "praktijk-wachtwoord" })).json());

  const voor = await readFile(join(dataDir, "praktijk-accounts.json"), "utf8");
  const nb = await post("/api/praktijk/team/uitnodigen", { email: mail("tom"), naam: "Tom", rol: "beheerder" }, T);
  assert.equal(nb.status, 403, "gedeelde sessie nodigt geen beheerder uit naast een eigen-login-beheerder");
  const nbj = await nb.json();
  assert.equal(nbj.eigenLogin, true);
  assert.equal(nbj.link, undefined, "geen link in het antwoord");
  assert.equal(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"), voor, "niets bewaard");

  // als therapeut uitnodigen blijft werken; daarna kan de gedeelde sessie hem niet beheerder maken
  const nt = await post("/api/praktijk/team/uitnodigen", { email: mail("tom"), naam: "Tom", rol: "therapeut" }, T);
  assert.equal(nt.status, 200, "gedeelde sessie nodigt een therapeut uit");
  const ntj = await nt.json();
  await aannemen(ntj.link, "Tom", "tom-wachtwoord");
  assert.equal((await post("/api/praktijk/team/rol", { id: ntj.lid.id, rol: "beheerder" }, T)).status, 403, "gedeelde sessie maakt Tom geen beheerder");
  const TomEigen = await inloggen("Fysio Uitnodiging A", mail("tom"), "tom-wachtwoord");
  const weg = await post("/api/praktijk/team/verwijder", { id: ellenId, gedeeld: "laten" }, TomEigen);
  assert.equal(weg.status, 403, "Tom (therapeut) verwijdert Ellen niet");
  const teamA = await (await get("/api/praktijk/team", E)).json();
  assert.equal(teamA.leden.find((l) => l.id === ellenId).rol, "beheerder");
  assert.equal(teamA.leden.find((l) => l.id === ntj.lid.id).rol, "therapeut");

  // Ellen (eigen login) nodigt wel een beheerder uit
  const eb = await post("/api/praktijk/team/uitnodigen", { email: mail("sara"), naam: "Sara", rol: "beheerder" }, E);
  assert.equal(eb.status, 200, "eigen-login-beheerder nodigt een beheerder uit");
  await aannemen((await eb.json()).link, "Sara", "sara-wachtwoord");
  const teamA2 = await (await get("/api/praktijk/team", E)).json();
  assert.equal(teamA2.leden.find((l) => l.naam === "Sara").rol, "beheerder", "Sara is beheerder");

  // --- openstaande uitnodigingen van Ellen (eigen login) zijn beschermd (sweep 2026-11-20 22u) ---
  const ni = await post("/api/praktijk/team/uitnodigen", { email: mail("nina"), naam: "Nina", rol: "beheerder" }, E);
  assert.equal(ni.status, 200);
  const nij = await ni.json();
  const pi = await post("/api/praktijk/team/uitnodigen", { email: mail("piet"), naam: "Piet", rol: "therapeut" }, E);
  assert.equal(pi.status, 200);
  const pij = await pi.json();
  const voorOver = await readFile(join(dataDir, "praktijk-accounts.json"), "utf8");
  const over = await post("/api/praktijk/team/uitnodigen", { email: mail("nina"), naam: "Nina", rol: "therapeut" }, T);
  assert.equal(over.status, 403, "gedeelde sessie overschrijft Ellens uitnodiging niet");
  const overj = await over.json();
  assert.equal(overj.eigenLogin, true);
  assert.equal(overj.link, undefined, "geen nieuwe link in het antwoord");
  assert.equal((await post("/api/praktijk/team/uitnodigen", { email: mail("piet"), naam: "Piet", rol: "therapeut" }, T)).status, 403,
    "ook een therapeut-uitnodiging van Ellen niet");
  assert.equal((await post("/api/praktijk/team/rol", { id: nij.lid.id, rol: "therapeut" }, T)).status, 403, "rol van Nina blijft");
  assert.equal((await post("/api/praktijk/team/verwijder", { id: nij.lid.id, gedeeld: "laten" }, T)).status, 403, "Nina niet weg");
  assert.equal((await post("/api/praktijk/team/verwijder", { id: pij.lid.id, gedeeld: "laten" }, T)).status, 403, "Piet niet weg");
  assert.equal(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"), voorOver, "niets bewaard");
  await aannemen(nij.link, "Nina", "nina-wachtwoord");
  const teamN = await (await get("/api/praktijk/team", E)).json();
  assert.equal(teamN.leden.find((l) => l.id === nij.lid.id).rol, "beheerder", "Ellens link werkt nog: Nina is beheerder");
  // Ellen zelf beheert haar uitnodiging gewoon
  assert.equal((await post("/api/praktijk/team/verwijder", { id: pij.lid.id }, E)).status, 200, "Ellen haalt Piets uitnodiging weg");
  // een uitnodiging die de gedeelde sessie zelf verstuurde, blijft ze beheren
  const ge = await post("/api/praktijk/team/uitnodigen", { email: mail("gijs"), naam: "Gijs", rol: "therapeut" }, T);
  assert.equal(ge.status, 200);
  assert.equal((await post("/api/praktijk/team/uitnodigen", { email: mail("gijs"), naam: "Gijs", rol: "therapeut" }, T)).status, 200,
    "eigen gedeelde uitnodiging opnieuw versturen mag");
  assert.equal((await post("/api/praktijk/team/verwijder", { id: (await ge.json()).lid.id }, T)).status, 200, "en weghalen ook");

  const act = (await (await get("/api/praktijk/activiteit", E)).json()).activiteit;
  const uitgenodigd = act.filter((a) => a.actie === "collega-uitgenodigd").map((a) => String(a.wie));
  assert.ok(uitgenodigd.length >= 2 && uitgenodigd.every((w) => w && w !== "undefined"), "uitnodigen toont wie: " + JSON.stringify(uitgenodigd));
  assert.ok(uitgenodigd.some((w) => w.startsWith("praktijkwachtwoord") && w.includes("Tom")), "gedeelde uitnodiging met naam");
  assert.ok(uitgenodigd.some((w) => w.startsWith("Ellen") && w.includes("Sara") && w.includes("beheerder")), "Ellen nodigde Sara uit als beheerder");
  assert.ok(act.some((a) => a.actie === "team-wijziging-geweigerd" && String(a.wie).includes("uitnodigen als beheerder")), "poging staat in Activiteit");

  // --- praktijk B: de beheerder-uitnodiging kwam vóór de eigen login van de eigenaar ---
  const claimB = await post("/api/praktijk/claim", { praktijk: "Fysio Uitnodiging B", wachtwoord: "praktijk-wachtwoord-b", akkoord: true });
  assert.equal(claimB.status, 200);
  const GB = ses(await claimB.json());
  const vroeg = await post("/api/praktijk/team/uitnodigen", { email: mail("tim"), naam: "Tim", rol: "beheerder" }, GB);
  assert.equal(vroeg.status, 200, "zonder eigen-login-beheerder mag de gedeelde sessie een beheerder uitnodigen");
  const vroegLink = (await vroeg.json()).link;
  const eigenB = await post("/api/praktijk/team/eigen-login", { naam: "Bea", email: mail("bea"), wachtwoord: "bea-wachtwoord", regels: true }, GB);
  assert.equal(eigenB.status, 200);
  const ebj = await eigenB.json();
  const B = ses(ebj);
  assert.equal(ebj.ik.rol, "beheerder");
  await aannemen(vroegLink, "Tim", "tim-wachtwoord");
  const teamB = await (await get("/api/praktijk/team", B)).json();
  assert.equal(teamB.leden.find((l) => l.naam === "Tim").rol, "therapeut", "oude gedeelde beheerder-uitnodiging begint als therapeut");
  const Tim = await inloggen("Fysio Uitnodiging B", mail("tim"), "tim-wachtwoord");
  assert.equal((await post("/api/praktijk/team/verwijder", { id: ebj.ik.id, gedeeld: "laten" }, Tim)).status, 403, "Tim verwijdert Bea niet");

  assert.doesNotMatch(uit, /TypeError|ReferenceError|Unhandled/, "geen serverfout in het log");
  console.log("test-team-uitnodiging-beheerder: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
