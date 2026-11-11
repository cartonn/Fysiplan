// Gedeeld praktijkwerk en rollen (security, 2026-11-07).
// Een therapeut (geen beheerder) kon teamsjablonen en eigen oefeningen van de hele praktijk
// verwijderen, en een sjabloon van een collega stil overschrijven door met dezelfde naam te delen.
// - Wie iets deelde/toevoegde mag het zelf weghalen of bijwerken; een beheerder altijd.
// - Een andere therapeut krijgt 403 (verwijderen) of 409 (zelfde naam), en er verandert niets.
// - Na een verlopen proef kan een beheerder geen collega's meer uitnodigen of eigen login maken.
// Zonder browser, past in CI. `npm run test:gedeeldwerk`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-gedeeldwerk-"));
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
const P = "Fysio Rollen";

try {
  start(); await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: "sanne@rollen.nl", wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const lid = async (naam, email) => {
    const u = await post("/api/praktijk/team/uitnodigen", { email, naam, rol: "therapeut" }, S);
    assert.equal(u.status, 200);
    const t = new URL((await u.json()).link).searchParams.get("t");
    assert.equal((await formulier("/v2/uitnodiging", { t, naam, wachtwoord: naam.toLowerCase() + "-wachtwoord", regels: "1" })).status, 200);
    const l = await post("/api/praktijk/login", { email, wachtwoord: naam.toLowerCase() + "-wachtwoord" });
    assert.equal(l.status, 200);
    return ses(await l.json());
  };
  const J = await lid("Joris", "joris@rollen.nl");
  const M = await lid("Mark", "mark@rollen.nl");

  // ---- teamsjablonen ----
  const deel = (naam, n, H) => post("/api/praktijk/sjablonen", { praktijk: P, naam, oefeningen: [{ n }] }, H);
  assert.equal((await deel("Knie", "Squat", J)).status, 200, "Joris deelt een sjabloon");
  assert.equal((await deel("Rug", "Brug", S)).status, 200, "beheerder deelt een sjabloon");
  const sjabNamen = async (H) => (await (await get("/api/praktijk/sjablonen?praktijk=" + encodeURIComponent(P), H)).json()).sjablonen.map((s) => s.naam + ":" + s.oefeningen[0].n).sort();

  const over = await deel("knie", "Iets anders", M);
  assert.equal(over.status, 409, "Mark overschrijft het sjabloon van Joris niet");
  const weg1 = await post("/api/praktijk/sjablonen/verwijder", { praktijk: P, naam: "Knie" }, M);
  assert.equal(weg1.status, 403, "Mark verwijdert het sjabloon van Joris niet");
  assert.equal((await post("/api/praktijk/sjablonen/verwijder", { praktijk: P, naam: "Rug" }, M)).status, 403, "ook niet dat van de beheerder");
  assert.deepEqual(await sjabNamen(M), ["Knie:Squat", "Rug:Brug"], "niets veranderd");
  // gebruikers-sweep 2026-11-11: de app toont "Verwijderen voor de praktijk" alleen aan wie het mag
  const magWeg = async (H) => Object.fromEntries((await (await get("/api/praktijk/sjablonen?praktijk=" + encodeURIComponent(P), H)).json()).sjablonen.map((s) => [s.naam, s.magWeg]));
  assert.deepEqual(await magWeg(M), { Knie: false, Rug: false }, "Mark (therapeut) mag geen van beide verwijderen");
  assert.deepEqual(await magWeg(J), { Knie: true, Rug: false }, "Joris alleen zijn eigen sjabloon");
  assert.deepEqual(await magWeg(S), { Knie: true, Rug: true }, "beheerder alles");
  const naDelen = await (await deel("Enkel", "Hielheffen", M)).json();
  assert.equal(naDelen.sjablonen.find((s) => s.naam === "Enkel").magWeg, true, "na delen: eigen sjabloon verwijderbaar");
  assert.equal(naDelen.sjablonen.find((s) => s.naam === "Knie").magWeg, false, "na delen: andermans sjabloon niet");
  assert.equal((await post("/api/praktijk/sjablonen/verwijder", { praktijk: P, naam: "Enkel" }, M)).status, 200, "Mark verwijdert zijn eigen sjabloon");
  const html = await readFile(join(process.cwd(), "public/index.html"), "utf8");
  assert.match(html, /it\.bron==='praktijk'&&it\.s\.magWeg!==false/, "app toont de knop alleen bij magWeg");

  assert.equal((await deel("Knie", "Lunge", J)).status, 200, "Joris werkt zijn eigen sjabloon bij");
  assert.equal((await deel("Knie", "Step-up", S)).status, 200, "beheerder mag bijwerken");
  assert.equal((await deel("Knie", "Squat", J)).status, 200, "maker blijft maker na bijwerken door beheerder");
  assert.equal((await post("/api/praktijk/sjablonen/verwijder", { praktijk: P, naam: "Knie" }, J)).status, 200, "Joris verwijdert zijn eigen sjabloon");
  assert.equal((await post("/api/praktijk/sjablonen/verwijder", { praktijk: P, naam: "Rug" }, S)).status, 200, "beheerder verwijdert");
  assert.equal((await deel("Heup", "Brug", M)).status, 200);
  assert.equal((await post("/api/praktijk/sjablonen/verwijder", { praktijk: P, naam: "Heup" }, G)).status, 200, "gedeeld praktijkwachtwoord = beheer");

  // ---- eigen oefeningen ----
  const oef = async (naam, H) => { const r = await post("/api/praktijk/oefeningen", { praktijk: P, naam, img: png }, H); assert.equal(r.status, 200, naam); return (await r.json()).oefeningen.find((o) => o.naam === naam).id; };
  const oJ = await oef("Joris oefening", J);
  const oS = await oef("Sanne oefening", S);
  assert.equal((await post("/api/praktijk/oefeningen/verwijder", { praktijk: P, id: oJ }, M)).status, 403, "Mark verwijdert de oefening van Joris niet");
  assert.equal((await post("/api/praktijk/oefeningen/verwijder", { praktijk: P, id: oS }, M)).status, 403, "ook niet die van de beheerder");
  const lijst = (await (await get("/api/praktijk/oefeningen?praktijk=" + encodeURIComponent(P), M)).json()).oefeningen;
  assert.equal(lijst.length, 2, "beide oefeningen staan er nog");
  // magWeg per oefening: de app toont het kruisje alleen bij wie mag (gebruikers-sweep 2026-11-11 14u)
  const oefWeg = async (H) => Object.fromEntries((await (await get("/api/praktijk/oefeningen?praktijk=" + encodeURIComponent(P), H)).json()).oefeningen.map((o) => [o.naam, o.magWeg]));
  assert.deepEqual(await oefWeg(M), { "Joris oefening": false, "Sanne oefening": false }, "Mark (therapeut) mag geen eigen oefening van een ander verwijderen");
  assert.deepEqual(await oefWeg(J), { "Joris oefening": true, "Sanne oefening": false }, "Joris alleen zijn eigen oefening");
  assert.deepEqual(await oefWeg(S), { "Joris oefening": true, "Sanne oefening": true }, "beheerder alles");
  const naToevoegen = await (await post("/api/praktijk/oefeningen", { praktijk: P, naam: "Mark oefening", img: png }, M)).json();
  assert.deepEqual(Object.fromEntries(naToevoegen.oefeningen.map((o) => [o.naam, o.magWeg])),
    { "Joris oefening": false, "Sanne oefening": false, "Mark oefening": true }, "na toevoegen: alleen de eigen oefening verwijderbaar");
  assert.match(html, /o\.magWeg!==false\?"<button class='btn' type='button' data-eoweg=/, "app toont het kruisje alleen bij magWeg");
  assert.match(html, /alleen die collega of een beheerder van de praktijk verwijderen/, "app legt uit wie het wel mag");
  assert.equal((await post("/api/praktijk/oefeningen/verwijder", { praktijk: P, id: oJ }, J)).status, 200, "Joris verwijdert zijn eigen oefening");
  assert.equal((await post("/api/praktijk/oefeningen/verwijder", { praktijk: P, id: oS }, S)).status, 200, "beheerder verwijdert");

  // ---- verlopen proef: geen nieuwe collega's of eigen logins meer ----
  app.kill(); await wacht(200);
  const dag = 86400000;
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
    rol0000000000001: { id: "rol0000000000001", email: "sanne@rollen.nl", naam: "Sanne", tel: "+31612340000", praktijk: P,
      gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [] } }));
  const accs = JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
  accs["fysio rollen"].proef = { id: "rol0000000000001", verloopt: Date.now() - dag };
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accs));
  start(); await klaar();
  const S2 = ses(await (await post("/api/praktijk/login", { email: "sanne@rollen.nl", wachtwoord: "sanne-wachtwoord" })).json());
  const G2 = ses(await (await post("/api/praktijk/login", { praktijk: P, wachtwoord: "praktijk-wachtwoord" })).json());
  const u2 = await post("/api/praktijk/team/uitnodigen", { email: "nieuw@rollen.nl", naam: "Nieuw", rol: "therapeut" }, S2);
  assert.equal(u2.status, 403, "uitnodigen na verlopen proef");
  assert.equal((await u2.json()).proefVerlopen, true);
  const e2 = await post("/api/praktijk/team/eigen-login", { naam: "X", email: "x@rollen.nl", wachtwoord: "x-wachtwoord-1", regels: true }, G2);
  assert.equal(e2.status, 403, "eigen login na verlopen proef");
  assert.equal((await get("/api/praktijk/team", S2)).status, 200, "team lezen blijft open");

  console.log("test-team-gedeeld-werk: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
