import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {loadDraft} from '../lib/draft-exercise-import.js';
const id='fc_07a47f244d7392e6',root=await fs.mkdtemp(path.join(os.tmpdir(),'fysiplan-motion-test-'));
const catalogue=JSON.parse(await fs.readFile('public/oefeningen-v2.json','utf8'));
try{
 await fs.cp('content/private-exercise-drafts/'+id,path.join(root,id),{recursive:true});
 const file=path.join(root,id,'motion.json'),original=JSON.parse(await fs.readFile(file,'utf8'));
 assert.equal((await loadDraft({draftRoot:root,id,catalogue})).motionCandidate.sha256,original.sha256);
 for(const mutate of [x=>x.published=true,x=>x.clinicalApproval=true,x=>x.file='../outside.mp4',x=>x.sha256='bad',x=>x.audio=true,x=>x.referenceSha256.start='bad']){
  const m=structuredClone(original);mutate(m);await fs.writeFile(file,JSON.stringify(m));
  await assert.rejects(loadDraft({draftRoot:root,id,catalogue}));
 }
 const html=await fs.readFile('public/draft-review.html','utf8');new vm.Script(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 assert.match(html,/object-fit:contain/);assert.ok(!/video\.(?:autoplay|loop)\s*=\s*true/.test(html));
 assert.match(html,/video\.addEventListener\('error'/);assert.match(html,/Video opnieuw laden/);
 console.log('PASS private motion hash/reference/approval/path checks and review-player syntax, contain, no autoplay/loop, retry controls');
}finally{await fs.rm(root,{recursive:true,force:true});}
