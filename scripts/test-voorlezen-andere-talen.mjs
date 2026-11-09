// "Lees voor" in andere talen dan het Nederlands (toestelstem) volgt dezelfde regels als de
// knoppen per oefening en het Nederlandse voorlezen: een oefening waarvan de kaart het
// beeld (mediaWithheld) of de uitleg (houd op de uitleg) tegenhoudt, wordt helemaal
// overgeslagen en in de taal van de kaart genoemd; zonder geladen controle wordt niets
// voorgelezen. Alles wat niet wordt tegengehouden, klinkt precies zoals voorheen.
// Draait de echte functies uit public/kaart.html in een VM met de echte beoordeling.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exerciseId} from '../lib/exercise-id.js';

const lees=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const html=fs.readFileSync('public/kaart.html','utf8');
const tussen=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>i,b);return html.slice(i,j);};
const regelVan=(re)=>{const m=html.match(re);assert.ok(m,String(re));return m[0];};
const v2=lees('public/oefeningen-v2.json'),review=lees('public/mobile-media-review.json'),narration=lees('public/mobile-narration-review.json');
// Testgeval: sinds 2026-11-09 is de hold op Dips opgeheven (nieuwe avatar). Om "alleen het beeld wordt
// tegengehouden" te blijven toetsen houden we in deze test Biceps curl tegen, zoals de beoordeling een hold vastlegt.
for(const r of review.entries)if(r.name==='Biceps curl'){r.status='rejected';r.presentation='withhold';}
const lib=v2.map(e=>({...e,exerciseId:exerciseId(e),img:'/v2/'+e.img,kaartImg:'/v2/'+e.kaartImg}));
const oef=(naam)=>{const e=lib.find(x=>x.naam===naam);assert.ok(e,naam);return e;};
const beeldWeg=new Set(review.entries.filter(r=>r.status==='rejected').map(r=>r.exerciseId));
const uitlegWeg=new Set(narration.holds.filter(h=>h.status==='hold').map(h=>h.exerciseId));
const vrij=lib.filter(e=>review.entries.some(r=>r.exerciseId===e.exerciseId)&&!beeldWeg.has(e.exerciseId)&&!uitlegWeg.has(e.exerciseId)&&e.uitleg);
const [A,B]=[vrij[0],vrij[1]];
// testgevallen uit de echte beoordeling
const DIPS=oef('Biceps curl'),SWING=oef('Med ball swing'),ROTATOR=oef('Rotator (apparaat)');
assert.ok(beeldWeg.has(DIPS.exerciseId)&&!uitlegWeg.has(DIPS.exerciseId),'Biceps curl (testhold): alleen het beeld wordt tegengehouden');
assert.ok(uitlegWeg.has(SWING.exerciseId)&&!beeldWeg.has(SWING.exerciseId),'Med ball swing: alleen de uitleg wordt tegengehouden');
assert.ok(uitlegWeg.has(ROTATOR.exerciseId)&&beeldWeg.has(ROTATOR.exerciseId),'Rotator (apparaat): beide');

const MARKER='[en-test] '; // testvertaling, geen klinische tekst
const T_CODE=tussen('  var T={','  var SPRAAK=');
const T=vm.runInNewContext(T_CODE+';T');
const TALEN=['en','de','fr','es','pl','tr','ar','uk'];

