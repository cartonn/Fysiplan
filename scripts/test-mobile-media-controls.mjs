import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
const html=fs.readFileSync(new URL('../public/kaart.html',import.meta.url),'utf8');
for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{textContent:'',attrs:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v;}});return elements.get(id);}
let paused=0,removed=0,audioStopped=0,played=0;
const holder={classList:{remove(){removed++;}},innerHTML:'iframe'};
const document={getElementById:el,querySelectorAll(selector){
  if(selector==='.vhouder video')return [{pause(){paused++;}}];
  if(selector==='.vhouder.open')return [holder];
  if(selector==='.vbtn[aria-expanded="true"]')return [el('videoButton')];
  return [];
}};
let lastPlaylist=[],events=[];
const context=vm.createContext({document,window:{NoorAudio:{}},NoorAudio:{stop(){audioStopped++;},load:async()=>{},match:(name)=>name!=='Missing',play(items){played++;lastPlaylist=items;events.push('play');}},noorRequest:0,noorBron:-1,mediaReviewReady:true,explanationHolds:[],TAAL:'nl',tr:x=>x,alert(){throw Error('Unexpected alert');},demo:{info:{}},bronGecontroleerd:{},URL,location:{href:'https://praktijk.example/k/abc'},Math,Number});
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
vm.runInContext(between('  function geldigeUitsnede(','  async function loadMobileReview(')+
  between('  function stopLezen(){','  function leesVoor(){')+
  between('  async function speelNoor(','  // ---- als app')+
  between('  function demoHoudingen(','  var DEMO_MAAT='),context);
await vm.runInContext('speelNoor([{name:"Actuele naam",text:"Uitleg"}])',context);
assert.equal(paused,1);assert.equal(removed,1);assert.equal(holder.innerHTML,'');assert.equal(audioStopped,1);assert.equal(played,1);
assert.equal(el('lbgeluid').attrs['aria-pressed'],'true');
assert.equal(el('leesBtn').attrs['aria-pressed'],'true','de voorleesknop meldt zijn stand ook aan een schermlezer');
vm.runInContext('stopLezen()',context);assert.equal(el('lbgeluid').attrs['aria-pressed'],'false');
assert.equal(el('leesBtn').attrs['aria-pressed'],'false');

// ---- houdingen: alleen een beoordeelde uitsnede bij exact dit bestand ----
// Zoals de kaart het echt krijgt: het v2-kanaal levert /v2/images/..., de beoordeling
// noemt images/... . Een eerdere versie van deze test gebruikte /images/ en zag daardoor
// niet dat de houdingen in een echte browser nooit verschenen.
const foto={src:'https://praktijk.example/v2/images/avatar.jpg',naturalWidth:800,naturalHeight:1200};
const SLEUTEL='/v2/images/avatar.jpg|'+'a'.repeat(64);
const goedeMeta=()=>({source:'images/avatar.jpg',assetSha256:'a'.repeat(64),axis:'x',width:800,height:1200,
  poses:[{label:'start',crop:{x:10,y:10,w:300,h:1000}},{label:'end',crop:{x:420,y:10,w:300,h:1000}}]});
assert.equal(context.demoHoudingen(foto),null,'zonder beoordeelde uitsnede geen houdingen');
context.demo.info.poseMetadata=goedeMeta();
assert.equal(context.demoHoudingen(foto),null,'zonder bewezen bronbestand geen houdingen');
context.bronGecontroleerd[SLEUTEL]=false;
assert.equal(context.demoHoudingen(foto),null,'een afwijkende bron zet de uitsnede buiten werking');
context.bronGecontroleerd['a'.repeat(64)]=true;
assert.equal(context.demoHoudingen(foto),null,'een controle zonder pad telt niet');
context.bronGecontroleerd[SLEUTEL]=true;
assert.ok(context.demoHoudingen(foto),'beoordeelde uitsnede bij bewezen bron werkt, via het v2-pad');
assert.equal(context.demoHoudingen({src:'https://praktijk.example/images/avatar.jpg',naturalWidth:800,naturalHeight:1200}),null,
  'de controle hoort bij het getoonde pad; een ander pad naar hetzelfde bestand is nog niet gecontroleerd');
