// Mutatietests voor de twee smalle uitzonderingen van 2026-11-03:
//   A. tijdelijke bron-houds (scripts/build-mobile-media-review.mjs): gelden alleen voor
//      exact dit pad, deze bytes, deze naam en dit id; elke afwijking laat de bouw falen;
//   B. de V2-lijnbeeldcorrectie van hip extension / knee lift (content/v2-avatar-overrides.json):
//      alleen die twee, hash-gebonden; elke andere afwijking van V1 blijft een fout;
//   C. de lijnbeeldgraph ("run --execute") draait de correctie niet terug.
// Alles draait in een wegwerpmap met symlinks naar de echte bestanden; alleen de gemuteerde
// bestanden zijn kopieën. De echte catalogi, beoordeling en beelden blijven byte-gelijk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {exerciseId} from '../lib/exercise-id.js';

const repo = path.resolve(new URL('../', import.meta.url).pathname);
const lees = (p) => JSON.parse(fs.readFileSync(path.join(repo, p), 'utf8'));
const sha = (p) => createHash('sha256').update(fs.readFileSync(path.join(repo, p))).digest('hex');
const BEWAAKT = ['public/oefeningen.json', 'public/oefeningen-v2.json', 'public/mobile-media-review.json',
  'content/beginhouding-pijl.json', 'content/v2-avatar-overrides.json', 'content/v2-image-pair-report.json',
  'public/images/bovenste-extremiteit/dips-avatar-v7.jpg',
  'public/images/core/back-extension-avatar-v7.jpg', 'public/images/core/rug-extensie-avatar-v7.jpg',
  'public/images/core/back-extension.jpg', 'public/images/core/rug-extensie.jpg'];
const voor = BEWAAKT.map(sha);
const werk = fs.mkdtempSync(path.join(os.tmpdir(), 'fysiplan-uitzondering-'));
const KOPIEER = ['validate-exercise-backgrounds.mjs', 'publication-channel-graph.mjs', 'v2-line-art-graph.mjs'];

// Bouwt een wegwerpmap. Mappen in `echt` worden echte mappen met per bestand een symlink,
// zodat een schrijfactie in de wegwerpmap nooit via een symlink in de repo belandt.
// Scripts die hun root uit import.meta.url halen, worden gekopieerd (een symlink zou
// naar de echte repo terugwijzen).
let teller = 0;
function wegwerp({bestanden = {}, beelden = {}} = {}) {
  const root = path.join(werk, String(++teller));
  fs.mkdirSync(root);
  for (const naam of fs.readdirSync(repo)) {
    if (['public', 'content', 'scripts', '.git', 'output', 'dist'].includes(naam)) continue;
    fs.symlinkSync(path.join(repo, naam), path.join(root, naam));
  }
  for (const map of ['public', 'content', 'scripts']) {
    fs.mkdirSync(path.join(root, map));
    for (const naam of fs.readdirSync(path.join(repo, map))) {
      if (map === 'public' && (naam === 'mobile-media-review.json' || naam === 'images')) continue;
      if (map === 'content' && naam === 'v2-image-pair-report.json') continue;
      if (map === 'scripts' && KOPIEER.includes(naam)) fs.copyFileSync(path.join(repo, map, naam), path.join(root, map, naam));
      else fs.symlinkSync(path.join(repo, map, naam), path.join(root, map, naam));
    }
  }
  // beelden: symlinks per submap, behalve waar een beeld gemuteerd wordt
  fs.mkdirSync(path.join(root, 'public/images'));
  const gemuteerdeMappen = new Set(Object.keys(beelden).map((p) => p.split('/')[1]));
  for (const sub of fs.readdirSync(path.join(repo, 'public/images'))) {
    const doel = path.join(root, 'public/images', sub);
    if (!gemuteerdeMappen.has(sub)) { fs.symlinkSync(path.join(repo, 'public/images', sub), doel); continue; }
    fs.mkdirSync(doel);
    for (const f of fs.readdirSync(path.join(repo, 'public/images', sub))) {
      if (!beelden['images/' + sub + '/' + f]) fs.symlinkSync(path.join(repo, 'public/images', sub, f), path.join(doel, f));
    }
  }
  for (const [p, bytes] of Object.entries(beelden)) fs.writeFileSync(path.join(root, 'public', p), bytes);
  for (const [p, waarde] of Object.entries(bestanden)) {
    fs.rmSync(path.join(root, p), {force: true});
    fs.writeFileSync(path.join(root, p), typeof waarde === 'string' ? waarde : JSON.stringify(waarde, null, 2) + '\n');
  }
  return root;
}
function draai(root, script, args = [], {kopie = true} = {}) {
  const bestand = kopie ? path.join(root, 'scripts', script) : path.join(repo, 'scripts', script);
  return new Promise((klaar) => {
    const p = spawn(process.execPath, [bestand, ...args], {cwd: root});
    let uit = '', fout = '';
    p.stdout.on('data', (d) => uit += d); p.stderr.on('data', (d) => fout += d);
    p.on('close', (code) => klaar({code, uit, fout}));
  });
}

