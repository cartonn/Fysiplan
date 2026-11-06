// Security: een verlopen proef sluit ALLE schrijfroutes van de therapeut, en niet
// alleen op het apparaat met de proefcookie maar ook voor het praktijkaccount dat
// tijdens de proef werd beveiligd (ander apparaat, gewiste cookies, gewiste proef).
// Patiëntroutes, lezen en verwijderen blijven open. `npm run test:proefpoort`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-proefpoort-"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const hash = (ww) => { const s = randomBytes(16); return "scrypt$" + s.toString("hex") + "$" + scryptSync(ww, s, 32).toString("hex"); };
const dag = 86400000;
const verlopenToken = randomBytes(24).toString("hex");
const actiefToken = randomBytes(24).toString("hex");
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud0000000000001: { id: "oud0000000000001", email: "oud@praktijk.nl", naam: "Piet Oud", tel: "+31612340000",
    praktijk: "Fysio Oud", gestart: Date.now() - 15 * dag, verloopt: Date.now() - dag, akkoord: "x", tokens: [sha(verlopenToken)] },
  nieuw00000000001: { id: "nieuw00000000001", email: "nieuw@praktijk.nl", naam: "Nina Nieuw", tel: "+31612340001",
    gestart: Date.now() - dag, verloopt: Date.now() + 13 * dag, akkoord: "x", tokens: [sha(actiefToken)] }
}));
// "fysio oud" werd tijdens de (nu verlopen) proef beveiligd; "fysio vast" is een
// bestaande praktijk zonder proef en mag nergens last van krijgen
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({
  "fysio oud": { hash: hash("oud-wachtwoord-1"), gemaakt: Date.now() - 14 * dag },
  "fysio vast": { hash: hash("vast-wachtwoord-1"), gemaakt: Date.now() - 400 * dag }
}));
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio oud": { "jan": { id: "0ad0ad0ad0a2", praktijk: "Fysio Oud", naam: "Jan", ts: Date.now() - 2 * dag,
    chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} } }
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(), env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });

let ipTeller = 0;
const post = (pad, body, headers = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.9.0." + (++ipTeller % 250), ...headers }, body: JSON.stringify(body) });
const login = async (praktijk, wachtwoord, cookie) => {
  const r = await post("/api/praktijk/login", { praktijk, wachtwoord }, cookie ? { cookie } : {});
  assert.equal(r.status, 200, "inloggen " + praktijk);
  return (await r.json()).sessie;
};
const sjabloon = (praktijk, sessie, extra = {}) => post("/api/praktijk/sjablonen",
  { praktijk, naam: "Knie", oefeningen: [{ n: "Squat" }] }, { "x-praktijk-sessie": sessie, ...extra });
const isProefSlot = async (r, wat) => {
  assert.equal(r.status, 403, wat + ": status");
  assert.equal((await r.json()).proefVerlopen, true, wat + ": proefVerlopen");
};

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  const oud = "fpproef=" + verlopenToken;

  // 1. apparaat met verlopen proefcookie: ook sjablonen, afspraak en naam dicht (was 200)
  const sOud = await login("Fysio Oud", "oud-wachtwoord-1", oud);
  await isProefSlot(await sjabloon("Fysio Oud", sOud, { cookie: oud }), "sjabloon met verlopen cookie");
  await isProefSlot(await post("/api/kaart/afspraak", { praktijk: "Fysio Oud", naam: "Jan", t: Date.now() + dag },
    { "x-praktijk-sessie": sOud, cookie: oud }), "afspraak met verlopen cookie");
  await isProefSlot(await post("/api/kaart/naam", { praktijk: "Fysio Oud", naam: "Jan", nieuw: "Jan B" },
    { "x-praktijk-sessie": sOud, cookie: oud }), "naam met verlopen cookie");
  await isProefSlot(await post("/api/opname/start", { praktijk: "Fysio Oud" },
    { "x-praktijk-sessie": sOud, cookie: oud }), "opname met verlopen cookie");

  // 2. het inloggen vanaf het proefapparaat koppelt het account aan de proef ...
  const accs = JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));
  assert.equal(accs["fysio oud"].proef?.id, "oud0000000000001", "account gekoppeld aan de proef");
  // ... dus zonder cookie (ander apparaat) blijft dezelfde praktijk dicht
  const sAnder = await login("Fysio Oud", "oud-wachtwoord-1");
  await isProefSlot(await sjabloon("Fysio Oud", sAnder), "sjabloon zonder cookie");
  await isProefSlot(await post("/api/kaarten", { praktijk: "Fysio Oud", naam: "Nieuw", chosen: [] },
    { "x-praktijk-sessie": sAnder }), "nieuwe kaart zonder cookie");

  // 3. lezen, verwijderen en patiëntroutes blijven open
  const lijst = await fetch(origin + "/api/kaarten?praktijk=Fysio%20Oud", { headers: { "x-praktijk-sessie": sAnder, "x-forwarded-for": "10.9.1.1" } });
  assert.equal(lijst.status, 200, "kaartenoverzicht lezen");
  const meting = await post("/api/kaart/meting", { id: "0ad0ad0ad0a2", score: 4 });
  assert.equal(meting.status, 200, "patiënt geeft nog een pijnscore");
  const verwijder = await post("/api/kaarten/verwijder", { praktijk: "Fysio Oud", naam: "Jan" }, { "x-praktijk-sessie": sAnder });
  assert.notEqual((await verwijder.json()).proefVerlopen, true, "verwijderen valt niet onder het proefslot");

  // 4. proefgegevens wissen heft het slot niet op
  const wis = await fetch(origin + "/v2/proef/wissen", { method: "POST", headers: { cookie: oud, "content-type": "application/x-www-form-urlencoded" }, body: "zeker=1" });
  assert.ok(wis.status < 500);
  const proeven = JSON.parse(await readFile(join(dataDir, "proef-aanmeldingen.json"), "utf8"));
  assert.equal("oud0000000000001" in proeven, false, "proef is gewist");
  await isProefSlot(await sjabloon("Fysio Oud", sAnder), "sjabloon na wissen proef");

  // 5. lopende proef: beveiligen koppelt het account, schrijven werkt gewoon
  const nieuw = "fpproef=" + actiefToken;
  const claim = await post("/api/praktijk/claim", { praktijk: "Fysio Nieuw", wachtwoord: "nieuw-wachtwoord-1", akkoord: true }, { cookie: nieuw });
  assert.equal(claim.status, 200);
  const sNieuw = (await claim.json()).sessie;
  assert.equal(JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"))["fysio nieuw"].proef?.id, "nieuw00000000001");
  assert.equal((await sjabloon("Fysio Nieuw", sNieuw)).status, 200, "lopende proef schrijft");

  // 6. bestaande praktijk zonder proef merkt niets
  const sVast = await login("Fysio Vast", "vast-wachtwoord-1");
  assert.equal((await sjabloon("Fysio Vast", sVast)).status, 200, "praktijk zonder proef schrijft");
  assert.equal(JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"))["fysio vast"].proef, undefined);

  console.log("Proefpoort: alle controles geslaagd.");
} catch (err) {
  console.error(uit);
  throw err;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
