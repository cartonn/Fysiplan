// Legal 2026-11-20 (code tegen tekst (d), begrijpelijkheid (i)), gevonden door de gebruikers-sweep
// 2026-11-19 22u (Truus): "Mijn gegevens" op /k zei altijd "Blijf je oefenen, dan schuift dit op".
// Tijdens een proef zonder abonnement is de getoonde datum de wisdatum van de praktijk, en bij een
// afgeronde kaart 30 dagen na afronden: oefenen schuift die niet op. De server zegt nu met
// `verlooptVast` of de datum vastligt, en de kaart laat de zin dan weg (in alle kaarttalen).
// Server + statisch, zonder browser. `node scripts/test-kaart-bewaar-vast.mjs`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- statisch: elke kaarttaal heeft een tekst zonder de belofte, en de kaart kiest die bij verlooptVast ----
const html = await readFile(join(root, "public/kaart.html"), "utf8");
const tmgBron = html.match(/var TMG=(\{[\s\S]*?\});\n/)[1];
const TMG = Function("return " + tmgBron)();
const talen = Object.keys(TMG);
assert.ok(talen.length >= 9, "alle kaarttalen in TMG");
for (const t of talen) {
  assert.ok(TMG[t].totVast, "totVast in " + t);
  assert.ok(TMG[t].totVast.includes("{d}"), "totVast noemt de datum in " + t);
  assert.ok(TMG[t].totVast.length < TMG[t].tot.length, "totVast is de korte zin zonder de belofte in " + t);
}
assert.doesNotMatch(TMG.nl.totVast, /oefen|schuift/, "nl: geen belofte over oefenen");
assert.doesNotMatch(TMG.en.totVast, /exercis|later/, "en: geen belofte over oefenen");
assert.match(html, /trmg\(K\.kaart\.verlooptVast\?'totVast':'tot'\)/, "Mijn gegevens kiest de tekst op verlooptVast");

// ---- server: proefpraktijk, gewone praktijk, afgeronde kaart ----
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-bewaar-vast-"));
const nu = Date.now();
const dag = 86400000;
const token = "e".repeat(48);
await writeFile(join(dataDir, "proef-aanmeldingen.json"), JSON.stringify({
  p_vast: { id: "p_vast", email: "test-vast@voorbeeld.test", naam: "Testc", tel: "+31612345678", praktijk: "Testc Fysio",
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
  headers: { "content-type": "application/json", "x-forwarded-for": "10.71.0." + (ip++), ...extra }, body: JSON.stringify(body) });
const lees = async (id) => (await (await fetch(origin + "/api/kaart?id=" + id, { headers: { "x-forwarded-for": "10.71.1." + (ip++) } })).json()).kaart;
const maakKaart = async (P, S, roepnaam) => {
  const r = await post("/api/kaarten", { praktijk: P, naam: roepnaam, client: { c_naam: roepnaam }, chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S);
  const j = await r.json();
  assert.ok(j.id, "kaart gemaakt: " + JSON.stringify(j));
  return j.id;
};

try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }

  // gewone praktijk zonder proef: de datum schuift op met oefenen
  const P1 = "Testd Fysio";
  const c1 = await post("/api/praktijk/claim", { praktijk: P1, wachtwoord: "bewaar-vast-ww-1", akkoord: true });
  assert.equal(c1.status, 200, "beveiligen zonder proef");
  const S1 = { "x-praktijk-sessie": (await c1.json()).sessie };
  const id1 = await maakKaart(P1, S1, "Truus");
  const k1 = await lees(id1);
  assert.ok(k1.verloopt > nu + 80 * dag, "zonder proef: 90 dagen na de laatste activiteit");
  assert.equal(k1.verlooptVast, false, "zonder proef schuift de datum op met oefenen");

  // afronden: de datum ligt vast
  const a = await post("/api/kaart/archief", { praktijk: P1, id: id1, archief: true }, S1);
  assert.equal(a.status, 200, "afronden: " + await a.text());
  assert.equal((await lees(id1)).verlooptVast, true, "afgeronde kaart: oefenen schuift niets op");

  // proefpraktijk zonder abonnement: de wisdatum van de praktijk komt eerst en ligt vast
  const P2 = "Testc Oost";
  const c2 = await post("/api/praktijk/claim", { praktijk: P2, wachtwoord: "bewaar-vast-ww-2", akkoord: true }, { cookie: "fpproef=" + token });
  assert.equal(c2.status, 200, "beveiligen met proef: " + await c2.clone().text());
  const S2 = { "x-praktijk-sessie": (await c2.json()).sessie, cookie: "fpproef=" + token };
  const id2 = await maakKaart(P2, S2, "Jan");
  const k2 = await lees(id2);
  assert.ok(k2.verloopt < nu + 40 * dag, "proef: de wisdatum van de praktijk (proefeinde + 30 dagen)");
  assert.equal(k2.verlooptVast, true, "proef: de belofte over oefenen klopt niet, dus vast");

  console.log("Mijn gegevens: belofte 'blijf je oefenen, dan schuift dit op' alleen als dat waar is.");
} catch (e) {
  console.error(uit);
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
