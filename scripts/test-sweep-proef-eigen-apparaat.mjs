// Gebruikers-sweep 2026-11-19 06u (Mark, desktop en iPad): na het einde van de proef kreeg het EIGEN
// proefapparaat (proefcookie plus een geldige sessie) op /v2/app de verlopen-pagina, die bij elk bezoek
// opnieuw wachtwoord en code vroeg en daarna alleen een kaal overzicht gaf. Een tweede apparaat met
// alleen de sessie kreeg wel de app (alleen lezen, proefbalk). Nu krijgt het eigen apparaat met een
// geldige sessie van de praktijk van die proef dezelfde app; zonder sessie, of met een sessie van een
// andere praktijk, blijft de verlopen-pagina. Schrijven blijft geweigerd.
// Alleen de server, draait zonder browser. `npm run test:proefeigenapparaat`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefeigen-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const dag = 86400000;
const token = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  eigen00000000001: { id: "eigen00000000001", email: "proef@example.test", naam: "Proef Gebruiker", tel: "+31612340007",
    praktijk: "Fysio Eigen", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(token)], tokenT: { [sha(token)]: Date.now() - dag } }
}));
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio eigen": { hash: hash("eigen-wachtwoord-1"), gemaakt: Date.now() - 14 * dag, proef: { id: "eigen00000000001", verloopt: Date.now() - dag } },
  "fysio ander": { hash: hash("ander-wachtwoord-1"), gemaakt: Date.now() - 400 * dag }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 0;
const kop = (extra = {}) => ({ "x-forwarded-for": "10.73.0." + (++ip % 250), ...extra });
const login = async (praktijk, wachtwoord) => {
  const r = await fetch(origin + "/api/praktijk/login", { method: "POST", headers: kop({ "content-type": "application/json" }), body: JSON.stringify({ praktijk, wachtwoord }) });
  assert.equal(r.status, 200, "inloggen " + praktijk);
  return (await r.json()).sessie;
};
const isApp = (html) => /window\.FYSIPLAN_V2=true/.test(html);
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const cookie = "fpproef=" + token;
  // zonder sessie: de verlopen-pagina, zoals altijd
  let r = await fetch(origin + "/v2/app", { headers: kop({ cookie }), redirect: "manual" });
  let html = await r.text();
  assert.ok(!isApp(html), "proefcookie zonder sessie: geen app");
  assert.match(html, /voorbij/i, "proefcookie zonder sessie: verlopen-pagina");
  // met een geldige sessie van de eigen praktijk: de app (alleen lezen)
  const sEigen = await login("Fysio Eigen", "eigen-wachtwoord-1");
  r = await fetch(origin + "/v2/app", { headers: kop({ cookie, "x-praktijk-sessie": sEigen }), redirect: "manual" });
  html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(isApp(html), "eigen proefapparaat met geldige sessie: de app, niet opnieuw inloggen");
  assert.doesNotMatch(html, /window\.FYSIPLAN_PROEF=/, "geen welkom of voorbeeldkaart van een verlopen proef");
  // de status zegt nog steeds dat de proef voorbij is (proefbalk), en schrijven blijft dicht
  const st = await (await fetch(origin + "/api/praktijk/status?praktijk=" + encodeURIComponent("Fysio Eigen"), { headers: kop({ cookie, "x-praktijk-sessie": sEigen }) })).json();
  assert.equal(st.proefVerlopen, true, "status: proef voorbij");
  r = await fetch(origin + "/api/kaarten", { method: "POST", headers: kop({ cookie, "x-praktijk-sessie": sEigen, "content-type": "application/json" }),
    body: JSON.stringify({ praktijk: "Fysio Eigen", naam: "Jan", client: { c_naam: "Jan" }, chosen: [], kaartId: "" }) });
  assert.equal(r.status, 403, "schrijven blijft geweigerd na de proef");
  // een sessie van een andere praktijk opent de verlopen proef niet
  const sAnder = await login("Fysio Ander", "ander-wachtwoord-1");
  r = await fetch(origin + "/v2/app", { headers: kop({ cookie, "x-praktijk-sessie": sAnder }), redirect: "manual" });
  assert.ok(!isApp(await r.text()), "sessie van een andere praktijk: verlopen-pagina blijft");
  console.log("proefeigenapparaat: ok (eigen apparaat met geldige sessie krijgt de app alleen-lezen; zonder sessie of met een andere praktijk de verlopen-pagina)");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
