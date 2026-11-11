import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,mkdir,rm,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {maakSnapshot,leesManifest,herstelUpload,LIMITS,MANIFEST} from '../lib/backup-snapshots.js';
import {ontsleutel,versleutel} from '../lib/backup-elders.js';
const objects=new Map();let copied=0,putBytes=0,copyError=false;
const srv=createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
 if(req.method==='PUT'){
  const source=req.headers['x-amz-copy-source'];
  if(source){
   assert.ok(req.headers.authorization.includes('x-amz-copy-source'),'copy source ondertekend');
   if(copyError){res.writeHead(200);return res.end('<Error><Code>InternalError</Code></Error>');}
   if(!objects.has(source)){res.writeHead(404);return res.end();}
   objects.set(req.url,Buffer.from(objects.get(source)));copied++;res.writeHead(200);return res.end('<CopyObjectResult><ETag>ok</ETag></CopyObjectResult>');
  }
  objects.set(req.url,body);putBytes+=body.length;res.writeHead(200);return res.end();
 }
 const b=objects.get(req.url);if(!b){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-length':b.length});res.end(req.method==='HEAD'?undefined:b);
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const root=await mkdtemp(join(tmpdir(),'snapshot-test-'));
const inst={url:'http://127.0.0.1:'+srv.address().port+'/bak',id:'test',geheim:'test',regio:'nl-ams',sleutel:'lange-wachtzin-voor-backup-snapshot-test'};
const paths=[join(root,'kaarten.json')];
const env={...process.env,BACKUP_S3_URL:inst.url,BACKUP_S3_SLEUTEL_ID:inst.id,BACKUP_S3_GEHEIM:inst.geheim,BACKUP_SLEUTEL:inst.sleutel,BACKUP_S3_REGIO:inst.regio};
const day=n=>new Date('2026-11-'+String(n).padStart(2,'0')+'T12:00:00Z');
const manifest=r=>leesManifest(ontsleutel(objects.get('/bak/'+r.object),inst.sleutel));
const cli=(source,dest,extra=[])=>new Promise(resolve=>spawn(process.execPath,['scripts/backup-terugzetten.mjs',source,dest,...extra],{env,stdio:'ignore'}).on('exit',resolve));
try{
 await writeFile(paths[0],'{"kaart":"test"}');await mkdir(join(root,'uploads'));
 const original=randomBytes(100000);await writeFile(join(root,'uploads','video.mp4'),original);
 const a=await maakSnapshot(inst,root,paths,{nu:day(11)});assert.equal(a.deels,false);assert.equal(a.uploaded,1);
 const ma=manifest(a);assert.deepEqual(await herstelUpload(inst,ma.uploads['uploads/video.mp4']),original);
 const before=putBytes;
 const b=await maakSnapshot(inst,root,paths,{nu:day(12),vorigeObject:a.object});
 assert.equal(b.uploaded,0);assert.equal(b.copied,1);assert.ok(putBytes-before<10000,'ongewijzigde video verlaat server niet opnieuw');
 const mb=manifest(b);assert.notEqual(ma.uploads['uploads/video.mp4'].object,mb.uploads['uploads/video.mp4'].object);
 // Verlopen oudere dagobjecten mogen nieuwere snapshots niet breken.
 objects.delete('/bak/'+ma.uploads['uploads/video.mp4'].object);
 assert.deepEqual(await herstelUpload(inst,mb.uploads['uploads/video.mp4']),original);
 // Gewijzigde upload opnieuw; verwijderde upload niet in nieuwe dagkopie.
 const changed=randomBytes(110000);await writeFile(join(root,'uploads','video.mp4'),changed);
 const c=await maakSnapshot(inst,root,paths,{nu:day(13),vorigeObject:b.object});assert.equal(c.uploaded,1);assert.equal(c.copied,0);
 const mc=manifest(c);assert.deepEqual(await herstelUpload(inst,mc.uploads['uploads/video.mp4']),changed);
 await rm(join(root,'uploads','video.mp4'));
 const d=await maakSnapshot(inst,root,paths,{nu:day(14),vorigeObject:c.object});assert.equal(d.uploads,0);
 assert.deepEqual(await herstelUpload(inst,mb.uploads['uploads/video.mp4']),original,'oud herstelpunt blijft oud bestand bevatten');
 // HTTP 200 met Error is geen geslaagde serverkopie; fallback naar begrensde upload.
 await writeFile(join(root,'uploads','video.mp4'),changed);copyError=true;
 const e=await maakSnapshot(inst,root,paths,{nu:day(15),vorigeObject:c.object});assert.equal(e.uploaded,1);assert.equal(e.copied,0);copyError=false;
 // Limiet na encryptie: zelfs bij passend bronbestand kan container iets groter zijn.
 const f=await maakSnapshot(inst,root,paths,{nu:day(16),limits:{...LIMITS,snapshot:changed.length+1024}});
 assert.equal(f.deels,true);assert.ok(objects.get('/bak/'+f.object));assert.equal(manifest(f).complete,false);
 assert.equal(JSON.parse(ontsleutel(objects.get('/bak/'+f.object),inst.sleutel).bestanden['kaarten.json']).kaart,'test');
 const noBudget=await maakSnapshot(inst,root,paths,{nu:day(17),limits:{...LIMITS,transfer:LIMITS.metadata+1024*1024+100}});assert.equal(noBudget.deels,true);
 // Niet leesbare/onveilige inventaris is expliciet onvolledig, metadata blijft bewaard.
 await symlink('/etc/passwd',join(root,'uploads','link'));
 const bad=await maakSnapshot(inst,root,paths,{nu:day(18)});assert.equal(bad.deels,true);assert.equal(bad.errors,1);await rm(join(root,'uploads','link'));
 // Reeds opgeslagen uploads passen ook als het dagbudget alleen nog de index toelaat.
 const reused=await maakSnapshot(inst,root,paths,{nu:day(19),vorigeObject:c.object,limits:{...LIMITS,transfer:LIMITS.metadata+1024*1024+100}});
 assert.equal(reused.deels,false);assert.equal(reused.copied,1);assert.equal(reused.uploaded,0);
 // Volledig herstel via echte CLI, inclusief referenties en inhoudhashcontrole.
 const index=join(root,'index.fpb');await writeFile(index,objects.get('/bak/'+c.object));
 assert.equal(await cli(index,join(root,'restore')),0);assert.deepEqual(await readFile(join(root,'restore','uploads','video.mp4')),changed);
 // Beschadigd object mag nooit een succesvol herstel opleveren.
 const ref=mc.uploads['uploads/video.mp4'];const saved=objects.get('/bak/'+ref.object);
 const corrupt=Buffer.from(saved);corrupt[50]^=1;objects.set('/bak/'+ref.object,corrupt);
 assert.notEqual(await cli(index,join(root,'corrupt')),0);objects.set('/bak/'+ref.object,saved);
 await writeFile(index,objects.get('/bak/'+f.object));assert.notEqual(await cli(index,join(root,'partial')),0);
 assert.equal(await cli(index,join(root,'partial-explicit'),['--onvolledig']),0);
 // Path traversal / vreemde remote bestemming wordt afgewezen vóór schrijven.
 const evil={version:2,complete:true,missing:[],uploads:{'../escape':ref}};
 await writeFile(index,versleutel({[MANIFEST]:Buffer.from(JSON.stringify(evil))},inst.sleutel));assert.notEqual(await cli(index,join(root,'unsafe')),0);
 assert.ok(copied>=1);console.log('Snapshots: dagkopieën, server-copy, wijzigingen, verwijderingen, verlopen bron, budget, onveilige inventaris, corruptie en CLI-herstel geslaagd.');
}finally{srv.close();await rm(root,{recursive:true,force:true});}
