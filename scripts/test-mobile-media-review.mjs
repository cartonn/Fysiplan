import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';
import {validatePosePair} from '../lib/pose-frames.js';
import {measureBrandMark,MERK_AFDEKKING} from './brand-mark.mjs';
const manifest=JSON.parse(await fs.readFile('public/mobile-media-review.json','utf8'));
const approvals=JSON.parse(await fs.readFile('content/mobile-pose-approvals.json','utf8'));
const inspected=new Map(approvals.inspectedAssets.map(a=>[a.assetSha256,a]));
const manualRejections=new Set(approvals.manualRejections.map(r=>r.exerciseId));
const base=JSON.parse(await fs.readFile('public/oefeningen-v2.json','utf8'));
const available=[];
for(const e of base){try{await fs.access('public/'+(e.kaartImg||e.img));available.push(e);}catch{}}
// 319 V1-beelden plus de nieuwe lijntekeningen (content/nieuwe-lijntekeningen.json)
const NIEUW=JSON.parse(await fs.readFile('content/nieuwe-lijntekeningen.json','utf8')).lijntekeningen.length;
assert.equal(manifest.entries.length,319+NIEUW);
assert.equal(manifest.entries.length,available.length);
assert.equal(new Set(manifest.entries.map(e=>e.exerciseId)).size,319+NIEUW);
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
// vijf inhoudelijke afkeuringen plus drie tijdelijke houds op één bepaalde bron (2026-11-03; op 2026-11-09
// zijn de holds op Chair squat, Standing chair shoulder rotations, Dips en Triceps dips opgeheven met een nieuwe avatar):
// vijf bronfouten en twee open bronkeuzes (Back extension, Rug extensie)
const BRONKEUZE=new Map([
  ['fp_a0a18c0c13673d38','fc043247f30c168e50c4d2e69e093594486416fb80a438f22e58c3a67cf3cb50'],
  ['fp_7b07f346644f9c17','7480d432c7638d3568edea6ca3a8e4fc9b48caa8e646580bec5790f79a431b47']]);
for(const [id,name,source] of [['fp_7dc1478e2b3c17b0','Step up with knee raise','images/onderste-extremiteit/step-up-with-knee-raise-avatar-v7.jpg'],
  ['fp_a0a18c0c13673d38','Back extension','images/core/back-extension-avatar-v7.jpg'],
  ['fp_7b07f346644f9c17','Rug extensie','images/core/rug-extensie-avatar-v7.jpg']]){
  const e=manifest.entries.find(e=>e.exerciseId===id);
  assert.equal(e.name,name);assert.equal(e.source,source,name);assert.equal(e.status,'rejected',name);assert.equal(e.presentation,'withhold',name);
  assert.equal(e.hold.temporary,true,name);assert.equal(e.hold.source,source,name);assert.equal(e.hold.assetSha256,e.assetSha256,name);
  assert.equal(e.clinicalApproved,false,name);
  assert.equal(e.hold.kind,BRONKEUZE.has(id)?'source-choice-pending':'source-defect',name+': soort hold');
}
const metHold=manifest.entries.filter(e=>e.hold);assert.equal(metHold.length,3,'alleen de drie bedoelde bronnen hebben een tijdelijke hold');
for(const id of ['fp_295fd35a63d44ef8','fp_4b99c5f11b42a30d','fp_013ba6ad937cc9d9','fp_f227db5fcf245d9c']){const e=manifest.entries.find(e=>e.exerciseId===id);
  assert.ok(!e.hold,e.name+': hold opgeheven met nieuwe avatar');assert.notEqual(e.status,'rejected',e.name);}
