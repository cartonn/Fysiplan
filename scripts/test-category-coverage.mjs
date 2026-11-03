// Secundaire V2-categorieën: elke mapping heeft bewijs, nooit willekeurig vullen, en
// gebruikersoverrides gaan altijd voor.
//
// 1. Elke secundaire categorie in public/oefeningen-v2.json staat in
//    content/category-secondary-evidence.json, en andersom.
// 2. Nieuwe mappings: stabiel id, primaire categorie ongewijzigd, bekende categorie, beeld
//    aanwezig, geen uitleghouding, beeld niet afgekeurd, bewijsvelden ingevuld.
// 3. Afgewezen kandidaten (o.a. Standing chair heel/toe, Chair squat) hebben die categorie niet.
// 4. Neuro, Vestibulair, Bekken & postpartum en Sportrevalidatie worden niet via een
//    secundaire categorie gevuld zonder vastgelegde klinische goedkeuring.
// 5. De echte server: runtime-overrides (zoals de 5 die op 2026-11-03 in productie stonden)
//    vervangen groep en ook volledig; V1 krijgt de nieuwe V2-mappings niet.
// 6. Het dekkingsrapport telt de mappings mee en vult de niet-auto-vullen-categorieën niet.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { exerciseId } from '../lib/exercise-id.js';
import { berekenDekking, weergave } from './category-coverage.mjs';

const lees = (p) => JSON.parse(readFileSync(p, 'utf8'));
const v2 = lees('public/oefeningen-v2.json');
const v1 = lees('public/oefeningen.json');
const bewijs = lees('content/category-secondary-evidence.json');
const media = lees('public/mobile-media-review.json');
const uitleg = lees('public/mobile-narration-review.json');
const { groups, displayLabel } = weergave();
const bekend = new Set(groups.flatMap(([, labels]) => labels));
const geenAuto = new Set(bewijs.noAutoFill.categories);

// ---- 1. alles verklaard, en alles wat verklaard is staat er ook ----
const verklaard = new Map();
for (const m of [...bewijs.preexisting, ...bewijs.earlier, ...bewijs.mappings]) {
  verklaard.set(m.name, [...(verklaard.get(m.name) || []), m.add]);
}
for (const e of v2) for (const g of e.ook || []) {
  assert.ok((verklaard.get(e.naam) || []).includes(g), `secundaire categorie zonder bewijs: ${e.naam} -> ${g}`);
}
for (const [naam, labels] of verklaard) {
  const hits = v2.filter((e) => e.naam === naam);
  assert.equal(hits.length, 1, `${naam}: precies één record`);
  for (const g of labels) assert.ok((hits[0].ook || []).includes(g), `${naam}: verwacht ${g} als secundaire categorie`);
  assert.ok(!labels.includes(hits[0].groep), `${naam}: secundair gelijk aan primair`);
}
assert.ok(v2.every((e) => (e.ook || []).length <= 3), 'beheer staat hooguit 3 secundaire categorieën toe');

