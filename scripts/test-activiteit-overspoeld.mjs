// Security 2026-11-16 (backlog MIDDEL, gebruikers-sweep 2026-11-15 22u en 2026-11-16 02u, Karin):
// geweigerde pogingen van een collega duwden de echte gebeurtenissen uit Activiteit (15 regels) en,
// op den duur, uit de opslag (300 echte gebeurtenissen per praktijk). Nu zijn geweigerde pogingen
// ruis (klein plafond) en toont Activiteit 15 echte regels, hooguit 5 mislukte logins en per collega
// elke soort geweigerde poging één keer met teller (hooguit 15; sinds 2026-11-19).
// Zonder browser, past in CI. `npm run test:activiteitoverspoeld`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAuditRuis, kiesActiviteit } from "../lib/audit-keuze.js";

// 1) de keuze zelf
const basis = new Set(["login-mislukt"]);
assert.ok(isAuditRuis("team-wijziging-geweigerd", basis));
assert.ok(isAuditRuis("login-mislukt", basis));
assert.ok(!isAuditRuis("collega-verwijderd", basis));
assert.ok(!isAuditRuis("geweigerd-iets", basis), "alleen een actie die op -geweigerd eindigt");
const lijst = [];
for (let i = 0; i < 30; i++) lijst.push({ actie: "akkoord-geweigerd", i });
lijst.push({ actie: "collega-verwijderd" });
for (let i = 0; i < 30; i++) lijst.push({ actie: "ingelogd", i });
const k = kiesActiviteit(lijst, (a) => isAuditRuis(a, basis));
// sinds 2026-11-19: dezelfde soort van dezelfde collega is één regel met teller
assert.equal(k.filter((e) => e.actie === "akkoord-geweigerd").length, 1);
assert.equal(k[0].n, 30, "de teller telt alle 30 pogingen");
assert.equal(lijst[0].n, undefined, "de opslag zelf wordt niet aangepast");
assert.equal(k.filter((e) => !isAuditRuis(e.actie, basis)).length, 15);
assert.equal(k[1].actie, "collega-verwijderd", "volgorde blijft nieuwste eerst");

// Security 2026-11-19 (gebruikers-sweep 02u, Karin): Joost deed 7 verschillende geweigerde pogingen,
// waaronder zichzelf beheerder maken; daarna 20 foute logins. Activiteit liet er maar 5 zien, de
// oudste (de rolverhoging) viel weg. Nu staat elke soort er één keer, en foute logins duwen ze niet weg.
const joost = ["team-wijziging-geweigerd", "akkoord-geweigerd", "profiel-wijzigen-geweigerd", "alles-wissen-geweigerd",
  "download-geweigerd", "kaart-verwijderen-geweigerd", "proef-geweigerd"];
const k2lijst = [];
for (let i = 0; i < 20; i++) k2lijst.push({ actie: "login-mislukt", i });
for (const a of [...joost].reverse()) { k2lijst.push({ actie: a, wie: "Joost", n: 2 }); k2lijst.push({ actie: "ingelogd" }); }
k2lijst.push({ actie: "team-wijziging-geweigerd", wie: "Joost", n: 3 });
const k2 = kiesActiviteit(k2lijst, (a) => isAuditRuis(a, basis));
for (const a of joost) assert.equal(k2.filter((e) => e.actie === a && e.wie === "Joost").length, 1, a + " staat er precies één keer");
assert.equal(k2.find((e) => e.actie === "team-wijziging-geweigerd").n, 5, "teller van de rolverhoging opgeteld");
assert.equal(k2.filter((e) => e.actie === "login-mislukt").length, 5, "foute logins houden hun eigen plafond");
assert.equal(k2.filter((e) => e.actie === "ingelogd").length, 7);
// een andere collega met dezelfde soort is een eigen regel; het aantal soorten is begrensd
const k3lijst = [{ actie: "akkoord-geweigerd", wie: "A" }, { actie: "akkoord-geweigerd", wie: "B" }];
for (let i = 0; i < 40; i++) k3lijst.push({ actie: "akkoord-geweigerd", wie: "C" + i });
const k3 = kiesActiviteit(k3lijst, (a) => isAuditRuis(a, basis));
assert.equal(k3.length, 15, "hooguit 15 geweigerde regels");
assert.deepEqual(k3.slice(0, 2).map((e) => e.wie), ["A", "B"]);

