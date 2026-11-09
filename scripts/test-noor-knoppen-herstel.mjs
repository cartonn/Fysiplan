// Luisterknoppen per oefening na een mislukt of verlopen eerste laden van het Noor-manifest.
//
// Vroeger tekende de kaart de knoppen "Luister naar Noor" alleen opnieuw vanuit het eerste
// laden bij het opstarten. Mislukte dat (slecht bereik, time-out), dan bleef bij elke oefening
// "nog niet beschikbaar" staan, ook nadat een nieuwe poging via de knop bovenaan wél lukte en
// gewoon afspeelde. Deze test draait de echte kaartcode (tekenKaart, speelNoor, leesVoor,
// herstelNoorKnoppen en de opstartregel uit kaart.html) samen met de echte noor-audio.js,
// het echte manifest en de echte beoordelingsbestanden in een VM.
//
// Gecontroleerd: mislukken en verlopen gevolgd door een geslaagde poging; stoppen tijdens de
// nieuwe poging; een te laat antwoord van een oude poging; tegengehouden beeld en uitleg
// krijgen nooit een knop; geen dubbele knoppen of extra klikafhandeling; een open video en
// een lopende opname worden niet onderbroken.
// Wat dit NIET is: een browsertest. De #oefs-DOM is hier een tekst met precies de operaties
// die herstelNoorKnoppen gebruikt (querySelectorAll en outerHTML).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exerciseId} from '../lib/exercise-id.js';

const lees=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const html=fs.readFileSync('public/kaart.html','utf8');
const noorBron=fs.readFileSync('public/noor-audio.js','utf8');
const tussen=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i+a.length);assert.ok(j>i,b);return html.slice(i,j);};
const manifest=lees('public/audio/noor/manifest.json');
const v2=lees('public/oefeningen-v2.json');
// Testgeval: sinds 2026-11-09 heeft geen echte tegengehouden bron nog een opname (hold op Dips opgeheven).
// We houden in deze test Biceps curl tegen, precies zoals de beoordeling een hold vastlegt.
const REVIEW=lees('public/mobile-media-review.json');
for(const r of REVIEW.entries)if(r.name==='Biceps curl'){r.status='rejected';r.presentation='withhold';}
// zoals de server ze levert
const lib=v2.map(e=>({...e,exerciseId:exerciseId(e),img:'/v2/'+e.img,kaartImg:'/v2/'+e.kaartImg}));
const heeftOpname=e=>manifest.clips.some(c=>c.name===e.naam&&c.text===e.naam+'. '+e.uitleg);
const rust=async()=>{for(let i=0;i<40;i++)await new Promise(r=>setImmediate(r));};

// De opstartregel zoals hij in kaart.html staat; die draaien we letterlijk.
const startRegels=html.split('\n').filter(r=>r.includes('NoorAudio.load().then('));
assert.equal(startRegels.length,1,'precies één plek laadt het manifest bij het opstarten');
const START=startRegels[0].trim();
assert.ok(START.includes('herstelNoorKnoppen()'),'het opstarten gebruikt dezelfde herstelweg als een latere poging');
assert.ok(!START.includes('tekenKaart'),'het opstarten hertekent niet meer de hele kaart (dat brak een open video af)');

const KAART_CODE=
  tussen('  function esc(s){','  var id=')+
  tussen('  var mediaReviewReady=false,','  function tr(k){')+
  tussen('  function vt(s){','  function dagStr(t)')+
  tussen('  function tekenKaart(){','  // ---- Hoe ging het vandaag')+
  tussen('  var bezigLezen=false,noorRequest=0;','  // ---- als app');

// #oefs als tekst, met alleen wat herstelNoorKnoppen echt gebruikt. Een element dat niet
// meer (eenduidig) in de lijst staat kan niet vervangen worden, net als in een browser.
const WACHT=/<div class="vmeta" data-noor-wacht="(\d+)">[^<]*<\/div>/g;
function maakOefs(){
  const oefs={html:'',luisteraars:0,
    get innerHTML(){return this.html;},set innerHTML(v){this.html=String(v);},
    addEventListener(){this.luisteraars++;},
    querySelectorAll(sel){
      assert.equal(sel,'[data-noor-wacht]');
      return [...this.html.matchAll(WACHT)].map(([stuk,idx])=>({dataset:{noorWacht:idx},set outerHTML(nieuw){
        const i=oefs.html.indexOf(stuk);
        if(i<0||oefs.html.indexOf(stuk,i+1)>=0)throw Error('regel staat niet (eenduidig) meer in #oefs');
        oefs.html=oefs.html.slice(0,i)+nieuw+oefs.html.slice(i+stuk.length);
      }}));
    }};
  return oefs;
}

