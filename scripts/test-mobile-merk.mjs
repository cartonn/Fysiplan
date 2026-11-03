// Eén merk op de kaart: het ingebakken Fysiplan-merk wordt alleen afgedekt met een gemeten
// vlak, bij exact het bestand met de gemeten hash en afmetingen; in alle andere gevallen
// blijft het beeld zoals het is. De kaart zet zelf overal hetzelfde merk, buiten het beeld.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';

const html=fs.readFileSync(new URL('../public/kaart.html',import.meta.url),'utf8');
const between=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>i,b);return html.slice(i,j);};

// ---- opmaak: het merk staat bij de foto en bij de houdingen, met hetzelfde uiterlijk ----
assert.ok(html.includes('<div class="lbfoto" id="lbfoto"><span class="fpmerk" aria-hidden="true">Fysiplan</span><span class="lbbeeld"><img id="lbimg" alt=""/><i class="merkdek" id="lbdek" hidden></i></span></div>'),
  'de vergrote foto heeft een eigen merk buiten het beeld en een (verborgen) afdekvlak');
assert.ok(/\.fpmerk,\.lightbox \.demobeeld \.demomerk\{/.test(html),'foto en houdingen delen één merkstijl');
assert.ok(/\.fpmerk::before,\.lightbox \.demobeeld \.demomerk::before\{[^}]*icoon-192\.png/.test(html),'het merk draagt het echte icoon');
assert.ok(fs.existsSync(new URL('../public/images/icoon-192.png',import.meta.url)),'icoon bestaat');

// ---- stubs ----
function maakEl(id){return {id,hidden:false,style:{},attrs:{},_klassen:new Set(),
  classList:{add(k){this._s.add(k);},remove(k){this._s.delete(k);},contains(k){return this._s.has(k);},_s:null},
  setAttribute(k,v){this.attrs[k]=v;}};}
const els=new Map();
function el(id){if(!els.has(id)){const e=maakEl(id);e.classList._s=e._klassen;els.set(id,e);}return els.get(id);}
const bytes=Buffer.from('beeld-met-merk');
const sha=createHash('sha256').update(bytes).digest('hex');
let fetches=[];
const ctx=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[]},
  location:{href:'https://praktijk.example/k/abc'},URL,Promise,setTimeout,clearTimeout,Array,Uint8Array,Number,Math,String,Error,
  window:{crypto:webcrypto},crypto:webcrypto,
  fetch:async(pad)=>{fetches.push(pad);return {ok:true,arrayBuffer:async()=>bytes};},
  bronGecontroleerd:{}});
vm.runInContext('var merkDek={},poseKeuring={},blockedMedia={},explanationHolds=[],mediaReviewReady=false,bronGecontroleerd={};'+
  between('  function geldigeUitsnede(','  async function loadMobileReview(')+
  between('  async function loadMobileReview(','  // Een oude afkeuring mag')+
  between('  function bronPad(','  var DEMO_MAAT='),ctx);

// ---- laden: alleen een geldig vlak bij een hash en afmetingen ----
const entry=(over={})=>({exerciseId:'fp_a',source:'images/a.jpg',assetSha256:sha,width:800,height:1200,status:'unreviewed',
  poseGeometry:{status:'static'},poses:[],brandMark:{present:true,cover:{x:14,y:14,w:178,h:58}},...over});
async function laad(entries){
  ctx.merkDek={};vm.runInContext('merkDek={};',ctx);
  ctx.fetch=async(url)=>({ok:true,json:async()=>url.includes('narration')?{reviewDate:'d',holds:[]}:{reviewDate:'d',entries}});
  await vm.runInContext('loadMobileReview()',ctx);
  return vm.runInContext('merkDek',ctx);
}
let md=await laad([entry()]);
assert.deepEqual(JSON.parse(JSON.stringify(md['fp_a|images/a.jpg'])),{source:'images/a.jpg',assetSha256:sha,width:800,height:1200,cover:{x:14,y:14,w:178,h:58}});
md=await laad([entry({brandMark:{present:false,cover:null}})]);
assert.equal(md['fp_a|images/a.jpg'],undefined,'geen merk, geen vlak');
md=await laad([entry({brandMark:{present:true,cover:{x:700,y:14,w:178,h:58}}})]);
assert.equal(md['fp_a|images/a.jpg'],undefined,'een vlak buiten het beeld telt niet');
md=await laad([entry({assetSha256:'kapot'})]);
assert.equal(md['fp_a|images/a.jpg'],undefined,'zonder geldige hash geen vlak');
md=await laad([entry({status:'rejected'})]);
assert.equal(md['fp_a|images/a.jpg'],undefined,'een afgekeurd beeld wordt geblokkeerd, niet bijgewerkt');

