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
 for(const path of ['/api/exercise-drafts','/api/exercise-drafts/fc_07a47f244d7392e6/line']){
  assert.notEqual((await fetch(base+path)).status,200);
  assert.notEqual((await fetch(base+path,{headers:{'x-admin-sleutel':'admin88'}})).status,200);
 }
 const res=await fetch(base+'/api/exercise-drafts',{headers});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
 const body=await res.json();assert.equal(body.published,false);assert.equal(body.drafts.length,1);
 assert.equal(body.drafts[0].coreExerciseId,'fc_07a47f244d7392e6');
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
