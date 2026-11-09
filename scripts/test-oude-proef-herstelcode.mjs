// Security 2026-11-09 16u. (1) Inloggen op een gewone praktijk vanaf een apparaat met een
// oude, al verlopen proefcookie hing die praktijk aan de verlopen proef: meteen op slot, en
// sinds de proefronde praktijken wist (PR #133/#136) 30 dagen later alles weg, ook de
// patiëntkaarten. Nu koppelt inloggen alleen een account dat binnen díe proef is gemaakt.
// (2) Herstelcode in hoofdletters of met spaties overgetypt gaf 403 en telde mee voor het
// slot. Zonder browser. `npm run test:oudeproef`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oude-proef-"));
const nu = Date.now();
const dag = 86400000;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const tok = { oud: "c".repeat(48), lopend: "d".repeat(48) };
const proef = (id, token, gestart, verloopt) => ({ id, email: id + "@praktijk.nl", naam: "Therapeut " + id, tel: "+31612345678",
  praktijk: "", gestart, verloopt, akkoord: gestart, tokens: [hash(token)] });
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  oud: proef("oud", tok.oud, nu - 60 * dag, nu - 46 * dag),
  lopend: proef("lopend", tok.lopend, nu - dag, nu + 13 * dag)
}));

const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = "http://127.0.0.1:" + port;
let uitvoer = "";
const app = spawn(process.execPath, ["server.js"], { cwd: process.cwd(),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "", MOLLIE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { uitvoer += c; }); app.stderr.on("data", (c) => { uitvoer += c; });
let ip = 1;
const post = (pad, body, extra = {}) => fetch(origin + pad, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/json", "x-forwarded-for": "10.7.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const accounts = async () => JSON.parse(await readFile(join(dataDir, "praktijk-accounts.json"), "utf8"));

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // gewone praktijk, beveiligd zonder proef (direct in de app)
  const claim = await post("/api/praktijk/claim", { praktijk: "Praktijk Vrij", wachtwoord: "vrij-wachtwoord-1", akkoord: true });
  assert.equal(claim.status, 200, "beveiligen");
  const { herstelcode } = await claim.json();
  assert.match(herstelcode, /^FP-[0-9a-f]{5}(-[0-9a-f]{5}){3}$/);

  // collega logt in op een computer waar ooit (lang geleden) een proef liep
  const login = await post("/api/praktijk/login", { praktijk: "Praktijk Vrij", wachtwoord: "vrij-wachtwoord-1" }, { cookie: "fpproef=" + tok.oud });
  assert.equal(login.status, 200, "inloggen");
  const acc = (await accounts())["praktijk vrij"];
  assert.ok(acc, "account bestaat");
  assert.equal(acc.proef, undefined, "gewone praktijk niet aan een oude, verlopen proef gehangen (anders slot en later wissen)");

  // bestaand gedrag blijft: account gemaakt tijdens een lopende proef wordt bij inloggen nog gekoppeld
  assert.equal((await post("/api/praktijk/claim", { praktijk: "Praktijk Lopend", wachtwoord: "lopend-wachtwoord-1", akkoord: true })).status, 200);
  assert.equal((await post("/api/praktijk/login", { praktijk: "Praktijk Lopend", wachtwoord: "lopend-wachtwoord-1" }, { cookie: "fpproef=" + tok.lopend })).status, 200);
  assert.equal((await accounts())["praktijk lopend"].proef?.id, "lopend", "account uit een lopende proef blijft gekoppeld");

  // herstelcode van papier: hoofdletters, spaties in plaats van streepjes
  const overgetypt = herstelcode.toUpperCase().replace(/-/g, " ");
  const herstel = await post("/api/praktijk/herstel", { praktijk: "Praktijk Vrij", herstelcode: overgetypt, nieuw: "nieuw-wachtwoord-2" });
  assert.equal(herstel.status, 200, "herstelcode in hoofdletters en met spaties werkt");
  // een echt verkeerde code blijft geweigerd
  const fout = await post("/api/praktijk/herstel", { praktijk: "Praktijk Vrij", herstelcode: "FP-00000-00000-00000-00000", nieuw: "nieuw-wachtwoord-3" });
  assert.equal(fout.status, 403, "verkeerde code blijft 403");
  console.log("test-oude-proef-herstelcode: ok");
} catch (e) {
  console.error(uitvoer.slice(-3000));
  throw e;
} finally {
  app.kill();
  await new Promise((r) => app.once("exit", r)).catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}
