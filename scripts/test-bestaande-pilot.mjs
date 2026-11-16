import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync, createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wacht } from "node:timers/promises";
const dir = await mkdtemp(join(tmpdir(), "bestaande-pilot-"));
const schrijf = (n,v) => writeFile(join(dir,n+".json"), JSON.stringify(v));
const lees = async n => JSON.parse(await readFile(join(dir,n+".json")));
const pk="fysiototaal", id="testproef", gemaakt=Date.now()-86400000, wachtwoord="alleen-lokale-test";
const salt=randomBytes(16), hash="scrypt$"+salt.toString("hex")+"$"+scryptSync(wachtwoord,salt,32).toString("hex");
const email="tester@example.invalid", token=randomBytes(24).toString("hex");
const account={naam:"FysioTotaal",hash,gemaakt};
const kaarten=Object.fromEntries(Array.from({length:13},(_,i)=>["k"+i,{naam:"Test "+i,id:i.toString(16).padStart(12,"0"),ts:Date.now(),oefeningen:[]}]));
const v1={[email]:{email,praktijk:"FysioTotaal",hash,gemaakt}};
const poort=createServer(); await new Promise(r=>poort.listen(0,"127.0.0.1",r));
const port=poort.address().port; await new Promise(r=>poort.close(r));
const url="http://127.0.0.1:"+port;
const post=(p,v,h={})=>fetch(url+p,{method:"POST",headers:{"content-type":"application/json",...h},body:JSON.stringify(v)});
try {
  await schrijf("praktijk-accounts",{[pk]:account}); await schrijf("kaarten",{[pk]:kaarten}); await schrijf("v1-accounts",v1);
  for(const verlopen of [false,true]) {
    const verloopt=Date.now()+(verlopen?-35:1)*86400000;
    await schrijf("proef-aanmeldingen",{[id]:{id,gestart:gemaakt-86400000,verloopt,praktijk:"FysioTotaal",tokens:[createHash("sha256").update(token).digest("hex")]}});
    const app=spawn(process.execPath,["server.js"],{env:{PATH:process.env.PATH,HOME:dir,DATA_DIR:dir,PORT:String(port),HOST:"127.0.0.1",V2_BESTAANDE_PILOT:JSON.stringify({pk,id,gemaakt,verloopt})},stdio:"ignore"});
    const exit=new Promise(r=>app.once("exit",r));
    try {
      for(let i=0;i<150;i++){if(await fetch(url+"/health").then(r=>r.ok,()=>false))break;await wacht(100);}
      if(verlopen){for(let i=0;i<100&&(await lees("proef-aanmeldingen"))[id];i++)await wacht(100);assert.ok(!(await lees("proef-aanmeldingen"))[id]);}
      for(let i=0;i<2;i++){
        const login=await post("/api/praktijk/login",{praktijk:"FysioTotaal",wachtwoord},i?{}:{cookie:"fpproef="+token});
        assert.equal(login.status,200);const {sessie}=await login.json();assert.ok(sessie);
        const headers={"x-praktijk-sessie":sessie};
        const status=await (await fetch(url+"/api/praktijk/status?praktijk=FysioTotaal",{headers})).json();
        const schrijven=await post("/api/praktijk/sjablonen",{praktijk:"FysioTotaal",naam:"Pilottest "+i,oefeningen:[{n:"Pendel"}]},headers);
        assert.equal(schrijven.status,verlopen?403:200,await schrijven.clone().text());
        assert.equal(!!status.proefVerlopen,verlopen);assert.equal(!!status.proef,!verlopen);
      }
      const login1=await post("/api/v1/login",{email,wachtwoord});assert.equal(login1.status,200);
      const page=await fetch(url+"/",{headers:{cookie:login1.headers.get("set-cookie").split(";")[0]}});
      assert.ok(page.ok);assert.doesNotMatch(await page.text(),/<title>Fysiplan — inloggen/);
      assert.deepEqual((await lees("kaarten"))[pk],kaarten);assert.deepEqual((await lees("praktijk-accounts"))[pk],account);assert.deepEqual(await lees("v1-accounts"),v1);
    }finally{app.kill();await exit;}
  }
  console.log("OK: V2 op twee apparaten, einde pilot, 13 kaarten en V1-login.");
}finally{await rm(dir,{recursive:true,force:true});}
