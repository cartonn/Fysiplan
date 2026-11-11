// Zelfstandige dagkopieën: alleen gewijzigde uploads verlaten Railway.
// Iedere dag eigen objecten (CopyObject binnen Scaleway), dus lifecycle=7 dagen
// kan een oude kopie verwijderen zonder een nieuwere kopie onbruikbaar te maken.
import {createHash, createHmac} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat, readdir, readFile} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';
import {s3Headers, versleutel, ontsleutel, haalVanElders, objectNaam, veiligBackupPad} from './backup-elders.js';
export const MANIFEST = '__fysiplan_manifest__.json';
export const LIMITS = {snapshot:1024*1024*1024, transfer:200*1024*1024, metadata:10*1024*1024, files:10000};
const hash = b=>createHash('sha256').update(b).digest('hex');
const dateKey = d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const objectOK = s=>/^snapshots\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{64}\.fpb$/.test(s);
async function request(inst, method, object, {body=Buffer.alloc(0), extraHeaders={}}={}) {
  const url=inst.url+'/'+object;
  const headers=s3Headers({methode:method,url,regio:inst.regio,id:inst.id,geheim:inst.geheim,body,extraHeaders});
  return fetch(url,{method,headers, ...(method==='PUT'?{body}:{}),signal:AbortSignal.timeout(60000)});
}
async function put(inst, object, body) {
  const r=await request(inst,'PUT',object,{body});
  if(!r.ok) throw new Error('opslag '+r.status);
  await r.arrayBuffer();
}
async function head(inst, object, bytes) {
  const r=await request(inst,'HEAD',object);
  return r.ok && Number(r.headers.get('content-length'))===bytes;
}
async function copy(inst, source, dest, bytes) {
  const sourcePath=new URL(inst.url).pathname+'/'+source;
  const r=await request(inst,'PUT',dest,{extraHeaders:{'x-amz-copy-source':sourcePath}});
  const xml=await r.text();
  // S3 kan een fout teruggeven binnen HTTP 200.
  if(!r.ok || !/<CopyObjectResult(?:\s|>)/.test(xml) || /<Error(?:\s|>)/.test(xml)) return false;
  return head(inst,dest,bytes);
}
async function shaFile(path) {const h=createHash('sha256');for await(const c of createReadStream(path)) h.update(c);return h.digest('hex');}
async function inventory(root) {
  const files=[];
  async function walk(path, optional=false) {
    let st;try{st=await lstat(path);}catch(e){if(optional&&e.code==='ENOENT')return;throw e;}
    if(st.isSymbolicLink())throw new Error('symbolische link in uploads');
    if(st.isDirectory()){for(const n of (await readdir(path)).sort())await walk(join(path,n));return;}
    if(!st.isFile())throw new Error('onbekend bestandstype in uploads');
    const name=relative(root,path).split(sep).join('/');
    if(!veiligBackupPad(name))throw new Error('onveilig uploadpad');
    files.push({name,path,size:st.size});
    if(files.length>LIMITS.files)throw new Error('meer dan 10000 uploads');
  }
  await walk(join(root,'uploads'),true);return files;
}
export async function maakSnapshot(inst, root, dataPaths, {nu=new Date(), vorigeObject=null, limits=LIMITS}={}) {
  // Metadata eerst in het geheugen. Alleen optionele ontbrekende bestanden overslaan.
  const data=Object.create(null);let metaBytes=0;
  for(const path of dataPaths){
    const name=relative(root,path).split(sep).join('/');
    if(!veiligBackupPad(name)||name===MANIFEST)throw new Error('onveilig gegevenspad');
    let st;try{st=await lstat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(!st.isFile()||st.isSymbolicLink())throw new Error('onveilig gegevensbestand');
    if(metaBytes+st.size>limits.metadata)throw new Error('gegevensbestanden groter dan 10 MiB');
    const b=await readFile(path);metaBytes+=b.length;
    if(metaBytes>limits.metadata)throw new Error('gegevensbestanden groter dan 10 MiB');
    data[name]=b;
  }
  let vorige={};
  if(vorigeObject && /^fysiplan-(ma|di|wo|do|vr|za|zo)\.fpb$/.test(vorigeObject)){
    try{const p=ontsleutel(await haalVanElders(inst,vorigeObject),inst.sleutel);
      const m=JSON.parse(p.bestanden[MANIFEST]?.toString()||'{}');
      if(m.version===2)vorige=m.uploads||{};
    }catch{ /* onbeschikbare bron: opnieuw uploaden binnen transferbudget */ }
  }
  const m={version:2,created:nu.toISOString(),complete:true,uploads:{},missing:[],errors:[],sourceBytes:metaBytes,uploadedBytes:0,copied:0,uploaded:0};
  let files=[];
  try{files=await inventory(root);}catch{m.errors.push('uploadinventaris niet volledig leesbaar');m.complete=false;}
  let stored=metaBytes;
  const reserve=limits.metadata+1024*1024; // metadata en versleutelde index mogen altijd nog passen
  for(const f of files){
    m.sourceBytes+=f.size;
    try{
      if(stored+f.size+1024>limits.snapshot)throw new Error('opslaglimiet');
      const sha=await shaFile(f.path);
      if((await lstat(f.path)).size!==f.size)throw new Error("upload gewijzigd tijdens inventaris");
      const opaque=createHmac('sha256',inst.sleutel).update(sha).digest('hex');
      const object='snapshots/'+dateKey(nu)+'/'+opaque+'.fpb';
      const old=vorige[f.name];
      let bytes=0,reused=false;
      if(old?.sha256===sha && objectOK(old.object) && Number.isSafeInteger(old.bytes) && old.bytes>0 && stored+old.bytes<=limits.snapshot){
        try {reused= old.object===object ? await head(inst,object,old.bytes) : await copy(inst,old.object,object,old.bytes);}catch{}
        if(reused){bytes=old.bytes;m.copied++;}
      }
      if(!reused){
        // Vooraf begrenzen, geen groot bestand geheel in geheugen lezen als het niet past.
        if(f.size+1024>limits.transfer-m.uploadedBytes-reserve)throw new Error('dagelijks transferbudget');
        const raw=await readFile(f.path);
        if(raw.length!==f.size||hash(raw)!==sha)throw new Error('upload gewijzigd tijdens kopie');
        const body=versleutel({data:raw},inst.sleutel,nu.getTime());bytes=body.length;
        if(bytes>limits.transfer-m.uploadedBytes-reserve || stored+bytes>limits.snapshot)throw new Error('budgetgrens');
        // Ook een mislukte PUT verbruikt budget; geen onbeperkte retries.
        m.uploadedBytes+=bytes;
        await put(inst,object,body);
        if(!await head(inst,object,bytes))throw new Error('uploadcontrole mislukt');
        m.uploaded++;
      }
      stored+=bytes;
      m.uploads[f.name]={object,sha256:sha,size:f.size,bytes};
    }catch(e){m.complete=false;m.missing.push({name:f.name,reason:e.message});}
  }
  data[MANIFEST]=Buffer.from(JSON.stringify(m));
  const body=versleutel(data,inst.sleutel,nu.getTime());
  if(body.length+m.uploadedBytes>limits.transfer)throw new Error('index overschrijdt transferbudget');
  const object=objectNaam(nu);
  await put(inst,object,body); // index als laatste; nooit verwijzen naar niet-gecontroleerde objecten
  if(!await head(inst,object,body.length))throw new Error('indexcontrole mislukt');
  return {object,bytes:body.length+m.uploadedBytes,deels:!m.complete,uploads:Object.keys(m.uploads).length,ontbrekend:m.missing.length,errors:m.errors.length,copied:m.copied,uploaded:m.uploaded,sourceBytes:m.sourceBytes,op:nu.getTime()};
}
export function leesManifest(kopie) {
  if(!kopie.bestanden[MANIFEST])return null;
  const m=JSON.parse(kopie.bestanden[MANIFEST].toString());
  if(m.version!==2||typeof m.uploads!=='object'||!Array.isArray(m.missing))throw new Error('ongeldig snapshotmanifest');
  for(const [name,r] of Object.entries(m.uploads)) {
    if(!veiligBackupPad(name)||!name.startsWith('uploads/')||!objectOK(r.object)||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.size)||r.size<0)throw new Error('ongeldige uploadreferentie');
  }
  return m;
}
export async function herstelUpload(inst, ref) {
  if(!objectOK(ref.object))throw new Error('ongeldig object');
  const data=ontsleutel(await haalVanElders(inst,ref.object),inst.sleutel).bestanden.data;
  if(!data||data.length!==ref.size||hash(data)!==ref.sha256)throw new Error('upload beschadigd of onjuist');
  return data;
}
