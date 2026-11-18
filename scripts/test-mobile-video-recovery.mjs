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
const broken=setup();broken.v.events.error();broken.v.load=()=>{throw new Error('load failed synchronously');};
assert.doesNotThrow(()=>broken.s.children.at(-1).events.click());
assert.match(broken.s.textContent,/niet worden afgespeeld/);assert.equal(broken.s.children.at(-1).textContent,'Opnieuw proberen');
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

// Zonder internet: geen "neem contact op met je praktijk", maar "heeft internet nodig"; de video
// verdwijnt (vfout) zodat de melding bij 200 % tekst er niet overheen ligt (sweep 2026-11-12 18u, Truus).
{
  const nav={onLine:false};
  const ctx2=vm.createContext({TAAL:'nl',navigator:nav,document:{createElement:element}});vm.runInContext(source,ctx2);
  const h=element(),v=element();const klassen=new Set();h.classList={toggle(n,aan){aan?klassen.add(n):klassen.delete(n);}};
  v.isConnected=true;v.paused=true;v.load=()=>{};v.play=()=>Promise.resolve();h.contains=x=>x===v;ctx2.bewaakVideo(v,h);const st=h.children[0];
  assert.equal(klassen.has('vfout'),false);
  v.events.error();assert.match(st.textContent,/heeft internet nodig/);assert.doesNotMatch(st.textContent,/contact op/);
  assert.equal(klassen.has('vfout'),true,'video verdwijnt bij een fout');
  assert.equal(st.children.at(-1).textContent,'Opnieuw proberen');
  st.children.at(-1).events.click();assert.equal(klassen.has('vfout'),false,'opnieuw proberen toont de video weer');
  v.events.playing();assert.equal(klassen.has('vfout'),false);
  nav.onLine=true;v.events.error();assert.match(st.textContent,/niet worden afgespeeld/);assert.equal(klassen.has('vfout'),true);
  const en=vm.createContext({TAAL:'en',navigator:{onLine:false},document:{createElement:element}});vm.runInContext(source,en);
  const h3=element(),v3=element();v3.isConnected=true;h3.contains=()=>true;en.bewaakVideo(v3,h3);v3.events.error();assert.match(h3.children[0].textContent,/needs internet/);
}
assert.match(html,/\.vhouder\.vfout>video\{display:none\}/,'een video die niet speelt staat niet onder de melding');
assert.match(html,/h2,\.naam\{-webkit-hyphens:auto;hyphens:auto\}/,'koppen en oefennamen breken bij 200 % af met een streepje');
console.log('PASS offline melding + vfout + afbreken; native video error/retry, autoplay restriction, playback recovery, stale rejection, contain geometry (VM; no device playback claim)');
