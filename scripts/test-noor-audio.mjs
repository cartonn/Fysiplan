import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile('public/noor-audio.js','utf8');
const clips=[{name:'Test',text:'Test. Algemene uitleg.',src:'/audio/noor/abc123.mp3'},
  {name:'Tweede',text:'Tweede. Andere uitleg.',src:'/audio/noor/def456.mp3'}];
const players=[];
class Audio{constructor(){players.push(this);this.currentTime=0;}play(){this.played=true;return Promise.resolve();}pause(){this.paused=true;}load(){}removeAttribute(){this.src='';}}
const window={};const requests=[];
// eigen klok, zodat de wachttijd zonder echt wachten te testen is
let timers=[],nextTimer=1;
const setTimeout_=(fn,ms)=>{const id=nextTimer++;timers.push({id,fn,ms});return id;};
const clearTimeout_=(id)=>{timers=timers.filter(t=>t.id!==id);};
const vuurTimers=()=>{const lopend=timers;timers=[];lopend.forEach(t=>t.fn());};
vm.runInNewContext(source,{window,Audio,setTimeout:setTimeout_,clearTimeout:clearTimeout_,
  fetch:async(url)=>{requests.push(url);return {ok:true,json:async()=>({clips})};}});
await window.NoorAudio.load();
assert.ok(window.NoorAudio.match('Test','Algemene uitleg.'));
assert.equal(window.NoorAudio.match('Test','Gewijzigde uitleg.'),undefined);
let ended=0,error='';
await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'}],()=>ended++,s=>error=s);
assert.equal(players[0].src,clips[0].src);players[0].onended();assert.equal(ended,1);assert.ok(players[0].paused);
await window.NoorAudio.play([{name:'Test',text:'Gewijzigde uitleg.'}],()=>{},s=>error=s);
assert.match(error,/actuele Noor/);assert.equal(players.length,1);
await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'}],()=>ended++,s=>error=s);
window.NoorAudio.stop();assert.ok(players[1].paused);assert.equal(players[1].onended,null);
await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},s=>error=s);
players[2].onerror();assert.match(error,/niet worden afgespeeld/);
// een opname die blijft hangen stuurt geen enkele gebeurtenis: zonder eigen wachttijd
// blijft de knop eindeloos op "Stop" staan terwijl er niets te horen is
error='';
await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},s=>error=s);
assert.equal(timers.length,1,'elke opname krijgt een wachttijd');
vuurTimers();
assert.match(error,/laadt niet/);
assert.ok(players[3].paused,'na de wachttijd staat de speler stil');
// speelt hij wel af, dan vervalt de wachttijd en blijft hij gewoon doorlopen
error='';
await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},s=>error=s);
assert.equal(timers.length,1);
players[4].onplaying();
assert.equal(timers.length,0,'de wachttijd stopt zodra het geluid begint');
vuurTimers();assert.equal(error,'');
window.NoorAudio.stop();
assert.equal(timers.length,0,'stoppen laat geen wachttijd achter');

