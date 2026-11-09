// Gebruikers-sweep 2026-11-09 (Sanne, desktop): open kaart "Joke" → Kaarten → typ "Anna de Wit"
// → In de praktijk → OK bij het roepnaamvoorstel: Jokes kaart (zelfde id, zelfde geprinte QR)
// heette daarna stil "Anna W.". Het roepnaamvoorstel stuurde hernoem:true, waardoor de
// server de vraag "andere patiënt of naam verbeteren?" oversloeg.
// Nu stuurt een roepnaamvoorstel roepnaamHernoem; de server hernoemt dan alleen bij dezelfde
// voornaam ("Anna de Wit" → "Anna W."), anders eerst de hernoemVraag.
// Ook: een fout wachtwoord of foute herstelcode zegt nu wat er mis is.
// Zonder browser, past in CI. `npm run test:roepnaamander`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
// het roepnaamvoorstel (Kaarten en QR) zet niet meer de harde hernoem-keuze
assert.doesNotMatch(idx, /naam=vs;kn\.value=vs;HERNOEM_VOOR=/, "Kaarten: roepnaamvoorstel geen hernoem:true");
assert.doesNotMatch(idx, /var zet=function\(\)\{HERNOEM_VOOR=/, "QR: roepnaamvoorstel geen hernoem:true");
assert.match(idx, /c\.roepnaamHernoem=true/, "roepnaamvoorstel stuurt roepnaamHernoem");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-roepander-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.9.7." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const PR = "Fysio Roepnaam";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const claim = await post("/api/praktijk/claim", { praktijk: PR, wachtwoord: "wachtwoord-roepnaam-test", akkoord: true });
  assert.equal(claim.status, 200);
  const S = { "x-praktijk-sessie": (await claim.json()).sessie };
  const deel = (naam, extra) => post("/api/kaarten", { praktijk: PR, naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }], ...extra }, S);
  const namen = async () => {
    const r = await fetch(origin + "/api/kaarten?praktijk=" + encodeURIComponent(PR), { headers: kop(S) });
    assert.equal(r.status, 200);
    return (await r.json()).map((x) => x.naam).sort();
  };

  // Jokes kaart is gedeeld
  const r1 = await deel("Joke", { kaartId: "" });
  assert.equal(r1.status, 200);
  const joke = await r1.json();

  // roepnaamvoorstel voor een andere patiënt vanuit Jokes editor: eerst vragen
  const v = await deel("Anna W.", { kaartId: joke.id, basisTs: joke.ts, roepnaamHernoem: true });
  assert.equal(v.status, 409, "andere voornaam: niet stil hernoemen");
  const vj = await v.json();
  assert.equal(vj.hernoemVraag, true);
  assert.equal(vj.naam, "Joke");
  assert.deepEqual(await namen(), ["Joke"], "Jokes kaart heet nog Joke");
  const kj = await (await fetch(origin + "/api/kaart?id=" + joke.id, { headers: kop() })).json();
  assert.match(JSON.stringify(kj), /Joke/, "Jokes QR toont nog Joke");

  // "nieuwe kaart" na de vraag: eigen id
  const n = await deel("Anna W.", { kaartId: "", roepnaamHernoem: true });
  assert.equal(n.status, 200);
  assert.notEqual((await n.json()).id, joke.id);
  assert.deepEqual(await namen(), ["Anna W.", "Joke"]);

  // wel dezelfde patiënt: "Bert de Vries" (volledige naam gedeeld) → roepnaam "Bert V."
  const r2 = await deel("Bert de Vries", { kaartId: "" });
  const bert = await r2.json();
  const h = await deel("Bert V.", { kaartId: bert.id, basisTs: bert.ts, roepnaamHernoem: true });
  assert.equal(h.status, 200, "zelfde voornaam: roepnaam zonder extra vraag");
  assert.equal((await h.json()).id, bert.id, "zelfde id, zelfde QR");
  assert.deepEqual(await namen(), ["Anna W.", "Bert V.", "Joke"]);

  // Sanne (zelfde sweep): fout wachtwoord of foute herstelcode gaf "Alleen beschikbaar voor beheer."
  const fl = await post("/api/praktijk/login", { praktijk: PR, wachtwoord: "HelemaalFout1" });
  assert.equal(fl.status, 403);
  assert.equal((await fl.json()).fout, "Praktijknaam, e-mailadres of wachtwoord klopt niet.");
  const fh = await post("/api/praktijk/herstel", { praktijk: PR, code: "FOUT-FOUT-FOUT", wachtwoord: "nieuw-wachtwoord-123", akkoord: true });
  assert.equal(fh.status, 403);
  assert.equal((await fh.json()).fout, "Praktijknaam of herstelcode klopt niet.");

  console.log("test-sweep-roepnaam-andere-patient: OK");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