// ---- merkVlak: alleen bij exact de gemeten afmetingen ----
const meta={source:'images/a.jpg',assetSha256:sha,width:800,height:1200,cover:{x:14,y:14,w:178,h:58}};
assert.deepEqual(JSON.parse(JSON.stringify(ctx.merkVlak(meta,800,1200))),{l:14/800,t:14/1200,w:178/800,h:58/1200});
assert.equal(ctx.merkVlak(meta,1024,1200),null,'ander formaat: beeld blijft heel');
assert.equal(ctx.merkVlak(null,800,1200),null);

// ---- vergrote foto: afdekken pas na de hashcontrole van precies dit pad ----
await laad([entry()]);
const img=el('lbimg');img.complete=true;img.naturalWidth=800;img.naturalHeight=1200;
img.src='https://praktijk.example/v2/images/a.jpg';
const kader=el('lbfoto'),dek=el('lbdek');
fetches=[];ctx.fetch=async(pad)=>{fetches.push(pad);return {ok:true,arrayBuffer:async()=>bytes};};
let p=vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx);
assert.ok(kader.classList.contains('wacht'),'tijdens de controle is het beeld even verborgen: geen flits van het oude merk');
assert.equal(dek.hidden,true);
assert.equal(await p,true);
assert.equal(dek.hidden,false,'na een geslaagde controle is het merk afgedekt');
assert.deepEqual([dek.style.left,dek.style.top,dek.style.width,dek.style.height],
  [(14/800*100)+'%',(14/1200*100)+'%',(178/800*100)+'%',(58/1200*100)+'%']);
assert.equal(kader.classList.contains('wacht'),false);
assert.deepEqual(fetches,['/v2/images/a.jpg'],'opgehaald wordt precies het pad van het getoonde beeld');

// andere bytes onder hetzelfde pad: niet afdekken, beeld gewoon tonen
ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>Buffer.from('ander-beeld')});
assert.equal(await vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx),false);
assert.equal(dek.hidden,true,'afwijkende bytes: geen afdekking');
assert.equal(kader.classList.contains('wacht'),false,'en het beeld wordt wel getoond');

// geen vlak voor deze oefening: meteen tonen, niets ophalen
fetches=[];
assert.equal(await vm.runInContext('merkLightbox("fp_b|images/b.jpg")',ctx),false);
assert.equal(dek.hidden,true);assert.equal(kader.classList.contains('wacht'),false);assert.deepEqual(fetches,[]);

// afwijkende afmetingen: geen afdekking
ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes});
img.naturalWidth=1024;
assert.equal(await vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx),false);
assert.equal(dek.hidden,true);
img.naturalWidth=800;

// een snel volgende foto: de oude controle mag het vlak van de nieuwe niet zetten
let loslaten;ctx.fetch=()=>new Promise(r=>{loslaten=()=>r({ok:true,arrayBuffer:async()=>bytes});});
const eerste=vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx);
await new Promise(r=>setTimeout(r,0));
vm.runInContext('merkBeurt++',ctx); // een nieuwe foto is geopend
loslaten();
assert.equal(await eerste,false);assert.equal(dek.hidden,true,'een verouderde controle zet niets');

// ---- miniaturen: pas afdekken na de hashcontrole van precies het getoonde pad ----
// Afmetingen alleen bewijzen niets: een vervangen beeld van hetzelfde formaat, of een oude
// kopie uit de cache, verloor anders inhoud onder een vlak dat bij een ander bestand hoort.
const knop={kids:[],querySelector(){return this.kids.find(k=>k.className==='merkdek')||null;},removeChild(k){this.kids=this.kids.filter(x=>x!==k);},
  insertBefore(k){this.kids.push(k);}};
