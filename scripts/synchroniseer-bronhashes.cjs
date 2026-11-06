// Werkt na een avatar-import de bron-hashes/records bij van drafts en voorleesplannen
// (alleen kaartImg verandert; tekst en lijnbeeld blijven gelijk).
const fs=require('fs');const crypto=require('crypto');process.chdir(require('path').resolve(__dirname,'..'));
const cat=JSON.parse(fs.readFileSync('public/oefeningen-v2.json','utf8'));const byName=new Map(cat.map(e=>[e.naam,e]));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const d of fs.readdirSync('content/private-exercise-drafts')){const p=`content/private-exercise-drafts/${d}/draft.json`;if(!fs.existsSync(p))continue;
 const raw=fs.readFileSync(p,'utf8');const j=JSON.parse(raw);const o=j.originalRecord;if(!o)continue;const cur=byName.get(o.naam);if(!cur)continue;
 const voor=JSON.stringify(o);if(cur.kaartImg)o.kaartImg=cur.kaartImg;else delete o.kaartImg;
 // sleutelvolgorde als in de catalogus
 const nieuw={};for(const k of Object.keys(cur))if(k in o)nieuw[k]=o[k];for(const k of Object.keys(o))if(!(k in nieuw))nieuw[k]=o[k];j.originalRecord=nieuw;
 if(JSON.stringify(nieuw)!==voor){const ind=raw.match(/\n( +)"/)[1].length;fs.writeFileSync(p,JSON.stringify(j,null,ind)+(raw.endsWith('\n')?'\n':''));console.log('draft',d,o.naam)}}
for(const p of ['content/private-narration-drafts/manifest.json','output/category-narration-plan-20261103.json']){const raw=fs.readFileSync(p,'utf8');let n=0;
 const out=raw.replace(/("name": "([^"]+)",[\s\S]*?"sourceSha256": ")([0-9a-f]{64})/g,(m,pre,name,h)=>{const r=byName.get(name);if(!r)return m;const nh=sha(JSON.stringify(r));if(nh!==h)n++;return pre+nh});
 fs.writeFileSync(p,out);console.log(p,n)}
