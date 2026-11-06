// De V2-kaartbeelden van Standing chair hip extension en Standing chair knee lift waren
// onderling verwisseld (2026-11-03). Deze test legt de wérkelijk verwachte koppeling vast,
// los van de uitzonderingslijst zelf, zodat een fout in die lijst niet mee "geldig" wordt.
// Ook zeven bronnen (vijf met een zichtbaar defect, twee met een open bronkeuze) worden op de
// kaart tijdelijk tegengehouden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {exerciseId} from '../lib/exercise-id.js';

const lees=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha=(p)=>createHash('sha256').update(fs.readFileSync('public/'+p)).digest('hex');
const tekstSha=(t)=>createHash('sha256').update(t).digest('hex');
const v2=lees('public/oefeningen-v2.json'),v1=lees('public/oefeningen.json');
const review=lees('public/mobile-media-review.json'),overrides=lees('content/v2-avatar-overrides.json');

const HEUP='images/seated-chair/standing-chair-hip-extension-avatar-v8.jpg';   // toont een knieheffing
const LIJN_HEUP='images/seated-chair/standing-chair-hip-extension-line-v1.png'; // toont een knieheffing
const LIJN_KNIE='images/seated-chair/standing-chair-knee-lift-line-v1.png';     // toont een heupextensie
const KNIE='images/seated-chair/standing-chair-knee-lift-avatar-v8.jpg';       // toont een heupextensie
const BEELD_KNIEHEFFING='3f549445eff57fa963e6e742d79d33898a0c177d872dd51b9facab8562950abb';
const BEELD_HEUPEXTENSIE='64ab13e0e71e5c0e158066f7e05dc482515ad4312313ee79884f73be17dea048';
const verwacht=[
  {id:'fp_514654a0d4181742',naam:'Standing chair hip extension',kaartImg:KNIE,sha:BEELD_HEUPEXTENSIE,
    img:LIJN_KNIE,v1img:LIJN_HEUP,pijl:'images/beginhouding-pijl-v1/313.webp',tekst:/gestrekt been rustig naar achteren vanuit de heup/},
  {id:'fp_5319c4700561725d',naam:'Standing chair knee lift',kaartImg:HEUP,sha:BEELD_KNIEHEFFING,
    img:LIJN_HEUP,v1img:LIJN_KNIE,pijl:'images/beginhouding-pijl-v1/315.webp',tekst:/breng één knie gecontroleerd omhoog/}
];

