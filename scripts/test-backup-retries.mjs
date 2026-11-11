import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runBackup} from '../lib/backup-runner.js';
import {LIMITS} from '../lib/backup-snapshots.js';
const dir=await mkdtemp(join(tmpdir(),'backup-retries-'));const inst={url:'https://example.test/bucket'};
let t=Date.UTC(2026,10,11,10),calls=0;
const opts={now:()=>t,snapshot:async(i,r,p,o)=>{calls++;o.journal.bytes+=100;await o.saveJournal(o.journal);throw new Error('tijdelijke storing');}};
try{
 let s=await runBackup(inst,dir,[],opts);assert.equal(s.attempts,1);assert.equal(s.journal.bytes,100);
 s=await runBackup(inst,dir,[],opts);assert.equal(calls,1,'herstart wacht tot herkansing');
 t+=15*60*1000;s=await runBackup(inst,dir,[],opts);assert.equal(calls,2);assert.equal(s.journal.bytes,200);
 t+=60*60*1000;s=await runBackup(inst,dir,[],opts);assert.equal(calls,3);
 t+=4*60*60*1000;s=await runBackup(inst,dir,[],opts);assert.equal(calls,4);assert.equal(s.journal.bytes,400);
 t+=60*60*1000;s=await runBackup(inst,dir,[],opts);assert.equal(calls,4,'maximaal vier pogingen');
 t+=24*60*60*1000;s=await runBackup(inst,dir,[],{now:()=>t,snapshot:async()=>({deels:false,object:'fysiplan-do.fpb',bytes:20})});
 assert.equal(s.attempts,1);assert.equal(s.fullAt,t);assert.equal(s.journal.bytes,0);
 await runBackup(inst,dir,[],opts);assert.equal(calls,4,'geslaagde cyclus niet herhalen');
 // Een gedeeltelijke kopie mag het tijdstip van de laatste volledige niet vervangen.
 const full=t;t+=24*60*60*1000;s=await runBackup(inst,dir,[],{now:()=>t,snapshot:async()=>({deels:true,object:'fysiplan-vr.fpb'})});
 assert.equal(s.status,'deels');assert.equal(s.fullAt,full);
 // Reeds bestaande successen blijven na migratie geldig zonder netwerkverkeer.
 await writeFile(join(dir,'backup-elders-status.json'),JSON.stringify({versie:3,url:inst.url,op:t,object:'fysiplan-vr.fpb',resultaat:{bytes:123}}));
 s=await runBackup(inst,dir,[],opts);assert.equal(s.fullAt,t);assert.equal(calls,4);
 // Oud onderbroken werk: verbruik onbekend, dus budget conservatief reserveren.
 await writeFile(join(dir,'backup-elders-status.json'),JSON.stringify({versie:3,url:inst.url,poging:t}));
 s=await runBackup(inst,dir,[],opts);assert.equal(s.journal.bytes,LIMITS.transfer);assert.equal(calls,4);
 console.log('Herkansingen: pauzes, maximaal vier pogingen, herstartbestendig budget, laatste volledige kopie en veilige migratie geslaagd.');
}finally{await rm(dir,{recursive:true,force:true});}
