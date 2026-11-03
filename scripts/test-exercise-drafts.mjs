import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, symlink, readdir } from 'node:fs/promises';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { Script } from 'node:vm';
import { join, resolve } from 'node:path';
import { importDraft, loadDraft, listDrafts } from '../lib/draft-exercise-import.js';
const id='fc_07a47f244d7392e6',root=resolve('content/private-exercise-drafts');
const cataloguePath=resolve('public/oefeningen-v2.json'),before=await readFile(cataloguePath),catalogue=JSON.parse(before);
const d=await loadDraft({draftRoot:root,id,catalogue});
assert.equal(d.published,false);assert.equal(d.video,null);assert.equal(d.audio,null);
const temp=await mkdtemp(join(tmpdir(),'fysiplan-draft-test-'));
const bundle={...d,schema:'fysiplan-unpublished-import-candidate-v1'};
for(const role of ['line','start','end']){bundle.assets[role]={...d.assets[role],relativePath:`${role}.png`};await copyFile(join(root,id,`${role}.png`),join(temp,`${role}.png`));}
const bundlePath=join(temp,'candidate.json'),draftRoot=join(temp,'private');
const save=()=>writeFile(bundlePath,JSON.stringify(bundle));await save();
assert.equal((await importDraft({bundlePath,cataloguePath,draftRoot})).status,'imported-unpublished');
assert.equal((await importDraft({bundlePath,cataloguePath,draftRoot})).status,'unchanged');
assert.equal((await listDrafts({draftRoot,catalogue})).length,1);
bundle.publishable=true;await save();await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot}),/Draft flag/);bundle.publishable=false;
bundle.explanation+=' changed';await save();await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot}),/Explanation/);bundle.explanation=d.explanation;
bundle.coreExerciseId='fc_2050086df6d023ac';await save();await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot}),/not eligible/);bundle.coreExerciseId=id;
bundle.assets.line.relativePath='../outside.png';await save();await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot}),/traversal/);bundle.assets.line.relativePath='line.png';
await save();await writeFile(join(temp,'line.png'),'corrupt');await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot}),/PNG/);
await assert.rejects(loadDraft({draftRoot:root,id,catalogue:catalogue.map(r=>r.coreExerciseId===id?{...r,uitleg:'changed'}:r)}),/Source record changed/);
assert.deepEqual(await readFile(cataloguePath),before);
const server=await readFile('server.js','utf8');assert.ok(server.includes('!ADMIN_KEY_EIGEN || !isAdmin(request)'));
assert.ok(server.includes('private, no-store'));
const page=await readFile('public/draft-review.html','utf8');
new Script(page.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
assert.ok(page.includes("['line','start','end']"));
assert.ok(!page.includes('innerHTML'));
assert.ok(page.includes('object-fit:contain') && page.includes('object-position:50% 50%'));
// A lexical child symlink must not permit import from outside the bundle root,
// even when its bytes match the expected digest.
const outside=await mkdtemp(join(tmpdir(),'fysiplan-draft-outside-'));
await copyFile(join(root,id,'line.png'),join(outside,'line.png'));
await symlink(join(outside,'line.png'),join(temp,'escaped.png'));
bundle.assets.line.relativePath='escaped.png';await save();
await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot:join(temp,'symlink-drafts')}),/symlink escapes/);
bundle.assets.line.relativePath='line.png';await copyFile(join(root,id,'line.png'),join(temp,'line.png'));await save();
// Fail after the first staged image, then fail post-write validation. Neither
// may leave a final-ID directory, lock or staging debris; retry must work.
const atomicRoot=join(temp,'atomic');
const originalWrite=fs.promises.writeFile;
for(const mode of ['write-failure','validation-failure']){
 fs.promises.writeFile=async(p,bytes,options)=>{
  if(String(p).includes('.import-') && String(p).endsWith('/start.png')){
   if(mode==='write-failure')throw new Error('injected disk failure');
   return originalWrite(p,Buffer.from('bad staged PNG'),options);
  }
  return originalWrite(p,bytes,options);
 };
 syncBuiltinESMExports();
 try{await assert.rejects(importDraft({bundlePath,cataloguePath,draftRoot:atomicRoot}),mode==='write-failure'?/injected disk failure/:/PNG/);}
 finally{fs.promises.writeFile=originalWrite;syncBuiltinESMExports();}
 assert.deepEqual(await readdir(atomicRoot),[], 'Failed import must leave no partial draft or lock');
}
assert.equal((await importDraft({bundlePath,cataloguePath,draftRoot:atomicRoot})).status,'imported-unpublished');
assert.deepEqual(await readFile(cataloguePath),before);
console.log('PASS: draft import, idempotency, held IDs denied, source/hash/path/flags checks, catalogue unchanged');
console.log('PASS: realpath symlink escape rejected; staged write/validation failures cleanly retry');
