// Een persistent budget en maximaal vier pogingen per 24-uurscyclus.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {maakSnapshot,LIMITS} from './backup-snapshots.js';
const DAY=24*60*60*1000;
const DELAYS=[15*60*1000,60*60*1000,4*60*60*1000];
export async function runBackup(inst,root,paths,{now=Date.now,snapshot=maakSnapshot}={}) {
 const file=join(root,'backup-elders-status.json');let state;
 try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const t=now();
 if(state?.url!==inst.url)state=null;
 // Oude succesvolle dagkopie blijft geldig; migratie start niet onnodig een upload.
 if(state && state.versie!==4){
   const old=state;const started=old.op||old.poging||0;
   state={versie:4,url:inst.url,started,attempts:1,done:!!old.op&&!old.deels,
    status:old.op?(old.deels?'deels':'ok'):'fout',fullAt:old.op&&!old.deels?old.op:null,
    object:old.object,resultaat:old.resultaat,nextAt:started+DAY,
    journal:{bytes:old.resultaat?.bytes??old.bytes??LIMITS.transfer,uploads:{}}};
 }
 if(!state || t-state.started>=DAY){
   state={versie:4,url:inst.url,started:t,attempts:0,done:false,status:'wacht',fullAt:state?.fullAt||null,
    object:state?.object,nextAt:t,journal:{bytes:0,uploads:{}}};
 }
 const persist=async()=>{await writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file+'.tmp',file);};
 if(state.done||state.attempts>=4||t<state.nextAt){await persist();return {...state,attempted:false};}
 state.attempts++;
 // Ook een crash vóór het antwoord krijgt pas na de ingestelde pauze een herkansing.
 state.status='fout';state.nextAt=t+(DELAYS[state.attempts-1]??DAY);
 await persist();
 try{
   const result=await snapshot(inst,root,paths,{nu:new Date(state.started),vorigeObject:state.object,
    journal:state.journal,saveJournal:async j=>{state.journal=j;await persist();}});
   state.resultaat=result;state.object=result.object;
   state.status=result.deels?'deels':'ok';state.done=!result.deels;
   if(state.done)state.fullAt=now();
   state.error=result.deels?'onvolledige reservekopie; controleer de ontbrekende uploads':null;
 }catch(e){state.status='fout';state.error=e.message;}
 await persist();
 return {...state,attempted:true};
}