// ---- 2. nieuwe mappings: bewijs per stuk ----
const bronVan = (e) => String(e.kaartImg || e.img || '').replace(/^\/+/, '').replace(/^v2\//, '');
const afgekeurd = new Set([...media.entries, ...(media.rejectedSources || [])].filter((r) => r.status === 'rejected').map((r) => r.exerciseId + '|' + r.source));
for (const m of bewijs.mappings) {
  const e = v2.find((x) => x.naam === m.name);
  const id = exerciseId(e);
  assert.equal(id, m.exerciseId, `${m.name}: stabiel id`);
  assert.equal(v2.filter((x) => exerciseId(x) === id).length, 1, `${m.name}: id uniek`);
  if (e.exerciseId) assert.equal(e.exerciseId, id, `${m.name}: vastgelegd id gelijk aan berekend id`);
  assert.equal(e.groep, m.primary, `${m.name}: primaire categorie ongewijzigd`);
  assert.ok(bekend.has(displayLabel(m.add)), `${m.name}: ${m.add} is een bestaande standaardcategorie`);
  assert.ok(!geenAuto.has(m.add) || (m.clinicalApproval && m.clinicalApproval.by && m.clinicalApproval.date),
    `${m.name}: ${m.add} vraagt klinische goedkeuring`);
  assert.ok(existsSync(path.join('public', bronVan(e))), `${m.name}: kaartbeeld aanwezig`);
  assert.ok(existsSync(path.join('public', String(e.img).replace(/^\/+/, ''))), `${m.name}: lijnbeeld aanwezig`);
  assert.ok(!afgekeurd.has(id + '|' + bronVan(e)), `${m.name}: beeld is afgekeurd`);
  assert.ok(!uitleg.holds.some((h) => h.status === 'hold' && (h.exerciseId === id || h.name === m.name)), `${m.name}: uitleg wordt tegengehouden`);
  for (const veld of ['visual', 'text', 'holds', 'runtimeOverride']) assert.ok(String(m.evidence?.[veld] || '').length > 20, `${m.name}: bewijs ${veld}`);
  assert.ok(Array.isArray(m.evidence.sources) && m.evidence.sources.length, `${m.name}: bron`);
  for (const pad of [e.img, e.kaartImg]) assert.ok(m.evidence.visual.includes(pad), `${m.name}: het bekeken beeld ${pad} is het beeld van het record`);
}

// ---- 3. afgewezen kandidaten blijven buiten ----
for (const n of bewijs.notApplied) {
  const e = v2.find((x) => exerciseId(x) === n.exerciseId);
  assert.ok(e && e.naam === n.name, `${n.name}: bestaat onder dit id`);
  assert.ok(![e.groep, ...(e.ook || [])].includes(n.proposed), `${n.name}: niet toegepaste mapping ${n.proposed} staat er toch`);
  assert.ok(String(n.reason || '').length > 20, `${n.name}: reden`);
}
const heelToe = bewijs.notApplied.find((n) => n.name === 'Standing chair heel/toe');
assert.ok(heelToe && uitleg.holds.some((h) => h.status === 'hold' && h.exerciseId === heelToe.exerciseId), 'heel/toe: houding staat er en de mapping niet');
assert.ok(bewijs.notApplied.some((n) => n.exerciseId === 'fp_295fd35a63d44ef8'), 'Chair squat staat expliciet bij niet toegepast');
// Een tijdelijke bronhold (open bronkeuze, 2026-11-03) laat de categorie staan: Back extension
// en Rug extensie blijven onder Core en Rug vindbaar; alleen hun beeld telt als tegengehouden.
for (const id of ['fp_a0a18c0c13673d38', 'fp_7b07f346644f9c17']) {
  const e = v2.find((x) => exerciseId(x) === id);
  assert.ok(e && e.groep === 'Core' && (e.ook || []).includes('Rug'), `${id}: categorie ongewijzigd`);
  assert.ok(afgekeurd.has(id + '|' + bronVan(e)), `${e.naam}: beeld tegengehouden`);
}

// ---- 4. niet-auto-vullen-categorieën ----
for (const e of v2) for (const g of e.ook || []) {
  if (!geenAuto.has(displayLabel(g))) continue;
  const m = bewijs.mappings.find((x) => x.name === e.naam && x.add === g);
  assert.ok(m && m.clinicalApproval, `${e.naam} -> ${g} zonder klinische goedkeuring`);
}

// ---- 5. de echte server: overrides gaan voor, V1 blijft V1 ----
// De 5 overrides die op 2026-11-03 in productie stonden (publieke /v2/oefeningen.json,
// commit 736865e, health: verplaatst 5), plus twee op de nieuwe mappings zelf.
const productie = {
  'Abroller': { groep: 'Core', ook: ['Bovenste extremiteit'] },
  'Back extension': { groep: 'Core', ook: ['Bovenste extremiteit'] },
  'Balans op 1 been': { groep: 'Bosu', ook: ['Onderste extremiteit'] },
  'Abdominal (apparaat)': { groep: 'Apparaten', ook: ['Bovenste extremiteit'] },
  'Back (apparaat)': { groep: 'Apparaten', ook: ['Bovenste extremiteit'] }
};
const eigen = {
  'Seated chair squats': { groep: 'Seated Chair', ook: ['Bovenste extremiteit'] },
  'Foam roller back upper': { groep: 'Core', ook: [] }
};
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fysiplan-categorie-'));
await fs.writeFile(path.join(dataDir, 'categorie-wijzigingen.json'), JSON.stringify({ ...productie, ...eigen }));
const port = 8900 + (process.pid % 90);
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';server.stderr.on('data', (d) => { stderr += d; });
try {
  const haal = async (p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); assert.equal(r.status, 200, p); return r.json(); };
  let live;
  for (let i = 0; i < 100 && !live; i++) { try { live = await haal('/v2/oefeningen.json'); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  assert.ok(live, 'server start niet: ' + stderr.slice(0, 500));
  const vind = (lijst, naam) => { const hits = lijst.filter((e) => e.naam === naam); assert.equal(hits.length, 1, naam); return hits[0]; };
  for (const [naam, o] of Object.entries({ ...productie, ...eigen })) {
    const e = vind(live, naam);
    assert.equal(e.groep, o.groep, `${naam}: groep uit de override`);
    assert.deepEqual(e.ook || [], o.ook, `${naam}: ook uit de override, niets uit de basis erbij`);
  }
  for (const m of bewijs.mappings.filter((x) => !eigen[x.name])) {
    const e = vind(live, m.name);
    assert.equal(e.exerciseId, m.exerciseId, `${m.name}: zelfde id in de geleverde catalogus`);
    assert.equal(e.groep, m.primary);assert.ok(e.ook.includes(m.add), `${m.name}: mapping zichtbaar zonder override`);
  }
  // V1: de lijntekeningencatalogus kent de nieuwe V2-mappings niet
  const liveV1 = await haal('/oefeningen.json');
  for (const m of bewijs.mappings) {
    const basis = v1.filter((e) => e.naam === m.name);
    const geleverd = liveV1.filter((e) => e.naam === m.name);
    assert.equal(geleverd.length, basis.length, `${m.name}: V1 aantal`);
    if (eigen[m.name]) continue;
    for (const e of geleverd) assert.ok(!(e.ook || []).includes(m.add), `${m.name}: V1 krijgt de V2-mapping niet`);
  }
  assert.equal(liveV1.length, v1.length, 'V1-aantal ongewijzigd');
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  await fs.rm(dataDir, { recursive: true, force: true });
}

// ---- 6. dekkingsrapport ----
const rapport = berekenDekking();
const per = new Map(rapport.categories.map((c) => [c.category, c]));
for (const m of bewijs.mappings) {
  const c = per.get(displayLabel(m.add));
  assert.ok(c.secondaryRecords.includes(m.name), `rapport: ${m.name} telt mee in ${m.add}`);
}
for (const g of geenAuto) {
  const c = per.get(g);
  assert.ok(c && c.noAutoFill && c.secondary === 0, `rapport: ${g} niet via secundaire categorie gevuld`);
  assert.equal(c.missingAssets.length, c.primary - c.primaryAvailable, `rapport: ${g} ontbrekende beelden kloppen`);
}
assert.equal(rapport.totals.records, v2.length);
assert.equal(rapport.totals.withSecondary, v2.filter((e) => (e.ook || []).length).length);
const opgeslagen = existsSync('output/category-coverage-report.json') ? lees('output/category-coverage-report.json') : null;
assert.ok(opgeslagen, 'rapport ontbreekt: node scripts/category-coverage.mjs --write');
for (const c of opgeslagen.categories) {
  // het rapport mag ouder zijn dan latere beoordelingswijzigingen, maar nooit iets anders
  // tellen dan de catalogus: aantallen per categorie volgen uit public/oefeningen-v2.json
  const nu = per.get(c.category);
  assert.ok(nu, 'rapport: onbekende categorie ' + c.category);
  for (const k of ['records', 'primary', 'secondary']) assert.equal(c[k], nu[k], `opgeslagen rapport ${c.category}.${k} wijkt af: opnieuw schrijven`);
}

console.log(JSON.stringify({ passed: true, mappings: bewijs.mappings.length, earlier: bewijs.earlier.length, preexisting: bewijs.preexisting.length,
  notApplied: bewijs.notApplied.map((n) => n.name), noAutoFill: [...geenAuto], serverOverridesChecked: Object.keys({ ...productie, ...eigen }).length }));