context.bronGecontroleerd['/images/avatar.jpg|'+'a'.repeat(64)]=true;
assert.ok(context.demoHoudingen({src:'https://praktijk.example/images/avatar.jpg',naturalWidth:800,naturalHeight:1200}),'ook het pad zonder v2 werkt na controle');
assert.equal(context.demoHoudingen({src:'https://praktijk.example/v2/v2/images/avatar.jpg',naturalWidth:800,naturalHeight:1200}),null,'geen losse prefixen wegstrepen');
assert.equal(context.demoHoudingen({src:'https://praktijk.example/v2/images/anders.jpg',naturalWidth:800,naturalHeight:1200}),null,'uitsnede is bronspecifiek');
assert.equal(context.demoHoudingen({src:foto.src,naturalWidth:1024,naturalHeight:1200}),null,'afmetingen moeten kloppen');
context.demo.info.poseMetadata=goedeMeta();context.demo.info.poseMetadata.poses[1].crop.x=100;
assert.equal(context.demoHoudingen(foto),null,'overlappende uitsnedes zijn nooit twee houdingen');
context.demo.info.poseMetadata=goedeMeta();context.demo.info.poseMetadata.poses[0].crop.w=0;
assert.equal(context.demoHoudingen(foto),null,'lege uitsnede telt niet');
context.demo.info.poseMetadata=null;

// bevestigBron haalt precies de getoonde URL op en weigert een ander bestand meteen
{
  const opgehaald=[];
  const bytes=new TextEncoder().encode('bronbytes');
  const sha=createHash('sha256').update(bytes).digest('hex');
  let inhoud=bytes;
  const bron=vm.createContext({crypto:webcrypto,window:{crypto:webcrypto},URL,location:{href:'https://praktijk.example/k/abc'},bronGecontroleerd:{},
    fetch:async url=>{opgehaald.push(url);return {ok:true,arrayBuffer:async()=>inhoud.buffer};}});
  vm.runInContext(between('  function bronPad(src){','  var DEMO_MAAT='),bron);
  const meta={source:'images/avatar.jpg',assetSha256:sha};
  const URL_V2='https://praktijk.example/v2/images/avatar.jpg',KEY='/v2/images/avatar.jpg|'+sha;
  assert.equal(await bron.bevestigBron(meta,URL_V2),true);
  assert.deepEqual(opgehaald,['/v2/images/avatar.jpg'],'de getoonde URL wordt gecontroleerd, niet een ander pad');
  assert.equal(bron.bronGecontroleerd[KEY],true);
  // Een eerdere 'true' wordt niet hergebruikt: elke aanroep hoort bij een nieuwe lading.
  // Zonder reset: zelfde pad, andere bytes, dan geen houdingen meer (audit 2026-11-03).
  inhoud=new TextEncoder().encode('andere-bytes-zelfde-pad');
  assert.equal(await bron.bevestigBron(meta,URL_V2),false,'een nieuwe lading met andere bytes wordt niet op de oude uitkomst goedgekeurd');
  assert.equal(opgehaald.length,2,'opnieuw opgehaald, niet onthouden');
  assert.equal(bron.bronGecontroleerd[KEY],false,'de gedeelde uitkomst volgt de nieuwste controle');
  inhoud=bytes;
  assert.equal(await bron.bevestigBron(meta,URL_V2),true,'de beoordeelde bytes terug: weer goed');
  assert.equal(opgehaald.length,3);
  assert.equal(await bron.bevestigBron(meta,'https://praktijk.example/v2/images/ander.jpg'),false,'een ander bestand wordt zonder ophalen geweigerd');
  assert.equal(opgehaald.length,3);
  assert.equal(await bron.bevestigBron({source:'images/avatar.jpg',assetSha256:'0'.repeat(64)},URL_V2),false,'afwijkende bytes: geen houdingen');
  // en demoHoudingen leest die nieuwste uitkomst: na een controle met andere bytes geen houdingen
  bron.demo={info:{poseMetadata:{source:'images/avatar.jpg',assetSha256:sha,axis:'x',width:800,height:1200,
    poses:[{label:'start',crop:{x:10,y:10,w:300,h:1000}},{label:'end',crop:{x:420,y:10,w:300,h:1000}}]}}};
  vm.runInContext(between('  function geldigeUitsnede(','  async function loadMobileReview(')+between('  function demoHoudingen(','  function bronPad('),bron);
  const lb={src:URL_V2,naturalWidth:800,naturalHeight:1200};
  assert.ok(bron.demoHoudingen(lb),'beoordeelde bytes: houdingen');
  inhoud=new TextEncoder().encode('weer-andere-bytes');
  assert.equal(await bron.bevestigBron(meta,URL_V2),false);
  assert.equal(bron.demoHoudingen(lb),null,'na een nieuwere controle met andere bytes geen houdingen meer, ook zonder reset');
}

