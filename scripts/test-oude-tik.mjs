// Gebruikers-sweep 2026-11-14 (Jayden, Pixel 7): een tik uit de offline-wachtrij van meer dan
// 14 dagen terug (of ver in de toekomst door een verkeerde klok) kwam binnen als "nu" en
// overschreef de pijnscore van vandaag; de wachtrij op /k had geen maximumleeftijd.
// Nu: de server weigert zo'n tik met 400 en een begrijpelijke zin, en /k gooit wachtrij-items
// ouder dan 14 dagen weg voordat ze worden verstuurd.
// `npm run test:oudetik`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAG = 86400000;

// 1. de wachtrij op /k: wachtOpruimen uit kaart.html
const html = await readFile(join(root, "public", "kaart.html"), "utf8");
const stuk = html.match(/var WACHT_MAX_DAGEN=\d+,WACHT_OUD=0;\s*function wachtOpruimen\(w,nu\)\{[\s\S]*?\n {2}\}\n/);
assert.ok(stuk, "wachtOpruimen staat in kaart.html");
assert.match(html, /var ruw=leesWacht\(\),w=wachtOpruimen\(ruw,Date\.now\(\)\);bewaarWacht\(w\);/, "verstuurWacht ruimt eerst op");
const ctx = {};
vm.runInNewContext(stuk[0] + "this.f=wachtOpruimen;", ctx);
const nu = Date.UTC(2026, 10, 14, 10);
const w = {
  vers: { pad: "/api/kaart/meting", body: { score: 3, wanneer: nu - 2 * DAG }, t: nu - 2 * DAG },
  oud: { pad: "/api/kaart/meting", body: { score: 9, wanneer: nu - 21 * DAG }, t: nu - 21 * DAG },
  toekomst: { pad: "/api/kaart/gedaan", body: { aan: true, wanneer: nu + 3 * DAG }, t: nu + 3 * DAG },
  zonderWanneer: { pad: "/api/kaart/gedaan", body: { aan: true }, t: nu - 30 * DAG },
  kapot: null
};
const over = ctx.f(w, nu);
assert.deepEqual(Object.keys(over), ["vers"], "alleen de verse tik blijft in de wachtrij");
// en de patiënt hoort het, in elke taal van de kaart (Jayden: eerder verdween het stil)
const twacht = html.match(/var TWACHT=(\{[\s\S]*?\}\});/);
assert.ok(twacht, "TWACHT staat in kaart.html");
const talen = vm.runInNewContext("(" + twacht[1] + ")");
for (const [taal, d] of Object.entries(talen)) assert.ok(d.oud && d.oud.includes("{n}"), "melding 'oud' in " + taal);
assert.match(html, /if\(WACHT_OUD&&!n\)\{[^}]*trw\('oud'\)/, "tekenWacht toont de melding");
assert.match(html, /r\.status===400&&[^;]*WACHT_OUD\+\+/, "een 400 op een oude tik telt mee in de melding");

// 2. de server
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-oudetik-"));
const ID = "abcdef654321";
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({
  "fysio tik": {
    "jayden": { id: ID, praktijk: "Fysio Tik", naam: "Jayden", ts: Date.now(), pskDoel: "Hardlopen",
      chosen: [{ n: "Squat", id: "", i: 0 }], rows: {}, cells: {}, vids: {} }
  }
}));
const reserve = createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["server.js"], {
  cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"]
});
let uit = "";
app.stdout.on("data", (c) => { uit += c; });
app.stderr.on("data", (c) => { uit += c; });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
let ip = 1;
const post = (pad, body) => fetch(origin + pad, {
  method: "POST", body: JSON.stringify(body),
  headers: { "content-type": "application/json", "x-forwarded-for": "10.45.0." + (ip++) }
});
const kaart = async () => JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"))["fysio tik"].jayden;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }

  // pijn 3 vandaag, en een tik van twee dagen terug komt op die dag
  assert.equal((await post("/api/kaart/meting", { id: ID, score: 3 })).status, 200);
  assert.equal((await post("/api/kaart/meting", { id: ID, score: 5, wanneer: Date.now() - 2 * DAG })).status, 200, "tik van 2 dagen terug telt");
  assert.equal((await kaart()).metingen.length, 2, "twee dagen, twee scores");

  // te oud of ver in de toekomst: 400 met een zin, en de score van vandaag blijft 3
  const geweigerd = [
    ["/api/kaart/meting", { id: ID, score: 9, wanneer: Date.now() - 21 * DAG }],
    ["/api/kaart/meting", { id: ID, score: 9, wanneer: Date.now() + 3 * DAG }],
    ["/api/kaart/ervaring", { id: ID, score: -2, wanneer: Date.now() - 15 * DAG }],
    ["/api/kaart/psk", { id: ID, score: 9, wanneer: Date.now() - 30 * DAG }],
    ["/api/kaart/gedaan", { id: ID, aan: true, wanneer: Date.now() - 20 * DAG }],
    ["/api/kaart/oefening", { id: ID, oef: 0, n: "Squat", aan: true, wanneer: Date.now() - 20 * DAG }],
    ["/api/kaart/seintje", { id: ID, soort: "pijn", wanneer: Date.now() - 20 * DAG }]
  ];
  for (const [pad, body] of geweigerd) {
    const r = await post(pad, body);
    assert.equal(r.status, 400, pad + " met wanneer " + new Date(body.wanneer).toISOString() + " moet 400 geven");
    assert.match((await r.json()).fout || "", /te lang geleden/, "begrijpelijke zin");
  }
  const k = await kaart();
  assert.equal(k.metingen.length, 2);
  assert.equal([...k.metingen].sort((a, b) => a.t - b.t).at(-1).s, 3, "score van vandaag niet overschreven");
  assert.ok(!(k.ervaring || []).length && !(k.psk || []).length && !(k.gedaan || []).length, "niets anders vastgelegd");
  assert.ok(!k.seintje, "geen seintje van drie weken terug");

  // een klok die een paar uur voorloopt blijft gewoon werken
  assert.equal((await post("/api/kaart/gedaan", { id: ID, aan: true, wanneer: Date.now() + 3 * 3600000 })).status, 200, "klok paar uur voor: telt als nu");
  console.log("test-oude-tik: ok");
} catch (err) {
  console.error(uit.slice(-2000));
  throw err;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
