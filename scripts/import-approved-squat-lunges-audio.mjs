// Imports this already-generated, user-listened candidate only. No network/synthesis.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const base='output/audio-pending/0784c32aaf954f3c923a95ad6d1132a5';
const candidate=JSON.parse(fs.readFileSync(base+'/candidate.json'));
const ex=JSON.parse(fs.readFileSync('public/oefeningen-v2.json')).find(e=>exerciseId(e)===candidate.exerciseId);
assert.equal(ex.naam+'. '+ex.uitleg,candidate.text);
assert.equal(hash(candidate.text),candidate.textSha256);
assert.equal(candidate.voiceId,'ea8f12713f7644ea9ad4ed710901fbbb');
assert.equal(candidate.requestedSpeed,null);
assert.ok(!JSON.parse(fs.readFileSync('public/mobile-narration-review.json')).holds.some(h=>h.exerciseId===candidate.exerciseId));
assert.equal(hash(fs.readFileSync(candidate.sourceFile)),candidate.sourceSha256);
const bytes=fs.readFileSync(candidate.mp3);assert.equal(hash(bytes),candidate.mp3Sha256);
const path='public/audio/noor/manifest.json';
const m=JSON.parse(fs.readFileSync(path));
const prior=m.clips.filter(c=>c.name!==candidate.name);
assert.equal(prior.length,68,'Unexpected unrelated catalogue change; inspect before importing');
const name=hash(JSON.stringify({voiceId:candidate.voiceId,text:candidate.text,requestedSpeed:null,sourceSha256:candidate.sourceSha256}));
const src='/audio/noor/'+name+'.mp3';
const approval={reviewer:'user',date:'2026-11-03',response:'ja is goed',context:'User listened to direct Squat lunges recording link; parent relayed approval.',scope:'Listening acceptance of this recording; not clinical approval or an independent agent listening review.'};
const clip={name:candidate.name,text:candidate.text,src,duration:candidate.duration,
 provenance:{provider:candidate.provider,requestId:candidate.requestId,voiceId:candidate.voiceId,providerVoice:candidate.providerVoice,observedUi:candidate.observedUi,requestedSpeed:null,sourceFile:candidate.sourceFile,sourceSha256:candidate.sourceSha256,mp3Sha256:candidate.mp3Sha256,processing:candidate.processing,exactCatalogTextMatch:true,userListeningApproval:approval,agentListeningReviewed:false,independentTranscriptVerified:false,clinicalApproved:false,transcriptReview:candidate.transcriptReview,reviewLimitation:'ASR deviations retained. User accepted playback; agent has not independently listened. Global legacy manifest speed does not describe this clip.'}};
const existing=m.clips.find(c=>c.name===clip.name);
if(existing)assert.deepEqual(existing,clip,'Refuse replacing an existing differing clip');
if(fs.existsSync('public'+src))assert.equal(hash(fs.readFileSync('public'+src)),candidate.mp3Sha256);
else fs.copyFileSync(candidate.mp3,'public'+src);
if(!existing){m.clips.push(clip);fs.writeFileSync(path,JSON.stringify(m,null,2)+'\n');}
const after=JSON.parse(fs.readFileSync(path));
assert.deepEqual(after.clips.filter(c=>c.name!==clip.name),prior,'Existing clips changed');
assert.equal(after.clips.length,69);
fs.writeFileSync(base+'/user-listening-approval.json',JSON.stringify({...approval,requestId:candidate.requestId,sourceSha256:candidate.sourceSha256,publicAsset:src,status:'integrated-locally-not-deployed'},null,2)+'\n');
console.log('PASS: 69 recordings, previous 68 preserved exactly; user listening approval recorded separately from clinical approval.');