const v2 = lees('public/oefeningen-v2.json'), v1 = lees('public/oefeningen.json');
const pijlen = lees('content/beginhouding-pijl.json'), uitzonderingen = lees('content/v2-avatar-overrides.json');
const metV2 = (pas) => { const kopie = structuredClone(v2); pas(kopie); return {'public/oefeningen-v2.json': JSON.stringify(kopie, null, 1) + '\n'}; };
const naam = (lijst, n) => { const e = lijst.find((x) => x.naam === n); assert.ok(e, n); return e; };
const HEUP = 'Standing chair hip extension', KNIE = 'Standing chair knee lift';

try {
  // ---------- A. tijdelijke bron-houds ----------
  const dips = naam(v2, 'Dips');
  const anderBeeld = v2.find((e) => e.kaartImg?.startsWith('images/bovenste-extremiteit/') && e.kaartImg.endsWith('-avatar-v7.jpg')
    && !['Dips', 'Triceps dips'].includes(e.naam)).kaartImg;
  const herschreven = await sharp(fs.readFileSync(path.join(repo, 'public', dips.kaartImg))).jpeg({quality: 88}).toBuffer();
  assert.notEqual(createHash('sha256').update(herschreven).digest('hex'), sha('public/' + dips.kaartImg));
  // Back extension en Rug extensie (open bronkeuze): elk beeld opnieuw gecodeerd, dus zelfde
  // inhoud maar andere bytes, precies wat een stille vervanging op hetzelfde pad zou zijn.
  const bronkeuzeGevallen = [];
  for (const n of ['Back extension', 'Rug extensie']) {
    const e = naam(v2, n);
    const opnieuw = await sharp(fs.readFileSync(path.join(repo, 'public', e.kaartImg))).jpeg({quality: 87}).toBuffer();
    assert.notEqual(createHash('sha256').update(opnieuw).digest('hex'), sha('public/' + e.kaartImg), n);
    const fout = new RegExp('Tijdelijke hold voor ' + n + ' past niet meer');
    bronkeuzeGevallen.push(
      [n + ': ander pad', {bestanden: metV2((c) => { naam(c, n).kaartImg = anderBeeld; })}, fout],
      [n + ': andere bytes op hetzelfde pad', {beelden: {[e.kaartImg]: opnieuw}}, fout],
      [n + ': andere naam bij hetzelfde id', {bestanden: metV2((c) => { naam(c, n).naam = n + ' (variant)'; })}, fout],
      [n + ': ander id (herkoppeld lijnbeeld)', {bestanden: metV2((c) => { naam(c, n).img = 'images/core/' + n.toLowerCase().replace(' ', '-') + '-nieuw.jpg'; })},
        new RegExp('Tijdelijke hold niet toegepast: ' + n)]);
  }
  const houdGevallen = [
    ['controle: exacte bron', {}, null],
    ...bronkeuzeGevallen,
    ['Chair squat: ander pad', {bestanden: metV2((c) => { naam(c, 'Chair squat').kaartImg = anderBeeld; })}, /Tijdelijke hold voor Chair squat past niet meer/],
    ['Chair squat: andere bytes', {beelden: {'images/onderste-extremiteit/chair-squat-avatar-v7.jpg': herschreven}}, /Tijdelijke hold voor Chair squat past niet meer/],
    ['ander pad', {bestanden: metV2((c) => { naam(c, 'Dips').kaartImg = anderBeeld; })}, /Tijdelijke hold voor Dips past niet meer/],
    ['andere bytes op hetzelfde pad', {beelden: {[dips.kaartImg]: herschreven}}, /Tijdelijke hold voor Dips past niet meer/],
    ['andere naam bij hetzelfde id', {bestanden: metV2((c) => { naam(c, 'Dips').naam = 'Dips aan de bank'; })}, /Tijdelijke hold voor Dips past niet meer/],
    ['ander id (herkoppeld lijnbeeld)', {bestanden: metV2((c) => { naam(c, 'Dips').img = 'images/bovenste-extremiteit/dips-nieuw.jpg'; })}, /Tijdelijke hold niet toegepast: Dips/],
  ];
  const houdUitkomst = await Promise.all(houdGevallen.map(([, opzet]) => {
    const root = wegwerp(opzet);
    return draai(root, 'build-mobile-media-review.mjs', [], {kopie: false}).then((r) => ({...r, root}));
  }));
  houdGevallen.forEach(([label, , verwacht], i) => {
    const r = houdUitkomst[i];
    if (!verwacht) {
      assert.equal(r.code, 0, label + ': ' + r.fout);
      const review = JSON.parse(fs.readFileSync(path.join(r.root, 'public/mobile-media-review.json'), 'utf8'));
      assert.equal(review.summary.rejected, 12, label);
      assert.equal(review.entries.filter((e) => e.hold?.temporary).length, 7, label);
      assert.deepEqual(review.entries.filter((e) => e.hold?.kind === 'source-choice-pending').map((e) => e.exerciseId).sort(),
        ['fp_7b07f346644f9c17', 'fp_a0a18c0c13673d38'], label);
      // de wegwerpmap levert exact dezelfde beoordeling als de repo: het harnas zelf verandert niets
      assert.equal(fs.readFileSync(path.join(r.root, 'public/mobile-media-review.json'), 'utf8'),
        fs.readFileSync(path.join(repo, 'public/mobile-media-review.json'), 'utf8'), label);
    } else {
      assert.notEqual(r.code, 0, label + ': de bouw had moeten falen');
      assert.match(r.fout, verwacht, label);
      assert.ok(!fs.existsSync(path.join(r.root, 'public/mobile-media-review.json')), label + ': geen halve beoordeling geschreven');
    }
  });

  // ---------- B. V2-lijnbeeldcorrectie: alleen deze twee, hash-gebonden ----------
  const zonderUitzondering = structuredClone(uitzonderingen); zonderUitzondering.overrides = [];
  const verkeerdeHash = structuredClone(uitzonderingen); verkeerdeHash.overrides[0].lineSha256 = '0'.repeat(64);
  const pijlTerug = structuredClone(pijlen);
  for (const o of uitzonderingen.overrides) pijlTerug.entries.find((p) => p.id === o.arrow.id).source = o.arrow.previousSource;
  const v1Hersteld = structuredClone(v1);
  { const h = naam(v1Hersteld, HEUP), k = naam(v1Hersteld, KNIE); [h.img, k.img] = [k.img, h.img]; [h.kaartImg, k.kaartImg] = [k.kaartImg, h.kaartImg]; }
  const derde = ['Dips', 'Triceps dips'];
  const poortGevallen = [
    ['controle: huidige stand', {}, null],
    ['derde oefening wijkt af van V1 (niet vastgelegd)', {bestanden: metV2((c) => {
      const a = naam(c, derde[0]), b = naam(c, derde[1]); [a.img, b.img] = [b.img, a.img]; })},
      /V2 gebruikt niet exact de V1-afbeelding voor (Triceps )?dips|onjuiste kleur\/lijn-koppelingen: Dips, Triceps dips/i],
    ['V2-lijnbeeld terug naar V1, kaartbeeld gecorrigeerd', {bestanden: metV2((c) => { naam(c, HEUP).img = naam(v1, HEUP).img; })},
      /(1-op-1 kleur\/lijn-koppeling voor|V2-uitzondering) Standing chair hip extension/],
    // V1 'repareren' door de lijnbeelden te wisselen verandert ook de afgeleide V1-id's (kaartlinks)
    ['V1 aangepast (mag niet)', {bestanden: {'public/oefeningen.json': JSON.stringify(v1Hersteld, null, 1) + '\n'}}, /exerciseId van V1 en V2 lopen uiteen/],
    ['pijlbeelden niet meegeschoven', {bestanden: {'content/beginhouding-pijl.json': pijlTerug}}, /pijlbeeld 313 hoort niet meer onder het gecorrigeerde lijnbeeld/],
    ['uitzondering met verkeerde hash', {bestanden: {'content/v2-avatar-overrides.json': verkeerdeHash}}, /V2-lijnbeeld .* is gewijzigd/],
    ['uitzonderingen verwijderd, correctie blijft staan', {bestanden: {'content/v2-avatar-overrides.json': zonderUitzondering}},
      /1-op-1 kleur\/lijn-koppeling voor Standing chair hip extension|onjuiste kleur\/lijn-koppelingen: Standing chair hip extension, Standing chair knee lift/],
  ];
  for (const [label, opzet, verwacht] of poortGevallen) {
    const root = wegwerp(opzet);
    for (const poort of ['validate-exercise-backgrounds.mjs', 'publication-channel-graph.mjs']) {
      const r = await draai(root, poort);
      if (!verwacht) assert.equal(r.code, 0, `${label} / ${poort}: ${r.fout}`);
      else {
        assert.notEqual(r.code, 0, `${label} / ${poort}: had moeten falen`);
        assert.match(r.fout + r.uit, verwacht, `${label} / ${poort}`);
      }
    }
  }

  // ---------- C. de lijnbeeldgraph schrijft de correctie niet terug ----------
  // Alleen legacykaarten in de wegwerpcatalogus: daarvoor maakt de graph nooit nieuwe
  // lijnbeelden, hij herschrijft alleen het img-veld. Precies dat moet de correctie overleven.
  {
    const legacy = v2.filter((e) => !e.coreExerciseId);
    const root = wegwerp({bestanden: {'public/oefeningen-v2.json': JSON.stringify(legacy, null, 1) + '\n'}});
    const r = await draai(root, 'v2-line-art-graph.mjs', ['run', '--execute']);
    assert.equal(r.code, 0, r.fout);
    const na = JSON.parse(fs.readFileSync(path.join(root, 'public/oefeningen-v2.json'), 'utf8'));
    for (const o of uitzonderingen.overrides) {
      const e = na.find((x) => exerciseId(x) === o.exerciseId);
      assert.equal(e.img, o.lineImg, o.name + ': graph zet het V2-lijnbeeld niet terug naar V1');
      assert.equal(e.kaartImg, o.kaartImg, o.name);
    }
    const anders = na.filter((e) => !uitzonderingen.overrides.some((o) => o.exerciseId === exerciseId(e)) && e.img !== naam(v1, e.naam).img);
    assert.deepEqual(anders.map((e) => e.naam), [], 'alle andere legacykaarten blijven exact V1');
    const rapport = JSON.parse(fs.readFileSync(path.join(root, 'content/v2-image-pair-report.json'), 'utf8'));
    assert.deepEqual(rapport.pairs.filter((p) => p.source === 'v2-correction').map((p) => p.name).sort(), [HEUP, KNIE]);
  }
} finally {
  fs.rmSync(werk, {recursive: true, force: true});
}
assert.deepEqual(BEWAAKT.map(sha), voor, 'echte catalogi, beoordeling, pijlen en beelden byte-gelijk');
console.log('Uitzonderingen smal: 7 bron-houds; Dips-, Back extension- en Rug extensie-mutaties op pad/bytes/naam/id en Chair squat-mutaties op pad/bytes falen; V2-lijnbeeldcorrectie geldt alleen voor de 2 vastgelegde oefeningen (derde afwijking, V1-wijziging, losse pijlen, verkeerde hash of ontbrekende uitzondering falen in beide poorten); de lijnbeeldgraph draait de correctie niet terug.');