assert.ok(html.includes('data-audio-naam="'));assert.ok(html.includes("name:foto.dataset.audioNaam||''"));
assert.ok(html.includes("name:(demo.info||{}).name||''"));
assert.ok(html.includes("var open=houder.classList.contains('open');\n      stopLezen();"),'video stops narration before opening');
assert.ok(html.includes("geluid.hidden=TAAL!=='nl'||!window.NoorAudio||!NoorAudio.match(demo.info.name,demo.info.uitleg)"),'static lightbox has available narration control');
assert.ok(html.includes("if(TAAL==='nl')geluidKnop.hidden=!window.NoorAudio||!NoorAudio.match(d.name||'',d.uitleg||'');"),'de demonstratie zet de geluidknop niet onterecht aan');
assert.ok(html.includes("stopLezen();stopVideos();demoStop();"),'achtergrond: ook de demonstratie stopt');

// ---- beoordelingsbestanden: blokkeren is de beginstand, vrijgeven vraagt bewijs ----
const bytes=new TextEncoder().encode('reviewed asset');
const hash=createHash('sha256').update(bytes).digest('hex');
const poseEntry={exerciseId:'fp_pose',source:'images/pose.jpg',status:'unreviewed',assetSha256:'b'.repeat(64),width:800,height:1200,
  poses:[{label:'start',crop:{x:10,y:10,w:300,h:1000}},{label:'end',crop:{x:420,y:10,w:300,h:1000}}],
  poseGeometry:{status:'geometry-approved',axis:'x',clinicalApproved:false}};
const conceptPose={...poseEntry,exerciseId:'fp_concept',source:'images/concept.jpg',poseGeometry:{status:'static',reason:'niet gecontroleerd'}};
const brokenPose={...poseEntry,exerciseId:'fp_broken',source:'images/broken.jpg',
  poses:[{label:'start',crop:{x:10,y:10,w:300,h:1000}},{label:'end',crop:{x:100,y:10,w:300,h:1000}}]};
const uploadReject={exerciseId:'po_praktijk',source:'uploads/oef-abc123def456.jpg',status:'rejected',assetSha256:'different'};
const reviewEntries=[uploadReject,{exerciseId:'fp_test',source:'images/test.jpg',status:'rejected',assetSha256:hash},{exerciseId:'fp_changed',source:'images/changed.jpg',status:'rejected',assetSha256:'different'},{exerciseId:'fp_unreviewed',source:'images/unreviewed.jpg',status:'unreviewed',assetSha256:hash},poseEntry,conceptPose,brokenPose];
const requests=[];
const maakReviewContext=(mediaDate,narrationDate)=>vm.createContext({crypto:webcrypto,window:{crypto:webcrypto},K:null,tekenKaart(){},
  fetch:async url=>{requests.push(url);return {ok:true,
    json:async()=>url.includes('narration')?{reviewDate:narrationDate,holds:[{exerciseId:'fp_held',name:'Held',text:'Old text',status:'hold'}]}:{reviewDate:mediaDate,entries:reviewEntries,
      rejectedSources:[{exerciseId:'fp_lunge',source:'images/cardio/lunge-v8.jpg',status:'rejected'}]},
    arrayBuffer:async()=>bytes.buffer};}});
