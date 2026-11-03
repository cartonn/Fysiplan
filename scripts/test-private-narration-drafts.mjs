import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const m=JSON.parse(fs.readFileSync('content/private-narration-drafts/manifest.json'));
const c=JSON.parse(fs.readFileSync('public/oefeningen-v2.json'));
const ledger=JSON.parse(fs.readFileSync('output/category-speech-ledger.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(m.published,false);assert.equal(m.private,true);assert.equal(m.recordings.length,3);
assert.equal(ledger.totalActualCredits,3);assert.equal(ledger.balanceBefore-ledger.balanceAfter,3);
for(const [i,r] of m.recordings.entries()){
 const e=c.find(e=>e.coreExerciseId===r.coreExerciseId);assert(e);
 assert.equal(r.text,e.naam+'. '+e.uitleg);assert.equal(r.textSha256,sha(r.text));
 assert.equal(r.sourceSha256,sha(JSON.stringify(e)));assert.equal(r.sha256,sha(fs.readFileSync(r.audioFile)));
 assert(r.audioFile.startsWith('content/private-narration-drafts/'));assert.equal(r.published,false);
 assert.equal(r.clinicalApproved,false);assert.equal(r.listeningReviewed,false);
 assert.equal(r.voiceId,'ea8f12713f7644ea9ad4ed710901fbbb');assert.equal(r.engine,'heygen_voice');assert.equal(r.returnedEngine,'orca');
 assert.equal(r.actualPremiumCredits,1);assert.equal(ledger.requests[i].actualCredits,1);
 assert.equal(ledger.requests[i].balanceBefore-ledger.requests[i].balanceAfter,1);
 assert(r.returnedWordTextExact && r.wordTimingsValid);assert(r.duration>1);
}
console.log('PASS: three private exact-source recordings, hashes, voice identity and three actual included credits; no clinical/listening approval implied.');
