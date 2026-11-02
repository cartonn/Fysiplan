import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';
import {validatePosePair} from '../lib/pose-frames.js';
const manifest=JSON.parse(await fs.readFile('public/mobile-media-review.json','utf8'));
const approvals=JSON.parse(await fs.readFile('content/mobile-pose-approvals.json','utf8'));
const inspected=new Map(approvals.inspectedAssets.map(a=>[a.assetSha256,a]));
const manualRejections=new Set(approvals.manualRejections.map(r=>r.exerciseId));
const base=JSON.parse(await fs.readFile('public/oefeningen-v2.json','utf8'));
const available=[];
for(const e of base){try{await fs.access('public/'+(e.kaartImg||e.img));available.push(e);}catch{}}
assert.equal(manifest.entries.length,319);
assert.equal(manifest.entries.length,available.length);
assert.equal(new Set(manifest.entries.map(e=>e.exerciseId)).size,319);
assert.equal(manifest.defaultPresentation,'static');
assert.equal(manifest.defaultAllowAutomaticPoseSplit,false);
for(const e of available){
  const r=manifest.entries.find(r=>r.exerciseId===exerciseId(e));assert(r,e.naam);
  assert.equal(r.source,e.kaartImg||e.img);assert.equal(r.name,e.naam);
  const bytes=await fs.readFile('public/'+r.source);
  assert.equal(r.assetSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(r.explanationSha256,createHash('sha256').update(e.uitleg||'').digest('hex'));
  assert(['rejected','unreviewed'].includes(r.status));assert.equal(r.clinicalApproved,false);
  assert.equal(r.allowAutomaticPoseSplit,false);
  // Houdingen zijn uitsluitend meetkundig goedgekeurd en altijd aan exact dit bestand
  // gebonden. Nooit afgeleid uit witruimte, nooit uit een hash, nooit klinisch.
  assert(['geometry-approved','static','withheld'].includes(r.poseGeometry.status),r.name);
  if(r.poseGeometry.status==='geometry-approved'){
    assert.equal(r.status,'unreviewed',r.name);
    assert.equal(r.poseGeometry.clinicalApproved,false,r.name);
    assert.equal(r.poseGeometry.visuallyInspected,true,r.name);
    assert.equal(r.poseGeometry.foreignInkPixels,0,r.name);
    assert(['x','y'].includes(r.poseGeometry.axis),r.name);
    assert(r.poseGeometry.silhouetteIoU<0.90,r.name);
    assert.equal(r.poses.length,2,r.name);
    assert.deepEqual(r.poses.map(p=>p.label),['start','end'],r.name);
    assert(validatePosePair(r.poses,r.width,r.height),r.name);
    const seen=inspected.get(r.assetSha256);
    assert(seen&&seen.source===r.source,'goedgekeurde uitsnede zonder visuele controle van dit bestand: '+r.name);
    assert(!manualRejections.has(r.exerciseId),'handmatig afgekeurd en toch goedgekeurd: '+r.name);
  }else{
    assert.deepEqual(r.poses,[],r.name);
    assert(String(r.poseGeometry.reason||'').length>10,r.name);
  }
  assert.equal(r.presentation,r.status==='rejected'?'withhold':'static');
  assert(r.reasons.length>0);assert(r.width>0);assert(r.height>0);
  if(r.name!=='Alternating lunge jumps'){assert.equal(r.width,800);assert.equal(r.height,1200);}
}
for(const name of ['Rotator (apparaat)','Dorsi-pecto (apparaat)','Endy Armstrekker','Endy Rotator','TRX pull up']){
  assert.equal(manifest.entries.find(e=>e.name===name)?.status,'rejected',name);
}
const lunge=manifest.entries.find(e=>e.name==='Alternating lunge jumps');
assert.equal(lunge.source,'images/cardio/alternating-lunge-jumps-avatar-v9.png');
assert.equal(lunge.status,'unreviewed');assert.equal(lunge.presentation,'static');
assert(manifest.rejectedSources.some(e=>e.source==='images/cardio/alternating-lunge-jumps-avatar-v8.jpg'&&e.status==='rejected'));
// een afgekeurde vorige versie is aan zijn bytes gebonden, en de kaart leest deze lijst
for(const e of manifest.rejectedSources){
  const bytes=await fs.readFile('public/'+e.source);
  assert.equal(e.assetSha256,createHash('sha256').update(bytes).digest('hex'),'afgekeurde bron niet aan zijn bytes gebonden: '+e.source);
}
assert.ok((await fs.readFile('public/kaart.html','utf8')).includes('data[0].rejectedSources'),'de kaart leest de afgekeurde vorige versies');
assert.equal(manifest.summary.approved,0);assert.equal(manifest.summary.rejected,5);assert.equal(manifest.summary.unreviewed,314);
// afgekeurde beelden leveren nooit houdingen, ook niet als de meting een paar vindt
for(const e of manifest.entries.filter(e=>e.status==='rejected')){
  assert.equal(e.poseGeometry.status,'withheld',e.name);assert.deepEqual(e.poses,[],e.name);
}
for(const r of approvals.manualRejections){
  const e=manifest.entries.find(e=>e.exerciseId===r.exerciseId);
  assert(e,r.name);assert.notEqual(e.poseGeometry.status,'geometry-approved',r.name);
}
// Steekproef: de vastgelegde uitsnedes moeten opnieuw uit de meting komen. Zo kan het
// bestand niet losraken van de code die de uitsnedes bepaalt.
const {poseCandidate}=await import('./pose-crop-candidates.mjs');
for(const naam of ['Anteflexie armen','Barbell front press','Push up']){
  const r=manifest.entries.find(e=>e.name===naam);
  assert.equal(r.poseGeometry.status,'geometry-approved',naam);
  const opnieuw=await poseCandidate(await fs.readFile('public/'+r.source));
  assert.equal(opnieuw.verdict,'pair-candidate',naam);
  assert.equal(opnieuw.axis,r.poseGeometry.axis,naam);
  assert.equal(JSON.stringify(opnieuw.poses),JSON.stringify(r.poses),'uitsnede wijkt af van de meting: '+naam);
  assert.equal(opnieuw.foreignInkPixels,0,naam);
}
const approvedPoses=manifest.entries.filter(e=>e.poseGeometry.status==='geometry-approved');
assert.equal(approvedPoses.length,manifest.summary.poseGeometryApproved);
assert(approvedPoses.length>0,'geen enkele houding goedgekeurd: de reparatie doet dan niets');
// De patiëntkaart mag een oefenfoto nooit stilzwijgend door een lijntekening vervangen.
// De kaart tekent o.kaartImg (en pas bij ontbreken o.img); de beoordeling moet over
// datzelfde bestand gaan, en dat bestand mag geen lijntekening zijn.
const kaartHtml=await fs.readFile('public/kaart.html','utf8');
assert.ok(kaartHtml.includes("var beeldpad=o?(o.kaartImg||o.img):'';"),'de kaart kiest zelf geen ander beeld');
assert.ok(kaartHtml.includes("function mediaSource(o){return String(o&&(o.kaartImg||o.img)||'')"),'de beoordeling gaat over hetzelfde beeld als de weergave');
for(const e of available){
  const bron=e.kaartImg||e.img;
  assert.ok(!/line-v1|beginhouding-pijl/.test(bron),'de kaart zou hier een lijntekening tonen: '+e.naam);
  assert.equal(manifest.entries.find(r=>r.exerciseId===exerciseId(e)).source,bron,e.naam);
}
assert.equal(manifest.schemaVersion,2);
assert(manifest.poseWarning.includes('geen klinische goedkeuring'));
console.log('PASS: 319 source-linked assets, hashes, five rejections; '+approvedPoses.length+' visueel gecontroleerde uitsnedes, geen klinische goedkeuring afgeleid.');
