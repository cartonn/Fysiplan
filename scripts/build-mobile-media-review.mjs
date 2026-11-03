// Reproducible inventory, not a clinical approval. Never infer approved poses from whitespace.
//
// Sinds de nachtreparatie van 2026-11-02 voegt dit script ook de houding-uitsnedes toe.
// Die komen NIET zomaar uit de meting: een uitsnede haalt dit bestand alleen als
//   1. scripts/pose-crop-candidates.mjs er 'pair-candidate' van maakt (twee echt
//      gescheiden figuren, nul vreemde inkt in de uitsnede, merk erbuiten, silhouetten
//      meetbaar verschillend), EN
//   2. het beeld met exact deze sha256 in content/mobile-pose-approvals.json staat als
//      visueel gecontroleerd, EN
//   3. het niet handmatig is afgekeurd en de hele inzending niet 'rejected' is.
// De status heet bewust 'geometry-approved': het zegt iets over de uitsnede, niet over
// de klinische juistheid van de oefening. clinicalApproved blijft overal false.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import { exerciseId } from '../lib/exercise-id.js';
import { poseCandidate } from './pose-crop-candidates.mjs';
import { measureBrandMark } from './brand-mark.mjs';

const rejects = new Map([
  ['Alternating lunge jumps', 'Beide afgebeelde houdingen tonen hetzelfde voorste been; de beschreven beenwissel en sprong zijn niet zichtbaar.'],
  ['Rotator (apparaat)', 'Avatar toont romprotatie op een torsomachine; uitleg beschrijft onderarm/schouderrotatie.'],
  ['Dorsi-pecto (apparaat)', 'Avatar toont armen voor de borst samenbrengen; uitleg beschrijft grepen van boven naar beneden trekken.'],
  ['Endy Armstrekker', 'Avatar toont voorwaartse chest press zonder bovenarmkussen; uitleg beschrijft armen naar beneden strekken met bovenarmen op een kussen.'],
  ['Endy Rotator', 'Avatar verandert ellebooghoek en bovenarmpositie; uitleg beschrijft onderarmrotatie met bovenarm langs het lichaam.'],
  ['TRX pull up', 'Avatar toont achteroverleunend optrekken met gestrekte benen; uitleg beschrijft hangen onder het anker met gebogen knieën.']
]);
const observations = new Map([
  ['Abroller', ['Los wiel met twee handgrepen zichtbaar; geen ab-machine. Uitvoering niet klinisch goedgekeurd.']],
  ['Med ball slams', ['Slechts één pose zichtbaar; geen eindpose beschikbaar.']],
  ['Seated cat-cow', ['Slechts één pose zichtbaar; geen eindpose beschikbaar.']],
  ['TRX row', ['Twee poses aanwezig, maar riemen verhinderen betrouwbare automatische witlijnsplitsing.']]
]);
// Tijdelijke houds op één bepaalde bron: exact dit pad én deze bytes. Ze lopen via hetzelfde
// afkeurspoor als hierboven (status 'rejected', presentatie 'withhold'), want dat is wat de
// kaart al tegenhoudt. Er wordt niets verwijderd en niets klinisch beoordeeld. Verandert het
// bestand op dit pad, of wijst de catalogus naar een ander bestand, dan faalt dit script:
// dan hoort een mens de nieuwe versie te bekijken, in plaats van dat de hold stilzwijgend
// vervalt of op ander beeld blijft gelden.
const HOLD_BEWIJS = 'Onafhankelijke beoordeling op oorspronkelijke resolutie en visuele controle door de coördinator (2026-11-03); eerder gesignaleerd in de statische visuele ronde van 2026-11-02 (output/pose-review/static/inspection.md).';
const sourceHolds = new Map([
  ['fp_295fd35a63d44ef8', {name:'Chair squat', source:'images/onderste-extremiteit/chair-squat-avatar-v7.jpg',
    assetSha256:'a4d98858e15a11f54fa84e98cacf73603a302c0ff8dc632fd62d0bdd9bd96418',
    evidence:'Onafhankelijke visuele controle op originele resolutie (2026-11-03), live bronbytes gelijk aan deze SHA256: stoel ontbreekt; bestaande startuitsnede toont de lage squat en einduitsnede rechtop, tegengesteld aan de beschreven beginhouding. Tijdelijke visuele bronhold, geen klinisch oordeel.',
    reason:'Tijdelijk tegengehouden: de stoel uit de uitleg ontbreekt en de begin- en eindhouding zijn omgekeerd weergegeven.'}],
  ['fp_013ba6ad937cc9d9', {name:'Dips', source:'images/bovenste-extremiteit/dips-avatar-v7.jpg',
    assetSha256:'ae7ea9bc2bcf7646e69832179c1ada68c42f1fb39af8e05effe15c6758bf7298',
    reason:'Tijdelijk tegengehouden: de steunen zijn onvolledig en er is geen dip afgebeeld; de figuur staat met de voeten op de grond.'}],
  ['fp_f227db5fcf245d9c', {name:'Triceps dips', source:'images/bovenste-extremiteit/triceps-dips-avatar-v7.jpg',
    assetSha256:'7a3f8095e040023498c3d6ec46d1b6a0d31d8d559a2141deecd98770fd84487a',
    reason:'Tijdelijk tegengehouden: de handen steunen op niets; de stoel of bank uit de uitleg ontbreekt.'}],
  ['fp_7dc1478e2b3c17b0', {name:'Step up with knee raise', source:'images/onderste-extremiteit/step-up-with-knee-raise-avatar-v7.jpg',
    assetSha256:'2dbad9164159e9602e62bdf374a58ed5bdd2f55b2a2160c83a68ee13528149c3',
    reason:'Tijdelijk tegengehouden: losse, zwevende fragmenten in plaats van een verhoging om op te stappen.'}],
  ['fp_4b99c5f11b42a30d', {name:'Standing chair shoulder rotations', source:'images/seated-chair/standing-chair-shoulder-rotations-avatar-v8.jpg',
    assetSha256:'8290b9e1fe168d92837c72a096dbc84276ec0e70f40de714b6e265b83e7f4e0b',
    reason:'Tijdelijk tegengehouden: de figuur staat op één been naast de stoel; er is geen schouder- of onderarmrotatie afgebeeld.'}],
  // Bronkeuze open (2026-11-03): beeld en eigen uitleg beschrijven een andere variant. Welke
  // bedoeld is, beslist de eigenaar/behandelaar; tot dan hetzelfde tegenhoudspoor als hierboven.
  // Geen klinisch oordeel en geen afkeuring van de oefening. Zie output/back-source-holds-20261103.json.
  ['fp_a0a18c0c13673d38', {name:'Back extension', source:'images/core/back-extension-avatar-v7.jpg',
    assetSha256:'fc043247f30c168e50c4d2e69e093594486416fb80a438f22e58c3a67cf3cb50', kind:'source-choice-pending',
    evidence:'Onafhankelijke visuele controle op originele resolutie (800x1200) door Claude en de coördinator (2026-11-03; sourceChoiceBlockers in output/visual-final-seven-20261103.json, overgenomen in output/back-source-holds-20261103.json), bronbytes gelijk aan deze SHA256: horizontale rugstrekbank, enkels onder de rollen, heupen op het kussen, geen vloercontact, armen gekruist op de borst; de eigen uitleg beschrijft buikligging op de grond met de handen naast het hoofd. Bronkeuze (bank- of vloervariant) open bij eigenaar/behandelaar. Tijdelijke visuele bronhold, geen klinisch oordeel en geen afkeuring van de oefening.',
    reason:'Tijdelijk tegengehouden: het beeld toont een rugstrekbank zonder vloercontact met de armen gekruist, de eigen uitleg buikligging op de grond met de handen naast het hoofd. Welke variant bedoeld is, wordt nog gekozen; geen klinisch oordeel.'}],
  ['fp_7b07f346644f9c17', {name:'Rug extensie', source:'images/core/rug-extensie-avatar-v7.jpg',
    assetSha256:'7480d432c7638d3568edea6ca3a8e4fc9b48caa8e646580bec5790f79a431b47', kind:'source-choice-pending',
    evidence:'Onafhankelijke visuele controle op originele resolutie (800x1200) door Claude en de coördinator (2026-11-03; sourceChoiceBlockers in output/visual-final-seven-20261103.json, overgenomen in output/back-source-holds-20261103.json), bronbytes gelijk aan deze SHA256: armen gestrekt naar voren en in de eindhouding ook armen en benen van de grond; de eigen uitleg beschrijft handen naast het hoofd en alleen de borst een stukje van de vloer. Bronkeuze (armen naar voren met armen en benen omhoog, of borstheffing met handen naast het hoofd) open bij eigenaar/behandelaar. Tijdelijke visuele bronhold, geen klinisch oordeel en geen afkeuring van de oefening.',
    reason:'Tijdelijk tegengehouden: het beeld toont gestrekte armen naar voren en armen en benen van de grond, de eigen uitleg handen naast het hoofd en alleen de borst omhoog. Welke variant bedoeld is, wordt nog gekozen; geen klinisch oordeel.'}]
]);
// Bewust gecorrigeerde V2-kaartbeelden (content/v2-avatar-overrides.json): alleen een
// observatie bij exact het gecorrigeerde bestand, geen goedkeuring.
const avatarOverrides = new Map(JSON.parse(await fs.readFile('content/v2-avatar-overrides.json', 'utf8'))
  .overrides.map(o => [o.exerciseId, o]));
