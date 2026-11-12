// Semantische houdingvolgorde (content/mobile-pose-order.json, 2026-11-03).
//
// Dumbell bench press: de meting nummert de figuren van boven naar onder, maar het bovenste
// figuur toont de gezakte dumbbells en het onderste de gestrekte armen. De eigen uitleg begint
// met de dumbbells boven de borst. De kaart toont poses[0] als Beginhouding, dus de geleverde
// volgorde is omgedraaid. Deze test bewijst:
//   1. de vastgelegde correctie is gebonden aan exact deze bron, uitleg en twee uitsnedes;
//   2. de kaart krijgt exact de gemeten bronuitsnedes, alleen in de betekenisvolgorde, en de
//      meetkunde (uitsnedes, as, controle) is ongewijzigd; geen klinische goedkeuring;
//   3. elke andere goedgekeurde oefening krijgt precies de gemeten volgorde (geen bijwerking);
//   4. de indeling (lib/pose-frames.js en de kopie in kaart.html) rekent een omgekeerde
//      y-volgorde per uitsnede juist uit: zelfde schaal, gecentreerd, echt zijwaarts verschil;
//   5. de echte kaartcode leest de volgorde in en tekent als Beginhouding de gestrekte armen.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';
import {poseFrameLayout, validatePosePair} from '../lib/pose-frames.js';
import {poseCandidate} from './pose-crop-candidates.mjs';

const lees = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const ID = 'fp_4bc24b8993e02443', BRON = 'images/bovenste-extremiteit/dumbell-bench-press-avatar-v7.jpg';
const BRON_SHA = 'a4119635d7e6ca7a6d87e4174e142ed7784b3c1318ce31af4d09af969870d43d';
// de werkelijke bronuitsnedes zoals de meting ze vindt (boven, onder)
const BOVEN = {x: 116, y: 136, w: 540, h: 472};   // ellebogen gebogen, dumbbells laag
const ONDER = {x: 164, y: 628, w: 500, h: 552};   // armen gestrekt, dumbbells boven de borst

const volgorde = lees('content/mobile-pose-order.json');
const review = lees('public/mobile-media-review.json');
const v2 = lees('public/oefeningen-v2.json'), v1 = lees('public/oefeningen.json');

// ---- 1. de correctie: precies één, aan alles gebonden ----
assert.deepEqual(volgorde.overrides.map((o) => o.exerciseId), [ID], 'alleen Dumbell bench press heeft een volgordecorrectie');
const o = volgorde.overrides[0];
const bytes = fs.readFileSync('public/' + BRON);
assert.equal(sha(bytes), BRON_SHA, 'bronbytes ongewijzigd');
assert.equal(o.assetSha256, BRON_SHA); assert.equal(o.source, BRON); assert.equal(o.name, 'Dumbell bench press');
assert.equal(o.clinicalApproved, false);
for (const [label, lijst] of [['V2', v2], ['V1', v1]]) {
  const e = lijst.filter((x) => exerciseId(x) === ID);
  assert.equal(e.length, 1, label + ': precies één record');
  assert.equal(e[0].naam, o.name, label); assert.equal(e[0].kaartImg, BRON, label);
  assert.equal(sha(e[0].uitleg), o.explanationSha256, label + ': exact de uitleg waarop de volgorde berust');
  assert.match(e[0].uitleg, /^Lig op de bank met in elke hand een dumbell boven je borst\. Laat de dumbells langzaam naast je borst zakken en druk ze weer omhoog tot gestrekte armen\.$/, label);
}
assert.deepEqual(o.start.crop, ONDER, 'beginhouding = onderste figuur');
assert.deepEqual(o.end.crop, BOVEN, 'eindhouding = bovenste figuur');

// ---- 2. geleverd: de gemeten uitsnedes, in betekenisvolgorde; meetkunde ongewijzigd ----
const gemeten = await poseCandidate(bytes);
assert.equal(gemeten.verdict, 'pair-candidate'); assert.equal(gemeten.axis, 'y');
assert.deepEqual(gemeten.poses, [{label: 'start', crop: BOVEN}, {label: 'end', crop: ONDER}], 'de meting nummert boven naar onder');
const r = review.entries.find((e) => e.exerciseId === ID);
assert.equal(r.source, BRON); assert.equal(r.assetSha256, BRON_SHA); assert.equal(r.explanationSha256, o.explanationSha256);
assert.equal(JSON.stringify(r.poses), JSON.stringify([{label: 'start', crop: ONDER}, {label: 'end', crop: BOVEN}]),
  'geleverd: beginhouding = gestrekte armen (onder), eindhouding = gezakte dumbbells (boven), exacte broncoördinaten');