const PAD_A='https://praktijk.example/v2/images/a.jpg';
const mini={parentNode:knop,dataset:{pose:'fp_a|images/a.jpg'},src:PAD_A,currentSrc:PAD_A,naturalWidth:800,naturalHeight:1200,clientWidth:86,clientHeight:86,nextSibling:null};
ctx.getComputedStyle=()=>({borderLeftWidth:'1px',borderTopWidth:'1px',paddingLeft:'4px',paddingTop:'4px',paddingRight:'4px',paddingBottom:'4px'});
ctx.document.createElement=()=>({style:{},setAttribute(){},className:''});
const dekMini=(i)=>vm.runInContext('dekMiniatuur',ctx)(i);
// Geen handmatige cache-reset: sinds de verse controle per lading is die overbodig, en
// juist zonder reset faalde de vorige versie (een eerdere 'true' werd hergebruikt).
const levert=(inhoud)=>{fetches=[];ctx.fetch=async(pad)=>{fetches.push(pad);return {ok:true,arrayBuffer:async()=>inhoud};};};

// 1. vervangen beeld, zelfde pad, zelfde afmetingen, oude hash in de beoordeling: niet afdekken
levert(Buffer.from('vervangen-beeld-van-hetzelfde-formaat'));
let bezig=dekMini(mini);
assert.equal(knop.kids.length,0,'zonder bewezen hash komt er nooit meteen een vlak');
assert.equal(await bezig,false);
assert.equal(knop.kids.length,0,'vervangen beeld van hetzelfde formaat: de miniatuur blijft heel');
assert.deepEqual(fetches,['/v2/images/a.jpg'],'gecontroleerd wordt precies het pad van het getoonde beeld');

// 2. de juiste bytes: pas na de controle een vlak, op de plek die object-fit:contain geeft
levert(bytes);
bezig=dekMini(mini);
assert.equal(knop.kids.length,0,'tijdens de controle nog geen vlak');
assert.equal(await bezig,true);
const d=knop.kids[0];assert.ok(d,'na een geslaagde controle krijgt de miniatuur een vlak');
// inhoud 78x78, beeld 52x78 gecentreerd: x0 = 1+4+13 = 18, y0 = 5; schaal 0.065
assert.deepEqual([d.style.left,d.style.top],['18px','5px']);
assert.ok(parseInt(d.style.width)>=Math.ceil(178*0.065)&&parseInt(d.style.height)>=Math.ceil(58*0.065),'het vlak dekt het hele merk');
assert.equal(await dekMini(mini),true);
assert.equal(knop.kids.length,1,'opnieuw tekenen stapelt geen vlakken');
assert.deepEqual(fetches,['/v2/images/a.jpg','/v2/images/a.jpg'],'elke nieuwe controle haalt opnieuw op; een eerdere uitkomst wordt niet hergebruikt');

// 3. een nieuwe controle haalt het oude vlak meteen weg; mislukt ze, dan blijft het weg
fetches=[];ctx.fetch=async(pad)=>{fetches.push(pad);return {ok:false};};
bezig=dekMini(mini);
assert.equal(knop.kids.length,0,'het oude vlak verdwijnt zodra opnieuw gecontroleerd wordt');
assert.equal(await bezig,false);assert.equal(knop.kids.length,0,'bron niet te controleren: beeld heel');
ctx.fetch=async()=>{throw Error('netwerk weg');};
assert.equal(await dekMini(mini),false);assert.equal(knop.kids.length,0,'netwerkfout: beeld heel');

// 4. ander formaat: geen vlak en ook niets ophalen
levert(bytes);mini.naturalWidth=1024;
assert.equal(await dekMini(mini),false);assert.equal(knop.kids.length,0,'ander formaat: beeld heel');
assert.deepEqual(fetches,[]);mini.naturalWidth=800;

// 5. een ander pad dan de beoordeling noemt: niet afdekken, ook al zijn de bytes goed
levert(bytes);mini.src=mini.currentSrc='https://praktijk.example/v2/images/ander.jpg';
assert.equal(await dekMini(mini),false);assert.equal(knop.kids.length,0);assert.deepEqual(fetches,[]);
mini.src=mini.currentSrc=PAD_A;

// 6. geen crypto.subtle (oude browser, onveilige verbinding): beeld heel
levert(bytes);const echtCrypto=ctx.crypto;ctx.crypto={};
assert.equal(await dekMini(mini),false);assert.equal(knop.kids.length,0,'niet te bewijzen: niet afdekken');
ctx.crypto=echtCrypto;

