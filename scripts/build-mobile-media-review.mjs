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
  const reason = correctedLunge ? undefined : rejects.get(e.naam);
  const id = exerciseId(e);
  const assetSha256 = createHash('sha256').update(bytes).digest('hex');
  const candidate = await poseCandidate(bytes);
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
    classification: {method:'raster-chroma-80x120-not-filename',chromaticPixels,visuallyInspected:Boolean(seen)||rejects.has(e.naam)||observations.has(e.naam)},
    width:metadata.width,height:metadata.height,
    status:reason?'rejected':'unreviewed',clinicalApproved:false,
    presentation:reason?'withhold':'static',allowAutomaticPoseSplit:false,
    reasons:reason?[reason]:['Geen volledige inhoudelijke controle en goedgekeurde pose-uitsneden vastgelegd.'],
    observations:correctedLunge ? ['Visueel gecontroleerd: rechterbeen voor in linker figuur, linkerbeen voor in rechter figuur; achterknieën boven de grond. Beenwissel hersteld, geen klinische goedkeuring of bewegingsdemonstratie.'] : observations.get(e.naam)||[],
    poses, poseGeometry
  });
}
if(entries.length!==319) throw new Error('Expected 319 available mobile assets, got '+entries.length);
for(const name of rejects.keys())if(!entries.some(e=>e.name===name))throw new Error('Missing rejection '+name);
const geometryApproved = entries.filter(e=>e.poseGeometry.status==='geometry-approved');
if(geometryApproved.some(e=>e.status==='rejected'||e.clinicalApproved))throw new Error('Afgekeurde of klinisch goedgekeurde inzending met houdingen');
const result={schemaVersion:2,reviewDate:'2026-11-02',scope:'Available repository mobile assets; production practice overrides not included.',
  classificationWarning:'Raster color is a candidate classification, not proof of anatomy, pose correctness or clinical approval. Avatar filenames alone are not evidence.',
  poseWarning:'poseGeometry.status "geometry-approved" betekent uitsluitend: deze twee uitsnedes zijn gemeten en visueel gecontroleerd op volledigheid, schaal en afwezigheid van vreemde elementen. Het is geen klinische goedkeuring en geen uitspraak over de juiste uitvoering.',
  poseApprovalSource:'content/mobile-pose-approvals.json',
  defaultPresentation:'static',defaultAllowAutomaticPoseSplit:false,
  rejectedSources:[{exerciseId:'fp_027779ceb994b08e',source:'images/cardio/alternating-lunge-jumps-avatar-v8.jpg',status:'rejected',reason:rejects.get('Alternating lunge jumps')}],
  summary:{total:entries.length,rejected:entries.filter(e=>e.status==='rejected').length,unreviewed:entries.filter(e=>e.status==='unreviewed').length,approved:0,
    poseGeometryApproved:geometryApproved.length,poseStatic:entries.length-geometryApproved.length},entries};
await fs.writeFile('public/mobile-media-review.json',JSON.stringify(result,null,2)+'\n');
console.log(result.summary);
