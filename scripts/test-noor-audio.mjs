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
console.log('OK: Noor lookup, stale-text rejection, playback, end, stop, error, start- en tussentijdse wachttijd (waiting/stalled/herstel/voortgang/opruimen), no patient data requests, inline syntax');
