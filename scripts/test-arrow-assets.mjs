import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {exerciseId} from '../lib/exercise-id.js';
const manifest=JSON.parse(await fs.readFile('content/beginhouding-pijl.json','utf8'));
const base=JSON.parse(await fs.readFile('public/oefeningen-v2.json','utf8'));
assert.equal(manifest.entries.length,310);assert.equal(manifest.withheld.length,9);
assert.equal(new Set(manifest.entries.map(e=>e.source)).size,310);
for(const e of manifest.entries){
  const original=base.find(x=>x.img===e.source);assert(original,e.naam);
  const m=await sharp('public/'+e.img).metadata();assert.equal(m.width,800);assert.equal(m.height,1200);
  assert.equal(exerciseId({...original,exerciseId:exerciseId(original),img:e.img}),exerciseId(original));
}
assert(manifest.entries.find(e=>e.id==='076').naam==='Abroller');
for(const hold of manifest.withheld)assert(!manifest.entries.some(e=>e.id===hold.id));
const server=await fs.readFile('server.js','utf8');
assert(server.includes('img: v2AssetPath(arrowImages.get(e.img) || e.img)'));
const css=await fs.readFile('public/v2.css','utf8');assert(css.includes('object-position:center;box-sizing:border-box'));
console.log('PASS: 310 mapped, 9 held back, all 800×1200, stable exercise IDs and contained/centered layout.');
