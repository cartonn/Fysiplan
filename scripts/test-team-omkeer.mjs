// Omkeertekens en emoji in Team en Activiteit (security, 2026-11-19).
// Gebruikers-sweep 2026-11-19 10u (Karin): een naam met U+202E werd bewaard en oogde in de
// teamlijst en Activiteit als een andere naam (#376 haalde ze alleen op /k weg), en een
// e-mailadres met een emoji vóór de @ werd aangenomen.
// Zonder browser, past in CI. `npm run test:teamomkeer`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geldigEmail } from "../lib/proef.js";

const OMKEER = /[‪-‮⁦-⁩]/;
const mail = (n, d = "omkeer.nl") => [n, d].join("@");

// ---- geldigEmail: deel vóór de @ alleen zichtbare ASCII, geen stuurtekens in het domein ----
assert.equal(geldigEmail(mail("sanne")), true);
assert.equal(geldigEmail(mail("s.de-vries+fysio")), true);
assert.equal(geldigEmail(mail("info", "fysio-münchen.de")), true, "een Unicode-domein (IDN) mag");
assert.equal(geldigEmail(mail("\u{1F600}")), false, "emoji vóór de @");
assert.equal(geldigEmail(mail("tom‮ln.oisyf")), false, "omkeerteken vóór de @");
assert.equal(geldigEmail(mail("tom", "fysio‮.nl")), false, "omkeerteken in het domein");
assert.equal(geldigEmail(mail("tom", "fy​sio.nl")), false, "nulbreedteteken in het domein");
assert.equal(geldigEmail(mail("jörg")), false, "geen niet-ASCII vóór de @");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-teamomkeer-"));
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
  app.stdout.on("data", (c) => { if (uit.length < 20000) uit += c; });
  app.stderr.on("data", (c) => { if (uit.length < 20000) uit += c; });
};
const stop = async () => { if (app && app.exitCode === null) { const e = new Promise((r) => app.once("exit", r)); app.kill(); await e; } };
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const klaar = async () => { for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) return; } catch {} await wacht(50); } };
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.8." + (ip >> 8) + "." + (ip++ & 255), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Omkeer";

try {
  start(); await klaar();
  const claim = await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true });
  assert.equal(claim.status, 200);
  const G = ses(await claim.json());
  // eigen login met een omkeerteken in de naam: bewaard zonder
  const el = await post("/api/praktijk/team/eigen-login", { naam: "San‮ne", email: mail("sanne"), wachtwoord: "sanne-wachtwoord", regels: true }, G);
  assert.equal(el.status, 200);
  const S = ses(await el.json());
  // uitnodigen met een emoji-adres: geweigerd
  const emo = await post("/api/praktijk/team/uitnodigen", { email: mail("\u{1F600}"), naam: "Emo", rol: "therapeut" }, S);
  assert.equal(emo.status, 400, "emoji-adres wordt geweigerd (was 200)");
  // uitnodigen met een omkeerteken in de naam: bewaard zonder
  const u = await post("/api/praktijk/team/uitnodigen", { email: mail("tom"), naam: "Tom‮redeeh⁦x⁩", rol: "therapeut" }, S);
  assert.equal(u.status, 200);
  const team = await (await get("/api/praktijk/team", S)).json();
  const namen = team.leden.map((l) => l.naam);
  assert.ok(!OMKEER.test(JSON.stringify(team)), "geen omkeertekens in Team: " + JSON.stringify(namen));
  assert.ok(namen.includes("Sanne") && namen.includes("Tomredeehx"), "namen blijven verder gelijk: " + JSON.stringify(namen));
  const opslag = await readFile(join(dataDir, "praktijk-accounts.json"), "utf8");
  assert.ok(!OMKEER.test(opslag), "ook niet in de opslag");

  // ---- oude gegevens van vóór de fix: in Team en Activiteit toch zonder omkeertekens ----
  await stop();
  const accs = JSON.parse(opslag);
  const pk = Object.keys(accs).find((k) => k === P.toLowerCase());
  const tom = accs[pk].leden.find((l) => l.naam === "Tomredeehx");
  tom.naam = "Tom‮redeeh";
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify(accs));
  let audit = [];
  try { audit = JSON.parse(await readFile(join(dataDir, "praktijk-audit.json"), "utf8")); } catch {}
  audit.push({ t: new Date().toISOString(), praktijk: pk, actie: "collega-uitgenodigd", ip: "-", wie: "Tom‮redeeh (door Sanne)" });
  await writeFile(join(dataDir, "praktijk-audit.json"), JSON.stringify(audit));
  start(); await klaar();
  const S2 = ses(await (await post("/api/praktijk/login", { email: mail("sanne"), wachtwoord: "sanne-wachtwoord" })).json());
  const team2 = await (await get("/api/praktijk/team", S2)).json();
  assert.ok(team2.ok && !OMKEER.test(JSON.stringify(team2)), "oude naam in Team zonder omkeerteken");
  const act = await (await get("/api/praktijk/activiteit?praktijk=" + encodeURIComponent(P), S2)).json();
  assert.ok(act.ok && act.activiteit.some((e) => (e.wie || "").includes("Tomredeeh")), "oude regel staat in Activiteit: " + JSON.stringify(act).slice(0, 300));
  assert.ok(!OMKEER.test(JSON.stringify(act)), "oude regel in Activiteit zonder omkeerteken");
  assert.ok(!/\bat [^\n]+\.js:\d+/.test(uit), "geen stacktrace in de serverlog");
  console.log("test:teamomkeer ok");
} catch (e) {
  console.error(uit.slice(-3000));
  throw e;
} finally {
  await stop();
  await rm(dataDir, { recursive: true, force: true });
}