// ---- races: een verouderde controle zet nooit een vlak ----
let wachtend=[];
const houdtVast=()=>{wachtend=[];ctx.fetch=()=>new Promise(r=>wachtend.push(()=>r({ok:true,arrayBuffer:async()=>bytes})));};
const tik=()=>new Promise(r=>setTimeout(r,0));

// 7. snel vervangen beeld: tijdens de controle krijgt de miniatuur een andere bron
houdtVast();
bezig=dekMini(mini);await tik();
mini.src=mini.currentSrc='https://praktijk.example/v2/images/b.jpg';
wachtend[0]();
assert.equal(await bezig,false);
assert.equal(knop.kids.length,0,'de controle van het vorige beeld zet geen vlak op het nieuwe');
mini.src=mini.currentSrc=PAD_A;

// 8. ander formaat geladen tijdens de controle
houdtVast();
bezig=dekMini(mini);await tik();mini.naturalWidth=1024;wachtend[0]();
assert.equal(await bezig,false);assert.equal(knop.kids.length,0);mini.naturalWidth=800;

// 9. de kaart is opnieuw getekend: de oude miniatuur hangt nergens meer aan
houdtVast();
bezig=dekMini(mini);await tik();mini.parentNode=null;wachtend[0]();
assert.equal(await bezig,false);assert.equal(knop.kids.length,0,'een losgekoppelde miniatuur krijgt niets');
mini.parentNode=knop;

// 10. twee controles na elkaar: alleen de laatste telt, ook als de eerste later klaar is
houdtVast();
const eersteMini=dekMini(mini);const laatsteMini=dekMini(mini);await tik();
assert.equal(wachtend.length,2);
wachtend[1]();assert.equal(await laatsteMini,true);assert.equal(knop.kids.length,1);
wachtend[0]();assert.equal(await eersteMini,false);
assert.equal(knop.kids.length,1,'een oudere controle stapelt geen tweede vlak');

// 11. de beoordeling verandert tijdens de controle (ander vlak voor deze oefening)
houdtVast();
bezig=dekMini(mini);await tik();
vm.runInContext('merkDek["fp_a|images/a.jpg"]=Object.assign({},merkDek["fp_a|images/a.jpg"])',ctx);
wachtend[0]();assert.equal(await bezig,false,'een vlak uit een vervangen beoordeling telt niet');
assert.equal(knop.kids.length,0);

// ---- dekMiniaturen: elke nieuwe lading van een miniatuur begint opnieuw ----
await laad([entry()]);levert(bytes);
const luister={};
const knop2={kids:[],querySelector:knop.querySelector,removeChild:knop.removeChild,insertBefore:knop.insertBefore};
const mini2={parentNode:knop2,dataset:{pose:'fp_a|images/a.jpg'},src:PAD_A,currentSrc:PAD_A,complete:false,naturalWidth:0,naturalHeight:0,
  clientWidth:86,clientHeight:86,nextSibling:null,addEventListener(t,f){(luister[t]=luister[t]||[]).push(f);}};
ctx.document.querySelectorAll=()=>[mini2];
vm.runInContext('dekMiniaturen()',ctx);
assert.equal(knop2.kids.length,0,'nog niet geladen: niets');
// de luisteraar geeft niets terug: wacht tot de (echte) hashcontrole klaar kan zijn
const laadt=async()=>{for(const f of luister.load||[])f();for(let i=0;i<50;i++)await tik();};
mini2.complete=true;mini2.naturalWidth=800;mini2.naturalHeight=1200;
await laadt();assert.equal(knop2.kids.length,1,'geladen en bewezen: vlak');
// daarna laadt de miniatuur een ander beeld: het oude vlak mag er niet op blijven staan
mini2.src=mini2.currentSrc='https://praktijk.example/v2/images/b.jpg';
await laadt();
assert.equal(knop2.kids.length,0,'een nieuwe lading van een ander beeld haalt het oude vlak weg');
mini2.src=mini2.currentSrc=PAD_A;await laadt();assert.equal(knop2.kids.length,1,'terug naar het bewezen beeld: weer een vlak');
// een mislukte lading (beeld weg, 0x0): het vlak mag niet over een leeg kader blijven staan
mini2.naturalWidth=0;mini2.naturalHeight=0;
for(const f of luister.error||[])f();for(let i=0;i<50;i++)await tik();assert.equal(knop2.kids.length,0,'een mislukte lading laat geen vlak achter');
ctx.document.querySelectorAll=()=>[];

