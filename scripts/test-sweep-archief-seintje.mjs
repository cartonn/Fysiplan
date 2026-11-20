// Gebruikers-sweep 2026-11-20 14u (Mark, desktop + iPad liggend): een collega rondde een kaart af terwijl de
// patiënt net "te veel pijn" meldde. Zonder enige vraag verdween het seintje uit Vandaag en de inbox van de
// behandelaar, ook vanuit een paneel dat al open stond vóór het seintje binnenkwam (hertest Mark), en via de API.
// Nu weigert /api/kaart/archief eerst met 409 { seintjeOpen } en uitleg; de app vraagt "Toch afronden?"
// en stuurt dan opnieuw met seintjeGezien: true. Zonder browser, past in CI. `npm run test:archiefsein`
// Legal 2026-11-20 21u (WGBO): toch afronden komt als regel in het contactlogboek en de dossiertekst.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const idx = await readFile(join(root, "public/index.html"), "utf8");
assert.match(idx, /if\(d\.seintjeOpen&&!gezien\)\{if\(window\.confirm\(/, "app vraagt eerst bij een open seintje");
assert.match(idx, /archief:naarArchief,seintjeGezien:gezien\}/, "app stuurt na de vraag opnieuw met seintjeGezien");

const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-archiefsein-"));
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
const kop = (extra = {}) => ({ "content-type": "application/json", "x-forwarded-for": "10.5.8." + (ip++), ...extra });
const post = (pad, body, extra) => fetch(origin + pad, { method: "POST", headers: kop(extra), body: JSON.stringify(body) });
const get = (pad, extra) => fetch(origin + pad, { headers: kop(extra) });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "Fysio Archief Seintje";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }
  const S = { "x-praktijk-sessie": (await (await post("/api/praktijk/claim", { praktijk: P, wachtwoord: "seintje-wachtwoord", akkoord: true })).json()).sessie };
  const deel = async (naam) => (await (await post("/api/kaarten", { praktijk: P, naam, client: { c_naam: naam },
    chosen: [{ n: "Squat", i: 0 }], kaartId: "" }, S)).json()).id;
  const archief = (id, extra = {}) => post("/api/kaart/archief", { praktijk: P, id, archief: true, ...extra }, S);
  const inbox = async () => (await (await get("/api/praktijk/inbox?praktijk=" + encodeURIComponent(P), S)).json()).kaarten;

  // open pijnseintje: eerst 409 met uitleg, de kaart blijft lopen en het seintje in de inbox
  const k1 = await deel("Patient A");
  assert.equal((await post("/api/kaart/seintje", { id: k1, soort: "pijn" })).status, 200);
  let r = await archief(k1);
  assert.equal(r.status, 409, "afronden met open pijnseintje vraagt eerst");
  const d = await r.json();
  assert.equal(d.seintjeOpen, "pijn");
  assert.match(d.fout, /meldt te veel pijn/);
  assert.ok((await inbox()).some((k) => k.id === k1), "seintje staat nog in de inbox");
  assert.equal((await archief(k1, { seintjeGezien: true })).status, 200, "na bevestigen afgerond");
  // Legal 2026-11-20 21u (WGBO, art. 7:454 BW): het seintje verdwijnt uit Vandaag en de inbox, dus de
  // dossiertekst moet zeggen dat de kaart toch werd afgerond; anders lijkt het pijnseintje onbeantwoord.
  const kaartVan = async (id) => (await (await get("/api/praktijk/kaart?praktijk=" + encodeURIComponent(P) + "&id=" + id, S)).json()).kaart;
  const c1 = (await kaartVan(k1)).contact || [];
  assert.deepEqual(c1.map((x) => x.van + ":" + x.soort + (x.sein ? ":" + x.sein : "")), ["patient:pijn", "praktijk:afgerond-open:pijn"],
    "afronden ondanks een open seintje staat in het contactlogboek");
  const fn = idx.match(/  function dossierTekst\(kaart\)\{[\s\S]*?\n  \}\n/);
  const od = idx.match(/  function oefDagen\(c\)\{[\s\S]*?\n  \}\n/);
  assert.ok(fn && od, "dossierTekst en oefDagen gevonden");
  const ctx = { location: { origin: "https://fysiplan.nl" }, normEx: (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "") };
  vm.runInNewContext(od[0] + fn[0] + ";this.dossierTekst=dossierTekst;", ctx);
  const dossier = ctx.dossierTekst(await kaartVan(k1));
  assert.match(dossier, /praktijk: kaart afgerond terwijl het seintje "meldt te veel pijn" nog open stond/);
  assert.doesNotMatch(dossier, /praktijk: ""/, "geen lege berichtregel");
  // nog eens afronden (al afgerond) of terughalen schrijft geen tweede regel
  assert.equal((await archief(k1, { seintjeGezien: true })).status, 200);
  assert.equal(((await kaartVan(k1)).contact || []).filter((x) => x.soort === "afgerond-open").length, 1, "één regel");

  // open vraag
  const k2 = await deel("Patient B");
  assert.equal((await post("/api/kaart/seintje", { id: k2, soort: "vraag" })).status, 200);
  r = await archief(k2);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).seintjeOpen, "vraag");

  // geen open seintje, alleen "gaat goed", of al afgehandeld: meteen afgerond
  assert.equal((await archief(await deel("Patient C"))).status, 200, "zonder seintje meteen");
  const k4 = await deel("Patient D");
  assert.equal((await post("/api/kaart/seintje", { id: k4, soort: "goed" })).status, 200);
  assert.equal((await archief(k4)).status, 200, "alleen 'gaat goed' vraagt niets");
  const k5 = await deel("Patient E");
  assert.equal((await post("/api/kaart/seintje", { id: k5, soort: "pijn" })).status, 200);
  assert.equal((await post("/api/praktijk/inbox/afgehandeld", { praktijk: P, id: k5 }, S)).status, 200);
  assert.equal((await archief(k5)).status, 200, "afgehandeld seintje vraagt niets");
  // terughalen vraagt nooit
  assert.equal((await post("/api/kaart/archief", { praktijk: P, id: k1, archief: false }, S)).status, 200);
  console.log("PASS afronden met een open vraag- of pijnseintje vraagt eerst (server en app)");
} catch (e) {
  console.error(uit.slice(-2000));
  throw e;
} finally {
  app.kill();
  await rm(dataDir, { recursive: true, force: true });
}
