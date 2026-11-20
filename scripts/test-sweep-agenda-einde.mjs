// Regressietest gebruikers-sweep 2026-11-20 18u (Jayden, Pixel 7 + iPhone 14): de oefenherinneringen
// (/api/kaart/agenda) liepen altijd 12 weken (COUNT=dagen x 12), ook als de kaart eerder verdwijnt:
// een proefpraktijk zonder abonnement (proefeinde + 30 dagen) of een afgeronde kaart (30 dagen).
// Dan opende elke herinnering wekenlang "Kaart niet gevonden". Nu stopt de reeks met UNTIL de dag
// vóór de vaste verdwijndatum; schuift de datum nog op met oefenen, dan blijft het 12 weken.
// Alleen server, geen browser: draait ook in CI. `npm run test:agendaeinde`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-agenda-einde-"));
const nu = Date.now();
const dag = 86400000;
const token = "f".repeat(48);
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p_ag: { id: "p_ag", email: "test-agenda@voorbeeld.test", naam: "Teste", tel: "+31612345678", praktijk: "Teste Fysio",
    gestart: nu - 9 * dag, verloopt: nu + 5 * dag, akkoord: nu - 9 * dag, tokens: [createHash("sha256").update(token).digest("hex")], kaarten: 0 }
}));
await writeFile(join(dataDir, "bewaartermijn.json"), JSON.stringify({ invoering: nu - 60 * dag }));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "", EIGEN_LOGIN_VERPLICHT: "", PROEF_VERPLICHT: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.72.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const lees = async (id) => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.72.1." + (ip++) } })).json()).kaart;
const agenda = async (id) => {
  const r = await fetch(origin + "/api/kaart/agenda?id=" + id + "&dagen=MO,WE,FR&tijd=08:30&taal=en", { headers: { "x-forwarded-for": "10.72.2." + (ip++) } });
  assert.equal(r.status, 200, "agenda: " + r.status);
  return (await r.text()).match(/^RRULE:(.*)\r$/m)[1];
};
const maakKaart = async (P, S, roepnaam) => {
  const j = await (await post("/api/kaarten", { praktijk: P, naam: roepnaam, client: { c_naam: roepnaam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json();
  assert.ok(j.id, "kaart gemaakt: " + JSON.stringify(j));
  return j.id;
};
const nlDag = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }).replace(/-/g, "");

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // gewone praktijk: de datum schuift op met oefenen, dus 12 weken
  const P1 = "Testf Fysio";
  const c1 = await post("/api/praktijk/claim", { praktijk: P1, wachtwoord: "agenda-einde-ww-1", akkoord: true });
  assert.equal(c1.status, 200);
  const S1 = { "x-praktijk-sessie": (await c1.json()).sessie };
  const id1 = await maakKaart(P1, S1, "Jayden");
  assert.equal(await agenda(id1), "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=36", "gewone kaart: 12 weken");

  // afgeronde kaart: verdwijnt over ~30 dagen; de herinneringen stoppen de dag ervoor
  assert.equal((await post("/api/kaart/archief", { praktijk: P1, id: id1, archief: true }, S1)).status, 200, "afronden");
  const k1 = await lees(id1);
  assert.equal(k1.verlooptVast, true);
  assert.equal(await agenda(id1), "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=" + nlDag(k1.verloopt - dag) + "T235959",
    "afgeronde kaart: herinneringen tot de dag vóór het verdwijnen");

  // proefpraktijk zonder abonnement: wisdatum van de praktijk (proefeinde + 30 dagen)
  const P2 = "Teste Oost";
  const c2 = await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "agenda-einde-ww-2", akkoord: true }, { cookie: "fpproef=" + token });
  assert.equal(c2.status, 200, "beveiligen met proef: " + await c2.clone().text());
  const S2 = { "x-praktijk-sessie": (await c2.json()).sessie, cookie: "fpproef=" + token };
  const id2 = await maakKaart(P2, S2, "Sam");
  const k2 = await lees(id2);
  assert.ok(k2.verloopt < nu + 40 * dag);
  const r2 = await agenda(id2);
  assert.doesNotMatch(r2, /COUNT=/, "proef: geen 12 weken");
  assert.equal(r2, "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=" + nlDag(k2.verloopt - dag) + "T235959", "proef: tot de wisdatum");

  console.log("test-sweep-agenda-einde: herinneringen stoppen vóór een vaste verdwijndatum, anders 12 weken");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
