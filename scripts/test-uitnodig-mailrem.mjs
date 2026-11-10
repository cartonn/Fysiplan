// Security 2026-11-10 (audit (b), backlog LAAG "uitnodigingsmail als spamkanaal"): mailOpSlot
// remde alleen per adres, dus één geclaimde praktijk kon via "Nodig uit" 50 willekeurige adressen
// laten mailen met een zelfgekozen praktijknaam in het onderwerp. Nu mailt Fysiplan hooguit
// 10 uitnodigingen per praktijk per 24 uur; daarna komt de link wel terug, zonder mail.
// Een andere praktijk merkt daar niets van. Nepmail-API op localhost; zonder browser (CI).
// `npm run test:uitnodigmail`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-uitnodigmail-"));
const mails = [];
const mailApi = createServer((req, res) => {
  let b = ""; req.on("data", (c) => { b += c; });
  req.on("end", () => { try { mails.push(JSON.parse(b)); } catch {} res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"x"}'); });
});
await new Promise((r) => mailApi.listen(0, "127.0.0.1", r));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
    MAIL_API_SLEUTEL: "test-sleutel", MAIL_AFZENDER: "test@fysiplan.invalid", MAIL_API_BASIS: `http://127.0.0.1:${mailApi.address().port}` },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.8.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = async (naam) => {
    const r = await post("/api/praktijk/claim", { praktijk: naam, wachtwoord: "praktijk-wachtwoord", akkoord: true });
    assert.equal(r.status, 200, await r.clone().text());
    return { "x-praktijk-sessie": (await r.json()).sessie };
  };
  const A = await claim("Fysio Spamtest");
  const uitkomsten = [];
  for (let i = 0; i < 12; i++) {
    const r = await post("/api/praktijk/team/uitnodigen", { naam: "Collega " + i, email: `doel${i}@voorbeeld.invalid` }, A);
    assert.equal(r.status, 200, "uitnodigen blijft lukken: " + (await r.clone().text()));
    const j = await r.json();
    assert.match(j.link, /\/v2\/uitnodiging\?t=[a-f0-9]{48}$/, "de link komt altijd terug");
    uitkomsten.push(j);
  }
  assert.deepEqual(uitkomsten.map((j) => j.gemaild), [...Array(10).fill(true), false, false], "hooguit 10 mails per praktijk per dag");
  assert.equal(uitkomsten[11].mailLimiet, true, "de app hoort waarom er niet gemaild is");
  assert.equal(uitkomsten[0].mailLimiet, undefined);
  assert.equal(mails.length, 10, "de mail-API kreeg precies 10 verzoeken");

  // een andere praktijk heeft een eigen plafond
  const B = await claim("Fysio Anders");
  const rb = await (await post("/api/praktijk/team/uitnodigen", { email: "collega@anders.invalid" }, B)).json();
  assert.equal(rb.gemaild, true, "een andere praktijk mailt gewoon");
  assert.equal(mails.length, 11);
  console.log("ok: uitnodigingsmails per praktijk begrensd op 10 per dag, link blijft werken");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  mailApi.close();
  await rm(dataDir, { recursive: true, force: true });
}
