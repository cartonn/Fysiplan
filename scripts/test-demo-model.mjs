import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DEMO_MODEL } from '../lib/agent-demo-model.js';
const dir = await mkdtemp(join(tmpdir(), 'fp-demo-model-'));
let calls = 0, hold, entered, mode = 'normal';
const input = [];
const api = createServer(async (req,res) => {
  let b=''; for await (const c of req) b+=c;
  const j=JSON.parse(b); input.push(j); calls++;
  if (mode==='hold') { entered?.(); await new Promise(r=>hold=r); }
  if (mode==='error') { res.writeHead(503); res.end('{}'); return; }
  const plan = mode==='bad' ? {wat:'onjuist'} : {samenvatting:'Een voorstel voor de demo; beheer moet de inhoud nog beoordelen.',acties:mode==='wrongrole' ? [{actie:'contact-voorstel',gegevens:{contact:'C-aaaaaa',kanaal:'mail',reden:'Voorstel dat niet bij de staf hoort.'}}] : [{actie:'taak-voorstel',gegevens:{titel:'Controleer de groeitekst',uitleg:'Controleer de feiten voordat iemand deze tekst gebruikt.',soort:'groei',prioriteit:2}}]};
  res.setHeader('content-type','application/json'); res.end(JSON.stringify({content:[{type:'text',text:JSON.stringify(plan)}]}));
});
await new Promise(r=>api.listen(0,'127.0.0.1',r));
const probe=createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port; await new Promise(r=>probe.close(r));
const url='http://127.0.0.1:'+port, admin='local-demo-model-test';
const env={PATH:process.env.PATH,HOME:process.env.HOME,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_KEY:admin,ANTHROPIC_API_KEY:'fake',ANTHROPIC_BASE_URL:'http://127.0.0.1:'+api.address().port};
let child,logs='';
async function start(){ child=spawn(process.execPath,['server.js'],{env,stdio:['ignore','pipe','pipe']}); child.stdout.on('data',c=>logs+=c); child.stderr.on('data',c=>logs+=c); for(let i=0;i<200;i++){try{if((await fetch(url+'/health')).ok)return;}catch{} await new Promise(r=>setTimeout(r,50));} throw Error('server start'); }
async function stop(){const done=once(child,'exit');child.kill();await done;}
const post=async(path,body={})=>{const r=await fetch(url+'/api/beheer/omgeving/'+path,{method:'POST',headers:{'x-admin-sleutel':admin,'content-type':'application/json'},body:JSON.stringify({bron:'demo',...body})});return {status:r.status,body:await r.json()};};
const page=async()=>await(await fetch(url+'/api/beheer/omgeving?bron=demo',{headers:{'x-admin-sleutel':admin}})).json();
try{
 await start();
 assert.equal((await post('loket/demoronde',{bron:'echt',rol:'staf'})).status,403);
 assert.equal(calls,0);
 const before=(await page()).loket.geheugen.taken.length;
 let r=await post('loket/demoronde',{rol:'staf'});
 assert.equal(r.status,200,JSON.stringify(r.body)); assert.equal(r.body.modelRonde.resultaten[0].ok,true);
 assert.equal(r.body.loket.geheugen.taken.length,before+1);
 assert.equal(input[0].model,DEMO_MODEL); assert.equal(input[0].max_tokens,2000);
 assert.ok(!input[0].messages[0].content.includes('@'));
 mode='wrongrole';r=await post('loket/demoronde',{rol:'staf'});assert.equal(r.body.modelRonde.resultaten[0].status,403);
 mode='hold';const began=new Promise(r=>entered=r);const running=post('loket/demoronde',{rol:'staf'});await began;
 assert.equal((await post('loket/demoronde',{rol:'groei'})).status,409);
 await post('loket/pauze',{aan:true});hold();assert.equal((await running).status,409);
 assert.equal((await post('loket/demoronde',{rol:'staf'})).status,423);await post('loket/pauze',{aan:false});
 mode='error';assert.equal((await post('loket/demoronde',{rol:'staf'})).status,502);
 mode='bad';assert.equal((await post('loket/demoronde',{rol:'staf'})).status,502);
 mode='normal';assert.equal((await post('loket/demoronde',{rol:'staf'})).status,200);
 assert.equal(calls,6); assert.equal((await post('loket/demoronde',{rol:'staf'})).status,429);
 await post('demo-opnieuw');assert.equal((await post('loket/demoronde',{rol:'staf'})).status,429);
 await stop();await start();assert.equal((await post('loket/demoronde',{rol:'staf'})).status,429);assert.equal(calls,6);
 await post('loket/agent',{rol:'groei',stand:'uit'});assert.equal((await post('loket/demoronde',{rol:'groei'})).status,423);
 console.log('test-demo-model: ok (modelkeuze, demo-only, rollen, gelijktijdigheid, stop tijdens aanvraag, API-fout, ongeldig antwoord, dagbudget, reset en herstart)');
}catch(e){console.error(logs.slice(-1500));throw e;}finally{if(child?.exitCode===null)await stop();api.close();await rm(dir,{recursive:true,force:true});}