// ---- nieuwe lading, zelfde pad, zelfde formaat, andere bytes (audit 2026-11-03) ----
// De vorige versie onthield 'true' per pad en hash: een tweede lading van hetzelfde pad
// werd dan zonder ophalen weer afgedekt (fetches 1, vlak 1). Hier zonder enige reset.
{
  const luister3={},knop3={kids:[],querySelector:knop.querySelector,removeChild:knop.removeChild,insertBefore:knop.insertBefore};
  const mini3={parentNode:knop3,dataset:{pose:'fp_a|images/a.jpg'},src:PAD_A,currentSrc:PAD_A,complete:false,naturalWidth:0,naturalHeight:0,
    clientWidth:86,clientHeight:86,nextSibling:null,addEventListener(t,f){(luister3[t]=luister3[t]||[]).push(f);}};
  const laadt3=async()=>{for(const f of luister3.load||[])f();for(let i=0;i<50;i++)await tik();};
  ctx.document.querySelectorAll=()=>[mini3];
  levert(bytes);
  vm.runInContext('dekMiniaturen()',ctx);
  mini3.complete=true;mini3.naturalWidth=800;mini3.naturalHeight=1200;
  await laadt3();
  assert.equal(knop3.kids.length,1,'eerste lading, juiste bytes: vlak');
  assert.equal(fetches.length,1);
  // dezelfde URL levert nu andere bytes; het beeld laadt opnieuw met hetzelfde formaat
  const zelfdeFormaat=Buffer.from('ander-beeld-zelfde-url-zelfde-formaat');
  ctx.fetch=async(pad)=>{fetches.push(pad);return {ok:true,arrayBuffer:async()=>zelfdeFormaat};};
  await laadt3();
  assert.equal(fetches.length,2,'een nieuwe lading wordt opnieuw gecontroleerd');
  assert.equal(knop3.kids.length,0,'andere bytes onder hetzelfde pad: geen vlak');
  assert.equal(vm.runInContext('bronGecontroleerd["/v2/images/a.jpg|'+sha+'"]',ctx),false,'de nieuwste uitkomst vervangt de oude');
  // en de vergrote foto van hetzelfde pad volgt die nieuwe uitkomst, ook zonder reset
  img.src=PAD_A;img.complete=true;img.naturalWidth=800;img.naturalHeight=1200;
  assert.equal(await vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx),false);
  assert.equal(dek.hidden,true,'vergrote foto: andere bytes, geen afdekking');
  assert.equal(fetches.length,3,'ook de vergrote foto controleert opnieuw');
  // terug naar de beoordeelde bytes: de volgende lading dekt weer af
  levert(bytes);
  await laadt3();
  assert.equal(knop3.kids.length,1,'beoordeelde bytes terug: vlak terug');
  ctx.document.querySelectorAll=()=>[];
}

// ---- een oudere controle die later klaar is, overschrijft de nieuwere uitkomst niet ----
{
  const sleutel='/v2/images/a.jpg|'+sha;
  const wacht=[];
  ctx.fetch=()=>new Promise(r=>wacht.push(inhoud=>r({ok:true,arrayBuffer:async()=>inhoud})));
  const oud=vm.runInContext('bevestigBron',ctx)({source:'images/a.jpg',assetSha256:sha},PAD_A);
  const nieuw=vm.runInContext('bevestigBron',ctx)({source:'images/a.jpg',assetSha256:sha},PAD_A);
  await tik();assert.equal(wacht.length,2);
  wacht[1](Buffer.from('nieuwe-lading-andere-bytes'));assert.equal(await nieuw,false);
  wacht[0](bytes);assert.equal(await oud,true,'de oude controle geeft haar eigen uitkomst aan haar eigen aanroeper');
  assert.equal(vm.runInContext('bronGecontroleerd["'+sleutel+'"]',ctx),false,'maar zet de gedeelde uitkomst niet terug op true');
}

console.log('Eén merk: ingebakken merk alleen afgedekt bij gemeten vlak, afmetingen én een verse hashcontrole van het pad bij elke lading (vergrote foto en miniaturen, geen hergebruik van een eerdere uitkomst, met racebescherming); foto en houdingen dragen hetzelfde eigen merk.');
