// Effectieve V2-categorieën zoals de echte server ze levert onder de productie-overrides.
//
// Aanleiding (2026-11-03): Rug telde op productie 10 en in de basiscatalogus van de
// gedeployde commit 11. Oorzaak: de runtime-override op Back extension (fp_a0a18c0c13673d38)
// vervangt ook volledig en laat de latere basis-mapping Rug (fcade75) dus niet zien.
// Een override is een bewuste beheerkeuze en gaat altijd voor; deze test legt vast dat
// tellen en filteren de geleverde catalogus volgen, en niet de basis.
//
// 1. De momentopname (content/category-production-overrides.json) past op de basis: elke
//    override hoort bij precies één record met hetzelfde exerciseId.
// 2. De server levert met precies die overrides: beeldfilter, groep en ook volledig uit de
//    override, niets uit de basis erbij, exerciseId ongewijzigd.
// 3. countCategory, matchesCategory en inGroep uit index.html tellen en filteren per
//    categorie exact de geleverde records.
// 4. Welke basis-secundaire categorieën op productie wegvallen staat vast in de
//    momentopname: een nieuwe mapping op een record met override faalt hier tot dat bewust
//    is vastgelegd. Nieuwe mappings uit category-secondary-evidence.json vallen nooit weg.
// 5. Rug: geleverd = basis - 1, het ontbrekende record is Back extension; V1 telt gelijk.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { exerciseId } from '../lib/exercise-id.js';

const lees = (p) => JSON.parse(readFileSync(p, 'utf8'));
const basis = lees('public/oefeningen-v2.json');
const v1Basis = lees('public/oefeningen.json');
const snap = lees('content/category-production-overrides.json');
const bewijs = lees('content/category-secondary-evidence.json');

// de weergaveregels en het filter van de bibliotheek zelf, niet een kopie
const html = readFileSync('public/index.html', 'utf8');
const ctx = vm.createContext({});
vm.runInContext(html.split('// CATEGORY_DISPLAY_START')[1].split('// CATEGORY_DISPLAY_END')[0], ctx);
vm.runInContext(html.match(/  function inGroep\(o,g\)\{[^\n]+/)[0], ctx);
ctx.USE_V2_LIBRARY = true;
const { displayLabel, matchesCategory, countCategory, inGroep } = ctx;
const groups = JSON.parse(vm.runInContext('JSON.stringify(groups)', ctx));
const labelsVan = (e) => new Set([e.groep, ...(e.ook || [])].map(displayLabel));

// ---- 1. momentopname past op de basis ----
assert.equal(snap.overrides.length, snap.source.verplaatst, 'momentopname: evenveel overrides als /health meldde');
const overrides = {};
for (const o of snap.overrides) {
  const hits = basis.filter((e) => e.naam === o.name);
  assert.equal(hits.length, 1, `${o.name}: precies één basisrecord`);
  assert.equal(exerciseId(hits[0]), o.exerciseId, `${o.name}: exerciseId`);
  assert.ok(o.groep && Array.isArray(o.ook) && o.ook.length <= 3, `${o.name}: override-vorm`);
  overrides[o.name] = { groep: o.groep, ook: o.ook };
}

// ---- verwachting: buildManifest('v2') onafhankelijk nagebouwd (zonder hernoemd/toegevoegd/verwijderd) ----
const klaar = (e) => {
  const bron = String(e.kaartImg || e.img || '');
  if (!bron || /^(?:data:|https?:|uploads\/)/.test(bron)) return Boolean(bron);
  return existsSync(path.join('public', bron.replace(/^\/+/, '')));
};
const basisKlaar = basis.filter(klaar);
const verwacht = new Map(basisKlaar.map((e) => {
  const o = overrides[e.naam];
  return [exerciseId(e), { naam: e.naam, groep: o ? o.groep : e.groep, ook: o ? o.ook : (e.ook || []) }];
}));
assert.equal(verwacht.size, basisKlaar.length, 'exerciseId uniek in de basis');

// ---- 2. de echte server met precies deze overrides ----
const vrijePoort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-effectief-'));
await fs.writeFile(path.join(dataDir, 'categorie-wijzigingen.json'), JSON.stringify(overrides));
const port = await vrijePoort();
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe']
});
let stderr = ''; server.stderr.on('data', (d) => { stderr += d; });
let geleverd, v1Geleverd, health;
try {
  const haal = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); assert.equal(r.status, 200, p); return r.json(); };
  for (let i = 0; i < 100 && !geleverd; i++) { try { geleverd = await haal('/v2/oefeningen.json'); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  assert.ok(geleverd, 'server start niet: ' + stderr.slice(0, 500));
  v1Geleverd = await haal('/oefeningen.json');
  health = await haal('/health');
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => server.exitCode !== null || server.signalCode !== null ? r() : server.once('exit', r));
  await fs.rm(dataDir, { recursive: true, force: true });
}
assert.equal(health.verplaatst, snap.overrides.length, 'health: aantal overrides');
assert.equal(health.v2Oefeningen, geleverd.length, 'health: aantal V2-records');