// ---- halverwege stokken: de wachttijd moet opnieuw kunnen starten ----
const handlers=['onended','onerror','onplaying','onwaiting','onstalled','ontimeupdate'];
const speel=async()=>{error='';await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'}],()=>ended++,s=>error=s);return players.at(-1);};

// 1. loopt eerst, stokt dan definitief: na de wachttijd een nette melding en stilte
let p=await speel();
p.onplaying();assert.equal(timers.length,0,'loopt: geen wachttijd');
p.currentTime=3.2;p.ontimeupdate();
p.onwaiting();assert.equal(timers.length,1,'stokken start een nieuwe wachttijd');
assert.equal(timers[0].ms,12000);
vuurTimers();
assert.match(error,/hapert/,'een vastgelopen fragment meldt zich');
assert.ok(p.paused,'na de wachttijd staat de speler stil');
for(const h of handlers)assert.equal(p[h],null,'opgeruimd na falen: '+h);

// 2. stokt en herstelt: geen melding, wachttijd weg
p=await speel();
p.onplaying();p.onwaiting();assert.equal(timers.length,1);
p.onplaying();assert.equal(timers.length,0,'herstel heft de wachttijd op');
vuurTimers();assert.equal(error,'');

// 3. 'stalled' terwijl er nog genoeg gebufferd is: zolang de tijd vooruitgaat hoort de
//    patiënt geluid, dus geen melding
p.currentTime=1;p.ontimeupdate();
p.onstalled();assert.equal(timers.length,1,'stalled start de wachttijd');
p.currentTime=1.25;p.ontimeupdate();assert.equal(timers.length,0,'echte voortgang heft hem op');
p.onstalled();p.ontimeupdate();assert.equal(timers.length,1,'zonder voortgang blijft de wachttijd staan');
vuurTimers();assert.match(error,/hapert/,'stalled zonder voortgang eindigt ook in een melding');

// 4. een tweede stokmelding verlengt een lopende wachttijd niet
p=await speel();
p.onplaying();p.onwaiting();const eerste=timers[0].id;
p.onstalled();p.onwaiting();
assert.equal(timers.length,1);assert.equal(timers[0].id,eerste,'de oorspronkelijke deadline blijft staan');
window.NoorAudio.stop();assert.equal(timers.length,0);
for(const h of handlers)assert.equal(p[h],null,'opgeruimd na stop: '+h);

// 5. einde van een afspeellijst: volgende fragment krijgt een eigen wachttijd, aan het
//    einde blijft niets hangen
const voor=ended;error='';
await window.NoorAudio.play([{name:'Test',text:'Algemene uitleg.'},{name:'Tweede',text:'Andere uitleg.'}],()=>ended++,s=>error=s);
p=players.at(-1);
p.onplaying();p.currentTime=8;p.ontimeupdate();p.onwaiting();assert.equal(timers.length,1);
p.onended();
assert.equal(p.src,clips[1].src,'tweede fragment geladen');
assert.equal(timers.length,1,'het nieuwe fragment heeft één eigen wachttijd, de oude is weg');
p.currentTime=0;p.ontimeupdate();assert.equal(timers.length,1,'tijd 0 op het nieuwe fragment telt niet als voortgang');
p.onplaying();assert.equal(timers.length,0);
p.onended();
assert.equal(ended,voor+1,'afspeellijst afgerond');assert.equal(error,'');
assert.equal(timers.length,0,'na het einde blijft geen wachttijd achter');
for(const h of handlers)assert.equal(p[h],null,'opgeruimd na het einde: '+h);

// 6. gebeurtenissen van een al gestopte speler doen niets meer
p=await speel();const oudeWaak=p.onwaiting,oudeVoortgang=p.ontimeupdate;
window.NoorAudio.stop();
oudeWaak();oudeVoortgang();assert.equal(timers.length,0,'een oude speler kan geen wachttijd meer starten');
vuurTimers();assert.equal(error,'');
assert.deepEqual(requests,['/audio/noor/manifest.json']);
const html=await readFile('public/kaart.html','utf8');
assert.ok(html.includes('<script src="/noor-audio.js"></script>'));
const readAll=html.slice(html.indexOf('function leesVoor()'),html.indexOf('function speelNoor('));
assert.ok(readAll.indexOf("if(TAAL==='nl')")<readAll.indexOf('new SpeechSynthesisUtterance'));
assert.ok(readAll.includes('speelNoor(items);return;'));
assert.ok(html.includes("if(TAAL==='nl')return;"),'Dutch pose narration must not use the device voice');
for(const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script);

// ---- het manifest zelf blijft hangen ----
// De wachttijd van een opname begint pas als het manifest er is. Zonder eigen grens bleef
// de knop op een slechte verbinding eindeloos op "Stop" staan, zonder melding.
const wachtRij=()=>new Promise(r=>setImmediate(r));
function verse(fetchImpl,extra={}){
  const s={timers:[],volgende:1,venster:{}};
  s.setTimeout=(fn,ms)=>{const id=s.volgende++;s.timers.push({id,fn,ms});return id;};
  s.clearTimeout=(id)=>{s.timers=s.timers.filter(t=>t.id!==id);};
  s.vuur=()=>{const l=s.timers;s.timers=[];l.forEach(t=>t.fn());};
  vm.runInNewContext(source,{window:s.venster,Audio,setTimeout:s.setTimeout,clearTimeout:s.clearTimeout,fetch:fetchImpl,...extra});
  s.N=s.venster.NoorAudio;
  return s;
}
const spelers=()=>players.length;

// A. een aanvraag die nooit antwoordt: na de grens afgebroken, nette melding, niets blijft hangen
let afgebroken=0;const opties=[];
class AC{constructor(){this.signal={aborted:false};}abort(){afgebroken++;this.signal.aborted=true;}}
let s=verse((url,o)=>{opties.push(o);return new Promise(()=>{});},{AbortController:AC});
assert.equal(s.timers.length,1,'het ophalen van het manifest heeft een eigen grens');
assert.equal(s.timers[0].ms,10000);
assert.ok(opties[0]&&opties[0].signal,'de aanvraag is af te breken');
let fout='',klaar=0;const voorA=spelers();
let bezig=s.N.play([{name:'Test',text:'Algemene uitleg.'}],()=>klaar++,m=>fout=m);
await wachtRij();
assert.equal(fout,'','binnen de grens: nog geen melding');
s.vuur();await bezig;
assert.match(fout,/laadt niet/,'na de grens een melding in plaats van eindeloze stilte');
assert.equal(afgebroken,1,'de hangende aanvraag wordt afgebroken');
assert.equal(klaar,0);assert.equal(spelers(),voorA,'zonder manifest wordt geen speler gemaakt');
assert.equal(s.timers.length,0,'na de grens blijft niets hangen');
// en zonder AbortController (oudere Safari) werkt de grens net zo
s=verse(()=>new Promise(()=>{}));
fout='';bezig=s.N.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},m=>fout=m);
s.vuur();await bezig;assert.match(fout,/laadt niet/,'ook zonder AbortController een grens');

