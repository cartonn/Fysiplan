// Gebruikers-sweep 2026-11-09 (Mark, desktop): een collega met eigen login maakt een kaart, de patiënt
// stelt een vraag, de collega zet "Alleen mijn patiënten" aan: teller 1, lijst "Alles is afgehandeld".
// De vraag was onvindbaar. Oorzaak: een nieuwe kaart kreeg behandelaar null en het filter zocht de
// voornaam in dat lege veld. Nu: een nieuwe kaart krijgt de ingelogde collega als behandelaar, het
// filter vergelijkt het hele eerste woord (Sanneke ≠ Sanne), houdt kaarten zonder behandelaar zichtbaar
// en de teller telt wat er staat. Zonder browser, past in CI. `npm run test:inboxmijn`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const appHtml = await readFile(join(root, "public/index.html"), "utf8");
assert.match(appHtml, /return !\(INBOX_ALLEEN_MIJN&&mijn\)\|\|!b\|\|b\.split\(\/\\s\+\/\)\[0\]===mijn;/, "filter: heel woord, zonder behandelaar blijft zichtbaar");
assert.match(appHtml, /\(lijst\.length\?" <span class='ib-tel'>"\+lijst\.length\+"<\/span>":""\)/, "teller telt de getoonde lijst");
// het filter zelf, los nagespeeld
const filter = (kaarten, mijn) => kaarten.filter((k) => { const b = String(k.behandelaar || "").trim().toLowerCase(); return !b || b.split(/\s+/)[0] === mijn; });
assert.deepEqual(filter([{ behandelaar: "Sanne de Wit" }, { behandelaar: "Sanneke Bos" }, { behandelaar: null }, { behandelaar: "Joris" }], "sanne").length, 2);

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-inboxmijn-"));
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
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.6.7." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const formulier = (pad, velden) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.6.8." + (ip++) },
  body: new URLSearchParams(velden).toString() });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const ses = (d) => ({ "x-praktijk-sessie": d.sessie });
const P = "Fysio Inbox Mijn";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const G = ses(await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "praktijk-wachtwoord", akkoord: true })).json());
  const M = ses(await (await post("/api/praktijk/team/eigen-login", { naam: "Mark Jansen", email: "mark@inbox.nl", wachtwoord: "mark-wachtwoord", regels: true }, G)).json());
  assert.ok(M["x-praktijk-sessie"], "eigen login beheerder");
  const uitn = await (await post("/api/praktijk/team/uitnodigen", { email: "sanne@inbox.nl", naam: "Sanne", rol: "therapeut" }, M)).json();
  const token = String(uitn.link || uitn.url || "").match(/t=([a-f0-9]{48})/)?.[1] || uitn.token;
  assert.ok(token, "uitnodiging: " + JSON.stringify(uitn));
  const klaar = await formulier("/v2/uitnodiging", { t: token, naam: "Sanne de Wit", wachtwoord: "sanne-wachtwoord", regels: "1" });
  assert.ok(klaar.status < 400, "uitnodiging aangenomen");
  const S = ses(await (await post("/api/praktijk/login", { email: "sanne@inbox.nl", wachtwoord: "sanne-wachtwoord" })).json());
  assert.ok(S["x-praktijk-sessie"], "Sanne logt in");

  const idS = (await (await post("/api/kaarten", { praktijk: P, naam: "Testpatient Een", client: { c_naam: "Testpatient Een" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  const idG = (await (await post("/api/kaarten", { praktijk: P, naam: "Testpatient Twee", client: { c_naam: "Testpatient Twee" }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, G)).json()).id;
  assert.ok(idS && idG, "kaarten gedeeld");
  for (const id of [idS, idG]) assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);

  const ib = await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json();
  const kS = ib.kaarten.find((k) => k.id === idS), kG = ib.kaarten.find((k) => k.id === idG);
  assert.equal(kS && kS.behandelaar, "Sanne de Wit", "nieuwe kaart van Sanne staat op haar naam");
  assert.equal(kG && kG.behandelaar, null, "kaart met het gedeelde wachtwoord: geen behandelaar");
  assert.deepEqual(filter(ib.kaarten, "sanne").map((k) => k.id).sort(), [idG, idS].sort(), "Alleen mijn: eigen vraag én die zonder behandelaar");
  assert.deepEqual(filter(ib.kaarten, "mark").map((k) => k.id), [idG], "Mark ziet Sannes patiënt niet bij Alleen mijn");

  // opnieuw opslaan door een collega neemt de kaart niet over
  assert.equal((await post("/api/kaarten", { praktijk: P, naam: "Testpatient Een", client: { c_naam: "Testpatient Een" }, chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 0 }], kaartId: idS }, M)).status, 200);
  const ib2 = await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), M)).json();
  assert.equal(ib2.kaarten.find((k) => k.id === idS).behandelaar, "Sanne de Wit", "bestaande behandelaar blijft");
  console.log("inbox alleen mijn: ok");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
