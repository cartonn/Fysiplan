// Een nieuwe praktijk beveiligen (en dus kaarten delen) kan alleen vanuit een lopende proef of
// als klant (PROEF_VERPLICHT, standaard aan in productie). Zonder proef: 403 met de weg naar
// de proef. Bestaande praktijken zonder proef loggen in en delen zoals altijd; een collega
// komt binnen via een uitnodiging. Zonder browser. `npm run test:proefverplicht`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const dag = 86400000;
const tok = { loopt: randomBytes(24).toString("hex"), voorbij: randomBytes(24).toString("hex"), klant: randomBytes(24).toString("hex") };

async function start(env) {
  const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefverplicht-"));
  const basis = (id, extra) => ({ id, email: id + "@praktijk.nl", naam: "Naam", tel: "+31612340000", akkoord: "x", ...extra });
  await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
    loopt00000000001: basis("loopt00000000001", { gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, tokens: [sha(tok.loopt)] }),
    voorbij000000001: basis("voorbij000000001", { gestart: Date.now() - 20 * dag, verloopt: Date.now() - 6 * dag, tokens: [sha(tok.voorbij)] }),
    klant00000000001: basis("klant00000000001", { gestart: Date.now() - 60 * dag, verloopt: Date.now() - 46 * dag, klant: true, tokens: [sha(tok.klant)] })
  }));
  // een praktijk van vóór deze regel, zonder proef
  await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
    "fysio vast": { naam: "Fysio Vast", hash: hash("vast-wachtwoord-1"), gemaakt: Date.now() - 400 * dag, vwo: { versie: "2026-11-09", t: "x" } }
  }));
  const reserve = createServer();
  await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const origin = "http://127.0.0.1:" + port;
  const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "",
      RAILWAY_ENVIRONMENT: "", RAILWAY_ENVIRONMENT_NAME: "", RAILWAY_PROJECT_ID: "", NODE_ENV: "", PROEF_VERPLICHT: "", ...env },
    stdio: ["ignore", "pipe", "pipe"] });
  let uit = "";
  app.stdout.on("data", (c) => { uit += c; }); app.stderr.on("data", (c) => { uit += c; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  let ip = 0;
  const post = (pad, body, headers = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.8.0." + (++ip % 250), ...headers }, body: JSON.stringify(body) });
  const claim = (praktijk, cookie, extra = {}) => post("/api/praktijk/claim",
    { praktijk, wachtwoord: "een-goed-wachtwoord", akkoord: true, ...extra }, cookie ? { cookie: "fpproef=" + cookie } : {});
  return { dataDir, post, claim, uit: () => uit,
    stop: async () => { await new Promise((r) => { app.on("exit", r); app.kill(); }); await rm(dataDir, { recursive: true, force: true }); } };
}

// 1. aan: zonder proef geen nieuwe praktijk
let s = await start({ PROEF_VERPLICHT: "aan" });
try {
  let r = await s.claim("Fysio Zomaar");
  assert.equal(r.status, 403, "zonder proef: geweigerd");
  let d = await r.json();
  assert.equal(d.proefNodig, true);
  assert.match(d.fout, /gratis proef/);
  // een verzonnen cookie telt niet
  assert.equal((await s.claim("Fysio Zomaar", randomBytes(24).toString("hex"))).status, 403);
  // een verlopen proef: de bestaande melding, geen nieuwe praktijk onder een andere naam
  r = await s.claim("Fysio Andere Naam", tok.voorbij);
  assert.equal(r.status, 403, "verlopen proef: geweigerd");
  assert.equal((await r.json()).proefVerlopen, true);
  let accs = JSON.parse(await readFile(join(s.dataDir, "praktijk-accounts.json"), "utf8"));
  assert.deepEqual(Object.keys(accs), ["fysio vast"], "er is geen account bijgekomen");

  // met een lopende proef: beveiligen lukt, en het account hangt aan die proef
  r = await s.claim("Fysio Proef", tok.loopt);
  assert.equal(r.status, 200, "lopende proef: beveiligen lukt");
  const sessieProef = (await r.json()).sessie;
  // een klant (proef al voorbij, wel betaald) mag ook
  assert.equal((await s.claim("Fysio Klant", tok.klant)).status, 200, "klant: beveiligen lukt");
  accs = JSON.parse(await readFile(join(s.dataDir, "praktijk-accounts.json"), "utf8"));
  assert.equal(accs["fysio proef"].proef.id, "loopt00000000001");
  assert.equal(accs["fysio klant"].proef.id, "klant00000000001");
  r = await s.post("/api/kaarten", { praktijk: "Fysio Proef", naam: "Jan", chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} },
    { "x-praktijk-sessie": sessieProef, cookie: "fpproef=" + tok.loopt });
  assert.equal(r.status, 200, "delen binnen de proef werkt");

  // een praktijk van vóór deze regel: inloggen en delen zonder proef, zoals altijd
  r = await s.post("/api/praktijk/login", { praktijk: "Fysio Vast", wachtwoord: "vast-wachtwoord-1" });
  assert.equal(r.status, 200, "bestaande praktijk logt in");
  const sessieVast = (await r.json()).sessie;
  r = await s.post("/api/kaarten", { praktijk: "Fysio Vast", naam: "Piet", chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} },
    { "x-praktijk-sessie": sessieVast });
  assert.equal(r.status, 200, "bestaande praktijk deelt een kaart: " + s.uit());
} finally { await s.stop(); }

// 2. standaard buiten productie uit (lokaal en tests), in productie aan, en uit te zetten
s = await start({});
try { assert.equal((await s.claim("Fysio Lokaal")).status, 200, "lokaal: uit"); } finally { await s.stop(); }
s = await start({ NODE_ENV: "production", ADMIN_KEY: "eigen-beheersleutel-1234" });
try { assert.equal((await s.claim("Fysio Live")).status, 403, "productie: standaard aan"); } finally { await s.stop(); }
s = await start({ NODE_ENV: "production", ADMIN_KEY: "eigen-beheersleutel-1234", PROEF_VERPLICHT: "uit" });
try { assert.equal((await s.claim("Fysio Live")).status, 200, "productie met PROEF_VERPLICHT=uit: open"); } finally { await s.stop(); }

console.log("Proef verplicht: nieuwe praktijk alleen met lopende proef of als klant; bestaande praktijken werken door.");