const reviewContext=maakReviewContext('2026-11-02','2026-11-02');
vm.runInContext(between('  var mediaReviewReady=','  function tr('),reviewContext);
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/images/test.jpg'}),true,'not rendered before review loaded');
await reviewContext.loadMobileReview();
assert.deepEqual(requests,['/mobile-media-review.json','/mobile-narration-review.json'],'het laden van de kaart haalt geen afbeeldingen binnen');
// een afgekeurde vorige versie blijft afgekeurd, ook al wijst de catalogus er niet meer naar
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_lunge',kaartImg:'/v2/images/cardio/lunge-v8.jpg'}),true,'terug naar een afgekeurde versie wordt tegengehouden');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_lunge',kaartImg:'/v2/images/cardio/lunge-v9.png'}),false,'de herstelde versie blijft zichtbaar');
// een afkeuring van een door de praktijk geüpload beeld moet ook echt werken
assert.equal(reviewContext.mediaWithheld({exerciseId:'po_praktijk',kaartImg:'/uploads/oef-abc123def456.jpg'}),true,'een afgekeurd praktijkbeeld wordt tegengehouden');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/images/test.jpg'}),true);
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/v2/images/test.jpg'}),true);
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_changed',kaartImg:'/images/changed.jpg'}),true,'een afkeuring blokkeert meteen, ook voor de hashcontrole');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_other',kaartImg:'/images/test.jpg'}),false,'different exercise not accidentally rejected');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/images/replaced.jpg'}),false,'replacement source not rejected');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_unreviewed',kaartImg:'/images/unreviewed.jpg'}),false,'unreviewed remains static');
assert.equal(reviewContext.explanationWithheld({exerciseId:'fp_held',naam:'Renamed',uitleg:'Changed'}),true,'hold needs explicit rereview, not text edit');
assert.equal(reviewContext.explanationWithheld({naam:'Held',uitleg:'Changed'}),true);
// alleen een goedgekeurde, geldige uitsnede komt in de kaart terecht
assert.ok(reviewContext.poseKeuring['fp_pose|images/pose.jpg'],'geometry-approved uitsnede wordt overgenomen');
assert.equal(reviewContext.poseKeuring['fp_pose|images/pose.jpg'].axis,'x');
assert.equal(reviewContext.poseKeuring['fp_concept|images/concept.jpg'],undefined,'niet gecontroleerde uitsnede wordt genegeerd');
assert.equal(reviewContext.poseKeuring['fp_broken|images/broken.jpg'],undefined,'overlappende uitsnede wordt genegeerd');
assert.equal(reviewContext.poseKeuring['fp_test|images/test.jpg'],undefined,'afgekeurd beeld levert nooit houdingen');
// een vervangen beeld krijgt zijn afkeuring niet geërfd, maar pas na bewijs
requests.length=0;
reviewContext.herzieAfgekeurd(['fp_test|images/test.jpg','fp_changed|images/changed.jpg','po_praktijk|uploads/oef-abc123def456.jpg']);
await new Promise(resolve=>setTimeout(resolve,10));
assert.deepEqual(requests,['/images/test.jpg','/images/changed.jpg','/uploads/oef-abc123def456.jpg'],'alleen beelden die echt op de kaart staan worden gecontroleerd, praktijkuploads inbegrepen');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/images/test.jpg'}),true,'gelijke hash blijft geblokkeerd');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_changed',kaartImg:'/images/changed.jpg'}),false,'andere hash: vervangen beeld wordt vrijgegeven');
// twee beoordelingsbestanden uit verschillende generaties: alles tegenhouden
const mixed=maakReviewContext('2026-11-02','2026-10-01');
vm.runInContext(between('  var mediaReviewReady=','  function tr('),mixed);
await assert.rejects(()=>mixed.loadMobileReview(),/generation/,'gemengde generaties worden geweigerd');
assert.equal(mixed.mediaReviewReady,false);

