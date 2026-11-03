import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile('public/noor-audio.js','utf8');
const clips=[{name:'Een',text:'Een. Eerste.',src:'/audio/noor/aaa.mp3'},
  {name:'Twee',text:'Twee. Tweede.',src:'/audio/noor/bbb.mp3'}];
const items=[{name:'Een',text:'Eerste.'},{name:'Twee',text:'Tweede.'}];
let player,mode='reject-late',calls=0,rejectFirst;
class Audio {
  constructor(){player=this;}
  play(){calls++;if(calls===1)return new Promise((_,reject)=>{rejectFirst=reject;});
    if(mode==='throw-next')throw Error('Synchronous media failure');return Promise.resolve();}
  pause(){this.paused=true;}load(){}removeAttribute(){}
}
const window={};
vm.runInNewContext(source,{window,Audio,setTimeout,clearTimeout,
  fetch:async()=>({ok:true,json:async()=>({clips})})});
await window.NoorAudio.load();
let errors=[],completed=0;
await window.NoorAudio.play(items,()=>completed++,e=>errors.push(e));
player.onended(); // the second clip begins before the old promise rejects
rejectFirst(Error('Late rejection from previous clip'));
await Promise.resolve();await Promise.resolve();
assert.equal(player.src,clips[1].src);
assert.equal(player.paused,undefined,'stale promise must not stop second clip');
assert.equal(errors.length,0);
player.onended();assert.equal(completed,1);
// Synchronous exceptions on subsequent fragments occur in an event handler,
// outside the original async play() try/catch. They still need clean recovery.
calls=0;mode='throw-next';errors=[];
await window.NoorAudio.play(items,()=>completed++,e=>errors.push(e));
assert.doesNotThrow(()=>player.onended());
assert.equal(errors.length,1);assert.equal(player.paused,true);
assert.equal(player.onended,null);
rejectFirst(Error('Old promise after cleanup'));
await Promise.resolve();assert.equal(errors.length,1);
window.NoorAudio.stop();
console.log('PASS: stale play promise cannot stop next clip; synchronous next-clip failure cleans up once.');
