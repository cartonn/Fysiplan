// Offline preparation only. No SDK, fetch, credentials or generation calls.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('public/oefeningen-v2.json'));
const manifest=JSON.parse(fs.readFileSync('public/audio/noor/manifest.json'));
const ids=['fc_07a47f244d7392e6','fc_853c97009144ec09','fc_2ab6250d362bc593'];
const entries=ids.map((id,i)=>{
  const found=catalog.filter(e=>e.coreExerciseId===id);
  if(found.length!==1)throw Error('Ambiguous/missing source '+id);
  const e=found[0],text=e.naam+'. '+e.uitleg;
  return {priority:i+1,coreExerciseId:id,name:e.naam,text,
    textSha256:createHash('sha256').update(text).digest('hex'),
    sourceSha256:createHash('sha256').update(JSON.stringify(e)).digest('hex'),
    characterCount:text.length,
    existingExactClip:manifest.clips.find(c=>c.name===e.naam&&c.text===text)?.src||null,
    voiceId:manifest.voiceId,engine:'heygen_voice',language:'nl',speed:0.95,
    status:i===0?'prepared-existing-private-draft':'prepared-conditional-visual-review',
    clinicalApproved:false,publish:false};
});
const seen=new Set();for(const e of entries){if(seen.has(e.textSha256))throw Error('Duplicate');seen.add(e.textSha256);}
console.log(JSON.stringify({schemaVersion:1,date:'2026-11-03',generationAuthorizedByThisPlan:false,
  scope:'Three strongest concept candidates from the 14-set index: table pick first, neck rotation and hand release conditional. No text rewriting.',
  totalCandidates:3,missingExactClips:entries.filter(e=>!e.existingExactClip).length,
  creditPlan:{latestCoordinatedBalance:24,observedSpeechCreditsPerRequest:1,
    estimatedThreeRequests:3,guaranteedUpperBound:null,providerMaxChargeParameterAvailable:false,
    action:'Do not submit until parent coordinates included-credit allocation and uncertain per-call pricing. Serial only, durable ledger before each call, balance after each call, stop on error/timeout/unexpected debit; no retry or purchase.'},
  sources:['https://www.heygen.com/model-context-protocol','https://www.heygen.com/api-pricing','https://help.heygen.com/en/articles/15126059-how-to-use-credits-on-heygen'],
  pricingFinding:'Official docs separate MCP premium balance from paid REST, but published current feature table does not state a guaranteed speech MCP per-call price. Observed one credit is evidence, not a contractual ceiling. Connected speech schema has no quote/dry-run/max-cost field.',
  entries},null,2));
