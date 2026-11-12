// De database die meeschrijft (reviewlijst punt 11). `npm run test:database`
//
// Draait tegen een echte PostgreSQL: TEST_DATABASE_URL als die gezet is, anders een eigen tijdelijke
// database met initdb (op de runner van GitHub staat PostgreSQL al; lokaal als root draait die als
// gebruiker postgres). Zonder PostgreSQL faalt de test: hij slaat zichzelf niet over.
//
// - uit tenzij DATABASE_URL én DATABASE_MEESCHRIJVEN=aan
// - de eerste ronde zet alle bestanden over, sessies en sleutels niet
// - elke schrijfactie komt erachteraan: de kaart, een nieuwe kaartversie
// - de vergelijking is gelijk, en ziet het als de database afwijkt
// - terugzetten naar een lege map geeft dezelfde bestanden; een niet-lege map weigert het script
// - een database die er niet is, houdt de app niet op
// - een kaart die voorgoed weg is, verdwijnt met haar versies
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { chown, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { gespiegeld, canoniek, vinger, kaartRijen, praktijkRijen, leeslogRijen, maakMeeschrijver } from "../lib/database.js";
import { maakPgDb } from "../lib/database-pg.js";

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const root = process.cwd();
const DAG = 86400e3;

// ---------- de rekenregels ----------
assert.deepEqual(["kaarten.json", "praktijk-accounts.json", "leeslog.json", "praktijk-sessies.json", "beheer-sessies.json", "media-sleutel.json", "v1-insteltokens.json", "test-postbak.json", "kaarten.json.tmp-ab12", "beheer-log.jsonl", "../x.json"].map(gespiegeld),
  [true, true, true, false, false, false, false, false, false, false, true]);
assert.equal(canoniek({ b: 1, a: [1, { d: 2, c: 3 }], u: undefined }), '{"a":[1,{"c":3,"d":2}],"b":1}');
assert.equal(vinger({ a: 1, b: 2 }), vinger({ b: 2, a: 1 }), "de volgorde van sleutels telt niet");
assert.notEqual(vinger({ a: 1 }), vinger({ a: 2 }));
{
  const k = kaartRijen({ p1: { a: { id: "k1", ts: 5, verwijderdOp: 9, gearchiveerd: true }, b: "kapot" }, p2: null });
  assert.deepEqual(k.map((r) => [r.pk, r.sleutel, r.id, r.ts, r.verwijderd_op, r.gearchiveerd]), [["p1", "a", "k1", 5, 9, true]]);
  const p = praktijkRijen({ p1: { naam: "A", hash: "geheim", gemaakt: 3, leden: [{ id: "l1", naam: "Bea", email: "b@x", rol: "beheerder", hash: "h", totp: { geheim: "G" } }, { naam: "zonder id" }] } });
  assert.deepEqual(p.praktijken.map((r) => [r.pk, r.naam, r.gemaakt]), [["p1", "A", 3]]);
  assert.deepEqual(p.logins.map((r) => [r.id, r.naam, r.email, r.rol, r.actief]), [["l1", "Bea", "b@x", "beheerder", true]]);
  assert.doesNotMatch(JSON.stringify(p), /geheim|"h"/, "geen wachtwoord of tweede stap in de tabellen");
  const l = leeslogRijen({ p1: [{ t: 1, tot: 2, n: 1, k: "k1", s: "geopend", wie: "Bea", lid: "l1" }], p2: "x" });
  assert.deepEqual(Object.keys(l), ["p1"]);
  assert.equal(l.p1.rijen[0].wie, "Bea");
}

// ---------- een echte PostgreSQL ----------
async function postgres() {
  if (process.env.TEST_DATABASE_URL) {
    const naam = "fp_test_" + Date.now().toString(36);
    const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await c.connect();
    await c.query("create database " + naam); await c.end();
    const u = new URL(process.env.TEST_DATABASE_URL); u.pathname = "/" + naam;
    return { url: u.toString(), async stop() { const d = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await d.connect(); await d.query("drop database if exists " + naam + " with (force)"); await d.end(); } };
  }
  const kandidaten = [];
  try { kandidaten.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim()); } catch {}
  for (const v of (existsSync("/usr/lib/postgresql") ? readdirSync("/usr/lib/postgresql") : []).sort().reverse()) kandidaten.push("/usr/lib/postgresql/" + v + "/bin");
  const bin = kandidaten.find((b) => existsSync(join(b, "initdb")) && existsSync(join(b, "pg_ctl")));
  if (!bin) throw new Error("geen PostgreSQL gevonden: zet TEST_DATABASE_URL of installeer PostgreSQL");
  const dir = await mkdtemp(join(tmpdir(), "fysiplan-pg-"));
  const alsRoot = process.getuid && process.getuid() === 0;
  if (alsRoot) { const id = spawnSync("id", ["-u", "postgres"], { encoding: "utf8" }); const gid = spawnSync("id", ["-g", "postgres"], { encoding: "utf8" }); await chown(dir, Number(id.stdout), Number(gid.stdout)); }
  const voer = (prog, args) => { const r = alsRoot ? spawnSync("runuser", ["-u", "postgres", "--", join(bin, prog), ...args], { encoding: "utf8" }) : spawnSync(join(bin, prog), args, { encoding: "utf8" }); if (r.status !== 0) throw new Error(prog + ": " + r.stderr + r.stdout); };
  const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const poort = s.address().port; await new Promise((r) => s.close(r));
  voer("initdb", ["-D", join(dir, "data"), "-A", "trust", "-U", "postgres", "--no-sync"]);
  voer("pg_ctl", ["-D", join(dir, "data"), "-o", `-p ${poort} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, "-w", "-l", join(dir, "log"), "start"]);
  return { url: `postgres://postgres@127.0.0.1:${poort}/postgres`, async stop() { try { voer("pg_ctl", ["-D", join(dir, "data"), "-m", "immediate", "-w", "stop"]); } catch {} await rm(dir, { recursive: true, force: true }); } };
}

const PG = await postgres();
const sql = new pg.Pool({ connectionString: PG.url, max: 2 });
const rijen = async (q, p) => (await sql.query(q, p)).rows;
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-database-"));
const SLEUTEL = "test-beheersleutel-" + Date.now();
const K1 = "aaaabbbbcccc", K2 = "ddddeeeeffff";
const kaart = (id, naam) => ({ id, praktijk: "Fysio Db", naam, ts: Date.now() - DAG, rows: {}, cells: {}, vids: {}, chosen: [{ n: "Squat", id: "", i: 0 }], client: { c_naam: naam } });
await writeFile(join(dataDir, "kaarten.json"), JSON.stringify({ "fysio db": { een: kaart(K1, "Een"), twee: kaart(K2, "Twee") } }));
await writeFile(join(dataDir, "praktijk-accounts.json"), JSON.stringify({ "p-0123456789abcdef": { naam: "Fysio Db", hash: "scrypt$00$00", gemaakt: Date.now() - 5 * DAG, leden: [
  { id: "aaaaaaaaaaaa", naam: "Bea", email: "bea@db.example", rol: "beheerder", hash: "scrypt$00$00", totp: { geheim: "JBSWY3DPEHPK3PXP" } },
  { id: "bbbbbbbbbbbb", naam: "Tom", email: "tom@db.example", rol: "therapeut", hash: "scrypt$00$00" }] } }));
await writeFile(join(dataDir, "leeslog.json"), JSON.stringify({ "fysio db": [{ t: Date.now() - 60e3, tot: Date.now() - 60e3, n: 1, k: K1, s: "geopend", wie: "Bea", lid: "aaaaaaaaaaaa" }] }));
await writeFile(join(dataDir, "praktijk-sessies.json"), JSON.stringify({ x: { pk: "p" } }));

async function vrijePoort() { const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
function startServer(extra) {
  return (async () => {
    const port = await vrijePoort();
    const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: SLEUTEL, ANTHROPIC_API_KEY: "", PROEF_VERPLICHT: "uit", EIGEN_LOGIN_VERPLICHT: "uit", ...extra };
    for (const k of Object.keys(env)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_|MAIL_)/.test(k) || k === "NODE_ENV") delete env[k];
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    const app = spawn(process.execPath, ["server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const s = { app, origin: `http://127.0.0.1:${port}`, uit: "" };
    app.stdout.on("data", (c) => { s.uit += c; });
    app.stderr.on("data", (c) => { s.uit += c; });
    for (let i = 0; i < 200; i++) { try { if ((await fetch(s.origin + "/health")).ok) break; } catch {} await wacht(50); }
    s.health = async () => (await (await fetch(s.origin + "/health")).json()).database;
    s.stop = async () => { app.kill("SIGTERM"); await new Promise((r) => (app.exitCode !== null ? r() : app.once("exit", r))); };
    return s;
  })();
}
let ip = 1;
const tik = (s, id, score) => fetch(s.origin + "/api/kaart/meting", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.93.0." + (ip++ & 255), origin: s.origin }, body: JSON.stringify({ id, score }) });
const beheer = (s, pad, body) => fetch(s.origin + pad, body ? { method: "POST", headers: { "content-type": "application/json", "x-admin-sleutel": SLEUTEL, origin: s.origin }, body: JSON.stringify(body) } : { headers: { "x-admin-sleutel": SLEUTEL } });
async function bijgewerkt(s, min) {
  let d;
  for (let i = 0; i < 200; i++) { d = await s.health(); if (d && d.wachtrij === 0 && d.geschreven >= min) return d; await wacht(50); }
  throw new Error("de database liep niet bij: " + JSON.stringify(d));
}
const terugzetten = (naar, ...extra) => spawnSync(process.execPath, ["scripts/database-terugzetten.mjs", naar, ...extra], { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: PG.url } });

let s = null;
try {
  // 1) uit: DATABASE_URL alleen is niet genoeg
  s = await startServer({ DATABASE_URL: PG.url, DATABASE_MEESCHRIJVEN: "" });
  assert.equal(await s.health(), "uit");
  assert.equal((await tik(s, K1, 3)).status, 200);
  await s.stop();
  assert.equal((await rijen("select count(*)::int as n from pg_tables where tablename = 'fp_bestand'"))[0].n, 0, "uit: geen tabel gemaakt");

  // 2) aan: de eerste ronde zet alles over
  s = await startServer({ DATABASE_URL: PG.url, DATABASE_MEESCHRIJVEN: "aan" });
  let d = await bijgewerkt(s, 3);
  assert.equal(d.stand, "meeschrijven");
  assert.equal(d.fouten, 0, s.uit);
  const namen = (await rijen("select naam from fp_bestand order by naam")).map((r) => r.naam);
  for (const n of ["kaarten.json", "praktijk-accounts.json", "leeslog.json"]) assert.ok(namen.includes(n), n + " staat erin: " + namen);
  assert.ok(!namen.some((n) => /sessies|sleutel/.test(n)), "geen sessies of sleutels: " + namen);
  assert.deepEqual((await rijen("select id, ts is not null as ts from fp_kaart order by id")).map((r) => [r.id, r.ts]), [[K1, true], [K2, true]]);
  assert.equal((await rijen("select count(*)::int as n from fp_kaartversie"))[0].n, 2);
  assert.deepEqual((await rijen("select naam, email, rol from fp_login order by naam")).map((r) => [r.naam, r.email, r.rol]), [["Bea", "bea@db.example", "beheerder"], ["Tom", "tom@db.example", "therapeut"]]);
  assert.deepEqual((await rijen("select naam from fp_praktijk")).map((r) => r.naam), ["Fysio Db"]);
  assert.deepEqual((await rijen("select k, s, wie from fp_leeslog")).map((r) => [r.k, r.s, r.wie]), [[K1, "geopend", "Bea"]]);
  const kolommen = (await rijen("select column_name from information_schema.columns where table_name in ('fp_login','fp_praktijk')")).map((r) => r.column_name);
  assert.ok(!kolommen.some((c) => /hash|totp|wachtwoord/.test(c)), "geen wachtwoord in de tabellen: " + kolommen);

  // 3) een schrijfactie van de patiënt komt erachteraan, met een nieuwe kaartversie
  const voor = d.geschreven;
  assert.equal((await tik(s, K2, 6)).status, 200);
  d = await bijgewerkt(s, voor + 1);
  const k2 = (await rijen("select data from fp_kaart where id = $1", [K2]))[0].data;
  assert.equal(k2.metingen.at(-1).s ?? k2.metingen.at(-1).score ?? k2.metingen.at(-1)[1], 6, JSON.stringify(k2.metingen));
  assert.equal((await rijen("select count(*)::int as n from fp_kaartversie where id = $1", [K2]))[0].n, 2, "tweede versie van deze kaart");
  assert.equal((await rijen("select count(*)::int as n from fp_kaartversie where id = $1", [K1]))[0].n, 1, "de andere kaart is niet opnieuw geschreven");

  // 4) de vergelijking: gelijk; alleen beheer met volledige rechten
  assert.equal((await fetch(s.origin + "/api/beheer/database/vergelijk", { method: "POST", headers: { "content-type": "application/json", origin: s.origin }, body: "{}" })).status, 403);
  let r = await beheer(s, "/api/beheer/database/vergelijk", {});
  let v = (await r.json()).vergelijking;
  assert.equal(r.status, 200);
  assert.equal(v.gelijk, true, JSON.stringify(v));
  assert.ok(v.bestanden >= 3);
  assert.equal((await s.health()).laatsteVergelijking.gelijk, true);
  assert.equal((await (await beheer(s, "/api/beheer/database")).json()).database.stand, "meeschrijven");

  // 5) de hersteltest: terug naar een lege map, gelijk aan de datamap; een niet-lege map weigert
  const terug = await mkdtemp(join(tmpdir(), "fysiplan-terug-"));
  let t = terugzetten(join(terug, "a"), "--vergelijk", dataDir);
  assert.equal(t.status, 0, t.stdout + t.stderr);
  assert.match(t.stdout, /gelijk aan/);
  assert.deepEqual(JSON.parse(await readFile(join(terug, "a", "kaarten.json"), "utf8")), JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8")));
  t = terugzetten(dataDir);
  assert.equal(t.status, 2, "nooit in een map waar al iets staat");
  assert.match(t.stderr, /niet leeg/);

  // 6) wijkt de database af, dan ziet de vergelijking dat
  await sql.query("update fp_bestand set inhoud = '{}'::jsonb where naam = 'leeslog.json'");
  await sql.query("delete from fp_login where naam = 'Tom'");
  v = (await (await beheer(s, "/api/beheer/database/vergelijk", {})).json()).vergelijking;
  assert.equal(v.gelijk, false);
  assert.ok(v.verschillen.some((x) => x.naam === "leeslog.json" && /verschilt/.test(x.tekst)), JSON.stringify(v.verschillen));
  assert.ok(v.verschillen.some((x) => x.wat === "fp_login"), JSON.stringify(v.verschillen));
  t = terugzetten(join(terug, "b"), "--vergelijk", dataDir);
  assert.equal(t.status, 1);
  assert.match(t.stdout, /leeslog\.json \(inhoud verschilt\)/);
  assert.equal((await rijen("select count(*)::int as n from fp_vergelijking"))[0].n, 2, "elke vergelijking wordt bewaard");
  await s.stop();

  // 7) na een herstart haalt de eerste ronde alles weer gelijk, zonder dubbele versies
  s = await startServer({ DATABASE_URL: PG.url, DATABASE_MEESCHRIJVEN: "aan" });
  await bijgewerkt(s, 3);
  v = (await (await beheer(s, "/api/beheer/database/vergelijk", {})).json()).vergelijking;
  assert.equal(v.gelijk, true, "na de herstart weer gelijk: " + JSON.stringify(v.verschillen));
  assert.equal((await rijen("select count(*)::int as n from fp_kaartversie"))[0].n, 3);
  await s.stop();

  // 8) een database die er niet is, houdt de app niet op
  s = await startServer({ DATABASE_URL: "postgres://postgres@127.0.0.1:" + (await vrijePoort()) + "/x", DATABASE_MEESCHRIJVEN: "aan" });
  assert.equal((await tik(s, K1, 7)).status, 200, "de patiënt kan gewoon tikken");
  const kaartenNu = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  assert.ok(JSON.stringify(kaartenNu["fysio db"].een.metingen).includes("7"), "het bestand is bijgewerkt");
  for (let i = 0; i < 100 && !(await s.health()).startFout; i++) await wacht(50);
  d = await s.health();
  assert.ok(d.startFout, "de fout staat in /health: " + JSON.stringify(d));
  assert.equal((await (await fetch(s.origin + "/health")).json()).ok, true);
  await s.stop();

  // 9) een kaart die voorgoed weg is, verdwijnt met al haar versies (rechtstreeks met de module)
  const db = maakPgDb(PG.url);
  const m = maakMeeschrijver({ db, dataDir, log: { error() {} } });
  await m.start();
  assert.ok(await m.bij());
  const zonderTwee = JSON.parse(await readFile(join(dataDir, "kaarten.json"), "utf8"));
  delete zonderTwee["fysio db"].twee;
  m.meld(join(dataDir, "kaarten.json"), JSON.stringify(zonderTwee));
  m.meld("/ergens/anders/kaarten.json", "{}");
  assert.ok(await m.bij());
  assert.equal((await rijen("select count(*)::int as n from fp_kaart where id = $1", [K2]))[0].n, 0);
  assert.equal((await rijen("select count(*)::int as n from fp_kaartversie where id = $1", [K2]))[0].n, 0, "geen versies van een verdwenen kaart");
  assert.ok((await rijen("select count(*)::int as n from fp_kaartversie where id = $1", [K1]))[0].n >= 1);
  // en een bestand dat niet gespiegeld wordt, of uit een andere map komt, gaat er niet in
  assert.equal(m.stand().fouten, 0);
  await db.sluit();

  console.log("test-database: ok (uit tenzij aangezet, eerste ronde, meeschrijven met kaartversies, vergelijking gelijk en ongelijk, terugzetten, herstart, database weg houdt niemand op, verdwenen kaart zonder versies)");
} catch (e) {
  if (s) console.error(s.uit.slice(-3000));
  throw e;
} finally {
  if (s && s.app.exitCode === null) s.app.kill();
  await sql.end().catch(() => {});
  await PG.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