assert.ok(validatePosePair(r.poses, r.width, r.height));
assert.equal(r.poseGeometry.status, 'geometry-approved'); assert.equal(r.poseGeometry.axis, 'y');
assert.equal(r.poseGeometry.clinicalApproved, false); assert.equal(r.poseGeometry.reviewDate, '2026-11-02', 'meetkundige controle onveranderd');
assert.equal(r.poseGeometry.silhouetteIoU, gemeten.metrics.silhouetteIoU); assert.equal(r.poseGeometry.foreignInkPixels, gemeten.foreignInkPixels);
assert.equal(r.status, 'unreviewed'); assert.equal(r.clinicalApproved, false); assert.equal(r.presentation, 'static');
// betekenis apart van meetkunde vastgelegd
assert.equal(r.poseOrder.basis, 'semantic-override'); assert.equal(r.poseOrder.override, 'content/mobile-pose-order.json');
assert.equal(r.poseOrder.delivered, 'omgekeerd ten opzichte van de bladvolgorde'); assert.equal(r.poseOrder.measuredOrder, 'boven naar onder');
assert.match(r.poseOrder.geometry, /^Ongewijzigd/); assert.match(r.poseOrder.meaning, /onderste uitsnede is de beginhouding/);
assert.equal(r.poseOrder.clinicalApproved, false);

// ---- 3. geen bijwerking: elke andere goedgekeurde oefening exact in de gemeten volgorde ----
let gelijk = 0;
for (const e of review.entries) {
  if (e.exerciseId !== ID) assert.equal(e.poseOrder, undefined, e.name + ': geen volgordecorrectie');
  if (e.poseGeometry.status !== 'geometry-approved' || e.exerciseId === ID) continue;
  const m = await poseCandidate(fs.readFileSync('public/' + e.source));
  assert.equal(JSON.stringify(e.poses), JSON.stringify(m.poses), e.name + ': geleverde volgorde wijkt af van de meting');
  gelijk++;
}
assert.equal(gelijk + 1, review.summary.poseGeometryApproved, 'alle goedgekeurde uitsnedes nagelopen');

// ---- 4. indeling bij een omgekeerde y-volgorde ----
const html = fs.readFileSync('public/kaart.html', 'utf8');
const tussen = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); const j = html.indexOf(b, i); assert.ok(j > i, b); return html.slice(i, j); };
const lib = poseFrameLayout(r.poses, 'y', 640, 32), voor = poseFrameLayout(gemeten.poses, 'y', 640, 32);
assert.equal(JSON.stringify(lib), JSON.stringify([voor[1], voor[0]]), 'per uitsnede hetzelfde frame, alleen de volgorde wisselt');
assert.equal(lib[0].sy, ONDER.y); assert.equal(lib[1].sy, BOVEN.y);
assert.equal(lib[0].scale, lib[1].scale, 'één schaal');
for (const f of lib) {
  assert.ok(Math.abs(f.dy + f.dh / 2 - 320) < 1e-9, 'gestapeld: verticaal gecentreerd');
  assert.ok(f.dx >= 32 - 1e-9 && f.dx + f.dw <= 608 + 1e-9 && f.dy >= 32 - 1e-9 && f.dy + f.dh <= 608 + 1e-9, 'binnen de marge');
}
assert.ok(Math.abs((lib[1].dx - lib[0].dx) - (BOVEN.x - ONDER.x) * lib[0].scale) < 1e-9, 'echt zijwaarts verschil blijft, ook omgekeerd');
const indeling = vm.createContext({Math, Number});
vm.runInContext(tussen('  function houdingFrames(', '  function demoStart()'), indeling);
assert.equal(JSON.stringify(indeling.houdingFrames(r.poses, 'y', 640, 32)), JSON.stringify(lib), 'kaart rekent identiek aan lib/pose-frames.js');

// ---- 5. de echte kaartcode: inlezen en tekenen ----
const lezer = vm.createContext({Promise, Array, Number, String, Error, JSON,
  fetch: async (url) => ({ok: true, json: async () => lees(url.includes('narration') ? 'public/mobile-narration-review.json' : 'public/mobile-media-review.json')})});
vm.runInContext(tussen('  var mediaReviewReady=false,', '  function geldigeUitsnede(') + tussen('  function geldigeUitsnede(', '  async function loadMobileReview(') +
  tussen('  async function loadMobileReview(', '  // Een oude afkeuring mag'), lezer);