// Back extension en Rug extensie: exact deze bytes, open bronkeuze, geen klinisch oordeel. De
// eerdere meetkundige controle van de uitsnedes blijft in de approvals staan, maar levert
// zolang de hold geldt geen houdingen meer.
for(const [id,hash] of BRONKEUZE){
  const e=manifest.entries.find(e=>e.exerciseId===id);
  assert.equal(e.assetSha256,hash,e.name);assert.equal(e.hold.assetSha256,hash,e.name);
  assert.match(e.hold.evidence,/originele resolutie/,e.name);assert.match(e.hold.evidence,/Bronkeuze .* open bij eigenaar\/behandelaar/,e.name);
  assert.match(e.hold.evidence,/geen klinisch oordeel en geen afkeuring van de oefening/,e.name);
  assert.match(e.reasons[0],/^Tijdelijk tegengehouden: .*geen klinisch oordeel\.$/,e.name);
  assert.equal(e.poseGeometry.status,'withheld',e.name);assert.deepEqual(e.poses,[],e.name);
  assert.ok(inspected.get(hash)?.source===e.source,e.name+': eerdere uitsnedecontrole niet weggehaald');
}
assert.equal(manifest.summary.approved,0);assert.equal(manifest.summary.rejected,8);assert.equal(manifest.summary.unreviewed,311+NIEUW);
// 2026-11-09 Physitrack-crosscheck: 71 nieuwe avatars; later rondes 3 en 4; gemeten paren op een contactvel bekeken (169).
assert.equal(manifest.summary.poseGeometryApproved,171);assert.equal(manifest.summary.poseStatic,148+NIEUW);
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
for(const naam of ['Anteflexie armen','Barbell neck press','Push up']){
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
// Uitzondering: de nieuwe lijntekeningen (content/nieuwe-lijntekeningen.json) horen bij
// oefeningen die nog géén oefenfoto/avatar hebben; daar vervangt de lijntekening niets.
// Ze hebben bewust geen kaartImg tot de avatar er is (besluit eigenaar 2026-11-06); daarna
// exact de in het register vastgelegde avatar (scripts/importeer-nieuwe-avatars.mjs).
const nieuweLijn=new Map(JSON.parse(await fs.readFile('content/nieuwe-lijntekeningen.json','utf8')).lijntekeningen.map(n=>[n.naam,n]));
for(const e of available){
  const bron=e.kaartImg||e.img;
  const nieuwe=nieuweLijn.get(e.naam);
  if(nieuwe){assert.equal(e.kaartImg??null,nieuwe.kaartImg??null,e.naam+': kaartImg wijkt af van het register');assert.equal(bron,nieuwe.kaartImg||nieuwe.img,e.naam);}
  else assert.ok(!/line-v1|beginhouding-pijl/.test(bron),'de kaart zou hier een lijntekening tonen: '+e.naam);
  assert.equal(manifest.entries.find(r=>r.exerciseId===exerciseId(e)).source,bron,e.naam);
}
assert.equal(manifest.schemaVersion,2);
assert(manifest.poseWarning.includes('geen klinische goedkeuring'));
// Ingebakken merk: elk afdekvlak is opnieuw gemeten op de bronpixels van exact dit bestand,
// zodat het bestand niet kan afdrijven van de meetcode. Afdekken mag alleen het vaste vlak,
// alleen op 800x1200, en nooit als iets anders dan het merk de rand ervan raakt.
let afgedekt=0;
for(const r of manifest.entries){
  const m=await measureBrandMark(await fs.readFile('public/'+r.source));
  assert.ok(r.brandMark,'brandMark ontbreekt: '+r.name);
  if(m.coverable){
    afgedekt++;
    assert.deepEqual(r.brandMark.cover,MERK_AFDEKKING,r.name);
    assert.equal(r.width,800,r.name);assert.equal(r.height,1200,r.name);
    assert.equal(m.inkInRing,0,r.name);
  }else assert.equal(r.brandMark.cover,null,'afdekking zonder bewezen vrij vlak: '+r.name);
  assert.equal(r.brandMark.present,m.present,r.name);
}
// 2026-11-09: 61 (ronde 3: nog 7, ronde 4: nog 1) legacy-avatars vervangen door nieuwe avatars uit de Physitrack-crosscheck, zonder ingebakken merk.
assert.equal(afgedekt,143,'143 beelden met een afdekbaar ingebakken merk');
assert.equal(manifest.summary.brandMarkCovered,143);
assert.equal(manifest.summary.brandMarkAbsent,176+NIEUW); // nieuwe lijntekeningen hebben geen ingebakken merk
// de drie beelden waar het ingebakken witte vak een hoekje uit de haren snijdt: het
// afdekvlak ligt binnen dat vak en maakt het niet groter
for(const naam of ['Front raises','Shoulder rotation (shrugs)','Yoga deep squat'])
  assert.deepEqual(manifest.entries.find(r=>r.name===naam).brandMark.cover,MERK_AFDEKKING,naam);
// een beeld zonder merk krijgt nooit een vlak, ook niet als er linksboven haar staat
for(const naam of ['Foam roller hamstring','Foam roller calf','Standing chair heel/toe','Alternating lunge jumps'])
  assert.equal(manifest.entries.find(r=>r.name===naam).brandMark.cover,null,naam);
console.log('PASS: '+(319+NIEUW)+' source-linked assets, hashes, eight rejections (five content, three temporary source holds: one source defect, two pending source choices); '+approvedPoses.length+' visueel gecontroleerde uitsnedes, 143 ingebakken merken opnieuw gemeten en afdekbaar, geen klinische goedkeuring afgeleid.');
