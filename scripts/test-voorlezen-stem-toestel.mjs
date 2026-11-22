// Legal 2026-11-22 (art. 28 en 44 AVG): "Lees voor" in een andere taal dan het Nederlands gebruikt
// de spraak van de browser. Chrome op een computer biedt ook stemmen op internet ("Google ...",
// localService false): dan gaat de hele voorleestekst (praktijk, doel van de therapeut, oefeningen
// en dosering) naar Google, dat geen subverwerker van Fysiplan is. De kaart kiest nu alleen een
// stem op het toestel zelf; is die er niet, dan leest hij niet voor en zegt dat in de kaarttaal.
// Draait de echte functies uit public/kaart.html in een VM, zonder browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('public/kaart.html','utf8');
const tussen=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>i,b);return html.slice(i,j);};
const T=vm.runInNewContext(tussen('  var T={','  var SPRAAK=')+';T');
for(const t of ['nl','en','de','fr','es','pl','tr','ar','uk'])assert.ok(T[t].leesGeenStem,'melding zonder toestelstem in '+t);

const INTERNET={name:'Google UK English Female',lang:'en-GB',voiceURI:'Google UK English Female',localService:false};
const TOESTEL={name:'Daniel',lang:'en-GB',voiceURI:'com.apple.voice.Daniel',localService:true};
function context(stemmen,voorkeur){
  const el=new Map(),log=[];
  const knop=id=>{if(!el.has(id))el.set(id,{textContent:'',hidden:false,value:'',options:[],selectedIndex:0,attrs:{},
    classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},
    replaceChildren(...o){this.options=o;},add(o){this.options.push(o);}});return el.get(id);};
  const spraak={cancel(){},speak(u){log.push({type:'speak',u});},getVoices:()=>stemmen,addEventListener(){}};
  const ctx=vm.createContext({document:{getElementById:knop,querySelectorAll:()=>[]},window:{speechSynthesis:spraak},
    speechSynthesis:spraak,SpeechSynthesisUtterance:function(t){this.text=t;},NoorAudio:{stop(){}},
    Option:function(t,v){this.text=t;this.value=v;},
    localStorage:{getItem:()=>voorkeur||'',setItem(){}},alert:m=>log.push({type:'alert',text:m}),
    TAAL:'en',T,tr:k=>T.en[k],vt:s=>s,normEx:s=>String(s).toLowerCase(),SPRAAK:{en:'en-GB'},explanationWithheld:()=>false,
    stopVideos(){},stopLezen(){},meldOvergeslagen(){},mediaReviewReady:true,noorRequest:0,bezigLezen:false,
    vindOefening:()=>null,noorItem:()=>({}),uitlegGehouden:()=>false,metEigen:()=>[],cellPrefix:()=>'x',
    demo:{spraak:true},
    K:{kaart:{chosen:[{n:'Squat'}],cells:{},client:{c_doel:'Weer traplopen na de knieoperatie'}},praktijk:{praktijk:'Praktijk'},lib:[]}});
  vm.runInContext(tussen('  var STEMMEN={};','  // [label, aria-label, standaardkeuze]')+
    tussen('  var TSTEM={','  if(window.speechSynthesis)try{')+
    tussen('  // Alleen een stem die op het toestel zelf draait','  function demoGeluidKnop(){')+
    tussen('  function leesVoor(){','  // Melding voor de toestelstem'),ctx);
  return {ctx,log,knop};
}
const spreek=r=>r.log.filter(x=>x.type==='speak');

// 1. stem op internet en op het toestel: altijd die op het toestel, ook als de internetstem
//    eerder als voorkeur bewaard werd (oude keuze in de stemkiezer)
{
  const r=context([INTERNET,TOESTEL],INTERNET.voiceURI);
  vm.runInContext('leesVoor()',r.ctx);
  assert.equal(spreek(r).length,1,'leest voor');
  assert.equal(spreek(r)[0].u.voice,TOESTEL,'alleen de stem op het toestel');
  vm.runInContext('vulStemmen()',r.ctx);
  const keuzes=r.knop('stemsel').options.map(o=>o.value);
  assert.ok(!keuzes.includes(INTERNET.voiceURI),'de stemkiezer biedt geen stem op internet aan');
  assert.ok(keuzes.includes(TOESTEL.voiceURI),'wel de stem op het toestel');
}
// 2. alleen een stem op internet: niets naar die stem, wel een melding in de kaarttaal
{
  const r=context([INTERNET]);
  vm.runInContext('leesVoor()',r.ctx);
  assert.equal(spreek(r).length,0,'zonder stem op het toestel wordt niets voorgelezen');
  assert.deepEqual(r.log.filter(x=>x.type==='alert').map(x=>x.text),[T.en.leesGeenStem]);
  vm.runInContext('demoZeg("Bend your knees")',r.ctx);
  assert.equal(spreek(r).length,0,'ook de gesproken demo gaat niet naar een stem op internet');
}
// 3. de gesproken demo met een stem op het toestel blijft werken
{
  const r=context([INTERNET,TOESTEL]);
  vm.runInContext('demoZeg("Bend your knees")',r.ctx);
  assert.equal(spreek(r).length,1);assert.equal(spreek(r)[0].u.voice,TOESTEL);
}
// /privacy noemt het, zodat tekst en code kloppen
const jur=fs.readFileSync('public/juridisch.html','utf8');
assert.match(jur,/<li id="voorlezen">[^\n]*nooit een stem op internet/,'/privacy#voorlezen noemt de regel');
console.log('Voorlezen in andere talen: alleen een stem op het toestel, nooit een stem op internet; zonder toestelstem een melding in de kaarttaal.');
