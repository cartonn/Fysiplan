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
const context=vm.createContext({document,window:{NoorAudio:{}},NoorAudio:{stop(){audioStopped++;},load:async()=>{},match:(name)=>name!=='Missing',play(items){played++;lastPlaylist=items;events.push('play');}},noorRequest:0,mediaReviewReady:true,explanationHolds:[],TAAL:'nl',tr:x=>x,alert(){throw Error('Unexpected alert');},demo:{info:{}},bronGecontroleerd:{},URL,location:{href:'https://praktijk.example/k/abc'},Math,Number});
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
const foto={src:'https://praktijk.example/images/avatar.jpg',naturalWidth:800,naturalHeight:1200};
const goedeMeta=()=>({source:'images/avatar.jpg',assetSha256:'a'.repeat(64),axis:'x',width:800,height:1200,
  poses:[{label:'start',crop:{x:10,y:10,w:300,h:1000}},{label:'end',crop:{x:420,y:10,w:300,h:1000}}]});
assert.equal(context.demoHoudingen(foto),null,'zonder beoordeelde uitsnede geen houdingen');
context.demo.info.poseMetadata=goedeMeta();
assert.equal(context.demoHoudingen(foto),null,'zonder bewezen bronbestand geen houdingen');
context.bronGecontroleerd['a'.repeat(64)]=false;
assert.equal(context.demoHoudingen(foto),null,'een afwijkende bron zet de uitsnede buiten werking');
context.bronGecontroleerd['a'.repeat(64)]=true;
assert.ok(context.demoHoudingen(foto),'beoordeelde uitsnede bij bewezen bron werkt');
assert.equal(context.demoHoudingen({src:'https://praktijk.example/images/anders.jpg',naturalWidth:800,naturalHeight:1200}),null,'uitsnede is bronspecifiek');
assert.equal(context.demoHoudingen({src:foto.src,naturalWidth:1024,naturalHeight:1200}),null,'afmetingen moeten kloppen');
context.demo.info.poseMetadata=goedeMeta();context.demo.info.poseMetadata.poses[1].crop.x=100;
assert.equal(context.demoHoudingen(foto),null,'overlappende uitsnedes zijn nooit twee houdingen');
context.demo.info.poseMetadata=goedeMeta();context.demo.info.poseMetadata.poses[0].crop.w=0;
assert.equal(context.demoHoudingen(foto),null,'lege uitsnede telt niet');
context.demo.info.poseMetadata=null;

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
const reviewEntries=[{exerciseId:'fp_test',source:'images/test.jpg',status:'rejected',assetSha256:hash},{exerciseId:'fp_changed',source:'images/changed.jpg',status:'rejected',assetSha256:'different'},{exerciseId:'fp_unreviewed',source:'images/unreviewed.jpg',status:'unreviewed',assetSha256:hash},poseEntry,conceptPose,brokenPose];
const requests=[];
const maakReviewContext=(mediaDate,narrationDate)=>vm.createContext({crypto:webcrypto,window:{crypto:webcrypto},K:null,tekenKaart(){},
  fetch:async url=>{requests.push(url);return {ok:true,
    json:async()=>url.includes('narration')?{reviewDate:narrationDate,holds:[{exerciseId:'fp_held',name:'Held',text:'Old text',status:'hold'}]}:{reviewDate:mediaDate,entries:reviewEntries},
    arrayBuffer:async()=>bytes.buffer};}});
const reviewContext=maakReviewContext('2026-11-02','2026-11-02');
vm.runInContext(between('  var mediaReviewReady=','  function tr('),reviewContext);
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/images/test.jpg'}),true,'not rendered before review loaded');
await reviewContext.loadMobileReview();
assert.deepEqual(requests,['/mobile-media-review.json','/mobile-narration-review.json'],'het laden van de kaart haalt geen afbeeldingen binnen');
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
reviewContext.herzieAfgekeurd(['fp_test|images/test.jpg','fp_changed|images/changed.jpg']);
await new Promise(resolve=>setTimeout(resolve,10));
assert.deepEqual(requests,['/images/test.jpg','/images/changed.jpg'],'alleen beelden die echt op de kaart staan worden gecontroleerd');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_test',kaartImg:'/images/test.jpg'}),true,'gelijke hash blijft geblokkeerd');
assert.equal(reviewContext.mediaWithheld({exerciseId:'fp_changed',kaartImg:'/images/changed.jpg'}),false,'andere hash: vervangen beeld wordt vrijgegeven');
// twee beoordelingsbestanden uit verschillende generaties: alles tegenhouden
const mixed=maakReviewContext('2026-11-02','2026-10-01');
vm.runInContext(between('  var mediaReviewReady=','  function tr('),mixed);
await assert.rejects(()=>mixed.loadMobileReview(),/generation/,'gemengde generaties worden geweigerd');
assert.equal(mixed.mediaReviewReady,false);

// ---- stemopnames ----
context.explanationHolds=[{name:'Held'}];let messages=[];context.alert=message=>{messages.push(message);events.push('notice');};
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
assert.ok(html.includes("if(hideMedia||holdExplanation)knop='';"),'held content cannot expose a video play button');
assert.ok(html.includes("(hideMedia?'':"),'teruggehouden beeld biedt ook geen stemopname aan');
assert.ok(html.includes("clinicallyReviewed===true?(VIDEO_META[TAAL]"),'het label klinisch gecontroleerd vraagt een positieve bevestiging');
console.log('Mobile media: mutual exclusion, audio button state, canonical names, source-bound poses, fail-closed review and syntax passed.');
