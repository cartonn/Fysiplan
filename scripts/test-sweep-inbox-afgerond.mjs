// Gebruikers-sweep 2026-11-20 10u (Mark, iPhone + desktop): op een afgeronde (gearchiveerde) kaart
// kon de patiënt nog "Het doet te veel pijn" tikken; /k zei "Verstuurd" en de server bewaarde het,
// maar Vandaag zei "Niets nieuws" en de inbox was leeg. Nu komt wat ná het archiveren binnenkwam in de
// inbox, met het label "afgeronde kaart"; oude dingen van vóór het archiveren blijven weg.
// Zonder browser, past in CI. `npm run test:inboxafgerond`
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /k\.gearchiveerd\?"<span class='ib-label'[^"]*>afgeronde kaart<\/span>"/, "inbox toont het label afgeronde kaart");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-inboxafgerond-"));
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
app.stdout.on("data", (c) => { uit = (uit + c).slice(-4000); });
app.stderr.on("data", (c) => { uit = (uit + c).slice(-4000); });
let ip = 1;
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.7." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Inbox Afgerond";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "afgerond-wachtwoord", akkoord: true })).json()).sessie };
  const deel = async (naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }, { n: "Brug", i: 1 }], kaartId: "" }, S)).json()).id;
  const id = await deel("Henk V.");
  const stil = await deel("Jan K.");
  const inbox = async () => (await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json());

  // vóór het archiveren: een vraag die de therapeut niet afhandelde, daarna afgerond
  assert.equal((await post("/api/kaart/seintje", { id, soort: "vraag" })).status, 200);
  assert.equal((await post("/api/kaart/seintje", { id: stil, soort: "vraag" })).status, 200);
  await wacht(5);
  for (const k of [id, stil]) assert.equal((await post("/api/kaart/archief", { praktijk: P, id: k, archief: true }, S)).status, 200);
  let ib = await inbox();
  assert.equal(ib.kaarten.length, 0, "afronden haalt oude dingen uit de inbox: " + JSON.stringify(ib.kaarten));

  // ná het archiveren: de patiënt meldt pijn op de afgeronde kaart
  await wacht(5);
  assert.equal((await post("/api/kaart/seintje", { id, soort: "pijn" })).status, 200);
  ib = await inbox();
  assert.equal(ib.kaarten.length, 1, "pijnseintje op een afgeronde kaart staat in de inbox");
  const k = ib.kaarten[0];
  assert.equal(k.id, id);
  assert.equal(k.gearchiveerd, true, "met de vlag afgerond");
  assert.ok(k.items.some((i) => i.soort === "seintje" && i.wat === "pijn"), "het pijnseintje: " + JSON.stringify(k.items));
  assert.ok(k.items.every((i) => i.t > 0), "alleen items met tijd");

  // afhandelen werkt ook op een afgeronde kaart
  assert.equal((await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id }, S)).status, 200);
  assert.equal((await inbox()).kaarten.length, 0, "afgehandeld: weg uit de inbox");
  // een vinkje na het archiveren is geen bericht: de kaart komt niet terug in de inbox
  assert.equal((await post("/api/kaart/oefening", { id: stil, oef: 0, aan: true })).status, 200);
  assert.equal((await inbox()).kaarten.length, 0, "vinkje haalt een afgeronde kaart niet terug");

  // hertest Mark: (1) open pijn van vóór het archiveren, daarna een vraag → de vraag telt mee
  const c = await deel("Cees");
  assert.equal((await post("/api/kaart/seintje", { id: c, soort: "pijn" })).status, 200);
  await wacht(5);
  assert.equal((await post("/api/kaart/archief", { praktijk: P, id: c, archief: true }, S)).status, 200);
  await wacht(5);
  assert.equal((await post("/api/kaart/seintje", { id: c, soort: "vraag" })).status, 200);
  ib = await inbox();
  const kc = ib.kaarten.find((x) => x.id === c);
  assert.ok(kc && kc.items.some((i) => i.wat === "vraag"), "vraag na het archiveren staat in de inbox: " + JSON.stringify(ib.kaarten));
  assert.equal((await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id: c }, S)).status, 200);
  // (2) offline getikt vóór het archiveren, pas daarna binnengekomen → ook zichtbaar
  const dd = await deel("Dirk");
  assert.equal((await post("/api/kaart/archief", { praktijk: P, id: dd, archief: true }, S)).status, 200);
  await wacht(5);
  const r = await post("/api/kaart/seintje", { id: dd, soort: "pijn", wanneer: Date.now() - 10 * 60000 });
  assert.equal(r.status, 200, "seintje uit de wachtrij aangenomen");
  ib = await inbox();
  assert.ok(ib.kaarten.some((x) => x.id === dd), "seintje uit de wachtrij na het archiveren staat in de inbox");
  assert.equal((await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id: dd }, S)).status, 200);
  assert.equal((await inbox()).kaarten.length, 0, "alles afgehandeld");
  // een actieve kaart staat er gewoon in (geen gedragswijziging)
  const actief = await deel("Fatima");
  assert.equal((await post("/api/kaart/meting", { id: actief, score: 6 })).status, 200);
  ib = await inbox();
  assert.deepEqual(ib.kaarten.map((x) => x.id), [actief]);
  assert.equal(ib.kaarten[0].gearchiveerd, undefined, "actieve kaart zonder vlag");
  console.log("test-sweep-inbox-afgerond: alles groen");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