function maakKaart(chosen,{abort=false}={}){
  // ---- de echte noor-audio.js met eigen klok, afspeler en manifestaanvragen ----
  const n={timers:[],volgende:1,aanvragen:[],spelers:[]};
  class Audio{constructor(){n.spelers.push(this);this.currentTime=0;this.paused=false;}
    play(){this.gestart=true;return Promise.resolve();}pause(){this.paused=true;}load(){}removeAttribute(){this.src='';}}
  class AC{constructor(){this.signal={aborted:false};}abort(){this.signal.aborted=true;}}
  const venster={};
  vm.runInNewContext(noorBron,{window:venster,Audio,
    setTimeout:(fn,ms)=>{const id=n.volgende++;n.timers.push({id,fn,ms});return id;},
    clearTimeout:id=>{n.timers=n.timers.filter(t=>t.id!==id);},
    fetch:url=>{assert.equal(url,'/audio/noor/manifest.json');return new Promise((ok,nee)=>n.aanvragen.push({ok,nee}));},
    ...(abort?{AbortController:AC}:{})});
  n.N=venster.NoorAudio;
  // alleen de grens van het manifest laten verlopen, nooit de wachttijd van een opname
  n.verloop=()=>{const nu=n.timers.filter(t=>t.ms===10000);n.timers=n.timers.filter(t=>t.ms!==10000);nu.forEach(t=>t.fn());};
  n.lever=i=>n.aanvragen[i].ok({ok:true,json:async()=>manifest});
  n.weiger=i=>n.aanvragen[i].ok({ok:false,json:async()=>({})});

  // ---- de kaart ----
  const oefs=maakOefs(),el=new Map(),meldingen=[];
  const knop=id=>{
    if(id==='oefs')return oefs;
    if(!el.has(id))el.set(id,{id,textContent:'',innerHTML:'',hidden:false,style:{},attrs:{},klassen:new Set(),
      classList:{add(k){el.get(id).klassen.add(k);},remove(k){el.get(id).klassen.delete(k);},contains(k){return el.get(id).klassen.has(k);}},
      setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}});
    return el.get(id);
  };
  const document={title:'',getElementById:knop,querySelectorAll(sel){
    if(sel==='#oefs [data-noor-wacht]')return oefs.querySelectorAll('[data-noor-wacht]');
    if(['#oefs .fotoknop img','.vhouder video','.vhouder.open','.vbtn[aria-expanded="true"]'].includes(sel))return [];
    throw Error('onverwachte selector: '+sel);
  }};
  const ctx=vm.createContext({document,window:{NoorAudio:n.N},NoorAudio:n.N,K:null,TAAL:'nl',VERT:{},
    tr:k=>k==='stop'?'Stop':k,alert:m=>meldingen.push(String(m)),demoGeluidKnop(){},tekenMeting(){},
    DRIEHOEK:'',VIDEO_META:{},VIDEO_META_CONCEPT:{},
    fetch:async url=>{
      if(url==='/mobile-media-review.json')return {ok:true,json:async()=>JSON.parse(JSON.stringify(REVIEW))};
      if(url==='/mobile-narration-review.json')return {ok:true,json:async()=>lees('public/mobile-narration-review.json')};
      throw Error('onverwachte aanvraag vanuit de kaart: '+url);
    }});
  vm.runInContext(KAART_CODE,ctx);
  return {n,ctx,oefs,knop,meldingen,
    async start(){
      await vm.runInContext('loadMobileReview()',ctx);
      ctx.K={lib,kaart:{chosen,cells:{},vids:{}},praktijk:{praktijk:'Testpraktijk'}};
      vm.runInContext(START,ctx);
      vm.runInContext('tekenKaart()',ctx);
    },
    tikBovenaan(){vm.runInContext('leesVoor()',ctx);},
    // wat de klikafhandeling op #oefs doet bij [data-noor] (bindEens)
    tikOefening(idx){vm.runInContext('speelNoor([noorItem(vindOefening(K.kaart.chosen['+idx+']),K.kaart.chosen['+idx+'])])',ctx);},
    stand(){return knop('leesBtn').attrs['aria-pressed'];}
  };
}