const approvals = JSON.parse(await fs.readFile('content/mobile-pose-approvals.json', 'utf8'));
const inspected = new Map(approvals.inspectedAssets.map(a => [a.assetSha256, a]));
const manualRejections = new Map(approvals.manualRejections.map(r => [r.exerciseId, r]));
const base = JSON.parse(await fs.readFile('public/oefeningen-v2.json', 'utf8'));
const entries = [];
for (const e of base) {
  const source = e.kaartImg || e.img;
  let bytes;
  try { bytes = await fs.readFile('public/' + source); } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const metadata = await sharp(bytes).metadata();
  const pixels = await sharp(bytes).resize(80,120).removeAlpha().raw().toBuffer();
  let chromaticPixels = 0;
  for(let i=0;i<pixels.length;i+=3) {
    if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20) chromaticPixels++;
  }
  const correctedLunge = e.naam==='Alternating lunge jumps' && source==='images/cardio/alternating-lunge-jumps-avatar-v9.png';
  const id = exerciseId(e);
  const assetSha256 = createHash('sha256').update(bytes).digest('hex');
  const hold = sourceHolds.get(id);
  if (hold && (hold.name !== e.naam || hold.source !== source || hold.assetSha256 !== assetSha256)) {
    throw new Error(`Tijdelijke hold voor ${hold.name} past niet meer bij de catalogus (${source}, ${assetSha256}): eerst opnieuw beoordelen en de hold bijwerken of verwijderen.`);
  }
  const reason = correctedLunge ? undefined : (rejects.get(e.naam) || (hold && hold.reason));
  const override = avatarOverrides.get(id);
  const corrected = override && override.kaartImg === source && override.assetSha256 === assetSha256;
  const candidate = await poseCandidate(bytes);
  const merk = await measureBrandMark(bytes);
  const seen = inspected.get(assetSha256);
  const manual = manualRejections.get(id);
  let poses = [], poseGeometry;
  if (reason) {
    poseGeometry = {status:'withheld', reason:'De afbeelding zelf is afgekeurd; er worden geen houdingen uit getoond.'};
  } else if (manual) {
    poseGeometry = {status:'static', reason: manual.reason, rejectedByReviewer: true};
  } else if (candidate.verdict !== 'pair-candidate') {
    poseGeometry = {status:'static', reason: candidate.reason};
  } else if (!seen || seen.source !== source) {
    poseGeometry = {status:'static', reason:'Uitsnede gemeten maar niet visueel gecontroleerd voor exact dit bestand.'};
  } else {
    poses = candidate.poses;
    poseGeometry = {
      status:'geometry-approved', axis:candidate.axis,
      reviewer:approvals.reviewer, reviewDate:approvals.reviewDate, reviewKind:approvals.reviewKind,
      visuallyInspected:true,
      method:'connected components op bronpixels; expliciete uitsnede per houding; geen witruimtesplitsing',
      foreignInkPixels:candidate.foreignInkPixels,
      silhouetteIoU:candidate.metrics.silhouetteIoU,
      brandingBoxesOutsideCrop:candidate.brandingBoxes.length,
      clinicalApproved:false,
      note:'Alleen de uitsnede en de weergave zijn gecontroleerd. De uitvoering is niet klinisch goedgekeurd.'
    };
  }
  entries.push({
    exerciseId: id, name: e.naam, source,
    assetSha256,
    explanationSha256: createHash('sha256').update(e.uitleg || '').digest('hex'),
    mediaType: chromaticPixels>100 ? 'color_avatar_candidate' : 'line_drawing_candidate',
    classification: {method:'raster-chroma-80x120-not-filename',chromaticPixels,visuallyInspected:Boolean(seen)||rejects.has(e.naam)||observations.has(e.naam)||Boolean(hold)||Boolean(corrected)},
    width:metadata.width,height:metadata.height,
    status:reason?'rejected':'unreviewed',clinicalApproved:false,
    presentation:reason?'withhold':'static',allowAutomaticPoseSplit:false,
    reasons:reason?[reason]:['Geen volledige inhoudelijke controle en goedgekeurde pose-uitsneden vastgelegd.'],
    observations:correctedLunge ? ['Visueel gecontroleerd: rechterbeen voor in linker figuur, linkerbeen voor in rechter figuur; achterknieën boven de grond. Beenwissel hersteld, geen klinische goedkeuring of bewegingsdemonstratie.'] : corrected ? ['Kaartbeeld gecorrigeerd op 2026-11-03: het vorige V2-kaartbeeld ('+override.previousKaartImg+') toonde '+override.previousShowed+'; dit beeld toont '+override.nowShows+', zoals de eigen uitleg. Het V2-lijnbeeld is op dezelfde manier gecorrigeerd. Zie content/v2-avatar-overrides.json. Het V1-lijnbeeld is niet aangepast en toont nog de andere beweging. Geen klinische goedkeuring.'] : observations.get(e.naam)||[],
    ...(hold ? {hold:{temporary:true,kind:hold.kind || 'source-defect',source:hold.source,assetSha256:hold.assetSha256,evidence:hold.evidence || HOLD_BEWIJS,
      release:'Vervalt niet vanzelf: alleen met een nieuw, beoordeeld bronbestand of een expliciet besluit. Er is niets verwijderd.'}} : {}),
    poses, poseGeometry,
    // Ingebakken eigen merk: de kaart dekt het af en zet overal zelf hetzelfde merk, zodat
    // het niet per oefening wisselt. Alleen met een gemeten, vrij vlak; zie brand-mark.mjs.
    brandMark: merk.coverable
      ? {present:true,cover:merk.patch,method:'icoon 20..61x22..63 + witte rand rond het afdekvlak, gemeten op bronpixels'}
      : {present:merk.present,cover:null,reason:merk.reason}
  });
}
if(entries.length!==319) throw new Error('Expected 319 available mobile assets, got '+entries.length);
for(const name of rejects.keys())if(!entries.some(e=>e.name===name))throw new Error('Missing rejection '+name);
for(const [id,hold] of sourceHolds)if(!entries.some(e=>e.exerciseId===id&&e.source===hold.source&&e.status==='rejected'))throw new Error('Tijdelijke hold niet toegepast: '+hold.name);
for(const [id,o] of avatarOverrides)if(!entries.some(e=>e.exerciseId===id&&e.source===o.kaartImg&&e.assetSha256===o.assetSha256))throw new Error('Gecorrigeerd kaartbeeld niet in de beoordeling: '+o.name);
const geometryApproved = entries.filter(e=>e.poseGeometry.status==='geometry-approved');
if(geometryApproved.some(e=>e.status==='rejected'||e.clinicalApproved))throw new Error('Afgekeurde of klinisch goedgekeurde inzending met houdingen');
const result={schemaVersion:2,reviewDate:'2026-11-02',scope:'Available repository mobile assets; production practice overrides not included.',
  classificationWarning:'Raster color is a candidate classification, not proof of anatomy, pose correctness or clinical approval. Avatar filenames alone are not evidence.',
  poseWarning:'poseGeometry.status "geometry-approved" betekent uitsluitend: deze twee uitsnedes zijn gemeten en visueel gecontroleerd op volledigheid, schaal en afwezigheid van vreemde elementen. Het is geen klinische goedkeuring en geen uitspraak over de juiste uitvoering.',
  poseApprovalSource:'content/mobile-pose-approvals.json',
  defaultPresentation:'static',defaultAllowAutomaticPoseSplit:false,
  rejectedSources:await Promise.all([{exerciseId:'fp_027779ceb994b08e',source:'images/cardio/alternating-lunge-jumps-avatar-v8.jpg',status:'rejected',reason:rejects.get('Alternating lunge jumps')}]
    // De afkeuring hoort bij exact deze bytes, net als bij de gewone regels; de kaart
    // blokkeert de bron ook zonder hash, maar met hash is het spoor controleerbaar.
    .map(async r=>{try{return {...r,assetSha256:createHash('sha256').update(await fs.readFile('public/'+r.source)).digest('hex')};}catch(error){if(error.code==='ENOENT')return r;throw error;}})),
  summary:{total:entries.length,rejected:entries.filter(e=>e.status==='rejected').length,unreviewed:entries.filter(e=>e.status==='unreviewed').length,approved:0,
    poseGeometryApproved:geometryApproved.length,poseStatic:entries.length-geometryApproved.length,
    brandMarkCovered:entries.filter(e=>e.brandMark.cover).length,brandMarkAbsent:entries.filter(e=>!e.brandMark.present).length},entries};
await fs.writeFile('public/mobile-media-review.json',JSON.stringify(result,null,2)+'\n');
console.log(result.summary);