// 2) runtime
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-overspoeld-"));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
let app, uit = "";
const start = () => {
  app = spawn(process.execPath, ["ser" + "ver.js"], {
    cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
      MAIL_API_SLEUTEL: "", MAIL_AFZENDER: "", MOLLIE_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  app.stdout.on("data", (c) => { uit += c; });
  app.stderr.on("data", (c) => { uit += c; });
};
const stop = async () => { if (!app || app.exitCode !== null) return; const weg = new Promise((r) => app.once("exit", r)); app.kill(); await weg; };
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.8.200." + (ip++ & 255) },
  body: new URLSearchParams(velden).toString() });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const mail = (n) => [n, "overspoeld.nl"].join("@");
const P = "Fysio Overspoeld";

try {
  start(); await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  const S = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Sanne", email: mail("sanne"), wachtwoord: "sanne-wachtwoord", regels: true }, G)).json());
  const u = await post("/api/praktijk/team/uitnodigen", { email: mail("mark"), naam: "Mark", rol: "therapeut" }, S);
  assert.equal(u.status, 200);
  const t = new URL((await u.json()).link).searchParams.get("t");
  assert.equal((await formulier("/v2/uitnodiging", { t, naam: "Mark", wachtwoord: "mark-wachtwoord", regels: "1" })).status, 200);

  // 300 oude geweigerde pogingen van Mark bovenop het echte spoor (zoals na uren van een lus)
  await stop();
  const pad = join(dataDir, "praktijk-audit.json");
  const audit = JSON.parse(await readFile(pad, "utf8"));
  const echt = audit.filter((e) => e.praktijk === "fysio overspoeld").map((e) => e.actie);
  assert.ok(echt.includes("geclaimd") && echt.includes("collega-uitgenodigd"), "echte regels: " + echt.join(","));
  const oud = new Date(Date.now() - 3600000).toISOString();
  const ruis = [];
  for (let i = 0; i < 300; i++) ruis.push({ t: oud, praktijk: "fysio overspoeld", actie: i % 2 ? "akkoord-geweigerd" : "team-wijziging-geweigerd", ip: "10.8.0.x", wie: "Mark (poging " + i + ")" });
  await writeFile(pad, JSON.stringify([...ruis, ...audit]));
  start(); await klaar();
  const M = ses(await (await post("/api/praktijk/login", { email: mail("mark"), wachtwoord: "mark-wachtwoord" })).json());
  const S2 = ses(await (await post("/api/praktijk/login", { email: mail("sanne"), wachtwoord: "sanne-wachtwoord" })).json());
  // nog drie nieuwe pogingen: elk liet vroeger de oudste echte gebeurtenis uit de opslag vallen
  assert.equal((await post("/api/praktijk/akkoord", { akkoord: true }, M)).status, 403);
  assert.equal((await post("/api/praktijk/team/uitnodigen", { email: mail("x"), naam: "X", rol: "therapeut" }, M)).status, 403);
  assert.equal((await post("/api/praktijk/team/uitnodigen", { email: mail("y"), naam: "Y", rol: "beheerder" }, M)).status, 403);
  await wacht(300);

  const a = (await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S2)).json()).activiteit || [];
  const tekst = a.map((e) => e.actie + "/" + (e.wie || "")).join(", ");
  assert.ok(a.some((e) => e.actie === "collega-uitgenodigd"), "collega uitgenodigd blijft in Activiteit: " + tekst);
  assert.ok(a.some((e) => e.actie === "geclaimd"), "het beveiligen blijft in Activiteit: " + tekst);
  assert.ok(a.filter((e) => /-geweigerd$/.test(e.actie)).length <= 15, "hooguit 15 geweigerde regels: " + tekst);
  assert.ok(a.some((e) => e.actie === "akkoord-geweigerd" && /^Mark/.test(e.wie || "")), "de nieuwste poging staat er nog: " + tekst);

  await stop();
  const na = JSON.parse(await readFile(pad, "utf8")).filter((e) => e.praktijk === "fysio overspoeld").map((e) => e.actie);
  for (const actie of ["geclaimd", "eigen-login-gemaakt", "collega-uitgenodigd"]) {
    assert.ok(na.includes(actie), actie + " staat nog in de opslag (geweigerde pogingen duwden het eruit)");
  }
  console.log("test-activiteit-overspoeld: ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