// ---- 1. de catalogus: het beeld met de beweging uit de eigen tekst ----
for(const v of verwacht){
  const e=v2.filter(x=>x.exerciseId===v.id);
  assert.equal(e.length,1,v.naam);
  assert.equal(e[0].naam,v.naam,'naam ongewijzigd');
  assert.equal(exerciseId(e[0]),v.id,'id ongewijzigd');
  assert.match(e[0].uitleg,v.tekst,'tekst ongewijzigd');
  assert.equal(e[0].kaartImg,v.kaartImg,v.naam+': V2-kaartbeeld moet de beweging uit de eigen uitleg tonen');
  assert.equal(sha(e[0].kaartImg),v.sha,v.naam+': precies het beoordeelde bestand');
  assert.equal(e[0].img,v.img,v.naam+': V2-lijnbeeld moet dezelfde beweging tonen als het kaartbeeld en de tekst');
  // V1 blijft exact zoals hij was, ook al toont het V1-lijnbeeld de andere beweging
  const oud=v1.filter(x=>x.naam===v.naam);
  assert.equal(oud.length,1);assert.equal(oud[0].img,v.v1img);assert.equal(oud[0].kaartImg,v.v1img);assert.equal(oud[0].uitleg,e[0].uitleg);
  // stabiele id's: een kaart uit V1 of V2 vindt dezelfde oefening
  assert.equal(exerciseId(oud[0]),v.id,'V1 en V2 delen dezelfde id');
  // de server levert voor het lijnbeeld de pijlversie (server.js: arrowImages.get(e.img));
  // die is per naam getekend en moet na de correctie precies dezelfde blijven
  const pijlen=lees('content/beginhouding-pijl.json').entries.filter(p=>p.source===e[0].img);
  assert.equal(pijlen.length,1);assert.equal(pijlen[0].img,v.pijl,v.naam+': geleverd pijlbeeld ongewijzigd');assert.equal(pijlen[0].naam,v.naam);
}
// V1-catalogus byte-gelijk aan de vastgelegde stand. Op 2026-11-05 is op verzoek van Ahmed
// bewust de uitleg van vier oefeningen aangepast (Anteflexie armen, Barbell front press,
// Biceps curl, Biceps pull), zodat die klopt met de avatarvideo's en de nieuwe Noor-opnames;
// V1 en V2 delen de uitleg. Op 2026-11-06 is, na de greepcontrole tegen de lijntekeningen,
// de uitleg van Anteflexie armen, Biceps curl, Biceps pull en Dips opnieuw aangepast (greep
// en opstelling volgens de lijntekening). Daarna, dezelfde dag, ook French press, Front pully row
// en Front raises (opstelling en materiaal volgens de lijntekening). Daarna Barbell pull over,
// Bench press, Dumbell pull over, Military press, Pully dips, Pully down en Pully pull over
// (houding en opstelling volgens de lijntekening en de goedgekeurde video). Daarna Pully cross
// down, Pully cross over en Pully cross up (één of twee handvatten, richting volgens de video). Elke andere wijziging van dit bestand laat deze test falen.
assert.equal(createHash('sha256').update(fs.readFileSync('public/oefeningen.json')).digest('hex'),'04017d83bdb5eee40ee06a31834cadebe7cfc62c539a50a90159fa4e76f015e7','public/oefeningen.json is ongewijzigd');
assert.notEqual(v2.find(x=>x.exerciseId==='fp_514654a0d4181742').kaartImg,v2.find(x=>x.exerciseId==='fp_5319c4700561725d').kaartImg);
// geen bestand verplaatst, hernoemd of overschreven
assert.equal(sha(HEUP),BEELD_KNIEHEFFING);assert.equal(sha(KNIE),BEELD_HEUPEXTENSIE);
assert.equal(sha(LIJN_HEUP),'1081e18c5f51c633d59ee869f6de16a3797f01cb3cbb3253c89bd35b854efeab');
assert.equal(sha(LIJN_KNIE),'7aa98cbb0b010aefd251f3c804375ff39697096cb5fe3722aa99ed34d749bca2');
assert.equal(sha('images/beginhouding-pijl-v1/313.webp'),'89b9a1102f54acee547772d485db6e6d223e5292df97923d492bc20fc3ea56d4');
assert.equal(sha('images/beginhouding-pijl-v1/315.webp'),'5de647b808443daad9405049fd56229baf04038f5ed4329105d7eedad0e16fec');

// ---- 2. de uitzonderingslijst klopt met de catalogus en is omkeerbaar beschreven ----
assert.equal(overrides.overrides.length,2,'precies twee uitzonderingen');
for(const v of verwacht){
  const o=overrides.overrides.find(x=>x.exerciseId===v.id);
  assert.ok(o,v.naam);assert.equal(o.kaartImg,v.kaartImg);assert.equal(o.assetSha256,v.sha);assert.equal(o.lineImg,v.img);
  assert.equal(o.v1LineImg,v.v1img);assert.equal(o.previousLineImg,v.v1img);assert.equal(o.arrow.img,v.pijl);
  assert.equal(o.previousKaartImg,v.kaartImg===KNIE?HEUP:KNIE,'de vorige koppeling staat erbij, zodat terugdraaien kan');
}

// ---- 3. de beoordeling hoort bij het nieuwe bestand en verzint geen beweging ----
for(const v of verwacht){
  const r=review.entries.find(x=>x.exerciseId===v.id);
  assert.equal(r.source,v.kaartImg);assert.equal(r.assetSha256,v.sha);
  assert.equal(r.status,'unreviewed');assert.equal(r.clinicalApproved,false);
  assert.notEqual(r.poseGeometry.status,'geometry-approved',v.naam+': geen begin/eind-paar');
  assert.deepEqual(r.poses,[]);
  assert.equal(r.explanationSha256,tekstSha(v2.find(x=>x.exerciseId===v.id).uitleg));
  assert.ok(r.observations.some(t=>/gecorrigeerd/.test(t)&&/V1-lijnbeeld/.test(t)),'de correctie en wat niet is aangepast staan erbij');
}