await vm.runInContext('loadMobileReview()', lezer);
const keuring = JSON.parse(vm.runInContext('JSON.stringify(poseKeuring)', lezer));
assert.deepEqual(keuring[ID + '|' + BRON].poses, [{label: 'start', crop: ONDER}, {label: 'end', crop: BOVEN}], 'de kaart leest de betekenisvolgorde in');
assert.equal(Object.keys(keuring).length, review.summary.poseGeometryApproved, 'geen uitsnede verloren of erbij');
const T = vm.runInNewContext(tussen('  var T={', '  var SPRAAK=') + ';T');
assert.equal(T.nl.houding1, 'Beginhouding'); assert.equal(T.nl.houding2, 'Eindhouding');

const tekeningen = [], gemaakt = [], ids = {};
function stub(tag) {
  const node = {tag, children: [], attrs: {}, style: {}, classList: {add() {}, remove() {}, contains: () => false, toggle() {}},
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, textContent: '', innerHTML: '', hidden: false};
  if (tag === 'canvas') node.getContext = () => ({set fillStyle(v) { node.fill = v; }, fillRect() {}, drawImage(...a) { tekeningen.push({canvas: node, args: a}); }});
  gemaakt.push(node); return node;
}
const img = ids.lbimg = stub('img');
img.complete = true; img.naturalWidth = r.width; img.naturalHeight = r.height; img.src = 'https://praktijk.example/v2/' + BRON;
const tekenaar = vm.createContext({document: {getElementById: (id) => (ids[id] = ids[id] || stub('div')), createElement: stub},
  Math, Number, URL, JSON, location: {href: 'https://praktijk.example/k/abc'},
  window: {matchMedia: () => ({matches: true}), NoorAudio: {match: () => false}}, matchMedia: () => ({matches: true}),
  TAAL: 'nl', tr: (k) => T.nl[k] ?? k, vt: (s) => s, uitlegNietVertaald: () => false, uitlegVertaald: () => false, DEMO_BRON: {nl: 'herkomst'}, NoorAudio: {match: () => false},
  demoKlok() {}, demoGeluidKnop() {}, demoZeg() {},
  bronGecontroleerd: {['/v2/' + BRON + '|' + BRON_SHA]: true},
  demo: {info: {name: r.name, uitleg: 'uitleg', poseMetadata: keuring[ID + '|' + BRON] && {...keuring[ID + '|' + BRON]}}}});
// de demonstratie vraagt de kaart zelf of er een opname is (onder de naam van nu of een eerdere)
vm.runInContext(tussen('  function geldigeUitsnede(', '  async function loadMobileReview(') + tussen('  function noorClipNaam(item){', '  function noorClip(item)') +
  tussen('  function demoHoudingen(', '  // met geluid aan wisselen we rustiger'), tekenaar);
vm.runInContext('demoStart()', tekenaar);
assert.equal(tekeningen.length, 2, 'twee houdingen getekend');
assert.deepEqual(tekeningen[0].args.slice(1, 5), [ONDER.x, ONDER.y, ONDER.w, ONDER.h], 'eerste (onderste laag, Beginhouding) = gestrekte armen');
assert.deepEqual(tekeningen[1].args.slice(1, 5), [BOVEN.x, BOVEN.y, BOVEN.w, BOVEN.h], 'tweede (laag erboven, Eindhouding) = gezakte dumbbells');
tekeningen.forEach((t, i) => assert.deepEqual(t.args.slice(5), [lib[i].dx, lib[i].dy, lib[i].dw, lib[i].dh], 'getekend op de berekende plek'));
assert.equal(tekeningen[0].canvas.className, undefined); assert.equal(tekeningen[1].canvas.className, 'boven');
assert.equal(gemaakt.find((n) => n.className === 'demotekst').textContent, 'Beginhouding', 'bij openen staat Beginhouding bij de gestrekte armen');

console.log(`Houdingvolgorde: Dumbell bench press levert de gemeten bronuitsnedes in betekenisvolgorde (Beginhouding = gestrekte armen ${JSON.stringify(ONDER)}, Eindhouding = gezakte dumbbells ${JSON.stringify(BOVEN)}), gebonden aan bron- en uitleghash; meetkunde ongewijzigd, geen klinische goedkeuring; ${gelijk} andere goedgekeurde oefeningen exact in gemeten volgorde; indeling en kaart verwerken de omgekeerde y-volgorde juist.`);
