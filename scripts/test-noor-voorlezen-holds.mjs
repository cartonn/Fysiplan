// De Nederlandse knop "Luister naar uitleg" bovenaan moet dezelfde regel volgen als de
// knop per oefening: wordt het beeld dat de kaart bij een oefening toont tegengehouden
// (afgekeurd of tijdelijke hold), dan wordt die uitleg niet voorgelezen. Eerlijk melden,
// geen toestelstem als vervanging, niets aan tekst, opname of dosering veranderen.
// Draait kaart.html-code in een VM met de echte beoordelings- en audiobestanden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exerciseId} from '../lib/exercise-id.js';

const lees=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const html=fs.readFileSync('public/kaart.html','utf8');
const tussen=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>i,b);return html.slice(i,j);};
const v2=lees('public/oefeningen-v2.json'),review=lees('public/mobile-media-review.json'),manifest=lees('public/audio/noor/manifest.json');
// zoals de server ze levert
const lib=v2.map(e=>({...e,exerciseId:exerciseId(e),img:'/v2/'+e.img,kaartImg:'/v2/'+e.kaartImg}));
const heeftOpname=(e)=>manifest.clips.some(c=>c.name===e.naam&&c.text===e.naam+'. '+e.uitleg);
const regel=(naam)=>{const e=lib.find(x=>x.naam===naam);assert.ok(e,naam);return e;};

// de held-bronnen met een opname: precies wat de bovenste knop vroeger toch afspeelde
const gehouden=review.entries.filter(r=>r.status==='rejected').map(r=>regel(r.name));
const gehoudenMetOpname=gehouden.filter(heeftOpname).map(e=>e.naam);
assert.ok(gehoudenMetOpname.includes('Dips')&&gehoudenMetOpname.includes('Triceps dips'),'testgeval: Dips en Triceps dips hebben een opname');
const normaal=lib.find(e=>heeftOpname(e)&&!review.entries.some(r=>r.exerciseId===e.exerciseId&&r.status==='rejected'));
assert.ok(normaal,'een gewone oefening met opname');

function kaartContext(chosen){
  const el=new Map(),meldingen=[],afgespeeld=[],robot=[];
  const knop=id=>{if(!el.has(id))el.set(id,{textContent:'',attrs:{},hidden:false,classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;}});return el.get(id);};
  const NoorAudio={stop(){},load:async()=>manifest,
    match:(name,text)=>manifest.clips.find(c=>c.name===name&&c.text===name+'. '+text),
    play(items){afgespeeld.push(...items.map(x=>x.name));}};
  const ctx=vm.createContext({Promise,Array,Number,String,Error,JSON,Math,
    document:{getElementById:knop,querySelectorAll:()=>[]},window:{NoorAudio,speechSynthesis:{cancel(){},speak(){robot.push('speak');}}},NoorAudio,
    speechSynthesis:{cancel(){},speak(){robot.push('speak');}},SpeechSynthesisUtterance:function(){robot.push('utterance');},
    TAAL:'nl',tr:x=>x,alert:m=>meldingen.push(m),demoGeluidKnop(){},
    fetch:async(url)=>({ok:true,json:async()=>lees(url.includes('narration')?'public/mobile-narration-review.json':'public/mobile-media-review.json')})});
  const normEx=html.match(/  function normEx\(s\)\{[^\n]*\n/)[0];
  vm.runInContext(normEx+tussen('  var mediaReviewReady=false,','  function geldigeUitsnede(')+
    tussen('  function geldigeUitsnede(','  async function loadMobileReview(')+tussen('  async function loadMobileReview(','  // Een oude afkeuring mag')+
    tussen('  function metEigen(','  function cellPrefix(')+tussen('  var bezigLezen=false,noorRequest=0;','  // ---- als app'),ctx);
  ctx.K={lib,kaart:{chosen,cells:{'dosering':'3x10'}},praktijk:{}};
  return {ctx,knop,meldingen,afgespeeld,robot};
}

// 1. gemengde selectie: de gewone oefening speelt, de tegengehouden worden overgeslagen en genoemd
{
  const keuze=[{n:normaal.naam,id:normaal.exerciseId},{n:'Dips',id:'fp_013ba6ad937cc9d9'},{n:'Triceps dips',id:'fp_f227db5fcf245d9c'},
    {n:'Step up with knee raise',id:'fp_7dc1478e2b3c17b0'},{n:'Standing chair hip extension',id:'fp_514654a0d4181742'}];
  function controleer(r){
    assert.deepEqual(r.afgespeeld,[normaal.naam],'alleen de oefening met een zichtbaar beeld wordt voorgelezen');
    assert.equal(r.meldingen.length,1,'één eerlijke melding');
    const m=r.meldingen[0];
    assert.match(m,/Niet voorgelezen, omdat de oefenafbeelding nog wordt gecontroleerd: Dips, Triceps dips, Step up with knee raise\./);
    assert.match(m,/Nog geen actuele stemopname: Standing chair hip extension\./,'ontbrekende opname apart benoemd');
    assert.match(m,/Je hoort nu de beschikbare uitleg voor 1 oefening/);
    assert.match(m,/dosering en opmerkingen van je behandelaar/,'dosering blijft het uitgangspunt');
    assert.doesNotMatch(m,/fout|onjuist|afgekeurd|klinisch|verwijderd/i,'de tekst wordt niet als inhoudelijk fout bestempeld');
    assert.deepEqual(r.robot,[],'geen toestelstem als vervanging');
  }
  // via de echte knop bovenaan
  const viaKnop=kaartContext(keuze);await vm.runInContext('loadMobileReview()',viaKnop.ctx);
  vm.runInContext('leesVoor()',viaKnop.ctx);for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  controleer(viaKnop);
  // en rechtstreeks met dezelfde items
  const k=kaartContext(keuze);await vm.runInContext('loadMobileReview()',k.ctx);
  await vm.runInContext('speelNoor((K.kaart.chosen||[]).map(function(x){return noorItem(vindOefening(x),x);}))',k.ctx);
  controleer(k);
  assert.equal(viaKnop.knop('leesBtn').attrs['aria-pressed'],'true','de knop staat op Stop zolang er iets speelt');
}