// ---- stemopnames ----
context.explanationHolds=[{name:'Held'}];let messages=[];context.alert=message=>{messages.push(message);events.push('notice');};
// sinds 2026-11-09 staat de melding op de pagina (#noorMelding) in plaats van in een alert()
el('noorMelding');Object.defineProperty(el('noorMelding'),'textContent',{set(v){if(v){messages.push(v);events.push('notice');}},get(){return '';}});
await vm.runInContext('speelNoor([{name:"Held",text:"Old text"}])',context);assert.equal(played,1,'held narration never plays');
context.explanationHolds=[{exerciseId:'fp_held',name:'Oude naam'}];
await vm.runInContext('speelNoor([{name:"Nieuwe naam",text:"Uitleg",id:"fp_held"}])',context);
assert.equal(played,1,'een houd op stabiel id blijft gelden na hernoemen');
context.explanationHolds=[{name:'Held'}];
events=[];
await vm.runInContext('speelNoor([{name:"Held",text:"Old text"},{name:"Missing",text:"New text"},{name:"Available",text:"Uitleg"}])',context);
assert.equal(played,2);assert.equal(lastPlaylist.length,1);assert.equal(lastPlaylist[0].name,'Available');
// eerst afspelen, dan melden: een blokkerende melding laat de toestemming van de tik verlopen
assert.deepEqual(events,['play','notice'],'de melding mag het afspelen niet blokkeren');
assert.match(messages.at(-1),/Held/);assert.match(messages.at(-1),/Missing/);assert.match(messages.at(-1),/1 oefening/);
const beforeCancelled=played;let finishLoad;
context.NoorAudio.load=()=>new Promise(resolve=>{finishLoad=resolve;});
const pending=context.speelNoor([{name:'Available',text:'Uitleg'}]);context.stopLezen();finishLoad();await pending;
assert.equal(played,beforeCancelled,'stop while manifest loading prevents delayed playback');
assert.ok(html.includes("if(explanationWithheld(bron))uitleg='';"),'other languages also suppress held explanation');
// teruggehouden beeld/uitleg: geen bibliotheek- of AI-video; alleen een video die de
// therapeut zelf opnam of per kaart koppelde blijft, zonder de algemene uitlegtekst
const holdBlok=html.slice(html.indexOf("if(hideMedia||holdExplanation){"),html.indexOf("var beeldpad=o&&o.kaartImg?o.kaartImg:'';"));
assert.ok(holdBlok.length>0&&holdBlok.length<1500,'held content block present');
assert.ok(/else knop='';\s*\}/.test(holdBlok),'held content cannot expose a library video play button');
assert.ok(holdBlok.includes("!(o.video.eigenMeta&&o.video.eigenMeta.aiGenerated)"),'held content never keeps a generated video');
assert.ok(!holdBlok.includes('vtekst')&&!holdBlok.includes('videoTekstData'),'held content keeps no explanation on the therapist video');
assert.ok(html.includes("(hideMedia?'':"),'teruggehouden beeld biedt ook geen stemopname aan');
assert.ok(html.includes("clinicallyReviewed===true?(VIDEO_META[TAAL]"),'het label klinisch gecontroleerd vraagt een positieve bevestiging');
console.log('Mobile media: mutual exclusion, audio button state, canonical names, source-bound poses, fail-closed review and syntax passed.');

// ---- een video van de praktijk draagt nooit de kop "uitleg bij de video" ----
// De tekst onder een video komt uit de bibliotheek. Bij een praktijkopname of een
// geplakte link is die tekst nooit tegen díe beelden gelegd; dat hoort erbij te staan.
const videoCode=between("      var videoTekst=b.dataset.vtekst||'';","      if(b.dataset.eigen){");
assert.ok(videoCode.includes("var vanPraktijk=b.dataset.vbron==='praktijk';"),'de herkomst van de video wordt gelezen');
assert.ok(videoCode.includes('VIDEO_TEKST_ALG'),'praktijkbeelden krijgen de algemene kop');
assert.ok(videoCode.includes('VIDEO_BRON_PRAKTIJK'),'bij praktijkbeelden staat waar beeld en tekst vandaan komen');
// Een door beheer geüploade AI-avatarvideo hoort bij de bibliotheekoefening (de uitleg is
// tegen díe beelden gelegd) en draagt data-avatar; andere eigen video's blijven 'praktijk'.
for(const merk of ['data-eigen="/\'+esc(eigen)+\'" data-vbron="\'+(eigenMeta&&eigenMeta.aiGenerated?\'bibliotheek" data-avatar="1\':\'praktijk\')+\'"',
  "data-vbron=\"'+(catalogus&&catalogus.iframe===stream?'bibliotheek':'praktijk')+'\"",
  "data-vbron=\"'+(persoonlijkYt?'praktijk':'bibliotheek')+'\""]){
  assert.ok(html.includes(merk),'herkomst ontbreekt op een videoknop: '+merk.slice(0,40));
}
// alle negen talen hebben beide teksten, anders valt een patiënt terug op Nederlands
for(const woordenboek of ['VIDEO_TEKST_ALG','VIDEO_BRON_PRAKTIJK']){
  const regel=html.slice(html.indexOf('  var '+woordenboek+'='));
  for(const taal of ['nl','en','de','fr','es','pl','tr','ar','uk'])assert.ok(regel.slice(0,2000).includes(taal+':'),woordenboek+' mist '+taal);
}
console.log('Videoherkomst: praktijkbeelden dragen de algemene bibliotheekkop en benoemen hun herkomst in negen talen.');