const knoppenIn=s=>[...s.matchAll(/data-noor="(\d+)"/g)].map(m=>Number(m[1]));
const wachtIn=s=>[...s.matchAll(/data-noor-wacht="(\d+)"/g)].map(m=>Number(m[1]));
// alles behalve de luisterregels zelf: moet na herstel byte voor byte gelijk zijn
const zonderLuisterregels=s=>s
  .replace(/<button type="button" class="vbtn" data-noor="\d+">Luister naar Noor<\/button><div class="vmeta">De stem legt[^<]*<\/div>/g,'#NOOR#')
  .replace(WACHT,'#NOOR#');

// ---- de oefeningen: uit de echte bibliotheek, met de echte beoordeling ----
const probe=maakKaart([]);await probe.start();
const zichtbaar=o=>!probe.ctx.mediaWithheld(o)&&!probe.ctx.explanationWithheld(o);
const metOpname=lib.filter(e=>heeftOpname(e)&&zichtbaar(e));
assert.ok(metOpname.length>=3,'minstens drie zichtbare oefeningen met een actuele opname');
const [A,B,E]=metOpname;
const zoek=naam=>{const e=lib.find(x=>x.naam===naam);assert.ok(e,naam);return e;};
const dips=zoek('Biceps curl'),gehouden=zoek('Yoga ear pressure'),zonder=zoek('Standing chair hip extension');
assert.ok(heeftOpname(dips)&&probe.ctx.mediaWithheld(dips),'testgeval: Biceps curl heeft een opname maar een (test)tegengehouden beeld');
assert.ok(probe.ctx.explanationWithheld(gehouden)&&!probe.ctx.mediaWithheld(gehouden),'testgeval: uitleg van Yoga ear pressure wordt gecontroleerd');
assert.ok(!heeftOpname(zonder)&&zichtbaar(zonder)&&zonder.uitleg,'testgeval: zichtbare oefening zonder actuele opname');
// E heeft een opname maar krijgt in de test een houd op de uitleg: het lastigste geval
const kies=e=>({n:e.naam,id:e.exerciseId});
const KEUZE=[kies(A),kies(dips),kies(B),kies(gehouden),kies(E),kies(zonder)];
const IA=0,IDIPS=1,IB=2,IGEH=3,IE=4,IZONDER=5;
const metHoudOpE=async kaart=>{await kaart.start();kaart.ctx.explanationHolds.push({exerciseId:E.exerciseId,name:E.naam,status:'hold'});vm.runInContext('tekenKaart()',kaart.ctx);};
const clip=e=>manifest.clips.find(c=>c.name===e.naam&&c.text===e.naam+'. '+e.uitleg).src;

// Referentie: zo tekent de kaart als het manifest er al is bij het tekenen
const ref=maakKaart(KEUZE);ref.n.lever(0);await rust();await metHoudOpE(ref);await rust();
assert.deepEqual(knoppenIn(ref.oefs.html),[IA,IB],'referentie: alleen zichtbare oefeningen met een opname en vrije uitleg');
assert.deepEqual(wachtIn(ref.oefs.html),[IZONDER],'referentie: zonder opname blijft de regel "nog niet beschikbaar"');
const REF=ref.oefs.html;

function controleerHersteld(kaart,voor,wat){
  const na=kaart.oefs.html;
  assert.deepEqual(knoppenIn(na),[IA,IB],wat+': precies één knop voor elke zichtbare oefening met opname');
  assert.deepEqual(wachtIn(na),[IZONDER],wat+': zonder actuele opname blijft "nog niet beschikbaar" staan');
  for(const i of [IDIPS,IGEH,IE]){
    assert.ok(!na.includes('data-noor="'+i+'"')&&!na.includes('data-noor-wacht="'+i+'"'),wat+': tegengehouden oefening '+i+' krijgt geen luisterregel');
  }
  assert.ok(na.includes('De oefenafbeelding wordt gecontroleerd'),wat+': melding bij tegengehouden beeld blijft');
  assert.equal(na.split('De algemene uitleg wordt gecontroleerd').length-1,2,wat+': melding bij beide tegengehouden uitleggen blijft');
  assert.equal(zonderLuisterregels(na),zonderLuisterregels(voor),wat+': de rest van de kaart is onaangeroerd');
  assert.equal(kaart.oefs.luisteraars,0,wat+': er komt geen klikafhandeling bij');
}

