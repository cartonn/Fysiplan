import {readFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const catalog=JSON.parse(await readFile('public/oefeningen.json','utf8'));
const m=JSON.parse(await readFile('public/audio/noor/manifest.json','utf8'));
assert.equal(m.voiceId,'ea8f12713f7644ea9ad4ed710901fbbb');
assert.equal(new Set(m.clips.map(c=>c.name)).size,m.clips.length);
const missing=[];
for(const o of catalog.filter(o=>o.uitleg)){
  const c=m.clips.find(c=>c.name===o.naam);
  if(!c){missing.push(o.naam);continue;}
  assert.ok(c,'Missing '+o.naam);assert.equal(c.text,o.naam+'. '+o.uitleg);
  assert.match(c.src,/^\/audio\/noor\/[a-f0-9]{64}\.mp3$/);
  assert.ok((await stat('public'+c.src)).size>1000);assert.ok(c.duration>1);
}
console.log('OK: '+m.clips.length+' current exercise recordings, voice identity, unique mapping and local assets');
console.log('Missing recordings: '+missing.length);
if(!process.argv.includes('--partial'))assert.equal(missing.length,0,'Incomplete Noor catalog; --partial validates existing recordings only');
