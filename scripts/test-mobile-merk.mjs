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
assert.deepEqual(fetches,['/v2/images/a.jpg'],'de bytes van precies het getoonde pad');

// andere bytes onder hetzelfde pad: niet afdekken, beeld gewoon tonen
vm.runInContext('bronGecontroleerd={}',ctx);
ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>Buffer.from('ander-beeld')});
assert.equal(await vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx),false);
assert.equal(dek.hidden,true,'afwijkende bytes: geen afdekking');
assert.equal(kader.classList.contains('wacht'),false,'en het beeld wordt wel getoond');

// geen vlak voor deze oefening: meteen tonen, niets ophalen
fetches=[];
assert.equal(await vm.runInContext('merkLightbox("fp_b|images/b.jpg")',ctx),false);
assert.equal(dek.hidden,true);assert.equal(kader.classList.contains('wacht'),false);assert.deepEqual(fetches,[]);

// afwijkende afmetingen: geen afdekking
vm.runInContext('bronGecontroleerd={}',ctx);
ctx.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes});
img.naturalWidth=1024;
assert.equal(await vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx),false);
assert.equal(dek.hidden,true);
img.naturalWidth=800;

// een snel volgende foto: de oude controle mag het vlak van de nieuwe niet zetten
vm.runInContext('bronGecontroleerd={}',ctx);
let loslaten;ctx.fetch=()=>new Promise(r=>{loslaten=()=>r({ok:true,arrayBuffer:async()=>bytes});});
const eerste=vm.runInContext('merkLightbox("fp_a|images/a.jpg")',ctx);
await new Promise(r=>setTimeout(r,0));
vm.runInContext('merkBeurt++',ctx); // een nieuwe foto is geopend
loslaten();
assert.equal(await eerste,false);assert.equal(dek.hidden,true,'een verouderde controle zet niets');

// ---- miniaturen: het vlak volgt object-fit:contain in het kader van 88 px ----
const knop={kids:[],querySelector(){return this.kids.find(k=>k.className==='merkdek')||null;},removeChild(k){this.kids=this.kids.filter(x=>x!==k);},
  insertBefore(k){this.kids.push(k);}};
const mini={parentNode:knop,dataset:{pose:'fp_a|images/a.jpg'},naturalWidth:800,naturalHeight:1200,clientWidth:86,clientHeight:86,nextSibling:null};
ctx.getComputedStyle=()=>({borderLeftWidth:'1px',borderTopWidth:'1px',paddingLeft:'4px',paddingTop:'4px',paddingRight:'4px',paddingBottom:'4px'});
ctx.document.createElement=()=>({style:{},setAttribute(){},className:''});
vm.runInContext('dekMiniatuur',ctx)(mini);
const d=knop.kids[0];assert.ok(d,'miniatuur krijgt een vlak');
// inhoud 78x78, beeld 52x78 gecentreerd: x0 = 1+4+13 = 18, y0 = 5; schaal 0.065
assert.deepEqual([d.style.left,d.style.top],['18px','5px']);
assert.ok(parseInt(d.style.width)>=Math.ceil(178*0.065)&&parseInt(d.style.height)>=Math.ceil(58*0.065),'het vlak dekt het hele merk');
vm.runInContext('dekMiniatuur',ctx)(mini);
assert.equal(knop.kids.length,1,'opnieuw tekenen stapelt geen vlakken');
mini.naturalWidth=1024;vm.runInContext('dekMiniatuur',ctx)(mini);
assert.equal(knop.kids.length,0,'ander formaat: vlak weg, beeld heel');

console.log('Eén merk: ingebakken merk alleen afgedekt bij gemeten vlak, hash en afmetingen; foto en houdingen dragen hetzelfde eigen merk.');