// ---- 4. tijdelijke houds op zeven bronnen (vijf bronfouten, twee open bronkeuzes) ----
const houds=[
  ['fp_013ba6ad937cc9d9','Dips','images/bovenste-extremiteit/dips-avatar-v7.jpg'],
  ['fp_f227db5fcf245d9c','Triceps dips','images/bovenste-extremiteit/triceps-dips-avatar-v7.jpg'],
  ['fp_7dc1478e2b3c17b0','Step up with knee raise','images/onderste-extremiteit/step-up-with-knee-raise-avatar-v7.jpg'],
  ['fp_4b99c5f11b42a30d','Standing chair shoulder rotations','images/seated-chair/standing-chair-shoulder-rotations-avatar-v8.jpg'],
  ['fp_295fd35a63d44ef8','Chair squat','images/onderste-extremiteit/chair-squat-avatar-v7.jpg'],
  ['fp_a0a18c0c13673d38','Back extension','images/core/back-extension-avatar-v7.jpg'],
  ['fp_7b07f346644f9c17','Rug extensie','images/core/rug-extensie-avatar-v7.jpg']
];
// Back extension en Rug extensie: de hold verandert niets aan de catalogi. V1 en V2 delen id,
// naam, uitleg, lijnbeeld en kaartbeeld; precies daardoor geldt de hold ook op een via V1
// gemaakte QR-kaart (zie onder).
const BRONKEUZE={'fp_a0a18c0c13673d38':'fc043247f30c168e50c4d2e69e093594486416fb80a438f22e58c3a67cf3cb50',
  'fp_7b07f346644f9c17':'7480d432c7638d3568edea6ca3a8e4fc9b48caa8e646580bec5790f79a431b47'};
for(const [id,hash] of Object.entries(BRONKEUZE)){
  const e2=v2.find(x=>exerciseId(x)===id),e1=v1.filter(x=>exerciseId(x)===id);
  assert.equal(e1.length,1,id+': precies één V1-record');
  for(const k of ['naam','groep','img','kaartImg','uitleg'])assert.equal(e1[0][k],e2[k],e2.naam+': V1 en V2 gelijk op '+k);
  assert.equal(sha(e2.kaartImg),hash,e2.naam+': exact de beoordeelde bytes');
  assert.ok(fs.existsSync('public/'+e2.img),e2.naam+': V1-lijnbeeld bestaat nog');
  assert.equal(review.entries.find(x=>x.exerciseId===id).hold?.kind,'source-choice-pending',e2.naam+': hold op open bronkeuze');
}
for(const [id,naam,bron] of houds){
  const e=v2.find(x=>exerciseId(x)===id);
  assert.equal(e.naam,naam);assert.equal(e.kaartImg,bron,naam+': bron niet verwijderd of omgezet');
  assert.ok(fs.existsSync('public/'+bron),naam+': bestand bestaat nog');
  const r=review.entries.find(x=>x.exerciseId===id);
  assert.equal(r.status,'rejected');assert.equal(r.presentation,'withhold');assert.equal(r.clinicalApproved,false);
  assert.equal(r.hold.temporary,true);assert.equal(r.hold.assetSha256,sha(bron));
}

// ---- 5. de patiëntkaart: houds tegengehouden, gecorrigeerde beelden zichtbaar ----
const html=fs.readFileSync('public/kaart.html','utf8');
const tussen=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>i,b);return html.slice(i,j);};
const kaart=vm.createContext({Promise,Array,Number,String,Error,JSON,
  fetch:async(url)=>({ok:true,json:async()=>lees(url.includes('narration')?'public/mobile-narration-review.json':'public/mobile-media-review.json')})});
vm.runInContext(tussen('  var mediaReviewReady=false,','  function geldigeUitsnede(')+tussen('  function geldigeUitsnede(','  async function loadMobileReview(')+
  tussen('  async function loadMobileReview(','  // Een oude afkeuring mag'),kaart);