// ---- 1. eerste laden verloopt, nieuwe poging via de knop bovenaan lukt ----
for(const [soort,faal] of [['verlopen',k=>k.n.verloop()],['mislukt',k=>k.n.weiger(0)]]){
  const k=maakKaart(KEUZE);await metHoudOpE(k);
  assert.deepEqual(knoppenIn(k.oefs.html),[],soort+': zonder manifest nog geen knoppen');
  assert.deepEqual(wachtIn(k.oefs.html),[IA,IB,IZONDER],soort+': wachtende regels alleen bij zichtbare oefeningen');
  faal(k);await rust();
  assert.deepEqual(knoppenIn(k.oefs.html),[],soort+': na het mislukken nog steeds geen knoppen');
  assert.equal(k.meldingen.length,0,soort+': het stille opstarten meldt niets');
  const voor=k.oefs.html;
  k.tikBovenaan();await rust();
  assert.equal(k.n.aanvragen.length,2,soort+': de knop bovenaan probeert opnieuw');
  assert.equal(k.stand(),'true',soort+': tijdens het laden staat de knop op Stop');
  k.n.lever(1);await rust();
  controleerHersteld(k,voor,soort);
  assert.equal(k.oefs.html,REF,soort+': hersteld is precies gelijk aan direct goed getekend');
  assert.equal(k.n.spelers.length,1,soort+': de knop bovenaan speelt gewoon af');
  const speler=k.n.spelers[0];
  assert.ok(speler.gestart&&!speler.paused&&speler.src===clip(A),soort+': de eerste beschikbare opname loopt');
  assert.equal(k.meldingen.length,1,soort+': één melding over wat is overgeslagen');
  assert.match(k.meldingen[0],/Uitleg wordt gecontroleerd: .*Yoga ear pressure/);
  assert.match(k.meldingen[0],new RegExp('Niet voorgelezen, omdat de oefenafbeelding nog wordt gecontroleerd: Biceps curl'));
  // nog een keer herstellen, en de opstartregel nog eens: niets dubbel, niets onderbroken
  vm.runInContext('herstelNoorKnoppen();herstelNoorKnoppen();',k.ctx);vm.runInContext(START,k.ctx);await rust();
  assert.equal(k.oefs.html,REF,soort+': opnieuw herstellen verandert niets');
  assert.ok(!speler.paused&&speler.onended,soort+': herstellen onderbreekt de lopende opname niet');
  assert.equal(k.stand(),'true');
  // de herstelde knop werkt via de bestaande klikregel
  k.tikOefening(IB);await rust();
  assert.equal(k.n.spelers.length,2);assert.equal(k.n.spelers[1].src,clip(B),soort+': de herstelde knop speelt de eigen oefening');
  assert.ok(speler.paused,'de vorige opname stopt pas bij een nieuwe tik, zoals altijd');
}

// ---- 2. stoppen tijdens de nieuwe poging ----
{
  const k=maakKaart(KEUZE);await metHoudOpE(k);
  k.n.verloop();await rust();
  k.tikBovenaan();await rust();assert.equal(k.stand(),'true');
  k.tikBovenaan();assert.equal(k.stand(),'false','tweede tik stopt meteen');
  assert.equal(k.knop('leesTxt').textContent,'Luister naar uitleg');
  // de patiënt opent intussen een video (de videoklik roept stopLezen aan)
  const VIDEO='<div class="vhouder open"><video controls autoplay playsinline src="/praktijk/eigen.mp4"></video></div>';
  k.oefs.html=k.oefs.html.replace('<div class="vhouder"></div>',VIDEO);
  vm.runInContext('stopLezen()',k.ctx);
  const voor=k.oefs.html;
  k.n.lever(1);await rust();
  assert.equal(k.n.spelers.length,0,'na stop start een later manifest geen geluid');
  assert.equal(k.meldingen.length,0,'en geen melding achteraf');
  assert.equal(k.stand(),'false','de knop bovenaan blijft op luisteren');
  controleerHersteld(k,voor,'stop tijdens poging');
  assert.ok(k.oefs.html.includes(VIDEO),'de open video blijft staan en speelt door');
}
// stoppen, en de poging verloopt daarna alsnog: niets gemeld, regels blijven, later lukt het
{
  const k=maakKaart(KEUZE);await metHoudOpE(k);
  k.n.weiger(0);await rust();
  k.tikBovenaan();await rust();k.tikBovenaan();
  k.n.verloop();await rust();
  assert.equal(k.meldingen.length,0,'een gestopte poging die verloopt meldt zich niet');
  assert.deepEqual(wachtIn(k.oefs.html),[IA,IB,IZONDER]);assert.deepEqual(knoppenIn(k.oefs.html),[]);
  const voor=k.oefs.html;
  k.tikBovenaan();await rust();assert.equal(k.n.aanvragen.length,3);
  k.n.lever(2);await rust();
  controleerHersteld(k,voor,'derde poging');
  assert.equal(k.n.spelers.length,1);assert.equal(k.stand(),'true');
}

