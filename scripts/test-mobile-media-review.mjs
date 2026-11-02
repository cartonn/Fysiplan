import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';
const manifest=JSON.parse(await fs.readFile('public/mobile-media-review.json','utf8'));
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
  assert.equal(r.allowAutomaticPoseSplit,false);assert.deepEqual(r.poses,[]);
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
assert.equal(manifest.summary.approved,0);assert.equal(manifest.summary.rejected,5);assert.equal(manifest.summary.unreviewed,314);
console.log('PASS: 319 source-linked assets, hashes, five rejections; corrected lunge static, no unearned pose/clinical approvals.');