await vm.runInContext('loadMobileReview()',kaart);
// zoals de server ze levert: /v2/images/...
const opKaart=(id)=>{const e=v2.find(x=>exerciseId(x)===id);return {exerciseId:id,naam:e.naam,kaartImg:'/v2/'+e.kaartImg,img:'/v2/'+e.img};};
for(const [id,naam] of houds)assert.equal(kaart.mediaWithheld(opKaart(id)),true,naam+' wordt op de kaart tegengehouden');
// De gedeelde QR-route normaliseert /v2/: dezelfde bron uit een V1-kaart wordt ook
// tegengehouden, maar geen andere oefening of vervangend bronpad bij dit id.
const chair=opKaart('fp_295fd35a63d44ef8');
assert.equal(kaart.mediaWithheld({...chair,kaartImg:chair.kaartImg.replace('/v2/','/')}),true,'Chair squat op gedeelde QR-route');
assert.equal(kaart.mediaWithheld({...chair,kaartImg:'/v2/images/review/new-chair.jpg'}),false,'geen hold op ander bronpad');
assert.equal(kaart.mediaWithheld({...chair,exerciseId:'different-id'}),false,'geen hold op ander id');
for(const id of Object.keys(BRONKEUZE)){
  const o=opKaart(id);
  assert.equal(kaart.mediaWithheld({...o,kaartImg:o.kaartImg.replace('/v2/','/')}),true,o.naam+' op gedeelde QR-route (V1-pad)');
  assert.equal(kaart.mediaWithheld({...o,kaartImg:o.kaartImg.replace('/v2/','')}),true,o.naam+' met relatief pad');
  assert.equal(kaart.mediaWithheld({...o,kaartImg:'/v2/images/review/'+id+'-nieuw.jpg'}),false,o.naam+': geen hold op ander bronpad');
  assert.equal(kaart.mediaWithheld({...o,exerciseId:'different-id'}),false,o.naam+': geen hold op ander id');
}
// de twee holds blijven bij hun eigen beeld: Backextensie (apparaat), met een andere bank, blijft zichtbaar
assert.equal(kaart.mediaWithheld(opKaart('fp_b5725b610192706a')),false,'Backextensie (apparaat) niet meegehouden');
for(const v of verwacht){
  assert.equal(kaart.mediaWithheld(opKaart(v.id)),false,v.naam+' toont het gecorrigeerde beeld');
  assert.equal(kaart.mediaWithheld({exerciseId:v.id,kaartImg:'/v2/'+(v.kaartImg===KNIE?HEUP:KNIE)}),false,'de oude koppeling is niet afgekeurd, alleen niet meer gebruikt');
}

// ---- 6. de pijplijn draait de correctie niet terug ----
const status=spawnSync(process.execPath,['scripts/carla-avatar-pipeline.mjs','status'],{encoding:'utf8'});
assert.equal(status.status,0,status.stderr);
const pending=JSON.parse(status.stdout).pending.map(p=>p.name);
for(const v of verwacht)assert.ok(!pending.includes(v.naam),v.naam+' telt in de pijplijn als gekoppeld');
const voor=[sha('oefeningen-v2.json'),sha(HEUP),sha(KNIE)];
const imp=spawnSync(process.execPath,['scripts/carla-avatar-pipeline.mjs','import','--name','Standing chair hip extension','--source','/bestaat/niet.png'],{encoding:'utf8'});
assert.notEqual(imp.status,0);assert.match(imp.stderr,/Import geweigerd/,'import voor een uitzondering wordt vóór elk schrijven geweigerd');
assert.deepEqual([sha('oefeningen-v2.json'),sha(HEUP),sha(KNIE)],voor,'catalogus en beelden onaangeroerd');

console.log('V2-kaart- en lijnbeelden: hip extension en knee lift tonen de beweging uit hun eigen uitleg (ids, teksten, geleverde pijlbeelden en V1 byte-gelijk, geen begin/eind-paar); 7 bronnen tijdelijk tegengehouden op de kaart (5 defect, 2 open bronkeuze, ook via de gedeelde V1-QR-route); pijplijn draait de correctie niet terug.');
