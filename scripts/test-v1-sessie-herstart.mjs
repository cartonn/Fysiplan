// Regressie #459: V2-patiëntvelden bleken door display:flex ook in V1 zichtbaar.
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const dataDir = await mkdtemp(join(tmpdir(), "fysiplan-v1-kaart-"));
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
async function vrijePoort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const port = await vrijePoort();
const origin = `http://127.0.0.1:${port}`;
const kind = { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir, ADMIN_KEY: "", ANTHROPIC_API_KEY: "",
  ACCOUNT_BEHEER_EMAILS: "", MAIL_API_SLEUTEL: "" };
for (const k of Object.keys(kind)) if (/^(MOLLIE|BACKUP|RAILWAY|SCALEWAY|FYSIPLAN_BASIS|MAIL_)/.test(k) || k === "NODE_ENV") delete kind[k];
const salt='0123456789abcdef0123456789abcdef';
const hash='scrypt$'+salt+'$'+scryptSync('Test-only-2026',Buffer.from(salt,'hex'),32).toString('hex');
await writeFile(join(dataDir,'v1-accounts.json'),JSON.stringify({'demo@example.test':{email:'demo@example.test',hash,praktijk:'FysioTotaal'}}));
let log = "";
let app;
async function start(){
 app=spawn(process.execPath,['server.js'],{cwd:root,env:kind,stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>{log+=c;}); app.stderr.on('data',c=>{log+=c;});
 for(let i=0;i<200;i++){try{if((await fetch(origin+'/health')).ok)return;}catch{}await wacht(50);}
 throw new Error(log);
}
async function stop(){const done=new Promise(r=>app.once('exit',r));app.kill();await done;}
async function login(){const r=await fetch(origin+'/api/v1/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'demo@example.test',wachtwoord:'Test-only-2026'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
async function active(cookie){return (await (await fetch(origin+'/api/v1/status',{headers:{cookie}})).json()).ingelogd;}
try {
 await start(); const cookie=await login(); assert.equal(await active(cookie),true);
 const saved=await readFile(join(dataDir,'v1-sessies.json'),'utf8');
 assert.ok(!saved.includes(cookie.split('=')[1]),'geen onversleuteld token op schijf');
 await stop(); await start(); assert.equal(await active(cookie),true,'V1 login overleeft herstart');
 await fetch(origin+'/api/v1/logout',{method:'POST',headers:{cookie}});
 await stop(); await start(); assert.equal(await active(cookie),false,'uitloggen blijft na herstart');
 const tweede=await login(); await stop();
 const a=JSON.parse(await readFile(join(dataDir,'v1-accounts.json'),'utf8'));a['demo@example.test'].hash='gewijzigd';
 await writeFile(join(dataDir,'v1-accounts.json'),JSON.stringify(a));
 await start(); assert.equal(await active(tweede),false,'wachtwoordwijziging trekt oude sessie in');
 console.log('PASS V1 login, herstart, uitloggen, wachtwoordwijziging en tokenafdruk');
}finally{if(app&&app.exitCode===null)await stop();await rm(dataDir,{recursive:true,force:true});}
