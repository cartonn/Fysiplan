import {runBackup} from '../lib/backup-runner.js';
import {herstelKaartVideo,uploadReferenties} from '../lib/backup-uploadreferenties.js';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,mkdir,rm,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {maakSnapshot,leesManifest,herstelUpload,LIMITS,MANIFEST,indexReserve,gegevensRuimte} from '../lib/backup-snapshots.js';
import {ontsleutel,versleutel} from '../lib/backup-elders.js';
const objects=new Map();let copied=0,putBytes=0,copyError=false,failUploadOnce=false;
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
  objects.set(req.url,body);putBytes+=body.length;
  if(failUploadOnce && req.url.includes("/snapshots/")){failUploadOnce=false;res.writeHead(503);return res.end();}
  res.writeHead(200);return res.end();
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
 const metaGrootte=(await readFile(paths[0])).length;
 const a=await maakSnapshot(inst,root,paths,{nu:day(11)});assert.equal(a.deels,false);assert.equal(a.uploaded,1);
 assert.equal(a.gegevensBytes,metaGrootte,'de kopie meldt hoe groot de gegevensbestanden zijn');
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
 const noBudget=await maakSnapshot(inst,root,paths,{nu:day(17),limits:{...LIMITS,transfer:indexReserve(metaGrootte)+100}});assert.equal(noBudget.deels,true);
 // Niet leesbare/onveilige inventaris is expliciet onvolledig, metadata blijft bewaard.
 await symlink('/etc/passwd',join(root,'uploads','link'));
 const bad=await maakSnapshot(inst,root,paths,{nu:day(18)});assert.equal(bad.deels,true);assert.equal(bad.errors,1);await rm(join(root,'uploads','link'));
 // Reeds opgeslagen uploads passen ook als het dagbudget alleen nog de index toelaat.
 const reused=await maakSnapshot(inst,root,paths,{nu:day(19),vorigeObject:c.object,limits:{...LIMITS,transfer:indexReserve(metaGrootte)+100}});
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
 // Verbinding kan falen nadat de upload is aangekomen. Na herstart hergebruiken we die.
 let journal={bytes:0,uploads:{}};let disk;
 const saveJournal=async j=>{disk=JSON.stringify(j);};
 failUploadOnce=true;
 const interrupted=await maakSnapshot(inst,root,paths,{nu:day(20),journal,saveJournal});
 assert.equal(interrupted.deels,true);const spent=journal.bytes;const network=putBytes;
 journal=JSON.parse(disk);
 const retried=await maakSnapshot(inst,root,paths,{nu:day(20),journal,saveJournal});
 assert.equal(retried.deels,false);assert.equal(retried.uploaded,0);assert.equal(retried.copied,1);
 assert.ok(putBytes-network<10000,'geen tweede video-upload na verloren antwoord');
 assert.ok(journal.bytes>spent,'ook indextransfers tellen mee');
 const fullJournal={bytes:LIMITS.transfer,uploads:journal.uploads};const beforeBudget=putBytes;
 await assert.rejects(maakSnapshot(inst,root,paths,{nu:day(20),journal:fullJournal}),/transferbudget/);
 assert.equal(putBytes,beforeBudget,'vol dagbudget mag geen nieuwe PUT versturen');
 // Path traversal / vreemde remote bestemming wordt afgewezen vóór schrijven.
 const evil={version:2,complete:true,missing:[],uploads:{'../escape':ref}};
 await writeFile(index,versleutel({[MANIFEST]:Buffer.from(JSON.stringify(evil))},inst.sleutel));assert.notEqual(await cli(index,join(root,'unsafe')),0);
 // Gegevensgrens: 64 MiB, één byte erboven mislukt met de grens in de melding, en vanaf de helft is het krap.
 assert.equal(LIMITS.metadata,64*1024*1024);
 const klein={...LIMITS,metadata:metaGrootte};
 assert.equal((await maakSnapshot(inst,root,paths,{nu:day(21),limits:klein})).gegevensBytes,metaGrootte,'precies op de grens past');
 await assert.rejects(maakSnapshot(inst,root,paths,{nu:day(21),limits:{...LIMITS,metadata:metaGrootte-1}}),/gegevensbestanden groter dan/);
 // 12 MiB aan gegevens: te veel voor de oude grens van 10 MiB, past ruim in de nieuwe
 const groot=join(root,'praktijk-audit.json');await writeFile(groot,Buffer.alloc(12*1024*1024,'a'));
 await assert.rejects(maakSnapshot(inst,root,[...paths,groot],{nu:day(21),limits:{...LIMITS,metadata:10*1024*1024}}),/gegevensbestanden groter dan 10 MiB/);
 const ruim=await maakSnapshot(inst,root,[...paths,groot],{nu:day(21)});
 assert.equal(ruim.gegevensBytes,metaGrootte+12*1024*1024);assert.equal(gegevensRuimte(ruim.gegevensBytes).krap,false);
 assert.equal(ontsleutel(objects.get('/bak/'+ruim.object),inst.sleutel).bestanden['praktijk-audit.json'].length,12*1024*1024,'het grote bestand zit heel in de kopie');
 await rm(groot);
 assert.deepEqual(gegevensRuimte(16*1024*1024),{bytes:16*1024*1024,grens:64*1024*1024,procent:25,krap:false});
 assert.equal(gegevensRuimte(32*1024*1024).krap,false,'precies de helft is nog niet krap');
 assert.equal(gegevensRuimte(32*1024*1024+1).krap,true);
 assert.equal(indexReserve(1000),11*1024*1024,'kleine gegevens: dezelfde reserve als voorheen');
 assert.equal(indexReserve(40*1024*1024),41*1024*1024,'grote gegevens: de reserve groeit mee');

 // Echte herstelbevinding: kaart verwijst naar video die al vóór de back-up ontbreekt.
 const missing='uploads/videos/v-0cd07852ac7f.mp4';
 const cards={test:{kaart:{id:'abc',chosen:[{n:'Oefening'}],rows:[{s:3}],vids:{oefening:missing,andere:'uploads/video.mp4'},metingen:[{s:2}]}}};
 await writeFile(paths[0],JSON.stringify(cards));
 let tick=day(25).getTime();
 const partial=await runBackup(inst,root,paths,{now:()=>tick});
 assert.equal(partial.status,'deels');assert.equal(partial.fullAt,null);
 assert.equal(partial.resultaat.ontbrekendeVerwijzingen,1);
 assert.match(partial.error,/uploadverwijzing/);assert.ok(!partial.error.includes(missing),'geen paden in alarm');
 assert.deepEqual(manifest(partial.resultaat).missing,[{name:missing,reason:'verwijzing naar ontbrekende upload'}]);
 assert.deepEqual(JSON.parse(ontsleutel(objects.get('/bak/'+partial.object),inst.sleutel).bestanden['kaarten.json']),cards,'metadata behouden bij ontbrekende video');
 const fixed=herstelKaartVideo(cards,missing);assert.equal(fixed.verwijderd,1);
 assert.equal(cards.test.kaart.vids.oefening,missing,'bronkaart intact');
 assert.deepEqual(fixed.kaarten,{test:{kaart:{...cards.test.kaart,vids:{andere:'uploads/video.mp4'}}}});
 await writeFile(paths[0],JSON.stringify(fixed.kaarten));tick+=16*60000;
 const recovered=await runBackup(inst,root,paths,{now:()=>tick});
 assert.equal(recovered.status,'ok');assert.equal(recovered.resultaat.ontbrekendeVerwijzingen,0);
 const refs=uploadReferenties({'kaarten.json':Buffer.from(JSON.stringify(['/'+missing+'?k=123','https://fysiplan.nl/'+missing,'https://extern.nl/uploads/external.mp4']))});
 assert.deepEqual([...refs.paths],[missing]);assert.equal(refs.fouten,0);
 assert.ok(uploadReferenties({'kaarten.json':Buffer.from('{')}).fouten);
 assert.ok(uploadReferenties({'kaarten.json':Buffer.from(JSON.stringify('uploads/%2e%2e/secrets'))}).fouten);
 assert.equal(uploadReferenties({'praktijk-audit.json':Buffer.from(JSON.stringify({oudeVerwijzing:missing}))}).paths.size,0,'historische logregels zijn geen actieve uploadreferenties');
 assert.ok(copied>=1);console.log('Snapshots: dagkopieën, server-copy, wijzigingen, verwijderingen, verlopen bron, budget, onveilige inventaris, corruptie en CLI-herstel geslaagd.');
}finally{srv.close();await rm(root,{recursive:true,force:true});}