const perId = new Map(geleverd.map((e) => [e.exerciseId, e]));
assert.equal(perId.size, geleverd.length, 'geleverde exerciseIds uniek');
assert.deepEqual([...perId.keys()].sort(), [...verwacht.keys()].sort(), 'geleverd = basis met beeld, zelfde exerciseIds');
for (const [id, v] of verwacht) {
  const e = perId.get(id);
  assert.equal(e.naam, v.naam, `${id}: naam`);
  assert.equal(e.groep, v.groep, `${v.naam}: groep`);
  assert.deepEqual(e.ook || [], v.ook, `${v.naam}: ook`);
}
// override gaat voor: precies de override, geen basis-secundaire categorie erbij gemengd
for (const o of snap.overrides) {
  const e = perId.get(o.exerciseId);
  assert.ok(e, `${o.name}: geleverd onder hetzelfde exerciseId`);
  assert.equal(e.groep, o.groep, `${o.name}: groep uit de override`);
  assert.deepEqual(e.ook || [], o.ook, `${o.name}: ook precies uit de override`);
}

// ---- 3. tellen en filteren volgen de geleverde catalogus ----
const categorieen = [...new Set([...groups.flatMap(([, l]) => l), ...geleverd.flatMap((e) => [...labelsVan(e)])])];
const ruwe = [...new Set(geleverd.flatMap((e) => [e.groep, ...(e.ook || [])]))];
const telling = {};
for (const label of [...categorieen, ...ruwe]) {
  const doel = displayLabel(label);
  const ids = [...verwacht].filter(([, v]) => labelsVan(v).has(doel)).map(([id]) => id).sort();
  assert.equal(countCategory(geleverd, label), ids.length, `${label}: telling`);
  assert.deepEqual(geleverd.filter((e) => matchesCategory(e, label)).map((e) => e.exerciseId).sort(), ids, `${label}: filter`);
  assert.deepEqual(geleverd.filter((e) => inGroep(e, label)).map((e) => e.exerciseId).sort(), ids, `${label}: chipfilter`);
  telling[doel] = ids.length;
}
assert.equal(countCategory(geleverd, 'all'), geleverd.length);

// ---- 4. weggevallen basis-secundaire categorieën zijn bewust vastgelegd ----
const weg = [];
for (const e of basisKlaar) {
  const effectief = labelsVan(verwacht.get(exerciseId(e)));
  for (const g of e.ook || []) if (!effectief.has(displayLabel(g))) weg.push({ exerciseId: exerciseId(e), name: e.naam, label: g });
}
assert.deepEqual(weg, snap.shadowedSecondary.map(({ exerciseId: id, name, label }) => ({ exerciseId: id, name, label })),
  'basis-mapping valt op productie weg door een override: vastleggen in content/category-production-overrides.json (override niet terugdraaien)');
for (const s of snap.shadowedSecondary) {
  const b = basis.find((e) => exerciseId(e) === s.exerciseId);
  assert.deepEqual({ groep: b.groep, ook: b.ook || [] }, { groep: s.base.groep, ook: s.base.ook }, `${s.name}: basis zoals vastgelegd`);
  assert.deepEqual(overrides[s.name], s.effective, `${s.name}: effectief zoals vastgelegd`);
  assert.ok(String(s.cause).length > 40 && String(s.decision).length > 40, `${s.name}: oorzaak en besluit`);
}
const wegSleutel = new Set(weg.map((w) => w.name + '|' + w.label));
for (const m of bewijs.mappings) {
  assert.ok(!overrides[m.name], `${m.name}: nieuwe mapping op een record met productie-override (bewijs zegt: geen override)`);
  assert.ok(!wegSleutel.has(m.name + '|' + m.add), `${m.name}: nieuwe mapping ${m.add} valt weg`);
  assert.ok(matchesCategory(perId.get(m.exerciseId), m.add), `${m.name}: effectief vindbaar onder ${m.add}`);
}
for (const m of [...bewijs.preexisting, ...bewijs.earlier]) {
  const e = geleverd.find((x) => x.naam === m.name);
  if (!e) continue; // geen beeld: niet geleverd, telt nergens
  assert.equal(matchesCategory(e, m.add), !wegSleutel.has(m.name + '|' + m.add), `${m.name} -> ${m.add}: effectief alleen als niet weggevallen`);
}

// ---- 5. Rug concreet, en V1 ----
const rugBasis = basisKlaar.filter((e) => matchesCategory(e, 'Rug')).map(exerciseId);
const rugGeleverd = new Set(geleverd.filter((e) => matchesCategory(e, 'Rug')).map((e) => e.exerciseId));
assert.deepEqual(rugBasis.filter((id) => !rugGeleverd.has(id)), ['fp_a0a18c0c13673d38'], 'Rug: alleen Back extension ontbreekt');
assert.equal(rugGeleverd.size, rugBasis.length - 1, 'Rug: geleverd = basis - 1');
assert.ok(rugGeleverd.has('fp_7b07f346644f9c17'), 'Rug extensie (zelfde bronhold, geen override) blijft onder Rug');
assert.equal(v1Geleverd.length, v1Basis.length, 'V1-aantal ongewijzigd');

console.log(JSON.stringify({ passed: true, served: geleverd.length, overrides: snap.overrides.length,
  shadowed: weg.map((w) => `${w.exerciseId} ${w.name} -${w.label}`), rug: { base: rugBasis.length, served: rugGeleverd.size },
  categoriesChecked: categorieen.length + ruwe.length, effectiveCounts: telling }));