// ---- 3. een te laat antwoord van de verlopen eerste poging telt niet ----
for(const abort of [false,true]){
  const k=maakKaart(KEUZE,{abort});await metHoudOpE(k);
  k.n.verloop();await rust();
  k.tikBovenaan();await rust();
  k.n.lever(0);await rust();
  assert.deepEqual(knoppenIn(k.oefs.html),[],'te laat antwoord (abort='+abort+'): geen knoppen');
  assert.equal(k.n.spelers.length,0,'te laat antwoord: geen geluid');
  assert.equal(k.stand(),'true','de lopende poging wacht nog');
  k.n.lever(1);await rust();
  assert.equal(k.oefs.html,REF,'de lopende poging herstelt de knoppen');
  assert.equal(k.n.spelers.length,1);
}

// ---- 4. eerste laden loopt nog als de patiënt bovenaan tikt: één poging, twee wachtenden ----
{
  const k=maakKaart(KEUZE);await metHoudOpE(k);
  k.tikBovenaan();await rust();
  assert.equal(k.n.aanvragen.length,1,'geen tweede aanvraag zolang de eerste loopt');
  k.n.lever(0);await rust();
  assert.equal(k.oefs.html,REF,'opstartregel en knop bovenaan herstellen samen precies één keer');
  assert.equal(k.n.spelers.length,1);assert.ok(!k.n.spelers[0].paused);
}

// ---- 5. tegengehouden na het tekenen: herstellen kijkt opnieuw, nooit alleen naar de wachtregel ----
{
  const k=maakKaart(KEUZE);await metHoudOpE(k);
  k.n.verloop();await rust();
  // B: uitleg alsnog tegengehouden (op stabiel id, onder een andere naam); A: beeld alsnog tegengehouden
  k.ctx.explanationHolds.push({exerciseId:B.exerciseId,name:'Oude naam',status:'hold'});
  k.ctx.blockedMedia[k.ctx.mediaKey(A)]={sha:''};
  const geladen=k.n.N.load();k.n.lever(1);await geladen;await rust();
  assert.ok(k.n.N.match(A.naam,A.uitleg),'het manifest is er nu wel');
  vm.runInContext('herstelNoorKnoppen()',k.ctx);
  assert.deepEqual(knoppenIn(k.oefs.html),[],'een houd na het tekenen voorkomt elke knop');
  assert.deepEqual(wachtIn(k.oefs.html),[IA,IB,IZONDER],'de wachtregels blijven gewoon staan');
  // beoordeling niet geladen: nooit een knop
  const k2=maakKaart(KEUZE);await metHoudOpE(k2);k2.n.verloop();await rust();
  k2.ctx.mediaReviewReady=false;
  k2.n.N.load().catch(()=>{});k2.n.lever(1);await rust();
  vm.runInContext('herstelNoorKnoppen()',k2.ctx);
  assert.deepEqual(knoppenIn(k2.oefs.html),[],'zonder geladen beoordeling geen knoppen');
  // andere taal: geen Nederlandse opname-knoppen
  const k3=maakKaart(KEUZE);await metHoudOpE(k3);k3.n.verloop();await rust();
  k3.ctx.TAAL='en';k3.n.N.load().catch(()=>{});k3.n.lever(1);await rust();
  vm.runInContext('herstelNoorKnoppen()',k3.ctx);
  assert.deepEqual(knoppenIn(k3.oefs.html),[],'in een andere taal geen Noor-knoppen');
}

// ---- 6. geen dubbele knoppen in de kaartcode zelf ----
assert.equal(html.split('data-noor="\'+idx+\'"').length-1,1,'de Noor-knop staat op één plek in de code (noorRegel)');
assert.ok(!tussen('  function herstelNoorKnoppen(){','  // ---- als app').includes('addEventListener'),'herstellen koppelt geen eigen afhandeling');
assert.equal(html.split("var noor=e.target.closest('[data-noor]');").length-1,1,'één klikafhandeling voor alle Noor-knoppen');

console.log('Noor-knoppen herstel: na verlopen en mislukt eerste laden herstelt een geslaagde poging bovenaan de knoppen per oefening (gelijk aan direct goed getekend), stop tijdens poging speelt niets en meldt niets, te laat antwoord telt niet, tegengehouden beeld/uitleg nooit een knop, geen dubbele knoppen of afhandeling, open video en lopende opname onaangeroerd.');
