// Geweigerde pogingen van een collega in Activiteit, deel 3 (security, 2026-11-15).
// Gebruikers-sweep 2026-11-14 22u (Karin, gemeten): een therapeut die een kaart van een collega
// naar de prullenbak zet, herstelt of definitief verwijdert, namens de praktijk akkoord geeft of
// op "proef doorgaan" drukt, kreeg netjes 403 of een omleiding, maar de beheerder zag het niet in
// Activiteit. Ook een download van alle gegevens door de beheerder stond er niet in.
// Zonder browser, past in CI. `npm run test:geweigerdactiviteit`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-geweigerd-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let app, uit = "";
const start = () => {
  app = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", MOLLIE_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
};
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.9.200." + (ip++ & 255), ...extra },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const mail = (n) => [n, "geweigerd.nl"].join("@");
const P = "Fysio Geweigerd";

try {
  start(); await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: mail("sanne"), wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const lid = async (naam) => {
    const u = await post("/api/praktijk/team/uitnodigen", { email: mail(naam.toLowerCase()), naam, rol: "therapeut" }, S);
    assert.equal(u.status, 200);
    const t = new URL((await u.json()).link).searchParams.get("t");
    assert.equal((await formulier("/v2/uitnodiging", { t, naam, wachtwoord: naam.toLowerCase() + "-wachtwoord", regels: "1" })).status, 200);
    const l = await post("/api/praktijk/login", { email: mail(naam.toLowerCase()), wachtwoord: naam.toLowerCase() + "-wachtwoord" });
    assert.equal(l.status, 200);
    return ses(await l.json());
  };
  const J = await lid("Joris");
  const M = await lid("Mark");
  const activiteit = async () => (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S)).json()).activiteit || [];
  const rij = (a, actie, wie) => a.filter((e) => e.actie === actie && (!wie || (e.wie || "").includes(wie)));
  const html = await readFile(join(process.cwd(), "public/index.html"), "utf8");

  // ---- kaart van Joris: Mark mag niet naar de prullenbak, herstellen of definitief verwijderen ----
  const r = await post("/api/kaarten", { praktijk: P, naam: "Kaart A", client: { c_naam: "Kaart A" }, chosen: [{ n: "Squat" }] }, J);
  assert.equal(r.status, 200);
  const id = (await r.json()).id;
  assert.equal((await post("/api/kaarten/verwijder", { praktijk: P, naam: "Kaart A", id }, M)).status, 403);
  assert.equal((await post("/api/kaarten/verwijder", { praktijk: P, naam: "Kaart A", id }, M)).status, 403);
  assert.equal((await post("/api/kaarten/verwijder", { praktijk: P, naam: "Kaart A", id }, J)).status, 200, "de maker mag wel");
  assert.equal((await post("/api/kaarten/herstel", { praktijk: P, id }, M)).status, 403);
  assert.equal((await post("/api/kaarten/definitief", { praktijk: P, id }, M)).status, 403);
  // ---- akkoord namens de praktijk is alleen voor een beheerder ----
  assert.equal((await post("/api/praktijk/akkoord", { akkoord: true }, M)).status, 403);

  let a = await activiteit();
  const lijstTekst = a.map((e) => e.actie + "/" + (e.wie || "") + "/" + (e.n || 1)).join(", ");
  assert.equal(rij(a, "kaart-verwijderen-geweigerd", "Mark").length, 1, "prullenbak door Mark staat in Activiteit (was niets): " + lijstTekst);
  assert.equal(rij(a, "kaart-verwijderen-geweigerd", "Mark")[0].n, 2, "twee pogingen op één regel");
  assert.equal(rij(a, "kaart-herstellen-geweigerd", "Mark").length, 1, "herstellen door Mark staat erin: " + lijstTekst);
  assert.equal(rij(a, "kaart-definitief-geweigerd", "Mark").length, 1, "definitief verwijderen door Mark staat erin: " + lijstTekst);
  assert.equal(rij(a, "akkoord-geweigerd", "Mark").length, 1, "akkoord door Mark staat erin: " + lijstTekst);
  assert.equal(rij(a, "kaart-verwijderd", "Joris").length, 1, "het echte verwijderen staat er ook");
  // geen roepnaam of kaartnaam van de patiënt in de regels
  assert.ok(!JSON.stringify(a).includes("Kaart A"), "geen kaartnaam in Activiteit");
  // de beheerder zelf mag de kaart wel herstellen: geen geweigerd-regel voor Sanne
  assert.equal((await post("/api/kaarten/herstel", { praktijk: P, id }, S)).status, 200);
  a = await activiteit();
  assert.equal(rij(a, "kaart-herstellen-geweigerd", "Sanne").length, 0);

  // ---- download van alle gegevens door de beheerder staat in Activiteit ----
  assert.equal((await formulier("/v2/gegevens/download", { praktijk: P, email: mail("sanne"), wachtwoord: "sanne-wachtwoord" })).status, 200);
  a = await activiteit();
  assert.equal(rij(a, "alles-gedownload").length, 1, "download door de beheerder staat in Activiteit: " + a.map((e) => e.actie).join(","));

  // ---- proef doorgaan / opzeggen door een collega zonder beheerdersrol ----
  app.kill(); await wacht(200);
  const dag = 86400000;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
    gew0000000000001: { id: "gew0000000000001", email: mail("sanne"), naam: "Sanne", tel: "+31612340000", praktijk: P,
      gestart: Date.now() - 2 * dag, verloopt: Date.now() + 12 * dag, akkoord: "x", tokens: [] } }));
  const accs = JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
  accs["fysio geweigerd"].proef = { id: "gew0000000000001", verloopt: Date.now() + 12 * dag };
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accs));
  start(); await klaar();
  const M2 = ses(await (await post("/api/praktijk/login", { email: mail("mark"), wachtwoord: "mark-wachtwoord" })).json());
  const S2 = ses(await (await post("/api/praktijk/login", { email: mail("sanne"), wachtwoord: "sanne-wachtwoord" })).json());
  const d = await formulier("/v2/proef/doorgaan", {}, M2);
  // praktijk-routine 2026-11-22: geen stille omleiding meer (de knop leek niets te doen), maar
  // een uitleg dat een beheerder dit regelt (routine-backlog LAAG, "stille 303")
  assert.equal(d.status, 403, "Mark krijgt uitleg in plaats van een stille omleiding");
  assert.match(await d.text(), /Dit regelt een beheerder van je praktijk/);
  const w = await formulier("/v2/proef/wissen", { zeker: "1" }, M2);
  assert.equal(w.status, 403, "wissen door Mark: " + w.status);
  assert.match(await w.text(), /Er is niets veranderd/);
  for (const [pad, velden] of [["/v2/proef/opzeggen", { actie: "opzeggen", zeker: "1" }], ["/v2/proef/opzeggen", { actie: "intrekken" }],
    ["/v2/proef/factuurgegevens", { naam: "Praktijk X", adres: "Straat 1" }]]) {
    const x = await formulier(pad, velden, M2);
    assert.equal(x.status, 403, pad + " door Mark: " + x.status);
    assert.match(await x.text(), /Dit regelt een beheerder/);
  }
  // wie niet is ingelogd, merkt niets nieuws: nog steeds de omleiding
  assert.equal((await formulier("/v2/proef/doorgaan", {})).status, 303);
  assert.equal((await formulier("/v2/proef/factuurgegevens", { naam: "X" })).status, 303);
  const proeven = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
  assert.ok(!proeven.gew0000000000001.doorgaan && !proeven.gew0000000000001.gewist, "er is niets veranderd aan de proef");
  a = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S2)).json()).activiteit || [];
  assert.equal(rij(a, "proef-geweigerd", "Mark (doorgaan").length, 1, "doorgaan door Mark staat in Activiteit: " + a.map((e) => e.actie + "/" + e.wie).join(", "));
  assert.equal(rij(a, "proef-geweigerd", "Mark (proefgegevens wissen").length, 1, "wissen door Mark staat in Activiteit");
  // de beheerder zelf (met eigen login) krijgt geen geweigerd-regel
  assert.equal((await formulier("/v2/proef/doorgaan", {}, S2)).status, 200, "beheerder mag doorgaan");
  a = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S2)).json()).activiteit || [];
  assert.equal(rij(a, "proef-geweigerd", "Sanne").length, 0);

  // Security 2026-11-19 08u (gebruikers-sweep 06u, Karin): een leespoging van Activiteit of van het
  // leeslog door een collega gaf 403, maar stond nergens; de schrijfpogingen wel.
  assert.equal((await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), M2)).status, 403);
  assert.equal((await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), M2)).status, 403);
  assert.equal((await get("/api/kaart/leeslog?praktijk=" + encodeURIComponent(P) + "&id=" + encodeURIComponent(id), M2)).status, 403);
  a = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S2)).json()).activiteit || [];
  assert.equal(rij(a, "activiteit-lezen-geweigerd", "Mark").length, 1, "leespoging Activiteit door Mark staat erin: " + a.map((e) => e.actie + "/" + e.wie).join(", "));
  assert.equal(rij(a, "activiteit-lezen-geweigerd", "Mark")[0].n, 2, "twee pogingen op één regel");
  assert.equal(rij(a, "leeslog-lezen-geweigerd", "Mark").length, 1, "leespoging leeslog door Mark staat erin");
  assert.equal(rij(a, "activiteit-lezen-geweigerd", "Sanne").length, 0, "de beheerder zelf geeft geen regel");
  // zonder sessie van deze praktijk komt er niets in Activiteit (geen ruis van buitenaf)
  assert.equal((await get("/api/kaart/leeslog?praktijk=" + encodeURIComponent(P) + "&id=" + encodeURIComponent(id))).status, 401);

  for (const actie of ["kaart-verwijderen-geweigerd", "kaart-herstellen-geweigerd", "kaart-definitief-geweigerd", "akkoord-geweigerd",
    "proef-geweigerd", "akkoord", "alles-gedownload", "activiteit-lezen-geweigerd", "leeslog-lezen-geweigerd"]) {
    assert.match(html, new RegExp("'" + actie + "':'[^']+'"), "app heeft een leesbare regel voor " + actie);
  }
  console.log("test-geweigerd-activiteit: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