// 2. alleen tegengehouden oefeningen: niets spelen, knop terug, eerlijke melding, geen robotstem
{
  const k=kaartContext([{n:'Dips',id:'fp_013ba6ad937cc9d9'},{n:'Triceps dips',id:'fp_f227db5fcf245d9c'}]);
  await vm.runInContext('loadMobileReview()',k.ctx);
  vm.runInContext('leesVoor()',k.ctx);for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  assert.deepEqual(k.afgespeeld,[]);assert.deepEqual(k.robot,[]);
  assert.equal(k.knop('leesBtn').attrs['aria-pressed'],'false','knop meteen terug op luisteren');
  assert.equal(k.meldingen.length,1);
  assert.match(k.meldingen[0],/oefenafbeelding nog wordt gecontroleerd: Dips, Triceps dips\./);
  assert.match(k.meldingen[0],/Er wordt nu niets voorgelezen voor deze selectie\./);
  assert.doesNotMatch(k.meldingen[0],/geen stemopname beschikbaar/,'niet beweren dat de opname ontbreekt');
}

// 3. dezelfde regel als de knop per oefening (die verschijnt niet bij een tegengehouden beeld)
{
  const k=kaartContext([]);await vm.runInContext('loadMobileReview()',k.ctx);
  for(const [naam,verwacht] of [['Dips',true],['Triceps dips',true],['Standing chair shoulder rotations',false],['Rotator (apparaat)',true],
    ['Back extension',true],['Rug extensie',true],['Backextensie (apparaat)',false],
    ['Standing chair hip extension',false],['Standing chair knee lift',false],[normaal.naam,false]]){
    const o=vm.runInContext('vindOefening',k.ctx)({n:naam});
    assert.equal(vm.runInContext('noorItem',k.ctx)(o,{n:naam}).beeldGehouden,verwacht,naam);
    assert.equal(vm.runInContext('mediaWithheld',k.ctx)(o),verwacht,naam+': zelfde uitkomst als de kaartweergave');
  }
  assert.ok(html.includes("speelNoor([noorItem(vindOefening(x),x)]);return;"),'de knop per oefening gebruikt dezelfde regel');
}

// 3a. open bronkeuze (Back extension, Rug extensie, 2026-11-03): zelfde overslaan als een
// bronfout. Ze hebben geen opname; het beeld gaat voor, dus ze heten niet "zonder opname".
{
  const keuze=[{n:normaal.naam,id:normaal.exerciseId},{n:'Back extension',id:'fp_a0a18c0c13673d38'},{n:'Rug extensie',id:'fp_7b07f346644f9c17'}];
  for(const x of keuze.slice(1))assert.ok(!heeftOpname(regel(x.n)),x.n+': testgeval zonder opname');
  const k=kaartContext(keuze);await vm.runInContext('loadMobileReview()',k.ctx);
  vm.runInContext('leesVoor()',k.ctx);for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  assert.deepEqual(k.afgespeeld,[normaal.naam]);assert.deepEqual(k.robot,[]);
  assert.equal(k.meldingen.length,1);
  assert.match(k.meldingen[0],/Niet voorgelezen, omdat de oefenafbeelding nog wordt gecontroleerd: Back extension, Rug extensie\./);
  assert.doesNotMatch(k.meldingen[0],/Nog geen actuele stemopname/);
  assert.doesNotMatch(k.meldingen[0],/fout|onjuist|afgekeurd|klinisch|verwijderd/i);
}

// 3b. controlegegevens niet te laden: er wordt niets voorgelezen (bestaande regel, blijft gelden)
{
  const k=kaartContext([{n:normaal.naam,id:normaal.exerciseId},{n:'Dips',id:'fp_013ba6ad937cc9d9'}]);
  k.ctx.fetch=async()=>({ok:false,json:async()=>({})});
  await vm.runInContext('loadMobileReview().catch(function(){mediaReviewReady=false;})',k.ctx);
  vm.runInContext('leesVoor()',k.ctx);for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  assert.deepEqual(k.afgespeeld,[],'zonder beoordeling geen voorlezing');assert.deepEqual(k.robot,[]);
  assert.equal(k.meldingen.length,1);
  // bestaande, eerdere regel in speelNoor: die stopt al vóór de beeldcontrole
  assert.match(k.meldingen[0],/De controle van de algemene uitleg kon niet laden\. Ververs de kaart\./);
  assert.match(k.meldingen[0],/dosering blijft op de kaart staan/);
}

// 4. niets verwijderd: de opnames van de tegengehouden oefeningen bestaan nog
for(const naam of gehoudenMetOpname){
  const clip=manifest.clips.find(c=>c.name===naam);
  assert.ok(fs.existsSync('public'+clip.src),naam+': opname niet verwijderd');
}
console.log('Voorlezen bovenaan: '+gehoudenMetOpname.length+' oefening(en) met tegengehouden beeld en een opname ('+gehoudenMetOpname.join(', ')+') worden overgeslagen en eerlijk genoemd, net als bij de knop per oefening; geen toestelstem, opnames en dosering onaangeroerd.');
