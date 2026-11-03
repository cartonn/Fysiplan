import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('public/kaart.html','utf8');
const source=html.slice(html.indexOf('  function bewaakVideo('),html.indexOf('  // ---- alle knoppen één keer'));
function element(){return {children:[],hidden:false,textContent:'',events:{},setAttribute(){},appendChild(x){this.children.push(x);},addEventListener(n,fn){this.events[n]=fn;}};}
const ctx=vm.createContext({TAAL:'nl',document:{createElement:element}});vm.runInContext(source,ctx);
function setup(){const h=element(),v=element();v.isConnected=true;v.paused=true;v.load=()=>{v.loads=(v.loads||0)+1;};v.play=()=>Promise.resolve();h.contains=x=>x===v&&v.isConnected;ctx.bewaakVideo(v,h);return {v,h,s:h.children[0]};}
const {v,s}=setup();assert.match(s.textContent,/laden/);
v.events.error();assert.match(s.textContent,/niet worden afgespeeld/);
const retry=s.children.at(-1);assert.equal(retry.type,'button');retry.events.click();assert.equal(v.loads,1);
v.events.playing();assert.equal(s.hidden,true);
v.events.waiting();assert.match(s.textContent,/laden/);
v.events.canplay();assert.match(s.textContent,/Tik op afspelen/);
v.events.error();v.play=()=>Promise.reject({name:'NotAllowedError'});s.children.at(-1).events.click();
await Promise.resolve();assert.match(s.textContent,/Tik op afspelen/);
// Late rejected play promises cannot resurrect an error after playing or card removal.
v.events.error();let reject;v.play=()=>new Promise((_,r)=>{reject=r;});s.children.at(-1).events.click();v.events.playing();reject({name:'NotSupportedError'});await Promise.resolve();assert.equal(s.hidden,true);
v.events.error();v.play=()=>new Promise((_,r)=>{reject=r;});s.children.at(-1).events.click();v.isConnected=false;const before=s.textContent;reject({name:'NotSupportedError'});await Promise.resolve();assert.equal(s.textContent,before);
assert.match(html,/\.vhouder video\{object-fit:contain\}/);
assert.match(html,/bewak|bewaakVideo\(houder.querySelector\('video'\),houder\)/);
console.log('PASS native video error/retry, autoplay restriction, playback recovery, stale rejection, contain geometry (VM; no device playback claim)');
