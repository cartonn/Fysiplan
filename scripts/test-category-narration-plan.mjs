import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const path='output/category-narration-plan-20261103.json';
const saved=JSON.parse(fs.readFileSync(path));
const rebuilt=JSON.parse(execFileSync(process.execPath,['scripts/plan-category-narration.mjs'],{encoding:'utf8'}));
assert.deepEqual(saved,rebuilt,'Plan must match exact current source and audio catalogue');
assert.equal(saved.missingExactClips,3);
assert.equal(saved.generationAuthorizedByThisPlan,false);
assert.equal(saved.creditPlan.guaranteedUpperBound,null);
assert.equal(saved.creditPlan.providerMaxChargeParameterAvailable,false);
assert.equal(saved.entries[0].coreExerciseId,'fc_07a47f244d7392e6');
for(const e of saved.entries){assert.equal(e.voiceId,'ea8f12713f7644ea9ad4ed710901fbbb');assert.equal(e.engine,'heygen_voice');assert.equal(e.language,'nl');assert.equal(e.speed,0.95);assert.equal(e.publish,false);assert.equal(e.clinicalApproved,false);}
console.log('PASS: three deduplicated exact-source scripts, existing voice, no generation/publication or unsupported cost guarantee.');