function context(taal,{reviewOk=true}={}){
  const el=new Map(),log=[];
  const knop=id=>{if(!el.has(id))el.set(id,{textContent:'',attrs:{},hidden:false,classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;}});return el.get(id);};
  const spraak={cancel(){log.push({type:'cancel'});},speak(u){log.push({type:'speak',u,text:u.text,lang:u.lang,rate:u.rate});}};
  const ctx=vm.createContext({Promise,Array,Number,String,Error,JSON,Math,
    document:{getElementById:knop,querySelectorAll:()=>[]},window:{speechSynthesis:spraak,NoorAudio:{stop(){}}},
    NoorAudio:{stop(){}},speechSynthesis:spraak,SpeechSynthesisUtterance:function(t){this.text=t;},
    alert:m=>log.push({type:'alert',text:m}),demoGeluidKnop(){},kiesStem:()=>null,
    fetch:async(url)=>reviewOk?{ok:true,json:async()=>url.includes('narration')?lees('public/mobile-narration-review.json'):JSON.parse(JSON.stringify(review))}
      :{ok:false,json:async()=>({})}});
  vm.runInContext(T_CODE+regelVan(/  var SPRAAK=\{[^\n]*\n/)+'var TAAL='+JSON.stringify(taal)+';var VERT={};\n'+
    regelVan(/  function tr\(k\)\{[^\n]*\n/)+regelVan(/  function vt\(s\)\{[^\n]*\n/)+regelVan(/  function normEx\(s\)\{[^\n]*\n/)+
    tussen('  var mediaReviewReady=false,','  function geldigeUitsnede(')+tussen('  function geldigeUitsnede(','  async function loadMobileReview(')+
    tussen('  async function loadMobileReview(','  // Een oude afkeuring mag')+tussen('  function metEigen(lib,kaart){','  function dagStr(t)')+
    tussen('  var bezigLezen=false,noorRequest=0,noorBron=-1;','  // ---- als app'),ctx);
  ctx.VERT[taal]={[A.uitleg]:MARKER+A.uitleg};
  return {ctx,knop,log,laad:()=>vm.runInContext('loadMobileReview().catch(function(){mediaReviewReady=false;})',ctx)};
}
const keuze=(...lijst)=>lijst.map(e=>({n:e.naam,id:e.exerciseId}));
// dosering bij elke oefening, ook bij de tegengehouden: die moet onaangeroerd blijven
function cellen(lijst){const c={};lijst.forEach((e,i)=>{c['x'+e.exerciseId+'.0|r0|S']=String(i+2);c['x'+e.exerciseId+'.0|r0|H']='10';});return c;}
function kaart(r,lijst){
  r.ctx.K={lib,kaart:{chosen:keuze(...lijst),cells:cellen(lijst),client:{c_doel:'Sterker worden'}},praktijk:{praktijk:'Testpraktijk'}};
}
const tik=(r)=>vm.runInContext('leesVoor()',r.ctx);
const spreek=(r)=>r.log.filter(x=>x.type==='speak');
const meldingen=(r)=>r.log.filter(x=>x.type==='alert').map(x=>x.text);
// verwachte voorleestekst volgens de bestaande opbouw; alleen de genoemde oefeningen (met kaartnummer)
function verwacht(taal,lijst,gelezen){
  const t=T[taal];
  const delen=['Testpraktijk',t.veilig,t.doel+': Sterker worden'];
  lijst.forEach((e,i)=>{
    if(!gelezen.includes(e))return;
    let zin=t.oefening+' '+(i+1)+': '+e.naam+'. '+String(i+2)+' '+t.series+', 10 '+t.herh;
    if(e===A)zin+='. '+(MARKER+A.uitleg).replace(/[.\s]+$/,'');
    delen.push(zin);
  });
  return delen.map(x=>String(x).replace(/[.\s]+$/,'')).join('. ')+'.';
}
const fill=(s,n)=>s.replace('{n}',n);

// ---- 1. niets tegengehouden: precies de bestaande voorlezing (ook de vertaalde uitleg) ----
{
  const r=context('en');await r.laad();kaart(r,[A,B]);
  tik(r);
  assert.equal(spreek(r).length,1);
  assert.equal(spreek(r)[0].text,verwacht('en',[A,B],[A,B]),'ongewijzigde voorlezing zonder houds');
  assert.equal(spreek(r)[0].lang,'en-GB');assert.equal(spreek(r)[0].rate,0.95);
  assert.deepEqual(meldingen(r),[],'geen melding als niets is overgeslagen');
  assert.ok(spreek(r)[0].text.includes(MARKER),'een echte vertaling van de uitleg wordt nog steeds voorgelezen');
}

// ---- 2. gemengde selectie: tegengehouden overgeslagen en genoemd, de rest ongewijzigd ----
{
  const lijst=[A,DIPS,SWING,ROTATOR,B];
  const r=context('en');await r.laad();kaart(r,lijst);
  const celVoor=JSON.stringify(r.ctx.K.kaart.cells);
  tik(r);
  assert.equal(spreek(r).length,1,'er wordt voorgelezen');
  const tekst=spreek(r)[0].text;
  assert.equal(tekst,verwacht('en',lijst,[A,B]),'alleen de vrije oefeningen, met hun kaartnummer (1 en 5)');
  for(const e of [DIPS,SWING,ROTATOR])assert.ok(!tekst.includes(e.naam),e.naam+' niet voorgelezen');
  const m=meldingen(r);
  assert.equal(m.length,1,'één melding');
  assert.equal(m[0],[fill(T.en.leesUitlegCheck,'Med ball swing, Rotator (apparaat)'),fill(T.en.leesBeeldCheck,'Biceps curl'),T.en.leesDosering].join('\n\n'));
  assert.doesNotMatch(m[0],/record|opname|wrong|incorrect|clinic/i,'geen bewering over opnames, geen oordeel over de tekst');
  assert.deepEqual(r.log.map(x=>x.type),['cancel','speak','alert'],'eerst spreken (binnen de tik), dan melden');
  assert.equal(r.ctx.bezigLezen,true);assert.equal(r.knop('leesBtn').attrs['aria-pressed'],'true');
  assert.equal(JSON.stringify(r.ctx.K.kaart.cells),celVoor,'dosering op de kaart onaangeroerd');
  // beurtbewaking blijft: stoppen, opnieuw starten, laat einde van de oude breekt de nieuwe niet af
  const eerste=spreek(r)[0].u;
  tik(r);assert.equal(r.ctx.bezigLezen,false,'tweede tik stopt');
  tik(r);const tweede=spreek(r).at(-1).u;assert.notEqual(tweede,eerste);assert.equal(r.ctx.bezigLezen,true);
  eerste.onend();assert.equal(r.ctx.bezigLezen,true,'laat einde van de gestopte voorlezing breekt de nieuwe niet af');
  tweede.onerror();assert.equal(r.ctx.bezigLezen,false);assert.equal(r.knop('leesBtn').attrs['aria-pressed'],'false');
}

// ---- 3. alles tegengehouden: niet beginnen, knop blijft op voorlezen, eerlijke melding ----
{
  const r=context('en');await r.laad();kaart(r,[DIPS,SWING]);
  tik(r);
  assert.deepEqual(spreek(r),[],'niets uitgesproken');
  assert.ok(!r.log.some(x=>x.type==='cancel'),'een eventuele andere spraak wordt niet afgebroken');
  assert.equal(r.ctx.bezigLezen,false);assert.notEqual(r.knop('leesBtn').attrs['aria-pressed'],'true');
  assert.deepEqual(meldingen(r),[[fill(T.en.leesUitlegCheck,'Med ball swing'),fill(T.en.leesBeeldCheck,'Biceps curl'),T.en.leesNiets,T.en.leesDosering].join('\n\n')]);
  tik(r);assert.equal(meldingen(r).length,2,'een volgende tik meldt opnieuw in plaats van te "stoppen"');assert.deepEqual(spreek(r),[]);
}

// ---- 4. elke taal meldt in haar eigen woorden ----
for(const k of ['leesUitlegCheck','leesBeeldCheck','leesNiets','leesDosering','leesGeenControle']){
  for(const taal of ['nl',...TALEN])assert.ok(typeof T[taal][k]==='string'&&T[taal][k].length>10,taal+'.'+k);
}
for(const taal of TALEN){
  assert.ok(T[taal].leesUitlegCheck.includes('{n}')&&T[taal].leesBeeldCheck.includes('{n}'),taal);
  const r=context(taal);await r.laad();kaart(r,[ROTATOR,DIPS]);
  tik(r);
  assert.deepEqual(spreek(r),[],taal);
  assert.deepEqual(meldingen(r),[[fill(T[taal].leesUitlegCheck,'Rotator (apparaat)'),fill(T[taal].leesBeeldCheck,'Biceps curl'),T[taal].leesNiets,T[taal].leesDosering].join('\n\n')],taal);
  assert.notEqual(T[taal].leesNiets,T.nl.leesNiets,taal+': niet terugvallen op het Nederlands');
}

// ---- 5. controle niet te laden: niets voorlezen, dat ook zeggen ----
{
  const r=context('de',{reviewOk:false});await r.laad();
  assert.equal(r.ctx.mediaReviewReady,false);
  kaart(r,[A,B]);
  tik(r);
  assert.deepEqual(spreek(r),[],'zonder controle geen voorlezing, ook niet van naam en dosering');
  assert.deepEqual(meldingen(r),[T.de.leesGeenControle]);
  assert.equal(r.ctx.bezigLezen,false);
}

// ---- 6. regel per oefening gelijk aan de kaartknoppen en het Nederlandse voorlezen ----
{
  const r=context('en');await r.laad();
  let gelezen=0,overgeslagen=0;const wegIds=new Set();
  for(const entry of review.entries){
    const e=lib.find(x=>x.exerciseId===entry.exerciseId);assert.ok(e,entry.name);
    r.ctx.K={lib,kaart:{chosen:keuze(e),cells:{},client:{}},praktijk:{}};
    r.log.length=0;
    tik(r);
    const o=vm.runInContext('vindOefening',r.ctx)({n:e.naam,id:e.exerciseId});
    const kaartKnopWeg=r.ctx.mediaWithheld(o)||r.ctx.explanationWithheld(o); // zelfde als hideMedia||holdExplanation
    const item=r.ctx.noorItem(o,{n:e.naam,id:e.exerciseId});
    const nederlandsWeg=r.ctx.uitlegGehouden(item)||item.beeldGehouden;   // zelfde als speelNoor
    const weg=spreek(r).length===0;
    assert.equal(weg,kaartKnopWeg,e.naam+': zelfde uitkomst als de knoppen per oefening');
    assert.equal(weg,nederlandsWeg,e.naam+': zelfde uitkomst als het Nederlandse voorlezen');
    if(weg){overgeslagen++;wegIds.add(e.exerciseId);}else gelezen++;
    if(r.ctx.bezigLezen)vm.runInContext('stopLezen()',r.ctx);
  }
  assert.equal(gelezen+overgeslagen,review.entries.length); // 319 V1-beelden + nieuwe lijntekeningen
  // Back extension en Rug extensie: hold opgeheven op 2026-11-09 (tekening, avatar en uitleg volgen Physitrack)
  for(const id of ['fp_a0a18c0c13673d38','fp_7b07f346644f9c17'])assert.equal(wegIds.has(id),uitlegWeg.has(id),id+': alleen nog overgeslagen bij een houd op de uitleg');
  console.log(`Voorlezen in andere talen: per oefening dezelfde regel als de kaartknoppen en het Nederlands (${gelezen} voorgelezen, ${overgeslagen} overgeslagen van ${review.entries.length}); gemengd, alles tegengehouden, 8 talen en controle niet te laden getest; zonder houds exact de bestaande voorlezing.`);
}
