import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const data=await mkdtemp(join(tmpdir(),'fysiplan-draft-http-'));
const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',ADMIN_KEY:'draft-test-only-private-key',DATA_DIR:data},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const base=`http://127.0.0.1:${port}`,headers={'x-admin-sleutel':'draft-test-only-private-key'};
try{
 let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(ready,log);
 for(const path of ['/api/exercise-drafts','/api/exercise-drafts/fc_07a47f244d7392e6/line','/api/exercise-drafts/fc_07a47f244d7392e6/motion']){
  assert.notEqual((await fetch(base+path)).status,200);
  assert.notEqual((await fetch(base+path,{headers:{'x-admin-sleutel':'admin88'}})).status,200);
 }
 const res=await fetch(base+'/api/exercise-drafts',{headers});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
 const body=await res.json();assert.equal(body.published,false);assert.equal(body.drafts.length,1);
 assert.equal(body.drafts[0].coreExerciseId,'fc_07a47f244d7392e6');
 const motion=body.drafts[0].motionCandidate;
 assert.equal(motion.qaStatus,'pending-independent-review');assert.equal(motion.clinicalApproval,false);assert.equal(motion.published,false);
 assert.equal(motion.audio,false);assert.equal(motion.fit,'contain');
 const original=await readFile('content/private-exercise-drafts/fc_07a47f244d7392e6/motion.mp4');
 const motionPath='/api/exercise-drafts/fc_07a47f244d7392e6/motion';
 for(const [range,start,end] of [[null,0,original.length-1],['bytes=0-1',0,1],['bytes=-16',original.length-16,original.length-1],['bytes=16-',16,original.length-1]]){
  const r=await fetch(base+motionPath,{headers:{...headers,...(range?{Range:range}:{})}});
  assert.equal(r.status,range?206:200);assert.equal(r.headers.get('content-type'),'video/mp4');assert.match(r.headers.get('cache-control'),/private.*no-store/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),original.subarray(start,end+1));
 }
 const invalidRange=await fetch(base+motionPath,{headers:{...headers,Range:'bytes=99999999-'}});assert.equal(invalidRange.status,416);assert.match(invalidRange.headers.get('cache-control'),/no-store/);
 const publicVideo=await fetch(base+'/content/private-exercise-drafts/fc_07a47f244d7392e6/motion.mp4');assert.notEqual(publicVideo.headers.get('content-type'),'video/mp4');
 const live=await(await fetch(base+'/v2/oefeningen.json')).json();assert.ok(!live.some(e=>e.coreExerciseId==='fc_07a47f244d7392e6'),'private motion never publishes missing exercise');
 for(const role of ['line','start','end']){
  const image=await fetch(base+`/api/exercise-drafts/fc_07a47f244d7392e6/${role}`,{headers});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),await readFile(`content/private-exercise-drafts/fc_07a47f244d7392e6/${role}.png`));
 }
 assert.equal((await fetch(base+'/api/exercise-drafts',{headers,method:'POST'})).status,405);
 const publicAttempt=await fetch(base+'/content/private-exercise-drafts/fc_07a47f244d7392e6/start.png');
 assert.ok(!String(publicAttempt.headers.get('content-type')).includes('image/png'));
 assert.notEqual(Buffer.from(await publicAttempt.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal((await fetch(base+'/api/exercise-drafts/fc_07a47f244d7392e6/unknown',{headers})).status,404);
 console.log('PASS: private draft HTTP list/assets authenticated, no-store, byte-equal; mutations denied; no public storage exposure');
}finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