// B. het antwoord komt, maar de inhoud blijft hangen: ook dat valt binnen de grens
s=verse(async()=>({ok:true,json:()=>new Promise(()=>{})}));
await wachtRij();assert.equal(s.timers.length,1,'de grens loopt door tot de inhoud er is');
fout='';bezig=s.N.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},m=>fout=m);
s.vuur();await bezig;assert.match(fout,/laadt niet/);

// C. na een verlopen poging begint de volgende opnieuw; een te laat antwoord telt niet
const aanvragen=[];
s=verse(()=>new Promise(ok=>aanvragen.push(ok)));
s.vuur();await wachtRij();
const tweede=s.N.load();
assert.equal(aanvragen.length,2,'na een verlopen poging haalt de volgende het manifest opnieuw op');
aanvragen[1]({ok:true,json:async()=>({clips})});
await tweede;
assert.ok(s.N.match('Test','Algemene uitleg.'),'de nieuwe poging levert het manifest');
assert.equal(s.timers.length,0,'een geslaagde poging ruimt haar grens op');
aanvragen[0]({ok:true,json:async()=>({clips:[]})});
await wachtRij();await wachtRij();
assert.ok(s.N.match('Test','Algemene uitleg.'),'een te laat antwoord van de oude poging overschrijft niets');
assert.equal(await s.N.load(),await tweede,'een geladen manifest wordt niet opnieuw opgehaald');
assert.equal(aanvragen.length,2);

// D. foutantwoord of onbruikbare inhoud: melding, en de volgende aanroep probeert opnieuw
let teller=0;
s=verse(async()=>{teller++;return teller===1?{ok:false}:teller===2?{ok:true,json:async()=>({})}:{ok:true,json:async()=>({clips})};});
await assert.rejects(s.N.load(),/niet beschikbaar/);
await assert.rejects(s.N.load(),/niet beschikbaar/,'een manifest zonder lijst opnames telt niet');
await s.N.load();assert.equal(teller,3);assert.ok(s.N.match('Test','Algemene uitleg.'));
assert.equal(s.timers.length,0);

// E. stoppen tijdens het laden: geen melding achteraf en geen geluid achteraf
s=verse(()=>new Promise(()=>{}));
fout='';const voorE=spelers();
bezig=s.N.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},m=>fout=m);
s.N.stop();s.vuur();await bezig;
assert.equal(fout,'','na stop meldt een verlopen poging zich niet meer');
assert.equal(spelers(),voorE);
let losLaten;
s=verse(()=>new Promise(ok=>{losLaten=ok;}));
fout='';bezig=s.N.play([{name:'Test',text:'Algemene uitleg.'}],()=>{},m=>fout=m);
s.N.stop();losLaten({ok:true,json:async()=>({clips})});await bezig;
assert.equal(spelers(),voorE,'na stop start een later manifest geen geluid');
assert.equal(fout,'');assert.equal(s.timers.length,0,'en de grens is opgeruimd');

// F. op de kaart: de knop staat op "Stop" tijdens het laden en komt na de grens vanzelf terug
s=verse(()=>new Promise(()=>{}));
const knoppen=new Map();
const knopEl=id=>{if(!knoppen.has(id))knoppen.set(id,{textContent:'',attrs:{},klassen:new Set(),
  classList:{add(k){knoppen.get(id).klassen.add(k);},remove(k){knoppen.get(id).klassen.delete(k);}},
  setAttribute(k,v){this.attrs[k]=v;}});return knoppen.get(id);};
const meldingen=[];
const kaart=vm.createContext({document:{getElementById:knopEl,querySelectorAll:()=>[]},window:s.venster,NoorAudio:s.N,
  mediaReviewReady:true,explanationHolds:[],TAAL:'nl',tr:x=>x==='stop'?'Stop':x,alert:m=>meldingen.push(m),demoGeluidKnop(){}});
const knip=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,a);const j=html.indexOf(b,i);assert.ok(j>i,b);return html.slice(i,j);};
vm.runInContext(knip('  var bezigLezen=false,noorRequest=0;','  function leesVoor(){')+knip('  async function speelNoor(','  // ---- als app'),kaart);
bezig=vm.runInContext('speelNoor([{name:"Test",text:"Algemene uitleg."}])',kaart);
await wachtRij();
assert.equal(knopEl('leesBtn').attrs['aria-pressed'],'true','tijdens het laden staat de knop op Stop');
s.vuur();await bezig;
assert.equal(knopEl('leesBtn').attrs['aria-pressed'],'false','na de grens staat de knop weer op luisteren');
assert.equal(knopEl('leesTxt').textContent,'Luister naar uitleg');
assert.equal(meldingen.length,1,'de patiënt krijgt één melding');
assert.equal(s.timers.length,0);
console.log('OK: Noor lookup, stale-text rejection, playback, end, stop, error, start- en tussentijdse wachttijd (waiting/stalled/herstel/voortgang/opruimen), begrensd manifest laden (hangend, hangende inhoud, opnieuw na verlopen/mislukt, te laat antwoord genegeerd, stop tijdens laden, kaartknop herstelt), no patient data requests, inline syntax');