// ---- tekenen en voorlezen kiezen dezelfde oefening ----
// Een eigen praktijkoefening met dezelfde naam als een bibliotheekoefening: de kaart
// toonde de ene en las de andere voor. Beide gebruiken nu één opzoekregel.
const opzoek=vm.createContext({});
vm.runInContext(between('  function normEx(s){','\n',)+'\n'+between('  function metEigen(lib,kaart){','  function dagStr(t)')+
  between('  function vindOefening(x){','  function leesVoor(){'),opzoek);
opzoek.K={lib:[{naam:'Squat',exerciseId:'fp_lib',uitleg:'bibliotheek'}],
  kaart:{eigenOef:[{naam:'Squat',id:'po_eigen',img:'uploads/oef-abc.jpg',uitleg:'eigen tekst'}]}};
const getekend=vm.runInContext("zoekOefening(oefeningIndex(K.lib,K.kaart),{n:'Squat'})",opzoek);
const voorgelezen=vm.runInContext("vindOefening({n:'Squat'})",opzoek);
assert.equal(getekend.exerciseId,'po_eigen','zonder id wint bij gelijke naam de eigen oefening, zoals altijd bij tekenen');
assert.equal(voorgelezen.exerciseId,getekend.exerciseId,'voorlezen kiest dezelfde oefening als tekenen');
assert.equal(vm.runInContext("vindOefening({n:'Squat',id:'fp_lib'})",opzoek).exerciseId,'fp_lib','een stabiel id gaat altijd voor');
assert.equal(vm.runInContext("vindOefening({n:'SQUAT!'})",opzoek).exerciseId,'po_eigen','naam wordt genormaliseerd');
assert.equal(vm.runInContext("vindOefening({n:'Onbekend'})",opzoek),null);
assert.ok(!html.includes('alle.find(function(o){return normEx(o.naam)'),'geen tweede opzoekregel meer');
assert.ok(html.includes('var o=zoekOefening(oefIndex,x);'),'tekenen gebruikt de gedeelde regel');

// ---- toestelstem: een laat einde van een gestopte voorlezing breekt de nieuwe niet af ----
const uitingen=[];
const spraak={cancel(){},speak(u){uitingen.push(u);}};
const lees=vm.createContext({document,speechSynthesis:spraak,window:{speechSynthesis:spraak},
  SpeechSynthesisUtterance:function(t){this.text=t;},NoorAudio:{stop(){}},noorRequest:0,TAAL:'en',
  tr:k=>k,vt:s=>s,SPRAAK:{en:'en-GB'},kiesStem:()=>null,explanationWithheld:()=>false,demoGeluidKnop(){},stopVideos(){},
  // beoordeling geladen en niets tegengehouden: deze test gaat alleen over de beurtbewaking
  mediaReviewReady:true,mediaWithheld:()=>false,explanationHolds:[],
  K:{kaart:{chosen:[{n:'Squat'}],cells:{},client:{}},praktijk:{praktijk:'Praktijk'},lib:[{naam:'Squat',uitleg:'Rustig zakken.'}]}});
vm.runInContext(between('  function normEx(s){','\n')+'\n'+between('  function metEigen(lib,kaart){','  function dagStr(t)')+
  between('  var bezigLezen=false,noorRequest=0,noorBron=-1;','  async function speelNoor('),lees);
vm.runInContext('leesVoor()',lees);
const eerste=uitingen.at(-1);assert.equal(lees.bezigLezen,true);
vm.runInContext('leesVoor()',lees);assert.equal(lees.bezigLezen,false,'tweede tik stopt');
vm.runInContext('leesVoor()',lees);
const tweede=uitingen.at(-1);assert.notEqual(tweede,eerste);assert.equal(lees.bezigLezen,true);
assert.equal(el('leesBtn').attrs['aria-pressed'],'true','ook de toestelstem meldt zijn stand aan een schermlezer');
eerste.onend();
assert.equal(lees.bezigLezen,true,'het late einde van de gestopte voorlezing breekt de nieuwe niet af');
assert.equal(el('leesBtn').attrs['aria-pressed'],'true','knopstand niet door de oude voorlezing gereset');
tweede.onerror();
assert.equal(lees.bezigLezen,false,'een spraakfout zet de knop terug in plaats van hem op Stop te laten');
assert.equal(el('leesBtn').attrs['aria-pressed'],'false');
console.log('Opzoeken en toestelstem: tekenen en voorlezen kiezen dezelfde oefening; een oude voorlezing kan de nieuwe niet afbreken.');
