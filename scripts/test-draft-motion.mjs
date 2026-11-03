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
 await fs.writeFile(file,JSON.stringify(original));
 const narrationFile=path.join(root,id,'narration.json'),narration=JSON.parse(await fs.readFile(narrationFile,'utf8'));
 for(const mutate of [x=>x.voiceId='other',x=>x.sha256='bad',x=>x.explanationSha256='bad',x=>x.textSha256='bad',x=>x.file='../outside.mp3',x=>x.published=true]){
  const n=structuredClone(narration);mutate(n);await fs.writeFile(narrationFile,JSON.stringify(n));await assert.rejects(loadDraft({draftRoot:root,id,catalogue}));
 }
 await fs.writeFile(narrationFile,JSON.stringify(narration));
 // Even an internally consistent edited catalogue+draft cannot reuse old speech.
 const draftFile=path.join(root,id,'draft.json'),draft=JSON.parse(await fs.readFile(draftFile,'utf8'));
 draft.explanation+=' Gewijzigd.';draft.originalRecord.uitleg=draft.explanation;await fs.writeFile(draftFile,JSON.stringify(draft));
 const changed=catalogue.map(e=>e.coreExerciseId===id?{...e,uitleg:draft.explanation}:e);
 await assert.rejects(loadDraft({draftRoot:root,id,catalogue:changed}),/Narration explanation changed/);
 const a={events:{},pauses:0,addEventListener(n,fn){this.events[n]=fn;},pause(){this.pauses++;}},v={...a,events:{},pauses:0};
 const context=vm.createContext({cards:{querySelectorAll:()=>[a,v]}});
 vm.runInContext(html.slice(html.indexOf('function exclusieveMedia('),html.indexOf('const clear=')),context);
 context.exclusieveMedia(a);context.exclusieveMedia(v);a.events.play();assert.equal(v.pauses,1);assert.equal(a.pauses,0);v.events.play();assert.equal(a.pauses,1);
 assert.ok(!/audio\.(?:autoplay|loop)\s*=\s*true/.test(html));assert.match(html,/Opname opnieuw laden/);
 assert.match(html,/object-fit:contain/);assert.ok(!/video\.(?:autoplay|loop)\s*=\s*true/.test(html));
 assert.match(html,/video\.addEventListener\('error'/);assert.match(html,/Video opnieuw laden/);
 console.log('PASS private motion hash/reference/approval/path checks and review-player syntax, contain, no autoplay/loop, retry controls');
}finally{await fs.rm(root,{recursive:true,force:true});}
