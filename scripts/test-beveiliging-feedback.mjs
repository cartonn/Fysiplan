// Validatie en foutafhandeling uit de echte app, met een kleine DOM-adapter.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/index.html','utf8');
const ids=['ps_ww','ps_vwo','ps_vwolab','ps_msg','ps_do','ps_email'];
let focus='',requests=[],reply={ok:false,fout:'Verkeerd wachtwoord'},statusRefresh=0;
const els=Object.fromEntries(ids.map(id=>{const classes=new Set();return [id,{id,tagName:'INPUT',value:'',checked:false,style:{},dataset:{},attrs:{},classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},focus(){focus=id},select(){this.selected=true},scrollIntoView(){},appendChild(){}}]}));
const ctx=vm.createContext({document:{getElementById:id=>els[id],querySelectorAll:()=>Object.values(els),createElement:()=>({}),createTextNode:t=>t},PS_MIS:false,PRAKSLOT:{pr:'Test',perEmail:false},fetch:async(url,opt)=>{requests.push({url,body:JSON.parse(opt.body)});return {json:async()=>reply}},toonPrakSlot:()=>statusRefresh++,setPrakSes(){},rendPrakSlot(){},toonSrvKaarten(){},reloadLibraryKeepingCard(){},IS_V2:false,console});
for(const name of ['psOntbreekt','prakSlotActie','toonPsMsg','psFout','psNu','psGeenMist','psLive']){
const start=html.indexOf('  function '+name+'(');assert.ok(start>=0,name);
let end=html.indexOf('\n  }',start);const lineEnd=html.indexOf('\n',start);
if(html.slice(start,lineEnd).endsWith('}'))end=lineEnd-3;
vm.runInContext(html.slice(start,end+4),ctx);
}
const tick=()=>new Promise(r=>setImmediate(r));
els.ps_do.dataset.act='claim';els.ps_ww.value='1234567';ctx.prakSlotActie();
assert.match(els.ps_msg.textContent,/nu 7/);assert.match(els.ps_msg.textContent,/algemene voorwaarden en de verwerkersovereenkomst/);
assert.equal(focus,'ps_ww');assert.equal(els.ps_ww.attrs['aria-invalid'],'true');assert.equal(els.ps_vwo.attrs['aria-invalid'],'true');assert.equal(requests.length,0);
els.ps_ww.value+='8';ctx.psLive({target:els.ps_ww});assert.doesNotMatch(els.ps_msg.textContent,/wachtwoord/);
els.ps_vwo.checked=true;ctx.psLive({target:els.ps_vwo});assert.match(els.ps_msg.textContent,/Alles ingevuld/);assert.equal(els.ps_msg.classList.contains('fout'),false);
ctx.prakSlotActie();await tick();assert.equal(requests[0].body.akkoord,true);assert.equal(els.ps_do.disabled,false);assert.equal(els.ps_msg.classList.contains('fout'),true);
requests=[];els.ps_do.dataset.act='login';ctx.PRAKSLOT.perEmail=true;ctx.prakSlotActie();assert.equal(focus,'ps_email');assert.equal(requests.length,0);
els.ps_email.value='test@example.invalid';ctx.prakSlotActie();await tick();assert.equal(requests[0].body.email,'test@example.invalid');assert.equal(els.ps_ww.selected,true);
ctx.fetch=async()=>{throw new Error('offline')};ctx.prakSlotActie();await tick();assert.match(els.ps_msg.textContent,/Geen verbinding/);assert.equal(els.ps_do.disabled,false);
assert.match(html,/aria-live='polite'/);assert.match(html,/prefers-reduced-motion:reduce/);
console.log('Beveiliging-feedback: gecombineerde fouten, live herstel, focus, eigen login, serverfout en netwerkherstel OK');
