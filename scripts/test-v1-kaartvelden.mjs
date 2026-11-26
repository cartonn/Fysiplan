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
const html=await readFile(join(root,'public/index.html'),'utf8');
assert.match(html, /#a4 \.client \.cr\[hidden\],html:not\(\.v2\) #a4 \.client \.cr-pat\{display:none!important\}/);
let playwright;
try { playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { console.log('PASS V1-afscherming (browsercontrole beschikbaar met PLAYWRIGHT_MODULE)'); process.exit(0); }
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
const app = spawn(process.execPath, ["server.js"], { cwd: root, env: kind, stdio: ["ignore", "pipe", "pipe"] });
app.stdout.on("data", (c) => { log += c; });
app.stderr.on("data", (c) => { log += c; });
for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await wacht(50); }


const browser=await playwright.chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
try {
 for(const route of ['/', '/v2/app']) {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  if(route==='/') {
   const login=await page.request.post(origin+'/api/v1/login',{data:{email:'demo@example.test',wachtwoord:'Test-only-2026'}});
   assert.equal(login.status(),200);
  }
  await page.goto(origin+route);
  await page.waitForSelector('#c_naam',{state:'attached'});
  await page.waitForTimeout(400);
  for(const media of ['screen','print']) {
   await page.emulateMedia({media});
   const state=await page.evaluate(()=>{
    const visible=id=>{const e=document.getElementById(id);const r=e.getBoundingClientRect();return r.width>5&&r.height>5&&getComputedStyle(e.closest('.cr')).display!=='none';};
    return {fields:['c_voornaam','c_achternaam','c_gebjaar'].map(visible),name:visible('c_naam'),age:visible('c_leeftijd'),labels:[...document.querySelectorAll('#a4 .client .cr')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>5).map(e=>e.querySelector('label').textContent)};
   });
   const v2=route==='/v2/app';
   assert.deepEqual(state.fields,[v2,v2,v2],route+' '+media+' patiëntvelden');
   assert.equal(state.name,!v2,route+' '+media+' oorspronkelijke naam');
   assert.equal(state.age,!v2,route+' '+media+' leeftijd');
   if(!v2)assert.deepEqual(state.labels,['Naam','Leeftijd','max. HF','Trainingszone']);
  }
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS V1 oorspronkelijke vier velden; V2 patiëntvelden; scherm en print; geen JS-fouten');
} finally {
 await browser.close(); app.kill(); await new Promise(r=>app.once('exit',r));
 await rm(dataDir,{recursive:true,force:true});
}
